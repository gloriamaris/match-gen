// =============================================================================
// Open Rotation (Skill-Weighted) — round-orchestrating match engine
// =============================================================================
//
// A self-contained matchmaking engine for organized pickleball open play.
// Unlike the sibling court-agnostic primitives, this engine owns the FULL
// round lifecycle: it picks sit-outs, distributes players across courts,
// chooses the globally best 2v2 partitions, applies score results, and tracks
// session-wide fairness and court movement.
//
// Design tenets
// -------------
//   * Pure JS, no React / DOM / network dependencies.
//   * State is a single JSON-serializable object (works with React state and
//     localStorage out of the box).
//   * Stateful orchestrator API (createInitialState / generateRound /
//     applyResults / getFairnessReport / getCourtMovementPreview) plus
//     backward-compatible primitives (buildCourtTeams / enforceExclusivePlayers)
//     for callers that want to slot into the existing per-court flow.
//   * Modular internal sections (snapshot, history index, wait queue, court
//     bucketer, partition enumerator, scorer, optimizer, movement, fairness)
//     so each concern stays isolated and testable.
//   * Plugin hooks (scoreMatchup, selectSitOuts, onRoundGenerated,
//     onResultsApplied) let callers override behavior without forking.
//
// Suggested DB schema (for a production backend persisting EngineState):
//
//   sessions(id, name, config_json, started_at, ended_at)
//   session_players(session_id, player_id, dupr_rating, current_court_float,
//                   wins, losses, games_played, sit_outs, fatigue_score)
//   rounds(id, session_id, round_index, generated_at)
//   round_courts(round_id, court_index, team_a_player_ids, team_b_player_ids)
//   matches(id, round_id, court_index, score_a, score_b, recorded_at)
//   match_partners(session_id, player_a_id, player_b_id, round_index)
//   match_opponents(session_id, player_a_id, player_b_id, round_index)
//   sit_outs(session_id, player_id, round_index)
//
// EngineState is fully JSON-serializable: `JSON.stringify(state)` keyed by
// session_id is sufficient for persistence; the engine is DB-agnostic.

// -----------------------------------------------------------------------------
// 1. Constants & default config
// -----------------------------------------------------------------------------

const COURT_SIZE = 4
const DEFAULT_MEDIAN_RATING = 3.5
const FATIGUE_WINDOW = 4

const DEFAULT_WEIGHTS = Object.freeze({
  repeatPartner: -10,
  repeatOpponent: -4,
  skillCloseness: 6,
  winnerWithWinner: 3,
  gamesPlayedBalance: 5,
  streakAlignment: 2,
  fatigueBalance: 1,
  courtAppropriateness: 4,
})

const DEFAULT_COOLDOWN = Object.freeze({
  partnerRounds: 3,
  opponentRounds: 2,
})

const DEFAULT_MOVEMENT = Object.freeze({
  aggressiveness: 0.6,
})

const DEFAULT_ANTI_FARMING = Object.freeze({
  maxRatingGapPerCourt: 1.2,
})

const DEFAULT_FAIRNESS = Object.freeze({
  maxGamesGap: 2,
})

const DEFAULT_OPTIMIZER = Object.freeze({
  maxLocalSwaps: 200,
  plateauPatience: 25,
})

const DEFAULT_CONFIG = Object.freeze({
  courts: 2,
  courtSize: COURT_SIZE,
  weights: DEFAULT_WEIGHTS,
  cooldown: DEFAULT_COOLDOWN,
  movement: DEFAULT_MOVEMENT,
  antiFarming: DEFAULT_ANTI_FARMING,
  fairness: DEFAULT_FAIRNESS,
  optimizer: DEFAULT_OPTIMIZER,
  hooks: null,
})

const mergeConfig = (override = {}) => ({
  ...DEFAULT_CONFIG,
  ...override,
  weights: { ...DEFAULT_WEIGHTS, ...(override.weights ?? {}) },
  cooldown: { ...DEFAULT_COOLDOWN, ...(override.cooldown ?? {}) },
  movement: { ...DEFAULT_MOVEMENT, ...(override.movement ?? {}) },
  antiFarming: { ...DEFAULT_ANTI_FARMING, ...(override.antiFarming ?? {}) },
  fairness: { ...DEFAULT_FAIRNESS, ...(override.fairness ?? {}) },
  optimizer: { ...DEFAULT_OPTIMIZER, ...(override.optimizer ?? {}) },
  hooks: override.hooks ?? null,
})

// -----------------------------------------------------------------------------
// 2. Generic helpers
// -----------------------------------------------------------------------------

const toNumber = (value) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

const shuffle = (items) => {
  const list = [...items]
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[list[index], list[swapIndex]] = [list[swapIndex], list[index]]
  }
  return list
}

const dedupeById = (items) => {
  const seen = new Set()
  const result = []
  items.forEach((item) => {
    if (!item || seen.has(item.id)) return
    seen.add(item.id)
    result.push(item)
  })
  return result
}

const pairKey = (a, b) =>
  [String(a), String(b)].sort((x, y) => x.localeCompare(y)).join('::')

// -----------------------------------------------------------------------------
// 3. Player snapshot builder
// -----------------------------------------------------------------------------
//
// Produces a per-round read-only view of every checked-in player with all the
// derived metrics the scorer / bucketer / movement need:
//
//   effectiveRating    — duprRating ?? clubRating ?? medianRating
//   performanceTrend   — EMA of recent point differentials per game
//   fatigueScore       — games played in the last FATIGUE_WINDOW rounds
//   currentCourt       — float; soft court bias used by the bucketer
//   lastResult         — 'win' | 'loss' | null
//   streak             — signed: +N for win streak, -N for loss streak
//
// Caller-provided fields on each player (e.g. duprRating, gamesPlayed) are
// always preferred; we only fall back to in-state values when missing.

const computeMedianRating = (players) => {
  const ratings = players
    .map((p) => toNumber(p.duprRating) ?? toNumber(p.clubRating))
    .filter((r) => r !== null)
    .sort((a, b) => a - b)
  if (ratings.length === 0) return DEFAULT_MEDIAN_RATING
  const mid = Math.floor(ratings.length / 2)
  return ratings.length % 2 === 0
    ? (ratings[mid - 1] + ratings[mid]) / 2
    : ratings[mid]
}

const computeFatigue = (playerId, matchHistory, currentRound) => {
  let fatigue = 0
  for (let i = matchHistory.length - 1; i >= 0; i -= 1) {
    const m = matchHistory[i]
    if (currentRound - m.round > FATIGUE_WINDOW) break
    if (m.teamA.includes(playerId) || m.teamB.includes(playerId)) {
      fatigue += 1 / Math.max(1, currentRound - m.round + 1)
    }
  }
  return fatigue
}

const computeTrend = (playerId, matchHistory) => {
  // EMA over the last 5 point-differentials, most recent weighted heaviest.
  const diffs = []
  for (let i = matchHistory.length - 1; i >= 0 && diffs.length < 5; i -= 1) {
    const m = matchHistory[i]
    const onA = m.teamA.includes(playerId)
    const onB = m.teamB.includes(playerId)
    if (!onA && !onB) continue
    diffs.push(onA ? m.scoreA - m.scoreB : m.scoreB - m.scoreA)
  }
  if (diffs.length === 0) return 0
  const alpha = 0.5
  let ema = diffs[diffs.length - 1]
  for (let i = diffs.length - 2; i >= 0; i -= 1) {
    ema = alpha * diffs[i] + (1 - alpha) * ema
  }
  return ema
}

const computeStreak = (playerState) => {
  // playerState.streak is updated on applyResults; expose as-is. Default 0.
  return Number.isFinite(playerState?.streak) ? playerState.streak : 0
}

const buildPlayerSnapshot = (players, state) => {
  const { round, playerState, matchHistory, config } = state
  const median = computeMedianRating(players)
  const courts = Math.max(1, config.courts)
  const defaultCourt = (courts - 1) / 2 // middle court by default

  return players.map((player) => {
    const ps = playerState[player.id] ?? {}
    const dupr = toNumber(player.duprRating)
    const club = toNumber(player.clubRating)
    const effectiveRating = dupr ?? club ?? median
    const gamesPlayed = ps.gamesPlayed ?? player.gamesPlayed ?? 0
    const wins = ps.wins ?? player.wins ?? 0
    const losses = ps.losses ?? player.losses ?? 0
    const streak = computeStreak(ps)
    const lastResult = ps.lastResult ?? null
    const currentCourt = Number.isFinite(ps.currentCourt)
      ? ps.currentCourt
      : defaultCourt
    const fatigueScore = computeFatigue(player.id, matchHistory, round)
    const performanceTrend = computeTrend(player.id, matchHistory)
    const sitOutCount = (ps.sitOutRounds ?? []).length
    const lastSitOutRound =
      sitOutCount > 0 ? ps.sitOutRounds[ps.sitOutRounds.length - 1] : -Infinity

    return {
      id: player.id,
      name: player.name,
      raw: player,
      effectiveRating,
      gamesPlayed,
      wins,
      losses,
      streak,
      lastResult,
      currentCourt,
      fatigueScore,
      performanceTrend,
      sitOutCount,
      lastSitOutRound,
      pointDifferential:
        ps.pointDifferential ?? player.pointDifferential ?? 0,
    }
  })
}

// -----------------------------------------------------------------------------
// 4. History indexer (partner + opponent cooldowns)
// -----------------------------------------------------------------------------
//
// Walks the recent slice of matchHistory once and produces two lookups:
//
//   partnerLastRound : Map<pairKey, roundIndex>
//   opponentLastRound: Map<pairKey, roundIndex>
//
// Both are bounded by max(partnerRounds, opponentRounds) so old matches are
// ignored. Lookup cost during scoring is O(1) per pair.

const buildHistoryIndex = (matchHistory, currentRound, config) => {
  const partnerLastRound = new Map()
  const opponentLastRound = new Map()
  const maxWindow = Math.max(
    config.cooldown.partnerRounds,
    config.cooldown.opponentRounds
  )

  for (let i = matchHistory.length - 1; i >= 0; i -= 1) {
    const m = matchHistory[i]
    if (currentRound - m.round > maxWindow) break
    const recordPartners = (team) => {
      for (let a = 0; a < team.length; a += 1) {
        for (let b = a + 1; b < team.length; b += 1) {
          const key = pairKey(team[a], team[b])
          if (!partnerLastRound.has(key)) partnerLastRound.set(key, m.round)
        }
      }
    }
    const recordOpponents = (teamA, teamB) => {
      teamA.forEach((a) => {
        teamB.forEach((b) => {
          const key = pairKey(a, b)
          if (!opponentLastRound.has(key)) opponentLastRound.set(key, m.round)
        })
      })
    }
    recordPartners(m.teamA)
    recordPartners(m.teamB)
    recordOpponents(m.teamA, m.teamB)
  }

  return { partnerLastRound, opponentLastRound }
}

const partnerRepeatScore = (a, b, index, currentRound, cooldown) => {
  const last = index.partnerLastRound.get(pairKey(a, b))
  if (last === undefined) return 0
  const roundsAgo = currentRound - last
  return Math.max(0, cooldown.partnerRounds - roundsAgo)
}

const opponentRepeatScore = (a, b, index, currentRound, cooldown) => {
  const last = index.opponentLastRound.get(pairKey(a, b))
  if (last === undefined) return 0
  const roundsAgo = currentRound - last
  return Math.max(0, cooldown.opponentRounds - roundsAgo)
}

// -----------------------------------------------------------------------------
// 5. Wait queue / sit-out selector
// -----------------------------------------------------------------------------
//
// Invariant: no player sits twice before every other checked-in player has sat
// at least once. We enforce this by partitioning candidates into tiers based
// on sitOutCount, then sorting within the lowest-count tier by (gamesPlayed
// desc, lastSitOutRound asc, fatigueScore desc, random).

const selectSitOuts = (snapshot, neededSitOuts, config) => {
  if (neededSitOuts <= 0) return []
  if (typeof config.hooks?.selectSitOuts === 'function') {
    const override = config.hooks.selectSitOuts(snapshot, { neededSitOuts })
    if (Array.isArray(override)) return override.slice(0, neededSitOuts)
  }

  // Tier by current sit-out count so under-rested players get priority to
  // play. Within a tier, prefer (a) most games played (need a break),
  // (b) longest time since last sit (round-robin fairness), (c) highest
  // fatigue (recently busy), (d) random tiebreak.
  const byTier = new Map()
  snapshot.forEach((p) => {
    const tier = p.sitOutCount
    if (!byTier.has(tier)) byTier.set(tier, [])
    byTier.get(tier).push(p)
  })

  const tiers = [...byTier.keys()].sort((a, b) => a - b)
  const chosen = []

  for (const tier of tiers) {
    if (chosen.length >= neededSitOuts) break
    const remaining = neededSitOuts - chosen.length
    const tierPlayers = shuffle(byTier.get(tier))
    tierPlayers.sort((a, b) => {
      if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed
      if (a.lastSitOutRound !== b.lastSitOutRound) {
        return a.lastSitOutRound - b.lastSitOutRound
      }
      return b.fatigueScore - a.fatigueScore
    })
    chosen.push(...tierPlayers.slice(0, remaining))
  }

  return chosen
}

// -----------------------------------------------------------------------------
// 6. Court bucketer (with anti-farming)
// -----------------------------------------------------------------------------
//
// Sorts playable players by (currentCourt asc, effectiveRating desc) and
// slices into K buckets of `courtSize`. Court 0 is the "top" court (winners
// trend up = toward index 0). Then enforces the anti-farming rating gap: any
// bucket whose internal rating spread exceeds `maxRatingGapPerCourt` is
// rebalanced by promoting its strongest player up one court and demoting that
// court's weakest player down to fill the slot.

const bucketByCourt = (playable, courts, config) => {
  const courtSize = config.courtSize ?? COURT_SIZE
  const expected = courts * courtSize
  if (playable.length < expected) return null

  const ordered = [...playable].sort((a, b) => {
    if (a.currentCourt !== b.currentCourt) {
      return a.currentCourt - b.currentCourt
    }
    if (b.effectiveRating !== a.effectiveRating) {
      return b.effectiveRating - a.effectiveRating
    }
    return a.id.localeCompare(b.id)
  })

  const buckets = []
  for (let c = 0; c < courts; c += 1) {
    buckets.push(ordered.slice(c * courtSize, (c + 1) * courtSize))
  }

  // Anti-farming: rebalance courts whose rating spread is too wide.
  const maxGap = config.antiFarming.maxRatingGapPerCourt
  if (Number.isFinite(maxGap) && maxGap > 0) {
    for (let c = courts - 1; c > 0; c -= 1) {
      const bucket = buckets[c]
      const ratings = bucket.map((p) => p.effectiveRating).sort((a, b) => a - b)
      const spread = ratings[ratings.length - 1] - ratings[0]
      if (spread <= maxGap) continue

      bucket.sort((a, b) => b.effectiveRating - a.effectiveRating)
      const above = buckets[c - 1]
      above.sort((a, b) => a.effectiveRating - b.effectiveRating)
      const promote = bucket[0]
      const demote = above[0]
      buckets[c] = [demote, ...bucket.slice(1)]
      buckets[c - 1] = [promote, ...above.slice(1)]
    }
  }

  return buckets
}

// -----------------------------------------------------------------------------
// 7. Quartet enumerator
// -----------------------------------------------------------------------------
//
// Three unique 2v2 partitions of any 4-player set.

const enumeratePartitions = (four) => {
  if (four.length !== 4) return []
  const [a, b, c, d] = four
  return [
    { teamA: [a, b], teamB: [c, d] },
    { teamA: [a, c], teamB: [b, d] },
    { teamA: [a, d], teamB: [b, c] },
  ]
}

// -----------------------------------------------------------------------------
// 8. Matchup quality scorer
// -----------------------------------------------------------------------------
//
// Each candidate partition is scored as:
//
//   score = w.skillCloseness     / (1 + skillSpread)
//         + w.winnerWithWinner   * winnerAlignment
//         + w.gamesPlayedBalance / (1 + gamesGap)
//         + w.streakAlignment    * streakAlignment
//         + w.fatigueBalance     / (1 + fatigueGap)
//         + w.courtAppropriateness * courtFit
//         + w.repeatPartner      * repeatPartnerCount
//         + w.repeatOpponent     * repeatOpponentCount
//
// All component metrics are normalized to be unit-scale (mostly [0,1] or
// [-1,1]) so the weights remain interpretable across sessions.

const teamHasWinner = (team) => team.every((p) => p.lastResult === 'win')
const teamHasLoser = (team) => team.every((p) => p.lastResult === 'loss')

const computeWinnerAlignment = (teamA, teamB) => {
  // 1.0 = pure W+W vs L+L. 0.5 = mixed. 0.0 = inverse (W with L on both teams).
  const aWin = teamHasWinner(teamA)
  const aLoss = teamHasLoser(teamA)
  const bWin = teamHasWinner(teamB)
  const bLoss = teamHasLoser(teamB)
  if ((aWin && bLoss) || (aLoss && bWin)) return 1
  if (aWin && bWin) return 0.5
  if (aLoss && bLoss) return 0.5
  return 0.25
}

const computeStreakAlignment = (teamA, teamB) => {
  const sumStreak = (t) => t.reduce((s, p) => s + (p.streak ?? 0), 0)
  const a = sumStreak(teamA)
  const b = sumStreak(teamB)
  // Closer team-streak sums = better alignment.
  return 1 / (1 + Math.abs(a - b))
}

const computeCourtFit = (four, courtIndex, totalCourts) => {
  if (totalCourts <= 1) return 1
  // Each player has an ideal court (their currentCourt). Sum the absolute
  // distance from this court's index, normalize.
  const totalDistance = four.reduce(
    (s, p) => s + Math.abs(p.currentCourt - courtIndex),
    0
  )
  const maxDistance = totalCourts * four.length
  return 1 - totalDistance / maxDistance
}

const scoreMatchup = (four, partition, ctx) => {
  const { config, historyIndex, currentRound, courtIndex, totalCourts } = ctx
  const w = config.weights
  const { teamA, teamB } = partition

  const ratings = four.map((p) => p.effectiveRating)
  const skillSpread = Math.max(...ratings) - Math.min(...ratings)

  const games = four.map((p) => p.gamesPlayed)
  const gamesGap = Math.max(...games) - Math.min(...games)

  const fatigues = four.map((p) => p.fatigueScore)
  const fatigueGap = Math.max(...fatigues) - Math.min(...fatigues)

  const winnerAlignment = computeWinnerAlignment(teamA, teamB)
  const streakAlignment = computeStreakAlignment(teamA, teamB)
  const courtFit = computeCourtFit(four, courtIndex, totalCourts)

  const repeatPartnerCount =
    partnerRepeatScore(
      teamA[0].id,
      teamA[1].id,
      historyIndex,
      currentRound,
      config.cooldown
    ) +
    partnerRepeatScore(
      teamB[0].id,
      teamB[1].id,
      historyIndex,
      currentRound,
      config.cooldown
    )

  let repeatOpponentCount = 0
  teamA.forEach((a) => {
    teamB.forEach((b) => {
      repeatOpponentCount += opponentRepeatScore(
        a.id,
        b.id,
        historyIndex,
        currentRound,
        config.cooldown
      )
    })
  })

  const defaultScore =
    w.skillCloseness / (1 + skillSpread) +
    w.winnerWithWinner * winnerAlignment +
    w.gamesPlayedBalance / (1 + gamesGap) +
    w.streakAlignment * streakAlignment +
    w.fatigueBalance / (1 + fatigueGap) +
    w.courtAppropriateness * courtFit +
    w.repeatPartner * repeatPartnerCount +
    w.repeatOpponent * repeatOpponentCount

  if (typeof config.hooks?.scoreMatchup === 'function') {
    const override = config.hooks.scoreMatchup(partition, {
      four,
      ctx,
      defaultScore,
      components: {
        skillSpread,
        gamesGap,
        fatigueGap,
        winnerAlignment,
        streakAlignment,
        courtFit,
        repeatPartnerCount,
        repeatOpponentCount,
      },
    })
    if (Number.isFinite(override)) return override
  }

  return defaultScore
}

const bestPartitionForBucket = (four, ctx) => {
  const partitions = enumeratePartitions(four)
  if (partitions.length === 0) {
    return { partition: null, score: -Infinity }
  }
  let best = partitions[0]
  let bestScore = scoreMatchup(four, best, ctx)
  for (let i = 1; i < partitions.length; i += 1) {
    const score = scoreMatchup(four, partitions[i], ctx)
    if (score > bestScore) {
      bestScore = score
      best = partitions[i]
    }
  }
  return { partition: best, score: bestScore }
}

// -----------------------------------------------------------------------------
// 9. Global round optimizer
// -----------------------------------------------------------------------------
//
// 1. Greedy seed: best partition per bucket.
// 2. Local search:
//      a) For each adjacent court pair, try swapping each player from one
//         with each player from the other. Accept if global score improves.
//      b) Re-evaluate each court's partition after every swap.
// Bounded by config.optimizer.maxLocalSwaps; early-exits on plateau.

const seedPlan = (buckets, ctx) => {
  return buckets.map((bucket, courtIndex) => {
    const { partition, score } = bestPartitionForBucket(bucket, {
      ...ctx,
      courtIndex,
    })
    return { courtIndex, players: bucket, partition, score }
  })
}

const totalPlanScore = (plan) =>
  plan.reduce((sum, c) => sum + (c.score ?? 0), 0)

const reevaluateCourt = (courtPlan, ctx) => {
  const { partition, score } = bestPartitionForBucket(courtPlan.players, {
    ...ctx,
    courtIndex: courtPlan.courtIndex,
  })
  return { ...courtPlan, partition, score }
}

const optimizeRound = (initialPlan, ctx) => {
  const { config } = ctx
  let plan = initialPlan
  let bestScore = totalPlanScore(plan)
  let swaps = 0
  let stagnant = 0

  while (
    swaps < config.optimizer.maxLocalSwaps &&
    stagnant < config.optimizer.plateauPatience
  ) {
    let improved = false

    for (let i = 0; i < plan.length - 1 && !improved; i += 1) {
      const courtA = plan[i]
      const courtB = plan[i + 1]

      for (let a = 0; a < courtA.players.length && !improved; a += 1) {
        for (let b = 0; b < courtB.players.length && !improved; b += 1) {
          const playersA = [...courtA.players]
          const playersB = [...courtB.players]
          ;[playersA[a], playersB[b]] = [playersB[b], playersA[a]]

          const candidateA = reevaluateCourt(
            { ...courtA, players: playersA },
            ctx
          )
          const candidateB = reevaluateCourt(
            { ...courtB, players: playersB },
            ctx
          )

          const newPlan = plan.map((c, idx) => {
            if (idx === i) return candidateA
            if (idx === i + 1) return candidateB
            return c
          })
          const newScore = totalPlanScore(newPlan)

          if (newScore > bestScore + 1e-6) {
            plan = newPlan
            bestScore = newScore
            improved = true
            stagnant = 0
          }
          swaps += 1
          if (swaps >= config.optimizer.maxLocalSwaps) break
        }
      }
    }

    if (!improved) stagnant += 1
  }

  return { plan, score: bestScore, swaps }
}

// -----------------------------------------------------------------------------
// 10. Court movement
// -----------------------------------------------------------------------------
//
// Soft float-based promotion/relegation:
//   * Winners shift toward court 0 by `movement.aggressiveness` units.
//   * Losers shift toward the bottom court by the same.
//   * Close games (point diff < 3) move half as much.
// `currentCourt` stays a float; the bucketer reads it and snaps integer
// assignments, so movement is smooth and never hard-locks a player to a court.

const computeCourtMovement = (player, isWinner, pointDiff, config, courts) => {
  const max = Math.max(0, courts - 1)
  const aggression = config.movement.aggressiveness
  const magnitude = Math.abs(pointDiff) < 3 ? aggression / 2 : aggression
  const current = Number.isFinite(player.currentCourt)
    ? player.currentCourt
    : (courts - 1) / 2
  const delta = isWinner ? -magnitude : magnitude
  const next = current + delta
  if (next < 0) return 0
  if (next > max) return max
  return next
}

const getCourtMovementPreview = (state, results) => {
  const { config, playerState } = state
  const courts = Math.max(1, config.courts)
  const preview = {}
  results.forEach((r) => {
    const isTeamAWin = r.scoreA > r.scoreB
    const winners = isTeamAWin ? r.teamA : r.teamB
    const losers = isTeamAWin ? r.teamB : r.teamA
    const pointDiff = Math.abs(r.scoreA - r.scoreB)
    winners.forEach((id) => {
      preview[id] = computeCourtMovement(
        playerState[id] ?? {},
        true,
        pointDiff,
        config,
        courts
      )
    })
    losers.forEach((id) => {
      preview[id] = computeCourtMovement(
        playerState[id] ?? {},
        false,
        pointDiff,
        config,
        courts
      )
    })
  })
  return preview
}

// -----------------------------------------------------------------------------
// 11. Fairness reporter
// -----------------------------------------------------------------------------

const variance = (values) => {
  if (values.length === 0) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
}

const getFairnessReport = (state) => {
  const { playerState, config, round } = state
  const perPlayer = {}
  const ids = Object.keys(playerState)

  const gamesValues = []
  const sitOutValues = []
  const courtDistribution = new Array(Math.max(1, config.courts)).fill(0)

  ids.forEach((id) => {
    const ps = playerState[id]
    const games = ps.gamesPlayed ?? 0
    const sitOuts = (ps.sitOutRounds ?? []).length
    const partners = ps.recentPartners ?? []
    const opponents = ps.recentOpponents ?? []
    const uniquePartners = new Set(partners.map((p) => p.id)).size
    const uniqueOpponents = new Set(opponents.map((o) => o.id)).size

    const avgPartnerRating = partners.length
      ? partners.reduce((s, p) => s + (p.rating ?? 0), 0) / partners.length
      : 0
    const avgOpponentRating = opponents.length
      ? opponents.reduce((s, o) => s + (o.rating ?? 0), 0) / opponents.length
      : 0

    const expectedGames = Math.max(1, round)
    const gamesFairness = Math.min(100, (games / expectedGames) * 100)
    const sitFairness =
      sitOuts === 0 ? 100 : Math.max(0, 100 - sitOuts * 20)
    const diversityFairness = Math.min(
      100,
      ((uniquePartners + uniqueOpponents) / Math.max(1, games * 3)) * 100
    )
    const fairnessScore = Math.round(
      (gamesFairness + sitFairness + diversityFairness) / 3
    )

    perPlayer[id] = {
      gamesPlayed: games,
      sitOuts,
      avgPartnerRating,
      avgOpponentRating,
      partnerDiversity: uniquePartners,
      opponentDiversity: uniqueOpponents,
      fairnessScore,
    }

    gamesValues.push(games)
    sitOutValues.push(sitOuts)
    const courtIdx = Math.round(
      Math.max(0, Math.min(config.courts - 1, ps.currentCourt ?? 0))
    )
    courtDistribution[courtIdx] = (courtDistribution[courtIdx] ?? 0) + 1
  })

  const gamesVar = variance(gamesValues)
  const sitOutVar = variance(sitOutValues)
  const overallFairness = Math.max(
    0,
    Math.round(100 - gamesVar * 10 - sitOutVar * 10)
  )

  return {
    perPlayer,
    session: {
      gamesPlayedVariance: gamesVar,
      sitOutVariance: sitOutVar,
      courtDistribution,
      overallFairness,
    },
  }
}

// -----------------------------------------------------------------------------
// 12. Public orchestrator API
// -----------------------------------------------------------------------------

const emptyPlayerState = () => ({
  currentCourt: null,
  wins: 0,
  losses: 0,
  gamesPlayed: 0,
  streak: 0,
  lastResult: null,
  pointsFor: 0,
  pointsAgainst: 0,
  pointDifferential: 0,
  recentPartners: [],
  recentOpponents: [],
  sitOutRounds: [],
})

/**
 * Build a fresh EngineState seeded with the supplied player list.
 *
 * @param {Array<{id:string,name:string,duprRating?:number,clubRating?:number,gender?:string}>} players
 * @param {Partial<typeof DEFAULT_CONFIG>} [sessionConfig]
 * @returns {EngineState}
 */
const createInitialState = (players, sessionConfig = {}) => {
  const config = mergeConfig(sessionConfig)
  const playerState = {}
  const unique = dedupeById(players ?? [])
  const courts = Math.max(1, config.courts)
  const defaultCourt = (courts - 1) / 2

  // Seed initial court bias by skill: stronger players start near court 0.
  const sorted = [...unique].sort((a, b) => {
    const aR = toNumber(a.duprRating) ?? toNumber(a.clubRating) ?? -Infinity
    const bR = toNumber(b.duprRating) ?? toNumber(b.clubRating) ?? -Infinity
    return bR - aR
  })
  sorted.forEach((player, index) => {
    const portion = sorted.length > 1 ? index / (sorted.length - 1) : 0.5
    const initialCourt = portion * (courts - 1)
    playerState[player.id] = {
      ...emptyPlayerState(),
      currentCourt: Number.isFinite(initialCourt) ? initialCourt : defaultCourt,
    }
  })

  return {
    config,
    round: 0,
    playerState,
    matchHistory: [],
    sitOutHistory: [],
    lastRoundPlan: null,
  }
}

const ensurePlayerEntry = (state, playerId) => {
  if (!state.playerState[playerId]) {
    const courts = Math.max(1, state.config.courts)
    state.playerState[playerId] = {
      ...emptyPlayerState(),
      currentCourt: (courts - 1) / 2,
    }
  }
  return state.playerState[playerId]
}

/**
 * Generate a globally-optimized round plan from the current EngineState.
 *
 * @param {EngineState} state
 * @param {{players:Array,courts?:number,configOverride?:object}} options
 * @returns {{state:EngineState, roundPlan:RoundPlan}}
 */
const generateRound = (state, options = {}) => {
  const players = dedupeById(options.players ?? [])
  const baseConfig = state.config
  const courts =
    options.courts ?? options.configOverride?.courts ?? baseConfig.courts
  const config = mergeConfig({
    ...baseConfig,
    ...(options.configOverride ?? {}),
    courts,
  })

  // Make sure every input player has a state entry so movement / fairness keep
  // working when players check in mid-session.
  const workingState = { ...state, config, playerState: { ...state.playerState } }
  players.forEach((p) => ensurePlayerEntry(workingState, p.id))

  const snapshot = buildPlayerSnapshot(players, {
    round: workingState.round + 1,
    playerState: workingState.playerState,
    matchHistory: workingState.matchHistory,
    config,
  })
  const currentRound = workingState.round + 1
  const courtSize = config.courtSize ?? COURT_SIZE
  const capacity = courts * courtSize

  if (snapshot.length < courtSize) {
    const roundPlan = {
      round: currentRound,
      courts: [],
      sitOuts: snapshot.map((p) => p.id),
      totalScore: 0,
    }
    return { state: { ...workingState, lastRoundPlan: roundPlan }, roundPlan }
  }

  const needSitOuts = Math.max(0, snapshot.length - capacity)
  const sitOuts = selectSitOuts(snapshot, needSitOuts, config)
  const sitOutIds = new Set(sitOuts.map((p) => p.id))
  const playable = snapshot.filter((p) => !sitOutIds.has(p.id))

  // Adjust court count downward if we don't have enough players for K courts.
  const effectiveCourts = Math.min(
    courts,
    Math.floor(playable.length / courtSize)
  )
  const overflow = playable.length - effectiveCourts * courtSize
  if (overflow > 0) {
    // Move overflow into sit-outs using the same priority.
    const extras = selectSitOuts(playable, overflow, config)
    const extraIds = new Set(extras.map((p) => p.id))
    extras.forEach((e) => sitOutIds.add(e.id))
    sitOuts.push(...extras)
    for (let i = playable.length - 1; i >= 0; i -= 1) {
      if (extraIds.has(playable[i].id)) playable.splice(i, 1)
    }
  }

  if (effectiveCourts === 0) {
    const roundPlan = {
      round: currentRound,
      courts: [],
      sitOuts: snapshot.map((p) => p.id),
      totalScore: 0,
    }
    return { state: { ...workingState, lastRoundPlan: roundPlan }, roundPlan }
  }

  const buckets = bucketByCourt(playable, effectiveCourts, config)
  if (!buckets) {
    const roundPlan = {
      round: currentRound,
      courts: [],
      sitOuts: snapshot.map((p) => p.id),
      totalScore: 0,
    }
    return { state: { ...workingState, lastRoundPlan: roundPlan }, roundPlan }
  }

  const historyIndex = buildHistoryIndex(
    workingState.matchHistory,
    currentRound,
    config
  )
  const scoringCtx = {
    config,
    historyIndex,
    currentRound,
    totalCourts: effectiveCourts,
  }

  const seed = seedPlan(buckets, scoringCtx)
  const { plan, score: totalScore } = optimizeRound(seed, scoringCtx)

  const roundPlan = {
    round: currentRound,
    totalScore,
    sitOuts: sitOuts.map((p) => p.id),
    courts: plan.map((c) => ({
      courtIndex: c.courtIndex,
      teamA: c.partition.teamA.map((p) => p.raw),
      teamB: c.partition.teamB.map((p) => p.raw),
      teamAIds: c.partition.teamA.map((p) => p.id),
      teamBIds: c.partition.teamB.map((p) => p.id),
      score: c.score,
    })),
  }

  // Record sit-outs in per-player history so the wait-queue invariant holds.
  const nextPlayerState = { ...workingState.playerState }
  sitOuts.forEach((p) => {
    const entry = nextPlayerState[p.id] ?? emptyPlayerState()
    nextPlayerState[p.id] = {
      ...entry,
      sitOutRounds: [...(entry.sitOutRounds ?? []), currentRound],
    }
  })

  const nextState = {
    ...workingState,
    playerState: nextPlayerState,
    sitOutHistory: [
      ...workingState.sitOutHistory,
      ...sitOuts.map((p) => ({ round: currentRound, playerId: p.id })),
    ],
    lastRoundPlan: roundPlan,
  }

  if (typeof config.hooks?.onRoundGenerated === 'function') {
    config.hooks.onRoundGenerated(roundPlan, nextState)
  }

  return { state: nextState, roundPlan }
}

/**
 * Apply the result of one court's match. Updates per-player wins/losses,
 * streaks, court bias, recent partner / opponent memory, and appends the
 * match to history. Safe to call once per court submission; round counter
 * is advanced only when at least one court of the current round resolves.
 *
 * @param {EngineState} state
 * @param {{courtIndex:number,teamA:string[],teamB:string[],scoreA:number,scoreB:number}} result
 * @returns {EngineState}
 */
const applyResults = (state, result) => {
  if (!result || !Array.isArray(result.teamA) || !Array.isArray(result.teamB)) {
    return state
  }
  const config = state.config
  const courts = Math.max(1, config.courts)
  const rawScoreA = Number(result.scoreA)
  const rawScoreB = Number(result.scoreB)
  const scoreA = Number.isFinite(rawScoreA) ? rawScoreA : 0
  const scoreB = Number.isFinite(rawScoreB) ? rawScoreB : 0
  const isTeamAWin = scoreA > scoreB
  const isDraw = scoreA === scoreB
  const pointDiff = Math.abs(scoreA - scoreB)
  const winners = isTeamAWin ? result.teamA : result.teamB
  const losers = isTeamAWin ? result.teamB : result.teamA
  const round =
    Number.isFinite(result.round) && result.round > 0
      ? result.round
      : state.lastRoundPlan?.round ?? state.round + 1

  const nextPlayerState = { ...state.playerState }

  const updatePlayer = (id, isWinner, ownTeam, opponentTeam, ownScore, oppScore) => {
    const prev = nextPlayerState[id] ?? emptyPlayerState()
    const nextStreak = isDraw
      ? 0
      : isWinner
        ? Math.max(0, prev.streak ?? 0) + 1
        : Math.min(0, prev.streak ?? 0) - 1
    const partnersUpdate = ownTeam
      .filter((pid) => pid !== id)
      .map((pid) => ({ id: pid, round }))
    const opponentsUpdate = opponentTeam.map((pid) => ({ id: pid, round }))
    nextPlayerState[id] = {
      ...prev,
      wins: (prev.wins ?? 0) + (isWinner && !isDraw ? 1 : 0),
      losses: (prev.losses ?? 0) + (!isWinner && !isDraw ? 1 : 0),
      gamesPlayed: (prev.gamesPlayed ?? 0) + 1,
      streak: nextStreak,
      lastResult: isDraw ? null : isWinner ? 'win' : 'loss',
      pointsFor: (prev.pointsFor ?? 0) + ownScore,
      pointsAgainst: (prev.pointsAgainst ?? 0) + oppScore,
      pointDifferential:
        (prev.pointDifferential ?? 0) + (ownScore - oppScore),
      currentCourt: computeCourtMovement(
        prev,
        isWinner,
        pointDiff,
        config,
        courts
      ),
      recentPartners: [...(prev.recentPartners ?? []), ...partnersUpdate].slice(
        -config.cooldown.partnerRounds * 4
      ),
      recentOpponents: [
        ...(prev.recentOpponents ?? []),
        ...opponentsUpdate,
      ].slice(-config.cooldown.opponentRounds * 4),
    }
  }

  winners.forEach((id) => {
    updatePlayer(
      id,
      true,
      winners,
      losers,
      isTeamAWin ? scoreA : scoreB,
      isTeamAWin ? scoreB : scoreA
    )
  })
  losers.forEach((id) => {
    updatePlayer(
      id,
      false,
      losers,
      winners,
      isTeamAWin ? scoreB : scoreA,
      isTeamAWin ? scoreA : scoreB
    )
  })

  const nextHistory = [
    ...state.matchHistory,
    {
      round,
      courtIndex: result.courtIndex,
      teamA: [...result.teamA],
      teamB: [...result.teamB],
      scoreA,
      scoreB,
    },
  ]

  const nextRound = Math.max(state.round, round)
  const nextState = {
    ...state,
    round: nextRound,
    playerState: nextPlayerState,
    matchHistory: nextHistory,
    lastRoundPlan: null,
  }

  if (typeof config.hooks?.onResultsApplied === 'function') {
    config.hooks.onResultsApplied(nextState, result)
  }

  return nextState
}

// -----------------------------------------------------------------------------
// 13. Backward-compatibility primitives
// -----------------------------------------------------------------------------
//
// These let App.jsx (or any sibling engine consumer) keep its existing
// per-court generation flow unchanged. `buildCourtTeams` accepts the same
// shapes used by the other engines (a Set of partner-pair keys OR a Map of
// playerId -> lastPartnerId) and produces two teams from any 4-player pool.

const partnerHistoryHas = (history, aId, bId) => {
  if (!history) return false
  if (history instanceof Set) {
    return (
      history.has(pairKey(aId, bId)) ||
      history.has(`${aId}:${bId}`) ||
      history.has(`${bId}:${aId}`)
    )
  }
  if (history instanceof Map) {
    return history.get(aId) === bId || history.get(bId) === aId
  }
  return false
}

const buildCourtTeams = (players, partnerHistory) => {
  const pool = dedupeById(players ?? []).slice(0, COURT_SIZE)
  if (pool.length < COURT_SIZE) return []

  const partitions = enumeratePartitions(pool)
  const ratingOf = (p) =>
    toNumber(p.duprRating) ?? toNumber(p.clubRating) ?? DEFAULT_MEDIAN_RATING

  const scorePartition = ({ teamA, teamB }) => {
    const ratingDiff = Math.abs(
      teamA.reduce((s, p) => s + ratingOf(p), 0) -
        teamB.reduce((s, p) => s + ratingOf(p), 0)
    )
    const repeatPenalty =
      (partnerHistoryHas(partnerHistory, teamA[0].id, teamA[1].id) ? 1 : 0) +
      (partnerHistoryHas(partnerHistory, teamB[0].id, teamB[1].id) ? 1 : 0)
    // Lower is better: heavily penalize repeats, then favor balanced ratings.
    return repeatPenalty * 100 + ratingDiff
  }

  let best = partitions[0]
  let bestScore = scorePartition(best)
  for (let i = 1; i < partitions.length; i += 1) {
    const s = scorePartition(partitions[i])
    if (s < bestScore) {
      bestScore = s
      best = partitions[i]
    }
  }
  return [best.teamA, best.teamB]
}

const enforceExclusivePlayers = (players, exclusiveIds) => {
  const exclusives = exclusiveIds instanceof Set ? exclusiveIds : new Set()
  const selected = []
  let exclusivePicked = false
  ;(players ?? []).forEach((player) => {
    if (!player) return
    if (exclusives.has(player.id)) {
      if (exclusivePicked) return
      exclusivePicked = true
    }
    selected.push(player)
  })
  return selected
}

// -----------------------------------------------------------------------------
// 14. Test / simulation helper
// -----------------------------------------------------------------------------
//
// Generates a round and applies random results to every court. Useful for
// dry-running fairness/movement behavior without hooking up the full UI.

const simulateRound = (state, players, options = {}) => {
  const { state: afterGenerate, roundPlan } = generateRound(state, {
    players,
    ...options,
  })
  let next = afterGenerate
  roundPlan.courts.forEach((court) => {
    const targetPoints = options.targetPoints ?? 11
    const scoreA = Math.floor(Math.random() * targetPoints) + 1
    const scoreB = scoreA === targetPoints ? targetPoints - 2 : targetPoints
    next = applyResults(next, {
      courtIndex: court.courtIndex,
      teamA: court.teamAIds,
      teamB: court.teamBIds,
      scoreA: Math.random() > 0.5 ? scoreA : scoreB,
      scoreB: Math.random() > 0.5 ? scoreB : scoreA,
      round: roundPlan.round,
    })
  })
  return { state: next, roundPlan }
}

// -----------------------------------------------------------------------------
// 15. Exports
// -----------------------------------------------------------------------------

export {
  DEFAULT_CONFIG,
  // Rich orchestrator
  createInitialState,
  generateRound,
  applyResults,
  getFairnessReport,
  getCourtMovementPreview,
  // Internals (exported for tests / advanced callers)
  buildPlayerSnapshot,
  buildHistoryIndex,
  selectSitOuts,
  bucketByCourt,
  enumeratePartitions,
  scoreMatchup,
  optimizeRound,
  computeCourtMovement,
  // Compat primitives
  buildCourtTeams,
  enforceExclusivePlayers,
  // Simulation
  simulateRound,
}
