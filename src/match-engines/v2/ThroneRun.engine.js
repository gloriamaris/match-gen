// =============================================================================
// Throne Run Engine — doubles pickleball match generation
// =============================================================================
//
// One winner holds the court after each match, gets new partners each round,
// and may leave after hitting the win streak limit. Initial generation reuses
// Progressive Play; stat updates extend
// PP's applyMatchResult with per-player win-streak tracking.
//
// Public API:
//   generateMatches(players, { courts, matchHistory })
//   applyMatchResult(players, result, { maxWinStreak })
//   generateCourtAfterScore(allPlayers, { winnerIds, courtMatchups, matchHistory, courts })

import {
  generateMatches,
  applyMatchResult as ppApplyMatchResult,
  skillRankOf,
  skillGroupOf,
  shiftSkillLevel,
  matchSignature,
  getCooldownIds,
  hasPartneredBefore,
  isMixedGender,
} from './ProgressivePlay.engine'

// -----------------------------------------------------------------------------
// applyMatchResult — extends PP with per-player win streak
// -----------------------------------------------------------------------------
// Returns { players, historyEntry, ejectedWinnerIds }
//
// ejectedWinnerIds contains exactly one winner per scored match:
// the winner with higher gamesPlayed (tie-break by lower games holder rules).
// The non-ejected winner is intended to hold the throne next round.

const applyMatchResult = (players, result, options = {}) => {
  const { maxWinStreak = 0 } = options
  const { courtIndex, teamAIds, teamBIds, winningTeam } = result
  const winnerIdSet = new Set(winningTeam === 'A' ? teamAIds : teamBIds)
  const loserIdSet = new Set(winningTeam === 'A' ? teamBIds : teamAIds)
  const allMatchPlayerIds = [...teamAIds, ...teamBIds]

  let ejectedWinnerIds = []

  const nextPlayers = players.map((player) => {
    if (!allMatchPlayerIds.includes(player.id)) return player

    const isWinner = winnerIdSet.has(player.id)
    const updated = { ...player }

    if (isWinner) {
      updated.wins = (Number(updated.wins) || 0) + 1
      updated.skillLevel = shiftSkillLevel(updated.skillLevel, 1)
      const newStreak = (Number(updated.currentWinStreak) || 0) + 1

      if (maxWinStreak > 0 && newStreak >= maxWinStreak) {
        updated.currentWinStreak = 0
        updated.medals = (Number(updated.medals) || 0) + 1
        updated.medalCooldownCourt = courtIndex
        updated.medalCooldownRemaining = 2
      } else {
        updated.currentWinStreak = newStreak
      }
    } else {
      updated.losses = (Number(updated.losses) || 0) + 1
      updated.skillLevel = shiftSkillLevel(updated.skillLevel, -1)
      updated.currentWinStreak = 0
    }
    updated.gamesPlayed = (Number(updated.gamesPlayed) || 0) + 1

    const partnerCounts = { ...(updated.partnerCounts ?? {}) }
    const ownTeam = winnerIdSet.has(player.id) ? [...winnerIdSet] : [...loserIdSet]
    ownTeam.forEach((id) => {
      if (id !== player.id) {
        partnerCounts[id] = (Number(partnerCounts[id]) || 0) + 1
      }
    })
    updated.partnerCounts = partnerCounts

    const opponentCountsObj = { ...(updated.opponentCounts ?? {}) }
    const opposingTeam = winnerIdSet.has(player.id)
      ? [...loserIdSet]
      : [...winnerIdSet]
    opposingTeam.forEach((id) => {
      opponentCountsObj[id] = (Number(opponentCountsObj[id]) || 0) + 1
    })
    updated.opponentCounts = opponentCountsObj

    return updated
  })

  const winnersAfterMatch = nextPlayers.filter((player) => winnerIdSet.has(player.id))
  if (winnersAfterMatch.length === 2) {
    const throneHolder = selectPrimaryThroneWinner(
      winnersAfterMatch[0],
      winnersAfterMatch[1]
    )
    ejectedWinnerIds = winnersAfterMatch
      .filter((player) => player.id !== throneHolder.id)
      .map((player) => player.id)
  }

  const historyEntry = {
    courtIndex,
    teamAIds: [...teamAIds],
    teamBIds: [...teamBIds],
    winningTeam,
    signature: matchSignature(teamAIds, teamBIds),
    timestamp: Date.now(),
  }

  return { players: nextPlayers, historyEntry, ejectedWinnerIds }
}

// -----------------------------------------------------------------------------
// Throne holder selection (when winners split across skill groups)
// -----------------------------------------------------------------------------
// After +1 promotion the two winners may land in different groups. Pick one to
// hold the throne: prefer the winner with fewest gamesPlayed, break ties by
// higher skill rank, then stable id ordering.

function selectPrimaryThroneWinner(winnerA, winnerB) {
  const gamesA = Number(winnerA.gamesPlayed) || 0
  const gamesB = Number(winnerB.gamesPlayed) || 0
  if (gamesA !== gamesB) return gamesA < gamesB ? winnerA : winnerB
  const rankA = skillRankOf(winnerA.skillLevel)
  const rankB = skillRankOf(winnerB.skillLevel)
  if (rankA !== rankB) return rankA > rankB ? winnerA : winnerB
  return String(winnerA.id).localeCompare(String(winnerB.id)) <= 0 ? winnerA : winnerB
}

// -----------------------------------------------------------------------------
// Partner priority scoring
// -----------------------------------------------------------------------------
// Prefer same skill level, then lower within the group, then higher as a
// last resort. Within the same priority tier, prefer fewer games played.

const partnerPriority = (winner, candidate) => {
  const winnerRank = skillRankOf(winner.skillLevel)
  const candidateRank = skillRankOf(candidate.skillLevel)
  if (winnerRank === candidateRank) return 0
  if (candidateRank < winnerRank) return 1
  return 2
}

const candidateScore = (winner, candidate) =>
  partnerPriority(winner, candidate) * 10000 +
  (Number(candidate.gamesPlayed) || 0)

const partnerRepeatCount = (a, b) =>
  Math.max(Number(a.partnerCounts?.[b.id]) || 0, Number(b.partnerCounts?.[a.id]) || 0)

const hasOpposedBefore = (a, b) =>
  (Number(a.opponentCounts?.[b.id]) || 0) > 0 ||
  (Number(b.opponentCounts?.[a.id]) || 0) > 0

const opponentRepeatCount = (a, b) =>
  Math.max(Number(a.opponentCounts?.[b.id]) || 0, Number(b.opponentCounts?.[a.id]) || 0)

const opponentPairKey = (playerA, playerB) =>
  [String(playerA.id), String(playerB.id)].sort().join(':')

const isFixedOpponentPair = (playerA, playerB, fixedPairs) =>
  fixedPairs.some(
    ([a, b]) => opponentPairKey(a, b) === opponentPairKey(playerA, playerB)
  )

const hasRepeatOpponents = (teamA, teamB, fixedPairs = []) => {
  for (let i = 0; i < teamA.length; i += 1) {
    for (let j = 0; j < teamB.length; j += 1) {
      const playerA = teamA[i]
      const playerB = teamB[j]
      if (isFixedOpponentPair(playerA, playerB, fixedPairs)) continue
      if (hasOpposedBefore(playerA, playerB)) return true
    }
  }
  return false
}

const crossTeamOpponentMetrics = (teamA, teamB, fixedPairs = []) => {
  let freshCount = 0
  let repeatScore = 0

  teamA.forEach((playerA) => {
    teamB.forEach((playerB) => {
      if (isFixedOpponentPair(playerA, playerB, fixedPairs)) return
      if (hasOpposedBefore(playerA, playerB)) {
        repeatScore += opponentRepeatCount(playerA, playerB)
      } else {
        freshCount += 1
      }
    })
  })

  return { freshCount, repeatScore }
}

const assignmentMixedScore = (winner1, partner1, winner2, partner2) =>
  (isMixedGender(winner1, partner1) ? 1 : 0) +
  (isMixedGender(winner2, partner2) ? 1 : 0)

const assignmentMetrics = (winner1, partner1, winner2, partner2) => {
  const opponentMetrics = crossTeamOpponentMetrics(
    [winner1, partner1],
    [winner2, partner2],
    [[winner1, winner2]]
  )

  const teamA = [winner1, partner1]
  const teamB = [winner2, partner2]
  const fixedPairs = [[winner1, winner2]]

  return {
    freshCount:
      (hasPartneredBefore(winner1, partner1) ? 0 : 1) +
      (hasPartneredBefore(winner2, partner2) ? 0 : 1),
    repeatScore:
      partnerRepeatCount(winner1, partner1) + partnerRepeatCount(winner2, partner2),
    hasRepeatOpponents: hasRepeatOpponents(teamA, teamB, fixedPairs),
    opponentFreshCount: opponentMetrics.freshCount,
    opponentRepeatScore: opponentMetrics.repeatScore,
    mixedScore: assignmentMixedScore(winner1, partner1, winner2, partner2),
    total: candidateScore(winner1, partner1) + candidateScore(winner2, partner2),
    poolOrderScore: 0,
    restedScore: 0,
  }
}

const INITIAL_ASSIGNMENT_METRICS = {
  freshCount: -1,
  repeatScore: Infinity,
  hasRepeatOpponents: true,
  opponentFreshCount: -1,
  opponentRepeatScore: Infinity,
  starterPartnerOnCooldown: Infinity,
  restedScore: Infinity,
  mixedScore: -1,
  total: Infinity,
  poolOrderScore: Infinity,
}

const isBetterAssignment = (next, best) => {
  if (next.hasRepeatOpponents !== best.hasRepeatOpponents) {
    return !next.hasRepeatOpponents
  }
  if (next.hasRepeatOpponents) {
    if (next.opponentFreshCount !== best.opponentFreshCount) {
      return next.opponentFreshCount > best.opponentFreshCount
    }
    if (next.opponentRepeatScore !== best.opponentRepeatScore) {
      return next.opponentRepeatScore < best.opponentRepeatScore
    }
  }
  if (next.freshCount !== best.freshCount) return next.freshCount > best.freshCount
  if (next.repeatScore !== best.repeatScore) return next.repeatScore < best.repeatScore
  if (next.opponentFreshCount !== best.opponentFreshCount) {
    return next.opponentFreshCount > best.opponentFreshCount
  }
  if (next.opponentRepeatScore !== best.opponentRepeatScore) {
    return next.opponentRepeatScore < best.opponentRepeatScore
  }
  if (next.starterPartnerOnCooldown !== best.starterPartnerOnCooldown) {
    return next.starterPartnerOnCooldown < best.starterPartnerOnCooldown
  }
  if (next.restedScore !== best.restedScore) return next.restedScore < best.restedScore
  if (next.mixedScore !== best.mixedScore) return next.mixedScore > best.mixedScore
  if (next.total !== best.total) return next.total < best.total
  return (next.poolOrderScore || 0) < (best.poolOrderScore || 0)
}

const courtCompositionMetrics = (teamA, teamB, options = {}) => {
  const {
    fixedOpponentPairs = [],
    poolOrderScore = 0,
    restedScore = 0,
    starterPartnerOnCooldown = 0,
  } = options
  const [playerA1, playerA2] = teamA
  const [playerB1, playerB2] = teamB
  const opponentMetrics = crossTeamOpponentMetrics(teamA, teamB, fixedOpponentPairs)

  return {
    freshCount:
      (hasPartneredBefore(playerA1, playerA2) ? 0 : 1) +
      (hasPartneredBefore(playerB1, playerB2) ? 0 : 1),
    repeatScore:
      partnerRepeatCount(playerA1, playerA2) + partnerRepeatCount(playerB1, playerB2),
    hasRepeatOpponents: hasRepeatOpponents(teamA, teamB, fixedOpponentPairs),
    opponentFreshCount: opponentMetrics.freshCount,
    opponentRepeatScore: opponentMetrics.repeatScore,
    starterPartnerOnCooldown,
    restedScore,
    mixedScore:
      (isMixedGender(playerA1, playerA2) ? 1 : 0) +
      (isMixedGender(playerB1, playerB2) ? 1 : 0),
    total:
      candidateScore(teamA[0], teamA[1]) + candidateScore(teamB[0], teamB[1]),
    poolOrderScore,
  }
}

// Pool expansion order: rested players at same / lower / higher skill level,
// then cooldown at lower / higher / same. Cooldown same-level (recent losers)
// is the last resort before giving up.
const POOL_TIER_ORDER = [
  { rested: true, priority: 0 },
  { rested: true, priority: 1 },
  { rested: true, priority: 2 },
  { rested: false, priority: 1 },
  { rested: false, priority: 2 },
  { rested: false, priority: 0 },
]

const playersInTier = (source, winner1, winner2, priority) =>
  source.filter((player) => {
    const p1 = partnerPriority(winner1, player)
    const p2 = partnerPriority(winner2, player)
    return p1 === priority || p2 === priority
  })

// Find best (partner1, partner2) assignment from a pool for two winners.
// Returns { partner1, partner2 } or null.
const findBestPartnerPair = (winner1, winner2, pool) => {
  if (pool.length < 2) return null

  let bestPartner1 = null
  let bestPartner2 = null
  let bestMetrics = { ...INITIAL_ASSIGNMENT_METRICS }

  for (let i = 0; i < pool.length; i += 1) {
    for (let j = 0; j < pool.length; j += 1) {
      if (i === j) continue
      const metrics = assignmentMetrics(winner1, pool[i], winner2, pool[j])
      if (isBetterAssignment(metrics, bestMetrics)) {
        bestMetrics = metrics
        bestPartner1 = pool[i]
        bestPartner2 = pool[j]
      }
    }
  }

  if (!bestPartner1 || !bestPartner2) return null
  return { partner1: bestPartner1, partner2: bestPartner2 }
}

const buildTieredPartnerPool = (rested, onCooldown, winner1, winner2) => {
  const cumulative = []
  const seen = new Set()
  let bestAssignment = null
  let bestMetrics = { ...INITIAL_ASSIGNMENT_METRICS }

  for (const tier of POOL_TIER_ORDER) {
    const source = tier.rested ? rested : onCooldown
    const tierPlayers = playersInTier(source, winner1, winner2, tier.priority)
    tierPlayers.forEach((player) => {
      if (seen.has(player.id)) return
      seen.add(player.id)
      cumulative.push(player)
    })

    if (cumulative.length >= 2) {
      const assignment = findBestPartnerPair(winner1, winner2, cumulative)
      if (!assignment) continue

      const metrics = assignmentMetrics(
        winner1,
        assignment.partner1,
        winner2,
        assignment.partner2
      )
      if (isBetterAssignment(metrics, bestMetrics)) {
        bestMetrics = metrics
        bestAssignment = assignment
      }
    }
  }

  return bestAssignment
}

// -----------------------------------------------------------------------------
// Single-winner partner selection
// -----------------------------------------------------------------------------
// When only one winner holds the throne, pick the full court assignment that
// best balances fresh partners and fresh cross-team opponents.

const findSingleWinnerPartners = (winner, rested, onCooldown) => {
  const pool = [...rested, ...onCooldown]
  if (pool.length < 3) return null

  let bestAssignment = null
  let bestMetrics = { ...INITIAL_ASSIGNMENT_METRICS }
  const restedIds = new Set(rested.map((player) => player.id))

  for (let partnerIndex = 0; partnerIndex < pool.length; partnerIndex += 1) {
    const partner = pool[partnerIndex]
    const remaining = pool.filter((_, index) => index !== partnerIndex)

    for (let i = 0; i < remaining.length; i += 1) {
      for (let j = i + 1; j < remaining.length; j += 1) {
        const opponent1 = remaining[i]
        const opponent2 = remaining[j]
        const metrics = courtCompositionMetrics(
          [winner, partner],
          [opponent1, opponent2],
          {
            restedScore:
              (restedIds.has(partner.id) ? 0 : 1) +
              (restedIds.has(opponent1.id) ? 0 : 1) +
              (restedIds.has(opponent2.id) ? 0 : 1),
          }
        )

        if (isBetterAssignment(metrics, bestMetrics)) {
          bestMetrics = metrics
          bestAssignment = { partner, opponent1, opponent2 }
        }
      }
    }
  }

  return bestAssignment
}

// -----------------------------------------------------------------------------
// generateCourtAfterScore
// -----------------------------------------------------------------------------
// After a score is entered, staying winners remain on court with new partners
// drawn from the queue.
//
// Supports 2 winners (split onto opposing teams, each gets a new partner) or
// 1 winner (placed on team A with a partner; 2 opponents fill team B).
//
// Partner selection prefers fresh partners, then lowest prior-partner counts,
// then mixed doubles, skill proximity, and games played. Repeats only when the
// expanded queue cannot offer a better assignment.

const generateCourtAfterScore = (allPlayers, options = {}) => {
  const {
    winnerIds = [],
    courtMatchups = [],
    matchHistory = [],
    courts = 2,
  } = options

  if (winnerIds.length < 1 || winnerIds.length > 2) return null

  const byId = new Map(allPlayers.map((p) => [p.id, p]))
  const winners = winnerIds.map((id) => byId.get(id)).filter(Boolean)
  if (winners.length !== winnerIds.length) return null
  if (winners.some((w) => !w.checkedIn)) return null

  if (winners.length === 2) {
    if (skillGroupOf(winners[0].skillLevel) !== skillGroupOf(winners[1].skillLevel))
      return null
  }

  const courtGroup = skillGroupOf(winners[0].skillLevel)

  const onCourtIds = new Set()
  ;(courtMatchups ?? []).forEach((matchup) => {
    if (!matchup) return
    matchup.teamA?.forEach((p) => onCourtIds.add(p.id))
    matchup.teamB?.forEach((p) => onCourtIds.add(p.id))
  })
  winners.forEach((w) => onCourtIds.add(w.id))

  const available = allPlayers.filter(
    (p) =>
      p.checkedIn &&
      !onCourtIds.has(p.id) &&
      skillGroupOf(p.skillLevel) === courtGroup
  )

  const neededPartners = winners.length === 2 ? 2 : 3
  if (available.length < neededPartners) return null

  const cooldownIds = getCooldownIds(matchHistory, courts)
  const rested = available.filter((p) => !cooldownIds.has(p.id))
  const onCooldown = available.filter((p) => cooldownIds.has(p.id))

  if (winners.length === 2) {
    const assignment = buildTieredPartnerPool(rested, onCooldown, winners[0], winners[1])
    if (!assignment) return null
    return {
      teamA: [winners[0], assignment.partner1],
      teamB: [winners[1], assignment.partner2],
    }
  }

  const assignment = findSingleWinnerPartners(winners[0], rested, onCooldown)
  if (!assignment) return null
  return {
    teamA: [winners[0], assignment.partner],
    teamB: [assignment.opponent1, assignment.opponent2],
  }
}

// -----------------------------------------------------------------------------
// Fallback court fill — last resort when Throne + PP generation both fail
// -----------------------------------------------------------------------------
// Picks the lowest-gamesPlayed checked-in player as the starter, then fills
// the remaining 3 slots by expanding outward through skill proximity and
// availability tiers:
//   1. Rested players at the same skill level
//   2. Rested players at adjacent skill levels (±1 rank)
//   3. Remaining rested players (any skill)
//   4. Cooldown players (any skill, last resort)
// Within each tier, lower gamesPlayed is preferred (stable id tie-break).

function generateFallbackCourtByPriority(allPlayers, options = {}) {
  const {
    courtIndex,
    courtMatchups = [],
    matchHistory = [],
    courts = 2,
  } = options

  const onOtherCourtIds = new Set()
  ;(courtMatchups ?? []).forEach((matchup, idx) => {
    if (idx === courtIndex || !matchup) return
    matchup.teamA?.forEach((p) => onOtherCourtIds.add(p.id))
    matchup.teamB?.forEach((p) => onOtherCourtIds.add(p.id))
  })

  const available = allPlayers.filter(
    (p) => p.checkedIn && !onOtherCourtIds.has(p.id)
  )

  if (available.length < 4) return null

  const sorted = [...available].sort((a, b) => {
    const gamesA = Number(a.gamesPlayed) || 0
    const gamesB = Number(b.gamesPlayed) || 0
    if (gamesA !== gamesB) return gamesA - gamesB
    return String(a.id).localeCompare(String(b.id))
  })

  const starter = sorted[0]
  const starterRank = skillRankOf(starter.skillLevel)

  const cooldownIds = getCooldownIds(matchHistory, courts)
  const candidates = sorted.filter((p) => p.id !== starter.id)

  const rested = candidates.filter((p) => !cooldownIds.has(p.id))
  const onCooldown = candidates.filter((p) => cooldownIds.has(p.id))

  const sameSkillRested = rested.filter(
    (p) => skillRankOf(p.skillLevel) === starterRank
  )
  const adjacentRested = rested.filter(
    (p) => Math.abs(skillRankOf(p.skillLevel) - starterRank) === 1
  )
  const otherRested = rested.filter((p) => {
    const diff = Math.abs(skillRankOf(p.skillLevel) - starterRank)
    return diff > 1
  })

  const orderedPool = [
    ...sameSkillRested,
    ...adjacentRested,
    ...otherRested,
    ...onCooldown,
  ]

  if (orderedPool.length < 3) return null

  const starterGroup = skillGroupOf(starter.skillLevel)
  const sameGroupPool = orderedPool.filter(
    (player) => skillGroupOf(player.skillLevel) === starterGroup
  )
  const sameGroupRestedCount = sameGroupPool.filter(
    (player) => !cooldownIds.has(player.id)
  ).length
  const searchPool =
    sameGroupPool.length >= 3 && sameGroupRestedCount >= 2
      ? sameGroupPool
      : orderedPool

  let bestPartner = null
  let bestOpponent1 = null
  let bestOpponent2 = null
  let bestMetrics = { ...INITIAL_ASSIGNMENT_METRICS }

  for (let partnerIndex = 0; partnerIndex < searchPool.length; partnerIndex += 1) {
    const partner = searchPool[partnerIndex]
    const remaining = searchPool.filter((_, index) => index !== partnerIndex)

    for (let i = 0; i < remaining.length; i += 1) {
      for (let j = i + 1; j < remaining.length; j += 1) {
        const opponent1 = remaining[i]
        const opponent2 = remaining[j]
        const poolOrderScore =
          orderedPool.findIndex((player) => player.id === partner.id) +
          orderedPool.findIndex((player) => player.id === opponent1.id) +
          orderedPool.findIndex((player) => player.id === opponent2.id)
        const restedScore =
          (cooldownIds.has(partner.id) ? 1 : 0) +
          (cooldownIds.has(opponent1.id) ? 1 : 0) +
          (cooldownIds.has(opponent2.id) ? 1 : 0)
        const metrics = courtCompositionMetrics(
          [starter, partner],
          [opponent1, opponent2],
          {
            poolOrderScore,
            restedScore,
            starterPartnerOnCooldown: cooldownIds.has(partner.id) ? 1 : 0,
          }
        )

        if (isBetterAssignment(metrics, bestMetrics)) {
          bestMetrics = metrics
          bestPartner = partner
          bestOpponent1 = opponent1
          bestOpponent2 = opponent2
        }
      }
    }
  }

  if (!bestPartner || !bestOpponent1 || !bestOpponent2) return null

  return {
    teamA: [starter, bestPartner],
    teamB: [bestOpponent1, bestOpponent2],
  }
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

export {
  generateMatches,
  applyMatchResult,
  generateCourtAfterScore,
  generateFallbackCourtByPriority,
  selectPrimaryThroneWinner,
}
