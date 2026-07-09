// =============================================================================
// Round Robin Engine — V2 doubles & singles match generation
// =============================================================================
//
// Pure JS, no React / DOM / network dependencies.
// All state is JSON-serializable; the caller owns persistence.
//
// Goal: everyone shares a court with and/or against everyone exactly once
// before any pairing repeats. Because any two players on the same court have
// "met" (whether teammates or opponents), coverage is driven by which group is
// picked. The engine greedily prefers groups whose member-pairs have met the
// fewest times, with a soft cooldown so players rest between games.
//
// Player input shape (subset used here):
//   { id, name, checkedIn, queueOrder, gamesPlayed, wins, losses,
//     partnerCounts, opponentCounts }
//
// Public API:
//   generateRoundRobinCourt(players, { courtIndex, courtMatchups, matchHistory,
//                                      courts, gameMode, excludePlayerIds })
//   applyMatchResult(players, { courtIndex, teamAIds, teamBIds, winningTeam })
//   revertMatchResult(players, { teamAIds, teamBIds, winningTeam })

import { getAllOnCourtPlayerIds } from './progressivePlayCourtRefresh'

// -----------------------------------------------------------------------------
// 1. Helpers
// -----------------------------------------------------------------------------

const CANDIDATE_WINDOW = 10
const leagueLargeRosterThreshold = (courts, gameMode = 'doubles') =>
  Math.max(courts, 1) * (gameMode === 'singles' ? 2 : 4)

const shuffle = (items) => {
  const list = [...items]
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

const checkInOrderOf = (player) => Number(player.queueOrder) || 0

const teamSizeForMode = (gameMode) => (gameMode === 'singles' ? 1 : 2)

const matchSignature = (teamAIds, teamBIds) => {
  const a = [...teamAIds].sort().join(',')
  const b = [...teamBIds].sort().join(',')
  return [a, b].sort().join(' vs ')
}

const partnerCount = (player, otherId) =>
  Number(player?.partnerCounts?.[otherId]) || 0

const opponentCount = (player, otherId) =>
  Number(player?.opponentCounts?.[otherId]) || 0

// How many times two players have shared a court (teammates OR opponents).
const metCount = (a, b) =>
  partnerCount(a, b.id) +
  partnerCount(b, a.id) +
  opponentCount(a, b.id) +
  opponentCount(b, a.id)

const gamesPlayedOf = (player) => Number(player.gamesPlayed) || 0

const SKILL_RANK = {
  beginner: 0,
  novice: 1,
  intermediate: 2,
  advanced: 3,
}

const normalizeSkillLevel = (level) => String(level ?? '').trim().toLowerCase()

const skillRankOf = (level) => SKILL_RANK[normalizeSkillLevel(level)] ?? 0

// Map of playerId -> locked teammate id, for mutually-paired players that are
// both present in `players`. Locked pairs always play on the same team.
const buildLockedPartnerMap = (players) => {
  const byId = new Map(players.map((p) => [p.id, p]))
  const map = new Map()
  players.forEach((player) => {
    const teammateId = player.teammateId
    if (!teammateId) return
    const teammate = byId.get(teammateId)
    if (teammate && teammate.teammateId === player.id) {
      map.set(player.id, teammateId)
    }
  })
  return map
}

const arePartnersLocked = (lockedPartner, aId, bId) =>
  lockedPartner.get(aId) === bId

const cooldownWindowForCourts = (courtSlots) =>
  Math.max(courtSlots || 1, 1) <= 3 ? 1 : 2

// Players who appeared in the most recent `courtSlots` match-history entries.
const getCooldownIds = (matchHistory, courtSlots) => {
  const recentEntries = (matchHistory ?? []).slice(
    -cooldownWindowForCourts(courtSlots)
  )
  const cooldownIds = new Set()
  recentEntries.forEach((entry) => {
    ;(entry.teamAIds ?? []).forEach((id) => cooldownIds.add(id))
    ;(entry.teamBIds ?? []).forEach((id) => cooldownIds.add(id))
  })
  return cooldownIds
}

// Rank players so the front of the list is the most deserving to play next:
// rested before on-cooldown, then fewest games, then earliest check-in.
const rankByFairness = (players, cooldownIds) =>
  [...players].sort((a, b) => {
    const aCooldown = cooldownIds.has(a.id) ? 1 : 0
    const bCooldown = cooldownIds.has(b.id) ? 1 : 0
    if (aCooldown !== bCooldown) return aCooldown - bCooldown
    const gamesDiff = gamesPlayedOf(a) - gamesPlayedOf(b)
    if (gamesDiff !== 0) return gamesDiff
    const orderDiff = checkInOrderOf(a) - checkInOrderOf(b)
    if (orderDiff !== 0) return orderDiff
    return String(a.id).localeCompare(String(b.id))
  })

// -----------------------------------------------------------------------------
// 2. Combination helpers
// -----------------------------------------------------------------------------

const combinations = (items, size) => {
  const results = []
  const choose = (start, picked) => {
    if (picked.length === size) {
      results.push([...picked])
      return
    }
    for (let i = start; i < items.length; i += 1) {
      picked.push(items[i])
      choose(i + 1, picked)
      picked.pop()
    }
  }
  choose(0, [])
  return results
}

// Sum of met-counts across every pair in a group. Locked partnerships are
// excluded because that pairing is forced (not a repeat the engine should
// avoid), so it must not make the group look "over-met".
const groupMetScore = (group, lockedPartner = new Map()) => {
  let total = 0
  for (let i = 0; i < group.length; i += 1) {
    for (let j = i + 1; j < group.length; j += 1) {
      if (arePartnersLocked(lockedPartner, group[i].id, group[j].id)) continue
      total += metCount(group[i], group[j])
    }
  }
  return total
}

// A group is valid only if every locked player has their partner present too.
const isLockConsistent = (group, lockedPartner) =>
  group.every((player) => {
    const partnerId = lockedPartner.get(player.id)
    if (!partnerId) return true
    return group.some((other) => other.id === partnerId)
  })

const groupGamesScore = (group) =>
  group.reduce((sum, player) => sum + gamesPlayedOf(player), 0)

const groupCooldownScore = (group, cooldownIds) =>
  group.reduce((sum, player) => sum + (cooldownIds.has(player.id) ? 1 : 0), 0)

// -----------------------------------------------------------------------------
// 3. Doubles team partition
// -----------------------------------------------------------------------------
//
// Given a chosen foursome, split into two teams of two. Coverage is already
// fixed by the foursome, so the partition just rotates partners: pick the split
// whose two partner-pairs have partnered the fewest times.

const partitionFoursome = (four) => {
  const [p0, p1, p2, p3] = four
  const splits = [
    [[p0, p1], [p2, p3]],
    [[p0, p2], [p1, p3]],
    [[p0, p3], [p1, p2]],
  ]

  const partnerRepeatScore = (pair) =>
    partnerCount(pair[0], pair[1].id) + partnerCount(pair[1], pair[0].id)

  let best = splits[0]
  let bestScore = Infinity
  splits.forEach((split) => {
    const score = partnerRepeatScore(split[0]) + partnerRepeatScore(split[1])
    if (score < bestScore) {
      bestScore = score
      best = split
    }
  })

  return { teamA: best[0], teamB: best[1] }
}

// Partition a foursome into two teams while keeping locked partners together.
// A foursome can hold at most two locked pairs (pairs are disjoint).
const partitionFoursomeWithLocks = (four, lockedPartner) => {
  const lockedPairs = []
  const used = new Set()

  four.forEach((player) => {
    if (used.has(player.id)) return
    const partnerId = lockedPartner.get(player.id)
    const partner = partnerId
      ? four.find((other) => other.id === partnerId)
      : null
    if (partner) {
      lockedPairs.push([player, partner])
      used.add(player.id)
      used.add(partner.id)
    }
  })

  const solos = four.filter((player) => !used.has(player.id))

  if (lockedPairs.length === 2) {
    return { teamA: lockedPairs[0], teamB: lockedPairs[1] }
  }
  if (lockedPairs.length === 1) {
    return { teamA: lockedPairs[0], teamB: solos }
  }
  return partitionFoursome(four)
}

const hasPartneredBefore = (a, b) =>
  partnerCount(a, b.id) > 0 || partnerCount(b, a.id) > 0

const hasOpposedBefore = (a, b) =>
  opponentCount(a, b.id) > 0 || opponentCount(b, a.id) > 0

const isMixedGender = (a, b) => {
  const left = String(a?.gender ?? '').trim().toLowerCase()
  const right = String(b?.gender ?? '').trim().toLowerCase()
  if (!left || !right) return false
  return left !== right
}

const isMixedSkill = (a, b) => skillRankOf(a?.skillLevel) !== skillRankOf(b?.skillLevel)

const enumerateDoublesAssignments = (batch) => [
  {
    teamA: [batch[0], batch[1]],
    teamB: [batch[2], batch[3]],
    index: 0,
  },
  {
    teamA: [batch[0], batch[2]],
    teamB: [batch[1], batch[3]],
    index: 1,
  },
  {
    teamA: [batch[0], batch[3]],
    teamB: [batch[1], batch[2]],
    index: 2,
  },
]

const buildLockedPairs = (group, lockedPartner) => {
  const lockedPairs = []
  const seen = new Set()

  group.forEach((player) => {
    if (seen.has(player.id)) return
    const partnerId = lockedPartner.get(player.id)
    if (!partnerId) return
    const partner = group.find((candidate) => candidate.id === partnerId)
    if (!partner) return
    lockedPairs.push([player.id, partner.id])
    seen.add(player.id)
    seen.add(partner.id)
  })

  return lockedPairs
}

const keepsLockedPairsTogether = (teamA, teamB, lockedPairs) =>
  lockedPairs.every(([leftId, rightId]) => {
    const teamAIds = new Set(teamA.map((player) => player.id))
    const teamBIds = new Set(teamB.map((player) => player.id))
    return (
      (teamAIds.has(leftId) && teamAIds.has(rightId)) ||
      (teamBIds.has(leftId) && teamBIds.has(rightId))
    )
  })

const isLeagueAssignmentFresh = (assignment) => {
  const [a1, a2] = assignment.teamA
  const [b1, b2] = assignment.teamB

  if (hasPartneredBefore(a1, a2) || hasPartneredBefore(b1, b2)) {
    return false
  }

  const crossPairs = [
    [a1, b1],
    [a1, b2],
    [a2, b1],
    [a2, b2],
  ]
  return crossPairs.every(([left, right]) => !hasOpposedBefore(left, right))
}

const scoreLeagueAssignment = (assignment) => {
  const skillMixedCount =
    (isMixedSkill(assignment.teamA[0], assignment.teamA[1]) ? 1 : 0) +
    (isMixedSkill(assignment.teamB[0], assignment.teamB[1]) ? 1 : 0)

  const genderMixedCount =
    (isMixedGender(assignment.teamA[0], assignment.teamA[1]) ? 1 : 0) +
    (isMixedGender(assignment.teamB[0], assignment.teamB[1]) ? 1 : 0)

  const partnerRepeatScore =
    partnerCount(assignment.teamA[0], assignment.teamA[1].id) +
    partnerCount(assignment.teamA[1], assignment.teamA[0].id) +
    partnerCount(assignment.teamB[0], assignment.teamB[1].id) +
    partnerCount(assignment.teamB[1], assignment.teamB[0].id)

  return {
    skillMixedCount,
    genderMixedCount,
    partnerRepeatScore,
    index: assignment.index,
  }
}

const compareLeagueAssignmentScore = (left, right) => {
  if (left.skillMixedCount !== right.skillMixedCount) {
    return right.skillMixedCount - left.skillMixedCount
  }
  if (left.genderMixedCount !== right.genderMixedCount) {
    return right.genderMixedCount - left.genderMixedCount
  }
  if (left.partnerRepeatScore !== right.partnerRepeatScore) {
    return left.partnerRepeatScore - right.partnerRepeatScore
  }
  return left.index - right.index
}

const partitionLeagueFoursome = (four, lockedPartner = new Map()) => {
  if (!Array.isArray(four) || four.length < 4) return null

  const lockedPairs = buildLockedPairs(four, lockedPartner)
  const freshAssignments = enumerateDoublesAssignments(four)
    .filter((assignment) =>
      keepsLockedPairsTogether(assignment.teamA, assignment.teamB, lockedPairs)
    )
    .filter((assignment) => isLeagueAssignmentFresh(assignment))

  if (freshAssignments.length === 0) {
    if (lockedPairs.length > 0) {
      return partitionFoursomeWithLocks(four, lockedPartner)
    }
    return null
  }

  const best = freshAssignments
    .map((assignment) => ({
      assignment,
      score: scoreLeagueAssignment(assignment),
    }))
    .sort((left, right) =>
      compareLeagueAssignmentScore(left.score, right.score)
    )[0]?.assignment

  if (!best) return null
  return { teamA: best.teamA, teamB: best.teamB }
}

// -----------------------------------------------------------------------------
// 4. Group selection
// -----------------------------------------------------------------------------
//
// From the candidate window, pick the best group of `needed` players: fewest
// already-met pairs, then fewest total games, then fewest players on cooldown.

const selectBestGroup = (candidates, needed, cooldownIds, lockedPartner = new Map()) => {
  if (candidates.length < needed) return null

  const groups = combinations(candidates, needed).filter((group) =>
    isLockConsistent(group, lockedPartner)
  )
  let best = null
  let bestMet = Infinity
  let bestGames = Infinity
  let bestCooldown = Infinity

  groups.forEach((group) => {
    const met = groupMetScore(group, lockedPartner)
    const games = groupGamesScore(group)
    const cooldown = groupCooldownScore(group, cooldownIds)

    const isBetter =
      best === null ||
      met < bestMet ||
      (met === bestMet &&
        (games < bestGames ||
          (games === bestGames && cooldown < bestCooldown)))

    if (isBetter) {
      best = group
      bestMet = met
      bestGames = games
      bestCooldown = cooldown
    }
  })

  return best
}

const buildLeagueFoursomeWithReplacement = (
  candidates,
  cooldownIds,
  lockedPartner
) => {
  const groups = combinations(candidates, 4)
    .filter((group) => isLockConsistent(group, lockedPartner))
    .map((group) => ({
      group,
      met: groupMetScore(group, lockedPartner),
      games: groupGamesScore(group),
      cooldown: groupCooldownScore(group, cooldownIds),
    }))
    .sort((left, right) => {
      if (left.met !== right.met) return left.met - right.met
      if (left.games !== right.games) return left.games - right.games
      return left.cooldown - right.cooldown
    })

  for (const { group } of groups) {
    const court = partitionLeagueFoursome(group, lockedPartner)
    if (court) return court
  }

  return null
}

// Checked-in players eligible for round robin. Mutual pairs count only when
// BOTH partners are checked in; if only one is checked in, that pair is
// excluded from matchups and court generation until both are present.
const getRoundRobinActivePlayers = (players) => {
  const roster = players ?? []
  const byId = new Map(roster.map((player) => [player.id, player]))

  return roster.filter((player) => {
    if (!player.checkedIn) return false
    const partnerId = player.teammateId
    if (!partnerId) return true
    const partner = byId.get(partnerId)
    if (!partner || partner.teammateId !== player.id) return true
    return partner.checkedIn
  })
}

// -----------------------------------------------------------------------------
// 5. Public API: generateRoundRobinCourt
// -----------------------------------------------------------------------------

const generateRoundRobinCourt = (players, options = {}) => {
  const {
    matchHistory = [],
    courts = 2,
    gameMode = 'doubles',
    excludePlayerIds,
  } = options

  const teamSize = teamSizeForMode(gameMode)
  const needed = teamSize * 2
  const excludeIds = new Set(excludePlayerIds ?? [])

  const eligible = getRoundRobinActivePlayers(players).filter(
    (player) => !excludeIds.has(player.id)
  )
  if (eligible.length < needed) return null

  const units = buildRoundRobinUnits(eligible)
  const hasLockedTeams = units.some((unit) => unit.length >= 2)

  if (hasLockedTeams && teamSize === 2) {
    const unitCourt = generateRoundRobinCourtFromUnits(eligible, units, options)
    if (unitCourt) return unitCourt

    const playersById = new Map(eligible.map((player) => [player.id, player]))
    if (countUnmetUnitPairs(units, playersById) > 0) {
      const relaxedCourt = generateRoundRobinCourtFromUnits(eligible, units, {
        ...options,
        ignoreCooldown: true,
      })
      if (relaxedCourt) return relaxedCourt
    }
    return null
  }

  const cooldownIds = getCooldownIds(matchHistory, courts)

  // Locked pairs only apply to doubles; singles is strictly 1v1.
  const lockedPartner = teamSize === 2 ? buildLockedPartnerMap(eligible) : new Map()
  const eligibleById = new Map(eligible.map((p) => [p.id, p]))

  // Rank by fairness, then shuffle within equal tiers so repeated refreshes are
  // not deterministic. Shuffling first preserves variety; the stable sort keeps
  // fairness ordering.
  const ranked = rankByFairness(shuffle(eligible), cooldownIds)

  // Bound enumeration cost: consider only the most-deserving candidates, but
  // make sure we keep at least `needed` of them and never split a locked pair
  // across the window boundary.
  const windowSize = Math.max(needed, Math.min(CANDIDATE_WINDOW, ranked.length))
  const candidateMap = new Map()
  for (let i = 0; i < ranked.length && candidateMap.size < windowSize; i += 1) {
    const player = ranked[i]
    candidateMap.set(player.id, player)
    const partnerId = lockedPartner.get(player.id)
    if (partnerId && eligibleById.has(partnerId)) {
      candidateMap.set(partnerId, eligibleById.get(partnerId))
    }
  }
  const candidates = [...candidateMap.values()]

  const group = selectBestGroup(candidates, needed, cooldownIds, lockedPartner)
  if (!group) return null

  if (teamSize === 1) {
    return { teamA: [group[0]], teamB: [group[1]] }
  }

  return partitionFoursomeWithLocks(group, lockedPartner)
}

const generateLeagueCourt = (players, options = {}) => {
  const {
    matchHistory = [],
    courts = 2,
    courtIndex,
    gameMode = 'doubles',
    excludePlayerIds,
  } = options

  if (gameMode === 'singles') {
    return generateRoundRobinCourt(players, options)
  }

  const teamSize = teamSizeForMode(gameMode)
  const needed = teamSize * 2
  const excludeIds = new Set(excludePlayerIds ?? [])

  const eligible = getRoundRobinActivePlayers(players).filter(
    (player) => !excludeIds.has(player.id)
  )
  if (eligible.length < needed) return null

  const units = buildRoundRobinUnits(eligible)
  const hasLockedTeams = units.some((unit) => unit.length >= 2)

  if (hasLockedTeams && teamSize === 2) {
    const unitCourt = generateRoundRobinCourtFromUnits(eligible, units, options)
    if (unitCourt) return unitCourt

    const playersById = new Map(eligible.map((player) => [player.id, player]))
    if (countUnmetUnitPairs(units, playersById) > 0) {
      const relaxedCourt = generateRoundRobinCourtFromUnits(eligible, units, {
        ...options,
        ignoreCooldown: true,
      })
      if (relaxedCourt) return relaxedCourt
    }
  }

  const cooldownIds = getCooldownIds(matchHistory, courts)
  const lockedPartner = buildLockedPartnerMap(eligible)
  const eligibleById = new Map(eligible.map((player) => [player.id, player]))
  const ranked = rankByFairness(eligible, cooldownIds)
  const checkedInCount = getRoundRobinActivePlayers(players).length
  const useDynamicLastCourtRule =
    teamSize === 2 &&
    checkedInCount > leagueLargeRosterThreshold(courts, gameMode)

  if (useDynamicLastCourtRule) {
    const dynamicCourt = buildLeagueCourtFromDynamicLastCourtRule(
      ranked,
      matchHistory,
      lockedPartner
    )
    if (dynamicCourt) return dynamicCourt
  }

  const windowSize = Math.max(needed, Math.min(CANDIDATE_WINDOW, ranked.length))
  const candidateMap = new Map()
  for (let i = 0; i < ranked.length && candidateMap.size < windowSize; i += 1) {
    const player = ranked[i]
    candidateMap.set(player.id, player)
    const partnerId = lockedPartner.get(player.id)
    if (partnerId && eligibleById.has(partnerId)) {
      candidateMap.set(partnerId, eligibleById.get(partnerId))
    }
  }
  const candidates = [...candidateMap.values()]

  const leagueCourt = buildLeagueFoursomeWithReplacement(
    candidates,
    cooldownIds,
    lockedPartner
  )
  if (leagueCourt) return leagueCourt

  const fallbackGroup = selectBestGroup(candidates, needed, cooldownIds, lockedPartner)
  if (!fallbackGroup) return null
  return partitionFoursomeWithLocks(fallbackGroup, lockedPartner)
}

// -----------------------------------------------------------------------------
// 6. Public API: applyMatchResult / revertMatchResult
// -----------------------------------------------------------------------------
//
// Round Robin tracks games, wins/losses, and partner/opponent counts. It never
// shifts skill levels, so historyEntry.skillChanges is always empty.

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
    } else {
      updated.losses = (Number(updated.losses) || 0) + 1
    }
    updated.gamesPlayed = (Number(updated.gamesPlayed) || 0) + 1

    const partnerCounts = { ...(updated.partnerCounts ?? {}) }
    const ownTeam = isWinner ? [...winnerIds] : [...loserIds]
    ownTeam.forEach((id) => {
      if (id !== player.id) {
        partnerCounts[id] = (Number(partnerCounts[id]) || 0) + 1
      }
    })
    updated.partnerCounts = partnerCounts

    const opponentCountsObj = { ...(updated.opponentCounts ?? {}) }
    const opposingTeam = isWinner ? [...loserIds] : [...winnerIds]
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
    skillChanges: {},
  }

  return { players: nextPlayers, historyEntry }
}

const normalizeMatchTimestamp = (entry, index) => {
  const timestamp = Number(entry?.timestamp)
  if (Number.isFinite(timestamp)) return timestamp
  return Number.MIN_SAFE_INTEGER + index
}

const derivePlayerLastMatch = (playerId, matchHistory = []) => {
  if (!playerId || !Array.isArray(matchHistory) || matchHistory.length === 0) {
    return null
  }

  const ranked = matchHistory
    .map((entry, index) => ({
      entry,
      index,
      rank: normalizeMatchTimestamp(entry, index),
    }))
    .sort((left, right) => right.rank - left.rank || right.index - left.index)

  for (let i = 0; i < ranked.length; i += 1) {
    const entry = ranked[i].entry
    const teamAIds = Array.isArray(entry?.teamAIds) ? entry.teamAIds : []
    const teamBIds = Array.isArray(entry?.teamBIds) ? entry.teamBIds : []
    const playedOnTeamA = teamAIds.includes(playerId)
    const playedOnTeamB = teamBIds.includes(playerId)
    if (!playedOnTeamA && !playedOnTeamB) continue

    const isWinner =
      (playedOnTeamA && entry.winningTeam === 'A') ||
      (playedOnTeamB && entry.winningTeam === 'B')

    return {
      courtIndex: Number.isInteger(entry.courtIndex) ? entry.courtIndex : null,
      teamAIds: [...teamAIds],
      teamBIds: [...teamBIds],
      result: isWinner ? 'win' : 'loss',
    }
  }

  return null
}

const getPlayerLastCourtIndex = (player, matchHistory = []) => {
  const storedCourt = player?.lastMatch?.courtIndex
  if (Number.isInteger(storedCourt)) return storedCourt
  return derivePlayerLastMatch(player?.id, matchHistory)?.courtIndex ?? null
}

const addLockedAwarePlayer = (
  player,
  selected,
  selectedIds,
  rankedById,
  lockedPartner
) => {
  if (!player || selectedIds.has(player.id)) return false

  const partnerId = lockedPartner.get(player.id)
  if (partnerId) {
    if (selectedIds.has(partnerId)) return false
    const partner = rankedById.get(partnerId)
    if (!partner) return false
    if (selected.length + 2 > 4) return false
    selected.push(player, partner)
    selectedIds.add(player.id)
    selectedIds.add(partner.id)
    return true
  }

  if (selected.length >= 4) return false
  selected.push(player)
  selectedIds.add(player.id)
  return true
}

const buildLeagueCourtFromDynamicLastCourtRule = (
  ranked,
  matchHistory,
  lockedPartner
) => {
  if (ranked.length < 4) return null

  const anchor = ranked[0]
  const anchorLastCourt = getPlayerLastCourtIndex(anchor, matchHistory)
  if (!Number.isInteger(anchorLastCourt)) return null

  const rankedById = new Map(ranked.map((player) => [player.id, player]))
  const selected = []
  const selectedIds = new Set()

  if (!addLockedAwarePlayer(anchor, selected, selectedIds, rankedById, lockedPartner)) {
    return null
  }

  const pool = ranked.filter(
    (player) =>
      !selectedIds.has(player.id) &&
      getPlayerLastCourtIndex(player, matchHistory) !== anchorLastCourt
  )
  const slotsRemaining = 4 - selected.length
  let fillableSlots = 0
  const simulatedSelectedIds = new Set(selectedIds)
  for (const player of pool) {
    if (simulatedSelectedIds.has(player.id)) continue
    const partnerId = lockedPartner.get(player.id)
    if (partnerId) {
      if (simulatedSelectedIds.has(partnerId)) continue
      const partner = rankedById.get(partnerId)
      if (!partner || fillableSlots + 2 > slotsRemaining) continue
      simulatedSelectedIds.add(player.id)
      simulatedSelectedIds.add(partner.id)
      fillableSlots += 2
    } else {
      simulatedSelectedIds.add(player.id)
      fillableSlots += 1
    }
    if (fillableSlots >= slotsRemaining) break
  }
  if (fillableSlots < slotsRemaining) return null

  for (const player of pool) {
    if (selected.length >= 4) break
    addLockedAwarePlayer(player, selected, selectedIds, rankedById, lockedPartner)
  }

  if (selected.length !== 4 || !isLockConsistent(selected, lockedPartner)) return null

  return partitionLeagueFoursome(selected, lockedPartner)
}

const applyLeagueLastMatchToPlayers = (players, result) => {
  const { courtIndex, teamAIds = [], teamBIds = [], winningTeam } = result ?? {}
  const teamASet = new Set(teamAIds)
  const teamBSet = new Set(teamBIds)
  const matchPlayerIds = new Set([...teamAIds, ...teamBIds])

  return (players ?? []).map((player) => {
    if (!matchPlayerIds.has(player.id)) return player
    const isWinner =
      (teamASet.has(player.id) && winningTeam === 'A') ||
      (teamBSet.has(player.id) && winningTeam === 'B')
    return {
      ...player,
      lastMatch: {
        courtIndex: Number.isInteger(courtIndex) ? courtIndex : null,
        teamAIds: [...teamAIds],
        teamBIds: [...teamBIds],
        result: isWinner ? 'win' : 'loss',
      },
    }
  })
}

const syncLeagueLastMatchFields = (players, matchHistory = []) =>
  (players ?? []).map((player) => ({
    ...player,
    lastMatch: derivePlayerLastMatch(player.id, matchHistory),
  }))

const removeRevertedMatchFromHistory = (matchHistory = [], result = {}) => {
  if (!Array.isArray(matchHistory) || matchHistory.length === 0) return []

  if (result?.id) {
    let removedById = false
    return matchHistory.filter((entry) => {
      if (!removedById && entry?.id === result.id) {
        removedById = true
        return false
      }
      return true
    })
  }

  const sameIds = (left = [], right = []) =>
    left.length === right.length && left.every((id, index) => id === right[index])

  let removed = false
  return matchHistory.filter((entry) => {
    if (removed) return true
    const matches =
      sameIds(entry?.teamAIds ?? [], result?.teamAIds ?? []) &&
      sameIds(entry?.teamBIds ?? [], result?.teamBIds ?? []) &&
      entry?.winningTeam === result?.winningTeam &&
      (entry?.courtIndex ?? null) === (result?.courtIndex ?? null)
    if (!matches) return true
    removed = true
    return false
  })
}

const applyLeagueMatchResult = (players, result, options = {}) => {
  const base = applyMatchResult(players, result)
  return {
    ...base,
    players: applyLeagueLastMatchToPlayers(base.players, result),
  }
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
    } else {
      updated.losses = Math.max(0, (Number(updated.losses) || 0) - 1)
    }
    updated.gamesPlayed = Math.max(0, (Number(updated.gamesPlayed) || 0) - 1)

    const partnerCounts = { ...(updated.partnerCounts ?? {}) }
    const ownTeam = isWinner ? [...winnerIds] : [...loserIds]
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
    const opposingTeam = isWinner ? [...loserIds] : [...winnerIds]
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

const revertLeagueMatchResult = (players, result, options = {}) => {
  const { matchHistory = [] } = options
  const revertedPlayers = revertMatchResult(players, result)

  const previousHistory = removeRevertedMatchFromHistory(matchHistory, result)
  return syncLeagueLastMatchFields(revertedPlayers, previousHistory)
}

// -----------------------------------------------------------------------------
// 7. Round robin progress (remaining / total matchups)
// -----------------------------------------------------------------------------
//
// Singles: each player plays every other player once → n*(n-1)/2 matchups.
//
// Doubles with locked teams: each locked pair is a fixed team; every team
// plays every other team once → t*(t-1)/2 matchups (e.g. 8 teams → 28).
//
// Doubles without locked teams: every player shares a court with every other
// player once → ceil(n*(n-1)/12) matchups (6 player-pairs per court).

const buildRoundRobinUnits = (checkedIn) => {
  const byId = new Map(checkedIn.map((player) => [player.id, player]))
  const lockedPartner = buildLockedPartnerMap(checkedIn)
  const used = new Set()
  const units = []

  checkedIn.forEach((player) => {
    if (used.has(player.id)) return
    const partnerId = lockedPartner.get(player.id)
    if (partnerId && byId.has(partnerId)) {
      units.push([player.id, partnerId].sort())
      used.add(player.id)
      used.add(partnerId)
      return
    }
    units.push([player.id])
    used.add(player.id)
  })

  return units
}

const unitsHaveMet = (unitA, unitB, playersById) => {
  for (const idA of unitA) {
    const playerA = playersById.get(idA)
    if (!playerA) continue
    for (const idB of unitB) {
      if (opponentCount(playerA, idB) > 0) return true
    }
  }
  return false
}

const countUnmetPlayerPairs = (players) => {
  let unmet = 0
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      if (metCount(players[i], players[j]) === 0) unmet += 1
    }
  }
  return unmet
}

const countUnmetUnitPairs = (units, playersById) => {
  let unmet = 0
  for (let i = 0; i < units.length; i += 1) {
    for (let j = i + 1; j < units.length; j += 1) {
      if (!unitsHaveMet(units[i], units[j], playersById)) unmet += 1
    }
  }
  return unmet
}

const unitPairFairnessScore = (unitA, unitB, playersById, cooldownIds) => {
  const roster = [...unitA, ...unitB]
    .map((id) => playersById.get(id))
    .filter(Boolean)
  const cooldownCount = roster.filter((player) => cooldownIds.has(player.id)).length
  const games = roster.reduce((sum, player) => sum + gamesPlayedOf(player), 0)
  return { cooldownCount, games }
}

// Build a court from two round-robin units (locked teams and/or solos). When a
// side has only one player, pick an eligible filler partner on that side.
const buildCourtFromUnitPair = (
  unitA,
  unitB,
  eligible,
  playersById,
  lockedPartner,
  cooldownIds
) => {
  const eligibleIds = new Set(eligible.map((player) => player.id))
  const usedIds = new Set([...unitA, ...unitB])

  const toPlayers = (unit) =>
    unit.map((id) => playersById.get(id)).filter((player) => player && eligibleIds.has(player.id))

  const pickFillerPartner = (forUnitIds) => {
    const blocked = new Set([...usedIds, ...forUnitIds])
    const candidates = eligible.filter((player) => {
      if (blocked.has(player.id)) return false
      const partnerId = lockedPartner.get(player.id)
      if (partnerId && blocked.has(partnerId)) return false
      return true
    })
    const ranked = rankByFairness(candidates, cooldownIds)
    return ranked[0] ?? null
  }

  let teamA = toPlayers(unitA)
  let teamB = toPlayers(unitB)

  if (teamA.length === 1) {
    const filler = pickFillerPartner(teamA.map((player) => player.id))
    if (!filler) return null
    teamA = [teamA[0], filler]
    usedIds.add(filler.id)
  }
  if (teamB.length === 1) {
    const filler = pickFillerPartner(teamB.map((player) => player.id))
    if (!filler) return null
    teamB = [teamB[0], filler]
  }

  if (teamA.length !== 2 || teamB.length !== 2) return null
  return { teamA, teamB }
}

// When locked teams exist, schedule team-vs-team matchups that have not been
// played yet instead of minimizing player-pair repeats (which can re-book the
// same two teams and stall the remaining-matchups counter).
const generateRoundRobinCourtFromUnits = (eligible, units, options = {}) => {
  const { matchHistory = [], courts = 2, ignoreCooldown = false } = options
  const playersById = new Map(eligible.map((player) => [player.id, player]))
  const lockedPartner = buildLockedPartnerMap(eligible)
  const cooldownIds = ignoreCooldown
    ? new Set()
    : getCooldownIds(matchHistory, courts)

  const unmetPairs = []
  for (let i = 0; i < units.length; i += 1) {
    for (let j = i + 1; j < units.length; j += 1) {
      if (!unitsHaveMet(units[i], units[j], playersById)) {
        unmetPairs.push([units[i], units[j]])
      }
    }
  }

  if (unmetPairs.length === 0) return null

  const ranked = unmetPairs
    .map(([unitA, unitB]) => {
      const { cooldownCount, games } = unitPairFairnessScore(
        unitA,
        unitB,
        playersById,
        cooldownIds
      )
      const court = buildCourtFromUnitPair(
        unitA,
        unitB,
        eligible,
        playersById,
        lockedPartner,
        cooldownIds
      )
      return { unitA, unitB, cooldownCount, games, court }
    })
    .filter(({ court }) => court !== null)
    .sort((a, b) => {
      if (a.cooldownCount !== b.cooldownCount) return a.cooldownCount - b.cooldownCount
      return a.games - b.games
    })

  return ranked[0]?.court ?? null
}

const computeRoundRobinMatchupProgress = (players, { gameMode = 'doubles' } = {}) => {
  const active = getRoundRobinActivePlayers(players)
  const n = active.length
  const minPlayers = gameMode === 'singles' ? 2 : 4

  if (n < minPlayers) {
    return { remaining: 0, total: 0 }
  }

  if (gameMode === 'singles') {
    const total = (n * (n - 1)) / 2
    const unmetPairs = countUnmetPlayerPairs(active)
    return { remaining: unmetPairs, total }
  }

  const units = buildRoundRobinUnits(active)
  const hasLockedTeams = units.some((unit) => unit.length >= 2)

  if (hasLockedTeams) {
    const teamCount = units.length
    const total = (teamCount * (teamCount - 1)) / 2
    const playersById = new Map(active.map((player) => [player.id, player]))
    const remaining = countUnmetUnitPairs(units, playersById)
    return { remaining, total }
  }

  const totalPairs = (n * (n - 1)) / 2
  const unmetPairs = countUnmetPlayerPairs(active)
  return {
    remaining: Math.ceil(unmetPairs / 6),
    total: Math.ceil(totalPairs / 6),
  }
}

const buildLeagueUpNextPreview = (
  players,
  {
    numberOfCourts = 1,
    gameMode = 'doubles',
    courtMatchups = [],
    matchHistory = [],
  } = {}
) => {
  const onCourtIds = new Set()
  ;(courtMatchups ?? []).forEach((matchup) => {
    if (!matchup) return
    matchup.teamA?.forEach((p) => onCourtIds.add(p.id))
    matchup.teamB?.forEach((p) => onCourtIds.add(p.id))
  })

  const checkedIn = (players ?? []).filter((p) => p.checkedIn)
  const cooldownIds = getCooldownIds(matchHistory, numberOfCourts)
  const sittingOut = checkedIn.filter(
    (p) => !onCourtIds.has(p.id) && !cooldownIds.has(p.id)
  )
  const cooldown = checkedIn.filter(
    (p) => !onCourtIds.has(p.id) && cooldownIds.has(p.id)
  )

  const maxSlots =
    Math.max(numberOfCourts, 1) * (gameMode === 'singles' ? 2 : 4)
  const onDeckSize = gameMode === 'singles' ? 2 : 4

  const allHaveZeroGames = checkedIn.every((p) => gamesPlayedOf(p) === 0)

  const orderPool = (pool, cooldownSet) =>
    allHaveZeroGames
      ? [...pool].sort((a, b) => {
          const orderDiff = checkInOrderOf(a) - checkInOrderOf(b)
          if (orderDiff !== 0) return orderDiff
          return String(a.id).localeCompare(String(b.id))
        })
      : rankByFairness(pool, cooldownSet)

  const orderedSittingOut = orderPool(sittingOut, cooldownIds)
  const orderedCooldown = orderPool(cooldown, new Set())
  const ordered = [...orderedSittingOut, ...orderedCooldown]

  const queue = ordered.slice(0, maxSlots)
  const onDeckPlayers = queue.slice(0, onDeckSize)

  return { queue, onDeckPlayers }
}

// -----------------------------------------------------------------------------
// 8. League Up Next freeze
// -----------------------------------------------------------------------------

function leagueFreezeBlockSize(numberOfCourts, gameMode) {
  return Math.max(numberOfCourts, 1) * (gameMode === 'singles' ? 2 : 4)
}

function leaguePlayersPerCourt(gameMode) {
  return gameMode === 'singles' ? 2 : 4
}

function courtToTeamIds(court) {
  if (!court) return null
  return {
    teamAIds: court.teamA.map((player) => player.id),
    teamBIds: court.teamB.map((player) => player.id),
  }
}

function onDeckCourtIds(onDeckCourt) {
  if (!onDeckCourt) return []
  return [...onDeckCourt.teamAIds, ...onDeckCourt.teamBIds]
}

function buildFreezeQueueIds(onDeckCourt, orderedIds, blockSize) {
  const queueIds = []
  const seen = new Set()
  const pushId = (id) => {
    if (id == null || seen.has(id)) return
    queueIds.push(id)
    seen.add(id)
  }
  onDeckCourtIds(onDeckCourt).forEach(pushId)
  for (const id of orderedIds) {
    if (queueIds.length >= blockSize) break
    pushId(id)
  }
  return queueIds.slice(0, Math.max(blockSize, onDeckCourtIds(onDeckCourt).length))
}

function captureLeagueFreeze(players, options = {}) {
  const {
    numberOfCourts = 1,
    gameMode = 'doubles',
    courtMatchups = [],
    matchHistory = [],
  } = options

  const preview = buildLeagueUpNextPreview(players, {
    numberOfCourts,
    gameMode,
    courtMatchups,
    matchHistory,
  })
  const onDeckCourt = courtToTeamIds(
    generateLeagueCourt(players, {
      courtMatchups,
      matchHistory,
      courts: numberOfCourts,
      gameMode,
      excludePlayerIds: getAllOnCourtPlayerIds(courtMatchups),
    })
  )
  const queueIds = buildFreezeQueueIds(
    onDeckCourt,
    (preview.queue ?? []).map((player) => player.id),
    leagueFreezeBlockSize(numberOfCourts, gameMode)
  )

  if (queueIds.length === 0) return null

  return {
    queueIds,
    onDeckCourt,
    numberOfCourts,
    gameMode,
  }
}

function isLeagueFreezeValid(snapshot, players, courtMatchups, options = {}) {
  const { numberOfCourts = 1, gameMode = 'doubles' } = options
  if (!snapshot?.queueIds?.length) return false
  if (snapshot.numberOfCourts !== numberOfCourts) return false
  if (snapshot.gameMode !== gameMode) return false

  const byId = new Map((players ?? []).map((player) => [player.id, player]))
  const onCourtIds = new Set(getAllOnCourtPlayerIds(courtMatchups))
  return snapshot.queueIds.every((id) => {
    const player = byId.get(id)
    return Boolean(player?.checkedIn) && !onCourtIds.has(id)
  })
}

function materializeLeagueFreezePlayers(snapshot, players) {
  if (!snapshot?.queueIds?.length) return []
  const byId = new Map((players ?? []).map((player) => [player.id, player]))
  return snapshot.queueIds.map((id) => byId.get(id)).filter(Boolean)
}

function materializeFrozenLeagueCourt(snapshot, players, options = {}) {
  const { gameMode = snapshot?.gameMode ?? 'doubles', courtIndex = 0 } = options
  if (!snapshot?.queueIds?.length) return null

  const byId = new Map((players ?? []).map((player) => [player.id, player]))
  const playersPerCourt = leaguePlayersPerCourt(gameMode)

  if (snapshot.onDeckCourt) {
    const teamA = snapshot.onDeckCourt.teamAIds
      .map((id) => byId.get(id))
      .filter(Boolean)
    const teamB = snapshot.onDeckCourt.teamBIds
      .map((id) => byId.get(id))
      .filter(Boolean)
    if (teamA.length + teamB.length === playersPerCourt) {
      return { courtIndex, teamA, teamB }
    }
  }

  const topPlayers = snapshot.queueIds
    .slice(0, playersPerCourt)
    .map((id) => byId.get(id))
    .filter(Boolean)
  if (topPlayers.length < playersPerCourt) return null

  if (gameMode === 'singles') {
    return {
      courtIndex,
      teamA: [topPlayers[0]],
      teamB: [topPlayers[1]],
    }
  }

  const lockedPartner = buildLockedPartnerMap(topPlayers)
  const partition =
    partitionLeagueFoursome(topPlayers, lockedPartner) ??
    partitionFoursomeWithLocks(topPlayers, lockedPartner)
  return {
    courtIndex,
    teamA: partition.teamA,
    teamB: partition.teamB,
  }
}

function advanceLeagueFreeze(snapshot, generatedPlayerIds, players, options = {}) {
  const numberOfCourts = options.numberOfCourts ?? snapshot?.numberOfCourts ?? 1
  const gameMode = options.gameMode ?? snapshot?.gameMode ?? 'doubles'
  const playersPerCourt = leaguePlayersPerCourt(gameMode)
  const generatedSet = new Set(generatedPlayerIds)

  const fresh = captureLeagueFreeze(players, {
    ...options,
    numberOfCourts,
    gameMode,
  })
  if (!fresh) return null

  const onDeckCourt = fresh.onDeckCourt
  const leadIds = onDeckCourt
    ? onDeckCourtIds(onDeckCourt)
    : fresh.queueIds.slice(0, playersPerCourt)
  const leadSet = new Set(leadIds)
  const blockSize = leagueFreezeBlockSize(numberOfCourts, gameMode)
  const merged = [...leadIds]
  const mergedSet = new Set(merged)

  const appendFrom = (ids) => {
    for (const id of ids) {
      if (merged.length >= blockSize) break
      if (mergedSet.has(id) || generatedSet.has(id) || leadSet.has(id)) continue
      merged.push(id)
      mergedSet.add(id)
    }
  }

  appendFrom(snapshot?.queueIds ?? [])
  appendFrom(fresh.queueIds)

  if (merged.length === 0) return null

  return {
    queueIds: merged,
    onDeckCourt,
    numberOfCourts,
    gameMode,
  }
}

function leagueOnDeckSize(gameMode = 'doubles') {
  return leaguePlayersPerCourt(gameMode)
}

// -----------------------------------------------------------------------------
// 9. Exports
// -----------------------------------------------------------------------------

export {
  teamSizeForMode,
  getCooldownIds,
  getRoundRobinActivePlayers,
  metCount,
  matchSignature,
  computeRoundRobinMatchupProgress,
  buildLeagueUpNextPreview,
  generateLeagueCourt,
  derivePlayerLastMatch,
  getPlayerLastCourtIndex,
  applyLeagueLastMatchToPlayers,
  syncLeagueLastMatchFields,
  applyLeagueMatchResult,
  revertLeagueMatchResult,
  captureLeagueFreeze,
  isLeagueFreezeValid,
  materializeLeagueFreezePlayers,
  materializeFrozenLeagueCourt,
  advanceLeagueFreeze,
  leagueOnDeckSize,
  generateRoundRobinCourt,
  applyMatchResult,
  revertMatchResult,
}
