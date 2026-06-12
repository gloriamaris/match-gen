// =============================================================================
// Progressive Play Engine — doubles pickleball match generation
// =============================================================================
//
// Pure JS, no React / DOM / network dependencies.
// All state is JSON-serializable; the caller owns persistence.
//
// Player input shape:
//   { id, name, skillLevel, teammateId, checkedIn, queueOrder,
//     wins, losses, partnerCounts, opponentCounts }
//
// Public API:
//   generateMatches(players, { courts, matchHistory })
//   applyMatchResult(players, { courtIndex, teamAIds, teamBIds, winningTeam })

// -----------------------------------------------------------------------------
// 1. Constants
// -----------------------------------------------------------------------------

const SKILL_RANK = Object.freeze({
  Beginner: 0,
  Novice: 1,
  Intermediate: 2,
  Advanced: 3,
})

const PLAYERS_PER_COURT = 4

const PARTNER_PENALTY_PER_COUNT = 100
const OPPONENT_PENALTY_PER_COUNT = 25
const EXACT_MATCH_REPEAT_PENALTY = 500

// -----------------------------------------------------------------------------
// 2. Helpers
// -----------------------------------------------------------------------------

const skillRankOf = (level) => SKILL_RANK[level] ?? 0

const skillGroupOf = (level) => {
  const rank = skillRankOf(level)
  // Group 1: Beginner + Novice partners. Group 2: Intermediate + Advanced partners.
  return rank >= 2 ? 2 : 1
}

const canTeamsPlayMatch = (teamA, teamB) =>
  Number(teamA?.skillGroup) === Number(teamB?.skillGroup)

const skillLevelFromRank = (rank) => {
  const entries = Object.entries(SKILL_RANK)
  const match = entries.find(([, r]) => r === rank)
  return match ? match[0] : 'Beginner'
}

const MAX_SKILL_RANK = 3
const MIN_SKILL_RANK = 0

const shiftSkillLevel = (currentLevel, direction) => {
  const rank = skillRankOf(currentLevel)
  const nextRank = Math.max(MIN_SKILL_RANK, Math.min(MAX_SKILL_RANK, rank + direction))
  return skillLevelFromRank(nextRank)
}

const performanceScore = (player) =>
  (Number(player.wins) || 0) - (Number(player.losses) || 0)

const highestSkillLevel = (players) => {
  let maxRank = 0
  players.forEach((p) => {
    const rank = skillRankOf(p.skillLevel)
    if (rank > maxRank) maxRank = rank
  })
  return skillLevelFromRank(maxRank)
}

// Global rule: group 1 (Beginner/Novice) teams never play group 2
// (Intermediate/Advanced) teams. Applies in Phase 1, Phase 2, and manual edits.
const teamSkillGroupForPlayers = (players) =>
  skillGroupOf(highestSkillLevel(players))

const canPlayerGroupsOpponents = (teamAPlayers, teamBPlayers) =>
  teamSkillGroupForPlayers(teamAPlayers) === teamSkillGroupForPlayers(teamBPlayers)

const teamPerformanceScore = (players) => {
  if (players.length === 0) return 0
  const total = players.reduce((sum, p) => sum + performanceScore(p), 0)
  return total / players.length
}

const partnerPenalty = (player, otherId) => {
  const counts = player.partnerCounts
  if (!counts || typeof counts !== 'object') return 0
  return (Number(counts[otherId]) || 0) * PARTNER_PENALTY_PER_COUNT
}

const opponentPenalty = (player, otherId) => {
  const counts = player.opponentCounts
  if (!counts || typeof counts !== 'object') return 0
  return (Number(counts[otherId]) || 0) * OPPONENT_PENALTY_PER_COUNT
}

const matchSignature = (teamAIds, teamBIds) => {
  const a = [...teamAIds].sort().join(',')
  const b = [...teamBIds].sort().join(',')
  return [a, b].sort().join(' vs ')
}

const shuffle = (items) => {
  const list = [...items]
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

const checkInOrderOf = (player) => Number(player.queueOrder) || 0

const sortByCheckInOrder = (players) =>
  [...players].sort((a, b) => {
    const orderDiff = checkInOrderOf(a) - checkInOrderOf(b)
    if (orderDiff !== 0) return orderDiff
    return String(a.id).localeCompare(String(b.id))
  })

const allCheckedInHaveZeroGames = (players) =>
  players.length > 0 &&
  players.every((player) => (Number(player.gamesPlayed) || 0) === 0)

const hasPartnerOrOpponentHistory = (players) =>
  players.some((player) => {
    const partnerTotal = Object.values(player.partnerCounts ?? {}).reduce(
      (sum, count) => sum + (Number(count) || 0),
      0
    )
    const opponentTotal = Object.values(player.opponentCounts ?? {}).reduce(
      (sum, count) => sum + (Number(count) || 0),
      0
    )
    return partnerTotal > 0 || opponentTotal > 0
  })

const shouldUseCheckInOrder = (players, matchHistory) =>
  allCheckedInHaveZeroGames(players) &&
  (matchHistory ?? []).length === 0 &&
  !hasPartnerOrOpponentHistory(players)

// -----------------------------------------------------------------------------
// 3. Locked team identification (Steps 1-2)
// -----------------------------------------------------------------------------

const identifyLockedTeams = (players) => {
  const byId = new Map(players.map((p) => [p.id, p]))
  const lockedTeams = []
  const lockedIds = new Set()

  players.forEach((player) => {
    if (!player.teammateId || lockedIds.has(player.id)) return
    const teammate = byId.get(player.teammateId)
    if (!teammate || teammate.teammateId !== player.id) return
    if (lockedIds.has(teammate.id)) return
    lockedTeams.push({ players: [player, teammate], locked: true })
    lockedIds.add(player.id)
    lockedIds.add(teammate.id)
  })

  const remaining = players.filter((p) => !lockedIds.has(p.id))
  return { lockedTeams, remaining }
}

// -----------------------------------------------------------------------------
// 4. Team generation for non-locked players (Step 4)
// -----------------------------------------------------------------------------
//
// Within each skill group, greedily pair players minimizing partner penalty
// (Partner Rotation Rule / Partner Priority).

const pairingPenalty = (a, b) =>
  partnerPenalty(a, b.id) +
  partnerPenalty(b, a.id) +
  opponentPenalty(a, b.id) +
  opponentPenalty(b, a.id)

const hasPartneredBefore = (a, b) =>
  (Number(a.partnerCounts?.[b.id]) || 0) > 0 ||
  (Number(b.partnerCounts?.[a.id]) || 0) > 0

const hasOpposedBefore = (a, b) =>
  (Number(a.opponentCounts?.[b.id]) || 0) > 0 ||
  (Number(b.opponentCounts?.[a.id]) || 0) > 0

const countFreshOpponentPairs = (teamA, teamB) => {
  let freshCount = 0
  teamA.players.forEach((playerA) => {
    teamB.players.forEach((playerB) => {
      if (!hasOpposedBefore(playerA, playerB)) freshCount += 1
    })
  })
  return freshCount
}

const hasRepeatOpponentsBetweenTeams = (teamA, teamB) => {
  for (const playerA of teamA.players) {
    for (const playerB of teamB.players) {
      if (hasOpposedBefore(playerA, playerB)) return true
    }
  }
  return false
}

const isMixedGender = (a, b) => {
  const ga = a.gender ?? ''
  const gb = b.gender ?? ''
  return ga !== '' && gb !== '' && ga !== gb
}

// Enumerate all ways to partition `players` into pairs. For N players this
// produces (N-1)!! partitions, which is feasible for typical pickleball groups
// (up to ~12 players per skill group).
const enumerateAllPairings = (players) => {
  if (players.length < 2) return [{ pairs: [], leftover: [...players] }]

  const hasOdd = players.length % 2 !== 0
  if (hasOdd) {
    const results = []
    for (let i = 0; i < players.length; i += 1) {
      const without = [...players.slice(0, i), ...players.slice(i + 1)]
      const sub = enumerateAllPairings(without)
      sub.forEach((r) => results.push({ pairs: r.pairs, leftover: [players[i]] }))
    }
    return results
  }

  if (players.length === 2) {
    return [{ pairs: [[players[0], players[1]]], leftover: [] }]
  }

  const first = players[0]
  const rest = players.slice(1)
  const results = []
  for (let i = 0; i < rest.length; i += 1) {
    const partner = rest[i]
    const remaining = [...rest.slice(0, i), ...rest.slice(i + 1)]
    const sub = enumerateAllPairings(remaining)
    sub.forEach((r) =>
      results.push({ pairs: [[first, partner], ...r.pairs], leftover: r.leftover })
    )
  }
  return results
}

const MAX_ENUMERATION_SIZE = 12

const generateTeamsForGroup = (players, options = {}) => {
  const { useCheckInOrder = false } = options
  if (players.length < 2) return { teams: [], leftover: [...players] }

  if (useCheckInOrder) {
    const ordered = sortByCheckInOrder(players)
    const teams = []
    for (let i = 0; i + 1 < ordered.length; i += 2) {
      teams.push({
        players: [ordered[i], ordered[i + 1]],
        locked: false,
      })
    }
    const leftover =
      ordered.length % 2 === 1 ? [ordered[ordered.length - 1]] : []
    return { teams, leftover }
  }

  // For small groups, enumerate all possible pair-partitions and pick the one
  // with the lowest total penalty. This avoids the greedy pitfall where early
  // choices force later high-penalty pairings.
  if (players.length <= MAX_ENUMERATION_SIZE) {
    const all = enumerateAllPairings(shuffle(players))

    const freshOnly = all.filter((candidate) =>
      candidate.pairs.every(([a, b]) => !hasPartneredBefore(a, b))
    )
    const candidates = freshOnly.length > 0 ? freshOnly : all

    let bestPairing = candidates[0]
    let bestMixedCount = -1
    let bestTotal = Infinity

    candidates.forEach((candidate) => {
      const mixedCount = candidate.pairs.filter(([a, b]) =>
        isMixedGender(a, b)
      ).length
      const total = candidate.pairs.reduce(
        (sum, [a, b]) => sum + pairingPenalty(a, b),
        0
      )
      if (
        mixedCount > bestMixedCount ||
        (mixedCount === bestMixedCount && total < bestTotal)
      ) {
        bestMixedCount = mixedCount
        bestTotal = total
        bestPairing = candidate
      }
    })

    return {
      teams: bestPairing.pairs.map(([a, b]) => ({
        players: [a, b],
        locked: false,
      })),
      leftover: bestPairing.leftover,
    }
  }

  // For larger groups, fall back to greedy with shuffle.
  const available = shuffle([...players])
  const teams = []
  const used = new Set()

  while (available.filter((p) => !used.has(p.id)).length >= 2) {
    const pool = available.filter((p) => !used.has(p.id))
    const anchor = pool[0]
    used.add(anchor.id)

    let bestPartner = null
    let bestPenalty = Infinity
    let bestIsFresh = false
    let bestIsMixed = false

    for (let i = 1; i < pool.length; i += 1) {
      const candidate = pool[i]
      const isFresh = !hasPartneredBefore(anchor, candidate)
      const isMixed = isMixedGender(anchor, candidate)
      const penalty = pairingPenalty(anchor, candidate)

      const betterTier =
        (isFresh && !bestIsFresh) ||
        (isFresh === bestIsFresh && isMixed && !bestIsMixed)
      const sameTier = isFresh === bestIsFresh && isMixed === bestIsMixed

      if (betterTier || (sameTier && penalty < bestPenalty)) {
        bestPenalty = penalty
        bestPartner = candidate
        bestIsFresh = isFresh
        bestIsMixed = isMixed
      }
    }

    if (bestPartner) {
      used.add(bestPartner.id)
      teams.push({ players: [anchor, bestPartner], locked: false })
    }
  }

  const leftover = available.filter((p) => !used.has(p.id))
  return { teams, leftover }
}

// -----------------------------------------------------------------------------
// 5. Build all team units (Steps 3-6)
// -----------------------------------------------------------------------------

const buildTeamUnits = (checkedIn, options = {}) => {
  const { useCheckInOrder = false } = options
  const { lockedTeams, remaining } = identifyLockedTeams(checkedIn)

  const lockedTeamsOrdered = useCheckInOrder
    ? [...lockedTeams].sort((a, b) => {
        const orderA = Math.min(...a.players.map(checkInOrderOf))
        const orderB = Math.min(...b.players.map(checkInOrderOf))
        return orderA - orderB
      })
    : lockedTeams

  const group1Players = useCheckInOrder
    ? sortByCheckInOrder(
        remaining.filter((p) => skillGroupOf(p.skillLevel) === 1)
      )
    : remaining.filter((p) => skillGroupOf(p.skillLevel) === 1)
  const group2Players = useCheckInOrder
    ? sortByCheckInOrder(
        remaining.filter((p) => skillGroupOf(p.skillLevel) === 2)
      )
    : remaining.filter((p) => skillGroupOf(p.skillLevel) === 2)

  const g1 = generateTeamsForGroup(group1Players, { useCheckInOrder })
  const g2 = generateTeamsForGroup(group2Players, { useCheckInOrder })

  // Group 1 (Beginner/Novice) and group 2 (Intermediate/Advanced) pair only
  // within their own group. Odd leftovers sit out rather than cross-pairing.
  const sitOutCandidates = [...g1.leftover, ...g2.leftover]
  const allTeams = [...lockedTeamsOrdered, ...g1.teams, ...g2.teams]
  return { teams: allTeams, sitOuts: sitOutCandidates }
}

const enrichTeam = (team) => {
  const skill = highestSkillLevel(team.players)
  const perf = teamPerformanceScore(team.players)
  const group = skillGroupOf(skill)
  return { ...team, teamSkillLevel: skill, teamPerformanceScore: perf, skillGroup: group }
}

// -----------------------------------------------------------------------------
// 6. Group by skill, sort by performance, bucket & merge (Steps 7-10)
// -----------------------------------------------------------------------------

const groupAndBucket = (enrichedTeams) => {
  const groups = { 1: [], 2: [] }
  enrichedTeams.forEach((team) => {
    const g = team.skillGroup
    if (!groups[g]) groups[g] = []
    groups[g].push(team)
  })

  // Teams only match within their skill group. Lone teams in a group sit out
  // rather than playing cross-group opponents.
  // Sort within each group by performance desc
  Object.values(groups).forEach((list) => {
    list.sort((a, b) => b.teamPerformanceScore - a.teamPerformanceScore)
  })

  // Create performance buckets within each group
  const allBuckets = []
  Object.values(groups).forEach((sortedTeams) => {
    if (sortedTeams.length === 0) return
    const buckets = []
    let currentBucket = [sortedTeams[0]]

    for (let i = 1; i < sortedTeams.length; i += 1) {
      const prev = sortedTeams[i - 1].teamPerformanceScore
      const curr = sortedTeams[i].teamPerformanceScore
      if (Math.abs(prev - curr) <= 1) {
        currentBucket.push(sortedTeams[i])
      } else {
        buckets.push(currentBucket)
        currentBucket = [sortedTeams[i]]
      }
    }
    buckets.push(currentBucket)

    // Merge small buckets (< 2 teams) with nearest neighbor
    const merged = mergeBuckets(buckets)
    allBuckets.push(...merged)
  })

  return allBuckets
}

const mergeBuckets = (buckets) => {
  if (buckets.length <= 1) return buckets

  let merged = [...buckets]
  let changed = true
  while (changed) {
    changed = false
    for (let i = 0; i < merged.length; i += 1) {
      if (merged[i].length < 2) {
        if (i > 0 && (i === merged.length - 1 || merged[i - 1].length <= merged[Math.min(i + 1, merged.length - 1)].length)) {
          merged[i - 1] = [...merged[i - 1], ...merged[i]]
          merged.splice(i, 1)
        } else if (i < merged.length - 1) {
          merged[i + 1] = [...merged[i], ...merged[i + 1]]
          merged.splice(i, 1)
        }
        changed = true
        break
      }
    }
  }
  return merged
}

// -----------------------------------------------------------------------------
// 7. Match generation within buckets (Step 11)
// -----------------------------------------------------------------------------

const generateMatchesFromBuckets = (buckets, matchHistory, options = {}) => {
  const { useCheckInOrder = false } = options
  const previousSignatures = new Set(
    (matchHistory ?? []).map((m) => matchSignature(m.teamAIds, m.teamBIds))
  )
  const matches = []

  buckets.forEach((bucket) => {
    if (useCheckInOrder) {
      const remaining = [...bucket]
      while (remaining.length >= 2) {
        const teamA = remaining.shift()
        const sameGroupIdx = remaining.findIndex((team) =>
          canTeamsPlayMatch(teamA, team)
        )
        if (sameGroupIdx === -1) {
          matches.push({ teamA, teamB: null })
          continue
        }
        const [teamB] = remaining.splice(sameGroupIdx, 1)
        matches.push({ teamA, teamB })
      }
      if (remaining.length === 1) {
        matches.push({ teamA: remaining[0], teamB: null })
      }
      return
    }

    const available = shuffle([...bucket])
    while (available.length >= 2) {
      const teamA = available.shift()
      let bestIdx = -1
      let bestFreshOpponents = -1
      let bestPenalty = Infinity
      let bestHasRepeatOpponents = null

      for (let i = 0; i < available.length; i += 1) {
        const teamB = available[i]
        if (!canTeamsPlayMatch(teamA, teamB)) continue

        let penalty = 0

        // Opponent penalty
        teamA.players.forEach((pA) => {
          teamB.players.forEach((pB) => {
            penalty += opponentPenalty(pA, pB.id) + opponentPenalty(pB, pA.id)
          })
        })

        const freshOpponents = countFreshOpponentPairs(teamA, teamB)
        const hasRepeatOpponents = hasRepeatOpponentsBetweenTeams(teamA, teamB)

        // Exact match repeat
        const sig = matchSignature(
          teamA.players.map((p) => p.id),
          teamB.players.map((p) => p.id)
        )
        if (previousSignatures.has(sig)) {
          penalty += EXACT_MATCH_REPEAT_PENALTY
        }

        // Competitive balance (lowest priority)
        penalty += Math.abs(
          teamA.teamPerformanceScore - teamB.teamPerformanceScore
        )

        const isBetterMatch =
          bestIdx === -1 ||
          (hasRepeatOpponents !== bestHasRepeatOpponents
            ? !hasRepeatOpponents
            : freshOpponents > bestFreshOpponents ||
              (freshOpponents === bestFreshOpponents && penalty < bestPenalty))

        if (isBetterMatch) {
          bestFreshOpponents = freshOpponents
          bestPenalty = penalty
          bestHasRepeatOpponents = hasRepeatOpponents
          bestIdx = i
        }
      }

      if (bestIdx === -1) {
        matches.push({ teamA, teamB: null })
        continue
      }

      const teamB = available.splice(bestIdx, 1)[0]
      matches.push({ teamA, teamB })
    }

    // Any leftover team in this bucket stays unmatched (will be a sit-out)
    if (available.length > 0) {
      matches.push({ teamA: available[0], teamB: null })
    }
  })

  return matches
}

// -----------------------------------------------------------------------------
// 8. Court assignment
// -----------------------------------------------------------------------------

const assignCourts = (matches, courtCount) => {
  const validMatches = matches.filter(
    (match) =>
      match.teamA &&
      match.teamB &&
      canTeamsPlayMatch(match.teamA, match.teamB)
  )
  const unmatched = matches.filter((m) => !m.teamB)

  // Sort by combined performance desc within each skill group.
  const compareByCombinedPerformanceDesc = (a, b) => {
    const perfA =
      (a.teamA.teamPerformanceScore + a.teamB.teamPerformanceScore) / 2
    const perfB =
      (b.teamA.teamPerformanceScore + b.teamB.teamPerformanceScore) / 2
    return perfB - perfA
  }

  const matchSkillGroup = (match) =>
    Math.max(
      Number(match.teamA.skillGroup) || 1,
      Number(match.teamB.skillGroup) || 1
    )

  const group1Matches = []
  const group2Matches = []
  validMatches.forEach((match) => {
    if (matchSkillGroup(match) === 1) {
      group1Matches.push(match)
      return
    }
    group2Matches.push(match)
  })
  group1Matches.sort(compareByCombinedPerformanceDesc)
  group2Matches.sort(compareByCombinedPerformanceDesc)

  // Alternate low/high skill groups per court whenever both groups exist:
  // Court 1 -> Group 1, Court 2 -> Group 2, Court 3 -> Group 1, ...
  const orderedMatches = []
  while (group1Matches.length > 0 || group2Matches.length > 0) {
    if (group1Matches.length > 0) {
      orderedMatches.push(group1Matches.shift())
    }
    if (group2Matches.length > 0) {
      orderedMatches.push(group2Matches.shift())
    }
  }

  const courtAssignments = orderedMatches.slice(0, courtCount).map((m, idx) => ({
    courtIndex: idx,
    teamA: m.teamA.players,
    teamB: m.teamB.players,
  }))

  // Overflow valid matches and unmatched teams become sit-outs
  const overflowSitOuts = []
  orderedMatches.slice(courtCount).forEach((m) => {
    overflowSitOuts.push(...m.teamA.players, ...m.teamB.players)
  })
  unmatched.forEach((m) => {
    overflowSitOuts.push(...m.teamA.players)
  })

  return { courtAssignments, overflowSitOuts }
}

// -----------------------------------------------------------------------------
// 9. Fairness pre-selection
// -----------------------------------------------------------------------------
// When more players are checked in than court slots available, prefer players
// with the fewest gamesPlayed. This prevents the same players from playing
// every round while others sit out repeatedly.
//
// Cooldown: players who appeared in the most recent round (last `courtSlots`
// match-history entries) cannot play again until enough rested players are
// available. Cooldown applies in both Phase 1 and Phase 2.
//
// A small buffer (one extra court's worth) is added so the engine has room to
// handle skill-group splits without running short.

const getCooldownIds = (matchHistory, courtSlots) => {
  const recentEntries = (matchHistory ?? []).slice(-Math.max(courtSlots || 1, 1))
  const cooldownIds = new Set()
  recentEntries.forEach((entry) => {
    ;(entry.teamAIds ?? []).forEach((id) => cooldownIds.add(id))
    ;(entry.teamBIds ?? []).forEach((id) => cooldownIds.add(id))
  })
  return cooldownIds
}

const sortByFairnessPriority = (players, { useCheckInOrder = false, cooldownIds } = {}) =>
  [...players].sort((a, b) => {
    const aZero = (Number(a.gamesPlayed) || 0) === 0 ? 0 : 1
    const bZero = (Number(b.gamesPlayed) || 0) === 0 ? 0 : 1
    if (aZero !== bZero) return aZero - bZero
    const gamesDiff =
      (Number(a.gamesPlayed) || 0) - (Number(b.gamesPlayed) || 0)
    if (gamesDiff !== 0) return gamesDiff
    if (cooldownIds) {
      const aOnCooldown = cooldownIds.has(a.id) ? 1 : 0
      const bOnCooldown = cooldownIds.has(b.id) ? 1 : 0
      if (aOnCooldown !== bOnCooldown) return aOnCooldown - bOnCooldown
    }
    if (useCheckInOrder) {
      return checkInOrderOf(a) - checkInOrderOf(b)
    }
    return String(a.id).localeCompare(String(b.id))
  })

const buildPoolWithCooldown = (checkedIn, courtSlots, matchHistory, options) => {
  const { useCheckInOrder = false, cooldownSlots } = options
  const minPlayers = courtSlots * PLAYERS_PER_COURT
  const cooldownIds = getCooldownIds(matchHistory, cooldownSlots ?? courtSlots)
  const rested = checkedIn.filter((player) => !cooldownIds.has(player.id))
  const onCooldown = checkedIn.filter((player) => cooldownIds.has(player.id))

  let pool = sortByFairnessPriority(rested, { useCheckInOrder, cooldownIds })
  if (pool.length < minPlayers) {
    const deficit = minPlayers - pool.length
    pool = [
      ...pool,
      ...sortByFairnessPriority(onCooldown, { useCheckInOrder, cooldownIds }).slice(0, deficit),
    ]
  }

  return { pool, cooldownIds }
}

const selectFairnessPool = (checkedIn, courtSlots, matchHistory, options = {}) => {
  const { useCheckInOrder = false } = options
  const bufferSize = courtSlots <= 1 ? 2 : PLAYERS_PER_COURT
  const neededPlayers = courtSlots * PLAYERS_PER_COURT + bufferSize
  const { pool, cooldownIds } = buildPoolWithCooldown(
    checkedIn,
    courtSlots,
    matchHistory,
    options
  )

  const allHavePlayed = checkedIn.every(
    (player) => (Number(player.gamesPlayed) || 0) >= 1
  )

  if (!allHavePlayed) {
    const selected = pool.slice(0, Math.min(pool.length, neededPlayers))
    const selectedIds = new Set(selected.map((player) => player.id))
    const fairnessSitOuts = checkedIn.filter((player) => !selectedIds.has(player.id))
    return { selected, fairnessSitOuts }
  }

  // Phase 2: everyone has at least 1 game — locked pairs + games-played fairness.
  const byId = new Map(pool.map((player) => [player.id, player]))

  const lockedPairs = []
  const lockedIds = new Set()
  pool.forEach((player) => {
    if (!player.teammateId || lockedIds.has(player.id)) return
    const teammate = byId.get(player.teammateId)
    if (!teammate || teammate.teammateId !== player.id) return
    if (lockedIds.has(teammate.id)) return
    lockedPairs.push([player, teammate])
    lockedIds.add(player.id)
    lockedIds.add(teammate.id)
  })

  const soloPlayers = pool.filter((player) => !lockedIds.has(player.id))

  const pairAvgGames = (pair) =>
    ((Number(pair[0].gamesPlayed) || 0) + (Number(pair[1].gamesPlayed) || 0)) /
    2

  // Interleave locked pairs (as 2-slot units) with solo players, sorted by
  // gamesPlayed so pairs no longer unconditionally consume slots first.
  const units = [
    ...lockedPairs.map((pair) => ({
      size: 2,
      players: pair,
      avgGames: pairAvgGames(pair),
      onCooldown: pair.some((p) => cooldownIds.has(p.id)),
    })),
    ...soloPlayers.map((p) => ({
      size: 1,
      players: [p],
      avgGames: Number(p.gamesPlayed) || 0,
      onCooldown: cooldownIds.has(p.id),
    })),
  ]

  units.sort((a, b) => {
    const gamesDiff = a.avgGames - b.avgGames
    if (gamesDiff !== 0) return gamesDiff
    const aCooldown = a.onCooldown ? 1 : 0
    const bCooldown = b.onCooldown ? 1 : 0
    if (aCooldown !== bCooldown) return aCooldown - bCooldown
    return 0
  })

  const selected = []
  let slots = neededPlayers

  for (const unit of units) {
    if (slots >= unit.size) {
      selected.push(...unit.players)
      slots -= unit.size
    }
  }

  const selectedIds = new Set(selected.map((player) => player.id))
  const fairnessSitOuts = checkedIn.filter((player) => !selectedIds.has(player.id))

  return { selected, fairnessSitOuts }
}

// -----------------------------------------------------------------------------
// 10. Public API: generateMatches
// -----------------------------------------------------------------------------

const generateMatches = (players, options = {}) => {
  const { courts = 2, cooldownCourts, matchHistory = [], excludePlayerIds } = options
  const checkedIn = (players ?? []).filter((p) => p.checkedIn)
  const excludeIds = new Set(excludePlayerIds ?? [])

  if (checkedIn.length < PLAYERS_PER_COURT) {
    return {
      courts: [],
      sitOuts: checkedIn,
      matchHistory,
      _fairnessSitOuts: [],
      _teamBuildSitOuts: [],
      _overflowSitOuts: [],
    }
  }

  const useCheckInOrder = shouldUseCheckInOrder(checkedIn, matchHistory)

  // For per-court refresh, run fairness on all checked-in players with the
  // session-wide court count so the pool is ranked globally.
  const fairnessCourtSlots = excludeIds.size > 0
    ? (cooldownCourts ?? courts)
    : courts

  const { selected: globalSelected, fairnessSitOuts: rawFairnessSitOuts } = selectFairnessPool(
    checkedIn,
    fairnessCourtSlots,
    matchHistory,
    { useCheckInOrder, cooldownSlots: cooldownCourts }
  )

  // Remove players assigned to other courts from the working pool
  const selected = excludeIds.size > 0
    ? globalSelected.filter((p) => !excludeIds.has(p.id))
    : globalSelected
  const fairnessSitOuts = excludeIds.size > 0
    ? rawFairnessSitOuts.filter((p) => !excludeIds.has(p.id))
    : rawFairnessSitOuts

  const { teams, sitOuts: teamBuildSitOuts } = buildTeamUnits(selected, {
    useCheckInOrder,
  })
  const enriched = teams.map(enrichTeam)
  const buckets = groupAndBucket(enriched)
  const matches = generateMatchesFromBuckets(buckets, matchHistory, {
    useCheckInOrder,
  })
  const { courtAssignments, overflowSitOuts } = assignCourts(matches, courts)

  const allSitOuts = [
    ...fairnessSitOuts,
    ...teamBuildSitOuts,
    ...overflowSitOuts,
  ]

  return {
    courts: courtAssignments,
    sitOuts: allSitOuts,
    matchHistory,
    _fairnessSitOuts: fairnessSitOuts,
    _teamBuildSitOuts: teamBuildSitOuts,
    _overflowSitOuts: overflowSitOuts,
  }
}

// -----------------------------------------------------------------------------
// 11. Public API: applyMatchResult
// -----------------------------------------------------------------------------

const applyMatchResult = (players, result) => {
  const { courtIndex, teamAIds, teamBIds, winningTeam } = result
  const winnerIds = new Set(winningTeam === 'A' ? teamAIds : teamBIds)
  const loserIds = new Set(winningTeam === 'A' ? teamBIds : teamAIds)
  const allMatchPlayerIds = [...teamAIds, ...teamBIds]

  const nextPlayers = players.map((player) => {
    if (!allMatchPlayerIds.includes(player.id)) return player

    const isWinner = winnerIds.has(player.id)
    const updated = { ...player }

    if (isWinner) {
      updated.wins = (Number(updated.wins) || 0) + 1
      updated.skillLevel = shiftSkillLevel(updated.skillLevel, 1)
    } else {
      updated.losses = (Number(updated.losses) || 0) + 1
      updated.skillLevel = shiftSkillLevel(updated.skillLevel, -1)
    }
    updated.gamesPlayed = (Number(updated.gamesPlayed) || 0) + 1

    // Update partner counts
    const partnerCounts = { ...(updated.partnerCounts ?? {}) }
    const ownTeam = winnerIds.has(player.id) ? [...winnerIds] : [...loserIds]
    ownTeam.forEach((id) => {
      if (id !== player.id) {
        partnerCounts[id] = (Number(partnerCounts[id]) || 0) + 1
      }
    })
    updated.partnerCounts = partnerCounts

    // Update opponent counts
    const opponentCountsObj = { ...(updated.opponentCounts ?? {}) }
    const opposingTeam = winnerIds.has(player.id)
      ? [...loserIds]
      : [...winnerIds]
    opposingTeam.forEach((id) => {
      opponentCountsObj[id] = (Number(opponentCountsObj[id]) || 0) + 1
    })
    updated.opponentCounts = opponentCountsObj

    return updated
  })

  const historyEntry = {
    courtIndex,
    teamAIds: [...teamAIds],
    teamBIds: [...teamBIds],
    winningTeam,
    signature: matchSignature(teamAIds, teamBIds),
    timestamp: Date.now(),
  }

  return { players: nextPlayers, historyEntry }
}

const revertMatchResult = (players, result) => {
  const { teamAIds, teamBIds, winningTeam } = result
  const winnerIds = new Set(winningTeam === 'A' ? teamAIds : teamBIds)
  const loserIds = new Set(winningTeam === 'A' ? teamBIds : teamAIds)
  const allMatchPlayerIds = [...teamAIds, ...teamBIds]

  return players.map((player) => {
    if (!allMatchPlayerIds.includes(player.id)) return player

    const isWinner = winnerIds.has(player.id)
    const updated = { ...player }

    if (isWinner) {
      updated.wins = Math.max(0, (Number(updated.wins) || 0) - 1)
      updated.skillLevel = shiftSkillLevel(updated.skillLevel, -1)
    } else {
      updated.losses = Math.max(0, (Number(updated.losses) || 0) - 1)
      updated.skillLevel = shiftSkillLevel(updated.skillLevel, 1)
    }
    updated.gamesPlayed = Math.max(0, (Number(updated.gamesPlayed) || 0) - 1)

    const partnerCounts = { ...(updated.partnerCounts ?? {}) }
    const ownTeam = winnerIds.has(player.id) ? [...winnerIds] : [...loserIds]
    ownTeam.forEach((id) => {
      if (id !== player.id) {
        const nextCount = Math.max(0, (Number(partnerCounts[id]) || 0) - 1)
        if (nextCount === 0) {
          delete partnerCounts[id]
        } else {
          partnerCounts[id] = nextCount
        }
      }
    })
    updated.partnerCounts = partnerCounts

    const opponentCountsObj = { ...(updated.opponentCounts ?? {}) }
    const opposingTeam = winnerIds.has(player.id) ? [...loserIds] : [...winnerIds]
    opposingTeam.forEach((id) => {
      const nextCount = Math.max(0, (Number(opponentCountsObj[id]) || 0) - 1)
      if (nextCount === 0) {
        delete opponentCountsObj[id]
      } else {
        opponentCountsObj[id] = nextCount
      }
    })
    updated.opponentCounts = opponentCountsObj

    return updated
  })
}

// -----------------------------------------------------------------------------
// 12. Exports
// -----------------------------------------------------------------------------

export {
  SKILL_RANK,
  PLAYERS_PER_COURT,
  skillRankOf,
  skillGroupOf,
  teamSkillGroupForPlayers,
  canTeamsPlayMatch,
  canPlayerGroupsOpponents,
  shiftSkillLevel,
  performanceScore,
  highestSkillLevel,
  teamPerformanceScore,
  partnerPenalty,
  opponentPenalty,
  matchSignature,
  checkInOrderOf,
  sortByCheckInOrder,
  allCheckedInHaveZeroGames,
  shouldUseCheckInOrder,
  identifyLockedTeams,
  hasPartneredBefore,
  isMixedGender,
  generateTeamsForGroup,
  buildTeamUnits,
  enrichTeam,
  groupAndBucket,
  generateMatchesFromBuckets,
  assignCourts,
  selectFairnessPool,
  getCooldownIds,
  generateMatches,
  applyMatchResult,
  revertMatchResult,
}
