import {
  canPlayerGroupsOpponents,
  checkInOrderOf,
  getCooldownIds,
  hasOpposedBefore,
  hasPartneredBefore,
  highestSkillLevel,
  isMixedGender,
  matchSignature,
  shiftSkillLevel,
  skillBucketOf,
  skillRankOf,
  sortByCheckInOrder,
} from './ProgressivePlay.engine'
import { getAllOnCourtPlayerIds } from './progressivePlayCourtRefresh'

export const LADDER_RUN_COOLDOWN_MATCHES = 2

const PLAYERS_PER_DOUBLES_COURT = 4
const PLAYERS_PER_SINGLES_COURT = 2

const groupSizeForMode = (gameMode) =>
  gameMode === 'singles' ? PLAYERS_PER_SINGLES_COURT : PLAYERS_PER_DOUBLES_COURT

const hasZeroGames = (player) => (Number(player.gamesPlayed) || 0) === 0
const hasPlayedAtLeastOneGame = (player) => (Number(player.gamesPlayed) || 0) >= 1
const isVeteranBatch = (players) => players.every(hasPlayedAtLeastOneGame)
const hasStatus = (status) => status === 'win' || status === 'loss'

const normalizePairKey = (aId, bId) =>
  [String(aId), String(bId)].sort().join(':')

const getLockedTeammate = (player, playersById) => {
  if (!player?.teammateId) return null
  const teammate = playersById.get(player.teammateId)
  if (!teammate || teammate.teammateId !== player.id) return null
  return teammate
}

const hasIneligibleLockedPartner = (player, allPlayersById, eligibleById) => {
  if (!player?.teammateId) return false
  const teammate = allPlayersById.get(player.teammateId)
  if (!teammate || teammate.teammateId !== player.id) return false
  return !eligibleById.has(teammate.id)
}

const collectiveSkillRank = (players) =>
  skillRankOf(highestSkillLevel(players))

const skillMixingOptions = (allowAdjacentSkillMixing) => ({
  allowAdjacent: allowAdjacentSkillMixing,
})

const skillBucketForPlayers = (players, allowAdjacentSkillMixing) =>
  skillBucketOf(highestSkillLevel(players), skillMixingOptions(allowAdjacentSkillMixing))

const unitMatchesGroupSkill = (
  unitPlayers,
  targetRank,
  targetBucket,
  allowAdjacentSkillMixing
) => {
  if (!allowAdjacentSkillMixing) {
    return collectiveSkillRank(unitPlayers) === targetRank
  }
  return skillBucketForPlayers(unitPlayers, true) === targetBucket
}

const playerMatchesGroupSkill = (player, targetRank, targetBucket, allowAdjacentSkillMixing) =>
  unitMatchesGroupSkill([player], targetRank, targetBucket, allowAdjacentSkillMixing)

const isBatchSkillCompatible = (batch, allowAdjacentSkillMixing) => {
  if (!Array.isArray(batch) || batch.length === 0) return true
  const targetRank = collectiveSkillRank(batch)
  const targetBucket = skillBucketForPlayers(batch, allowAdjacentSkillMixing)
  return batch.every((player) =>
    playerMatchesGroupSkill(player, targetRank, targetBucket, allowAdjacentSkillMixing)
  )
}

export function getPlayerLastResult(player, matchHistory = []) {
  if (hasStatus(player?.lastResult)) return player.lastResult
  if (!player?.id || !Array.isArray(matchHistory) || matchHistory.length === 0) return null

  for (let index = matchHistory.length - 1; index >= 0; index -= 1) {
    const match = matchHistory[index]
    if (!match) continue
    const teamAIds = match.teamAIds ?? []
    const teamBIds = match.teamBIds ?? []
    const isInA = teamAIds.includes(player.id)
    const isInB = teamBIds.includes(player.id)
    if (!isInA && !isInB) continue
    if (match.winningTeam === 'A') return isInA ? 'win' : 'loss'
    if (match.winningTeam === 'B') return isInB ? 'win' : 'loss'
  }

  return null
}

const buildLockedPairs = (players) => {
  const playersById = new Map(players.map((player) => [player.id, player]))
  const pairs = []
  const seen = new Set()

  players.forEach((player) => {
    const teammate = getLockedTeammate(player, playersById)
    if (!teammate || seen.has(player.id)) return
    seen.add(player.id)
    seen.add(teammate.id)
    pairs.push([player.id, teammate.id])
  })

  return pairs
}

const keepsLockedPairsTogether = (teamA, teamB, lockedPairs) => {
  const teamAIds = new Set(teamA.map((player) => player.id))
  const teamBIds = new Set(teamB.map((player) => player.id))

  return lockedPairs.every(([playerAId, playerBId]) => {
    const inA = teamAIds.has(playerAId) && teamAIds.has(playerBId)
    const inB = teamBIds.has(playerAId) && teamBIds.has(playerBId)
    const inBatch =
      teamAIds.has(playerAId) ||
      teamAIds.has(playerBId) ||
      teamBIds.has(playerAId) ||
      teamBIds.has(playerBId)
    if (!inBatch) return true
    return inA || inB
  })
}

const addPlayerOrLockedUnit = (
  player,
  group,
  assigned,
  eligibleById,
  allPlayersById,
  groupSize
) => {
  if (assigned.has(player.id)) return false
  if (hasIneligibleLockedPartner(player, allPlayersById, eligibleById)) return false

  const teammate = getLockedTeammate(player, eligibleById)
  if (teammate) {
    if (assigned.has(teammate.id)) return false
    if (group.length + 2 > groupSize) return false
    group.push(player, teammate)
    assigned.add(player.id)
    assigned.add(teammate.id)
    return true
  }

  if (group.length + 1 > groupSize) return false
  group.push(player)
  assigned.add(player.id)
  return true
}

const isPreferredAdjacentBucketPair = (playerA, playerB) => {
  const rankA = skillRankOf(playerA.skillLevel)
  const rankB = skillRankOf(playerB.skillLevel)
  return (
    (rankA === 0 && rankB === 1) ||
    (rankA === 1 && rankB === 0) ||
    (rankA === 2 && rankB === 3) ||
    (rankA === 3 && rankB === 2)
  )
}

export function getLadderRunCooldownIds(matchHistory) {
  return getCooldownIds(matchHistory, LADDER_RUN_COOLDOWN_MATCHES)
}

// Sitting-out players: checked in, not on a court, not on cooldown. This is the
// primary pool used to fill Up Next.
function buildSittingOutPool(players, courtMatchups, matchHistory = []) {
  const onCourtIds = new Set(getAllOnCourtPlayerIds(courtMatchups))
  const cooldownIds = getLadderRunCooldownIds(matchHistory)
  return sortByCheckInOrder(
    (players ?? []).filter(
      (player) =>
        player.checkedIn &&
        !onCourtIds.has(player.id) &&
        !cooldownIds.has(player.id)
    )
  )
}

// Cooldown players: checked in, not on a court, currently on cooldown. Used only
// as a secondary pool to top Up Next up to capacity when sitting-out players
// alone cannot fill it.
function buildCooldownPool(players, courtMatchups, matchHistory = []) {
  const onCourtIds = new Set(getAllOnCourtPlayerIds(courtMatchups))
  const cooldownIds = getLadderRunCooldownIds(matchHistory)
  return sortByCheckInOrder(
    (players ?? []).filter(
      (player) =>
        player.checkedIn &&
        !onCourtIds.has(player.id) &&
        cooldownIds.has(player.id)
    )
  )
}

// Merge sitting-out and cooldown pools, de-duplicated and kept in check-in order
// so grouping still follows the fairness queue.
function mergePoolsByCheckInOrder(...pools) {
  const seen = new Set()
  const merged = []
  pools.forEach((pool) => {
    pool.forEach((player) => {
      if (seen.has(player.id)) return
      seen.add(player.id)
      merged.push(player)
    })
  })
  return sortByCheckInOrder(merged)
}

function buildGroupForAnchor(
  anchor,
  queue,
  assigned,
  groupSize,
  allowAdjacentSkillMixing,
  eligibleById,
  allPlayersById,
  options = {}
) {
  const { requiredStatus = null, matchHistory = [] } = options
  const group = []
  if (
    !addPlayerOrLockedUnit(
      anchor,
      group,
      assigned,
      eligibleById,
      allPlayersById,
      groupSize
    )
  ) {
    return []
  }

  if (requiredStatus) {
    const anchorStatuses = group.map((player) => getPlayerLastResult(player, matchHistory))
    if (anchorStatuses.some((status) => status !== requiredStatus)) {
      return []
    }
  }

  const targetRank = collectiveSkillRank(group)
  const targetBucket = skillBucketForPlayers(group, allowAdjacentSkillMixing)

  const tryAddUnits = (predicate) => {
    for (const player of queue) {
      if (group.length >= groupSize) break
      if (assigned.has(player.id)) continue

      const teammate = getLockedTeammate(player, eligibleById)
      const unitPlayers = teammate ? [player, teammate] : [player]
      if (requiredStatus) {
        const statuses = unitPlayers.map((entry) => getPlayerLastResult(entry, matchHistory))
        if (statuses.some((status) => status !== requiredStatus)) continue
      }
      if (!predicate(unitPlayers)) continue

      addPlayerOrLockedUnit(
        player,
        group,
        assigned,
        eligibleById,
        allPlayersById,
        groupSize
      )
    }
  }

  // Same skill level first, then same two-bucket group (Beginner+Novice or
  // Intermediate+Advanced). Never mix across buckets (e.g. Novice+Advanced).
  tryAddUnits((unitPlayers) =>
    unitMatchesGroupSkill(unitPlayers, targetRank, targetBucket, allowAdjacentSkillMixing) &&
    collectiveSkillRank(unitPlayers) === targetRank
  )

  if (allowAdjacentSkillMixing && group.length < groupSize) {
    tryAddUnits((unitPlayers) =>
      unitMatchesGroupSkill(unitPlayers, targetRank, targetBucket, true) &&
      collectiveSkillRank(unitPlayers) !== targetRank
    )
  }

  return group
}

// Shared accumulator for the Up Next queue so multiple pools (sitting-out first,
// then cooldown top-up) can contribute to the same result.
function createUpNextState(groupSize, maxSlots) {
  return { groupSize, maxSlots, assigned: new Set(), groups: [], queue: [] }
}

function addCompleteGroupToState(state, group) {
  const { groupSize, maxSlots, assigned, groups, queue } = state
  if (group.length < groupSize) return false
  group.forEach((player) => assigned.add(player.id))
  const remainingSlots = maxSlots - queue.length
  const slice = group.slice(0, remainingSlots)
  if (slice.length < groupSize) return false
  groups.push(slice)
  queue.push(...slice)
  return true
}

// Run the zero-game then veteran grouping passes on a pool, adding only complete
// groups. Safe to call multiple times with different pools; already-assigned
// players are skipped so a later pool tops up what the previous pass left short.
function runGroupingPhases(eligible, state, options = {}) {
  const { allowAdjacentSkillMixing = false, matchHistory = [], allPlayersById } = options
  const { groupSize, maxSlots, assigned, queue } = state
  const eligibleById = new Map(eligible.map((player) => [player.id, player]))

  const zeroGameEligible = eligible.filter(hasZeroGames)
  for (const anchor of zeroGameEligible) {
    if (queue.length >= maxSlots) break
    if (assigned.has(anchor.id)) continue

    const tentativeAssigned = new Set(assigned)
    const group = buildGroupForAnchor(
      anchor,
      eligible,
      tentativeAssigned,
      groupSize,
      allowAdjacentSkillMixing,
      eligibleById,
      allPlayersById,
      { matchHistory }
    )

    addCompleteGroupToState(state, group)
  }

  const veteranEligible = eligible.filter(hasPlayedAtLeastOneGame)
  for (const anchor of veteranEligible) {
    if (queue.length >= maxSlots) break
    if (assigned.has(anchor.id)) continue

    const requiredStatus = getPlayerLastResult(anchor, matchHistory)
    if (!requiredStatus) continue

    const tentativeAssigned = new Set(assigned)
    const group = buildGroupForAnchor(
      anchor,
      veteranEligible,
      tentativeAssigned,
      groupSize,
      allowAdjacentSkillMixing,
      eligibleById,
      allPlayersById,
      { requiredStatus, matchHistory }
    )

    addCompleteGroupToState(state, group)
  }
}

// Final fallback fill: if Up Next is still below capacity, enqueue remaining
// eligible players in check-in order (still respecting locked-in pair atomicity)
// so the queue stays topped up for quick next-court generation.
function runFallbackFill(eligible, state, options = {}) {
  const { allPlayersById, allowAdjacentSkillMixing = false } = options
  const { groupSize, maxSlots, assigned, queue } = state
  if (queue.length >= maxSlots) return
  const eligibleById = new Map(eligible.map((player) => [player.id, player]))

  for (const player of eligible) {
    if (queue.length >= maxSlots) break
    if (assigned.has(player.id)) continue

    const openGroupStart = Math.floor(queue.length / groupSize) * groupSize
    const openGroup = queue.slice(openGroupStart)
    const targetRank = openGroup.length > 0 ? collectiveSkillRank(openGroup) : null
    const targetBucket =
      openGroup.length > 0 ? skillBucketForPlayers(openGroup, allowAdjacentSkillMixing) : null

    if (
      openGroup.length > 0 &&
      !playerMatchesGroupSkill(player, targetRank, targetBucket, allowAdjacentSkillMixing)
    ) {
      continue
    }
    addPlayerOrLockedUnit(
      player,
      queue,
      assigned,
      eligibleById,
      allPlayersById,
      maxSlots
    )
  }
}

// Append any sitting-out players not yet queued, in check-in order, without
// skill constraints so the full Sitting Out section is represented first.
function appendRemainingSittingOut(state, sittingOut, options = {}) {
  const { allPlayersById } = options
  const { maxSlots, assigned, queue } = state
  const eligibleById = new Map(sittingOut.map((player) => [player.id, player]))

  for (const player of sittingOut) {
    if (queue.length >= maxSlots) break
    if (assigned.has(player.id)) continue
    addPlayerOrLockedUnit(
      player,
      queue,
      assigned,
      eligibleById,
      allPlayersById,
      maxSlots
    )
  }
}

// Top Up Next to capacity by appending cooldown players at the bottom. Grouping
// runs on the cooldown pool only so rested players never get interleaved ahead
// of remaining sitting-out entries.
function appendCooldownTopUp(state, cooldown, sittingOut, options = {}) {
  const { allPlayersById, allowAdjacentSkillMixing = false, matchHistory = [] } =
    options
  const { groupSize, maxSlots, assigned, queue, groups } = state
  if (queue.length >= maxSlots || cooldown.length === 0) return

  const crossPoolEligibleById = new Map(
    mergePoolsByCheckInOrder(sittingOut, cooldown).map((player) => [player.id, player])
  )

  const cooldownState = createUpNextState(groupSize, maxSlots - queue.length)
  cooldownState.assigned = new Set(assigned)
  runGroupingPhases(cooldown, cooldownState, {
    allowAdjacentSkillMixing,
    matchHistory,
    allPlayersById,
  })
  runFallbackFill(cooldown, cooldownState, {
    allowAdjacentSkillMixing,
    allPlayersById,
  })

  for (const player of cooldownState.queue) {
    if (queue.length >= maxSlots) break
    if (assigned.has(player.id)) continue
    addPlayerOrLockedUnit(
      player,
      queue,
      assigned,
      crossPoolEligibleById,
      allPlayersById,
      maxSlots
    )
  }
  groups.push(...cooldownState.groups)

  for (const player of cooldown) {
    if (queue.length >= maxSlots) break
    if (assigned.has(player.id)) continue
    addPlayerOrLockedUnit(
      player,
      queue,
      assigned,
      crossPoolEligibleById,
      allPlayersById,
      maxSlots
    )
  }
}

// Build the visible Up Next list: skill-grouped sitting-out players first (with
// any earlier check-ins that grouping skipped), inline locked cooldown partners,
// then remaining cooldown players at the bottom — capped at courts * groupSize.
function buildSittingOutThenCooldownDisplayQueue(
  sittingOut,
  cooldown,
  maxSlots,
  groupedSittingQueue,
  allPlayersById
) {
  const groupedSitting = groupedSittingQueue.filter((player) =>
    sittingOut.some((entry) => entry.id === player.id)
  )
  const groupedIds = new Set(groupedSitting.map((player) => player.id))
  const groupedMinOrder =
    groupedSitting.length > 0
      ? Math.min(...groupedSitting.map((player) => checkInOrderOf(player)))
      : Infinity

  const missingEarly = sortByCheckInOrder(
    sittingOut.filter(
      (player) =>
        !groupedIds.has(player.id) && checkInOrderOf(player) < groupedMinOrder
    )
  )
  const missingLater = sortByCheckInOrder(
    sittingOut.filter(
      (player) =>
        !groupedIds.has(player.id) && checkInOrderOf(player) >= groupedMinOrder
    )
  )

  const sittingOrder = [...missingEarly, ...groupedSitting, ...missingLater]
  const crossPoolById = new Map(
    mergePoolsByCheckInOrder(sittingOut, cooldown).map((player) => [player.id, player])
  )
  const cooldownIds = new Set(cooldown.map((player) => player.id))
  const queue = []
  const used = new Set()

  const pushPlayer = (player) => {
    if (queue.length >= maxSlots || used.has(player.id)) return
    queue.push(player)
    used.add(player.id)
  }

  for (const player of sittingOrder) {
    if (queue.length >= maxSlots) break
    pushPlayer(player)
    const teammate = getLockedTeammate(player, crossPoolById)
    if (teammate && cooldownIds.has(teammate.id)) {
      pushPlayer(teammate)
    }
  }

  for (const player of sortByCheckInOrder(cooldown)) {
    if (queue.length >= maxSlots) break
    pushPlayer(player)
  }

  return queue.slice(0, maxSlots)
}

export function buildLadderRunUpNextPreview(players, options = {}) {
  const {
    numberOfCourts = 1,
    gameMode = 'doubles',
    allowAdjacentSkillMixing = false,
    courtMatchups = [],
    matchHistory = [],
  } = options

  const groupSize = groupSizeForMode(gameMode)
  const maxSlots = Math.max(numberOfCourts, 1) * groupSize
  const allPlayersById = new Map((players ?? []).map((player) => [player.id, player]))
  const phaseOptions = { allowAdjacentSkillMixing, matchHistory, allPlayersById }

  const sittingOut = buildSittingOutPool(players, courtMatchups, matchHistory)
  const cooldown = buildCooldownPool(players, courtMatchups, matchHistory)
  const state = createUpNextState(groupSize, maxSlots)

  // Tier 1: skill-group from sitting-out players only.
  runGroupingPhases(sittingOut, state, phaseOptions)
  runFallbackFill(sittingOut, state, phaseOptions)

  // When the Sitting Out section alone cannot reach capacity, include every
  // rested player before topping up from cooldown.
  if (sittingOut.length < maxSlots) {
    appendRemainingSittingOut(state, sittingOut, phaseOptions)
  }

  // Tier 2: append cooldown players at the bottom when sitting out alone
  // cannot reach courts * groupSize.
  if (state.queue.length < maxSlots) {
    appendCooldownTopUp(state, cooldown, sittingOut, phaseOptions)
  }

  const finalEligible = mergePoolsByCheckInOrder(sittingOut, cooldown)
  const queue = buildSittingOutThenCooldownDisplayQueue(
    sittingOut,
    cooldown,
    maxSlots,
    state.queue,
    allPlayersById
  )

  return {
    queue,
    onDeckPlayers: queue.slice(0, groupSize),
    groups: state.groups,
    eligible: finalEligible,
  }
}

function enumerateDoublesAssignments(batch) {
  return [
    {
      teamA: [batch[0], batch[1]],
      teamB: [batch[2], batch[3]],
      queueOrderScore: 0,
    },
    {
      teamA: [batch[0], batch[2]],
      teamB: [batch[1], batch[3]],
      queueOrderScore: 1,
    },
    {
      teamA: [batch[0], batch[3]],
      teamB: [batch[1], batch[2]],
      queueOrderScore: 2,
    },
  ]
}

function assignmentCheckInOrderKey(assignment) {
  const [a1, a2] = assignment.teamA
  const [b1, b2] = assignment.teamB
  const teamAKey = [checkInOrderOf(a1), checkInOrderOf(a2)].sort((x, y) => x - y)
  const teamBKey = [checkInOrderOf(b1), checkInOrderOf(b2)].sort((x, y) => x - y)
  const flattened = [...teamAKey, ...teamBKey]
  return flattened[0] * 1000000 + flattened[1] * 10000 + flattened[2] * 100 + flattened[3]
}

function buildAssignmentMetrics(assignment, allowAdjacentSkillMixing) {
  const mixedScore =
    (isMixedGender(assignment.teamA[0], assignment.teamA[1]) ? 1 : 0) +
    (isMixedGender(assignment.teamB[0], assignment.teamB[1]) ? 1 : 0)
  const adjacentPairScore = allowAdjacentSkillMixing
    ? (isPreferredAdjacentBucketPair(assignment.teamA[0], assignment.teamA[1]) ? 1 : 0) +
      (isPreferredAdjacentBucketPair(assignment.teamB[0], assignment.teamB[1]) ? 1 : 0)
    : 0

  return {
    partnerFreshScore:
      (hasPartneredBefore(assignment.teamA[0], assignment.teamA[1]) ? 0 : 1) +
      (hasPartneredBefore(assignment.teamB[0], assignment.teamB[1]) ? 0 : 1),
    opponentFreshScore: assignment.teamA.reduce((acc, playerA) => {
      return (
        acc +
        assignment.teamB.reduce(
          (innerAcc, playerB) => innerAcc + (hasOpposedBefore(playerA, playerB) ? 0 : 1),
          0
        )
      )
    }, 0),
    mixedScore,
    adjacentPairScore,
    queueOrderScore: assignment.queueOrderScore,
    checkInOrderKey: assignmentCheckInOrderKey(assignment),
  }
}

function compareAssignmentMetrics(left, right, preferHistory) {
  if (preferHistory && left.partnerFreshScore !== right.partnerFreshScore) {
    return left.partnerFreshScore - right.partnerFreshScore
  }

  if (preferHistory && left.opponentFreshScore !== right.opponentFreshScore) {
    return left.opponentFreshScore - right.opponentFreshScore
  }

  if (left.mixedScore !== right.mixedScore) {
    return left.mixedScore - right.mixedScore
  }

  if (left.adjacentPairScore !== right.adjacentPairScore) {
    return left.adjacentPairScore - right.adjacentPairScore
  }

  if (left.queueOrderScore !== right.queueOrderScore) {
    return right.queueOrderScore - left.queueOrderScore
  }

  return right.checkInOrderKey - left.checkInOrderKey
}

function isValidVeteranAssignment(assignment, lockedPairKeys) {
  const invalidTeamPartnering = (team) => {
    const [first, second] = team
    const key = normalizePairKey(first.id, second.id)
    if (lockedPairKeys.has(key)) return false
    return hasPartneredBefore(first, second)
  }

  return !invalidTeamPartnering(assignment.teamA) && !invalidTeamPartnering(assignment.teamB)
}

function scoreDoublesBatch(batch, options = {}) {
  const { allowAdjacentSkillMixing = false, preferHistory = false } = options
  if (!Array.isArray(batch) || batch.length < PLAYERS_PER_DOUBLES_COURT) return null
  if (!isBatchSkillCompatible(batch, allowAdjacentSkillMixing)) return null

  const lockedPairs = buildLockedPairs(batch)
  const lockedPairKeys = new Set(
    lockedPairs.map(([firstId, secondId]) => normalizePairKey(firstId, secondId))
  )
  const assignments = enumerateDoublesAssignments(
    batch.slice(0, PLAYERS_PER_DOUBLES_COURT)
  )
    .filter((assignment) => keepsLockedPairsTogether(assignment.teamA, assignment.teamB, lockedPairs))
    .filter((assignment) =>
      canPlayerGroupsOpponents(
        assignment.teamA,
        assignment.teamB,
        skillMixingOptions(allowAdjacentSkillMixing)
      )
    )
    .filter((assignment) =>
      preferHistory ? isValidVeteranAssignment(assignment, lockedPairKeys) : true
    )

  if (assignments.length === 0) return null

  let bestAssignment = null
  let bestMetrics = null

  assignments.forEach((assignment) => {
    const metrics = buildAssignmentMetrics(assignment, allowAdjacentSkillMixing)
    if (!bestAssignment) {
      bestAssignment = assignment
      bestMetrics = metrics
      return
    }

    if (compareAssignmentMetrics(metrics, bestMetrics, preferHistory) > 0) {
      bestAssignment = assignment
      bestMetrics = metrics
    }
  })

  return {
    assignment: bestAssignment,
    metrics: bestMetrics,
  }
}

export function assignDoublesCourtFromBatch(batch, options = {}) {
  const { allowAdjacentSkillMixing = false, preferHistory = false } = options
  const scored = scoreDoublesBatch(batch, { allowAdjacentSkillMixing, preferHistory })
  return scored?.assignment ?? null
}

function optimizeVeteranDoublesBatch(
  baselineBatch,
  queue,
  allowAdjacentSkillMixing,
  matchHistory
) {
  const baselineStatus = getPlayerLastResult(baselineBatch[0], matchHistory)
  if (!baselineStatus) return baselineBatch

  const baselineScored = scoreDoublesBatch(baselineBatch, {
    allowAdjacentSkillMixing,
    preferHistory: true,
  })

  let bestBatch = baselineBatch
  let bestScored = baselineScored
  const baselineIds = new Set(baselineBatch.map((player) => player.id))
  const baselineRank = collectiveSkillRank(baselineBatch)
  const baselineBucket = skillBucketForPlayers(baselineBatch, allowAdjacentSkillMixing)
  const candidates = queue.filter((candidate) => {
    if (baselineIds.has(candidate.id)) return false
    if (!hasPlayedAtLeastOneGame(candidate)) return false
    if (getPlayerLastResult(candidate, matchHistory) !== baselineStatus) return false
    return playerMatchesGroupSkill(
      candidate,
      baselineRank,
      baselineBucket,
      allowAdjacentSkillMixing
    )
  })

  for (const candidate of candidates) {
    for (let index = 0; index < baselineBatch.length; index += 1) {
      const current = baselineBatch[index]
      if (current.teammateId || candidate.teammateId) continue

      const nextBatch = [...baselineBatch]
      nextBatch[index] = candidate
      const scored = scoreDoublesBatch(nextBatch, {
        allowAdjacentSkillMixing,
        preferHistory: true,
      })
      if (!scored) continue
      const isBetter =
        !bestScored ||
        compareAssignmentMetrics(scored.metrics, bestScored.metrics, true) > 0
      if (isBetter) {
        bestBatch = nextBatch
        bestScored = scored
      }
    }
  }

  return bestBatch
}

function optimizeVeteranSinglesBatch(baselineBatch, queue, allowAdjacentSkillMixing, matchHistory) {
  const baselineStatus = getPlayerLastResult(baselineBatch[0], matchHistory)
  if (!baselineStatus) return baselineBatch

  const baselineRank = skillRankOf(baselineBatch[0].skillLevel)
  const baselineBucket = skillBucketForPlayers(baselineBatch, allowAdjacentSkillMixing)
  const baselineOpponent = baselineBatch[1]
  const statusAndSkillCandidates = queue.filter((candidate) => {
    if (candidate.id === baselineBatch[0].id) return false
    if (getPlayerLastResult(candidate, matchHistory) !== baselineStatus) return false
    return playerMatchesGroupSkill(
      candidate,
      baselineRank,
      baselineBucket,
      allowAdjacentSkillMixing
    )
  })

  const freshOpponent = statusAndSkillCandidates.find(
    (candidate) => !hasOpposedBefore(baselineBatch[0], candidate)
  )

  if (!freshOpponent) return baselineBatch
  if (freshOpponent.id === baselineOpponent.id) return baselineBatch

  return [baselineBatch[0], freshOpponent]
}

export function generateLadderRunCourtFromPreview(preview, options = {}) {
  const {
    gameMode = 'doubles',
    allowAdjacentSkillMixing = false,
    matchHistory = [],
    courtIndex = 0,
  } = options

  const eligiblePool = preview?.eligible ?? []
  const onDeckPlayers = preview?.onDeckPlayers ?? []
  const groupSize = groupSizeForMode(gameMode)

  if (onDeckPlayers.length < groupSize) {
    return null
  }

  const baselineBatch = onDeckPlayers.slice(0, groupSize)

  if (gameMode === 'singles') {
    const chosenBatch = isVeteranBatch(baselineBatch)
      ? optimizeVeteranSinglesBatch(
          baselineBatch,
          eligiblePool,
          allowAdjacentSkillMixing,
          matchHistory
        )
      : baselineBatch

    return {
      courtIndex,
      teamA: [chosenBatch[0]],
      teamB: [chosenBatch[1]],
    }
  }

  const chosenBatch = isVeteranBatch(baselineBatch)
    ? optimizeVeteranDoublesBatch(
        baselineBatch,
        eligiblePool,
        allowAdjacentSkillMixing,
        matchHistory
      )
    : baselineBatch

  const assignment = assignDoublesCourtFromBatch(chosenBatch, {
    allowAdjacentSkillMixing,
    preferHistory: isVeteranBatch(chosenBatch),
  })
  if (!assignment) return null

  return {
    courtIndex,
    teamA: assignment.teamA,
    teamB: assignment.teamB,
  }
}

export function generateLadderRunCourt(players, options = {}) {
  const {
    numberOfCourts = 1,
    gameMode = 'doubles',
    allowAdjacentSkillMixing = false,
    courtMatchups = [],
    matchHistory = [],
    courtIndex = 0,
  } = options

  const preview = buildLadderRunUpNextPreview(players, {
    numberOfCourts,
    gameMode,
    allowAdjacentSkillMixing,
    courtMatchups,
    matchHistory,
  })

  return generateLadderRunCourtFromPreview(preview, {
    gameMode,
    allowAdjacentSkillMixing,
    matchHistory,
    courtIndex,
  })
}

function ladderRunFreezeBlockSize(numberOfCourts, gameMode) {
  return Math.max(numberOfCourts, 1) * groupSizeForMode(gameMode)
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

export function captureLadderRunFreeze(players, options = {}) {
  const {
    numberOfCourts = 1,
    gameMode = 'doubles',
    allowAdjacentSkillMixing = false,
    courtMatchups = [],
    matchHistory = [],
  } = options

  const preview = buildLadderRunUpNextPreview(players, {
    numberOfCourts,
    gameMode,
    allowAdjacentSkillMixing,
    courtMatchups,
    matchHistory,
  })
  const onDeckCourt = courtToTeamIds(
    generateLadderRunCourtFromPreview(preview, {
      gameMode,
      allowAdjacentSkillMixing,
      matchHistory,
      courtIndex: 0,
    })
  )
  const queueIds = buildFreezeQueueIds(
    onDeckCourt,
    (preview.queue ?? []).map((player) => player.id),
    ladderRunFreezeBlockSize(numberOfCourts, gameMode)
  )

  if (queueIds.length === 0) return null

  return {
    queueIds,
    onDeckCourt,
    numberOfCourts,
    gameMode,
  }
}

export function isLadderRunFreezeValid(snapshot, players, courtMatchups, options = {}) {
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

export function materializeLadderRunFreezePlayers(snapshot, players) {
  if (!snapshot?.queueIds?.length) return []
  const byId = new Map((players ?? []).map((player) => [player.id, player]))
  return snapshot.queueIds.map((id) => byId.get(id)).filter(Boolean)
}

export function materializeFrozenLadderRunCourt(snapshot, players, options = {}) {
  const { gameMode = snapshot?.gameMode ?? 'doubles', courtIndex = 0 } = options
  if (!snapshot?.queueIds?.length) return null

  const byId = new Map((players ?? []).map((player) => [player.id, player]))
  const groupSize = groupSizeForMode(gameMode)

  if (snapshot.onDeckCourt) {
    const teamA = snapshot.onDeckCourt.teamAIds
      .map((id) => byId.get(id))
      .filter(Boolean)
    const teamB = snapshot.onDeckCourt.teamBIds
      .map((id) => byId.get(id))
      .filter(Boolean)
    if (teamA.length + teamB.length === groupSize) {
      return { courtIndex, teamA, teamB }
    }
  }

  const topPlayers = snapshot.queueIds
    .slice(0, groupSize)
    .map((id) => byId.get(id))
    .filter(Boolean)
  if (topPlayers.length < groupSize) return null

  if (gameMode === 'singles') {
    return {
      courtIndex,
      teamA: [topPlayers[0]],
      teamB: [topPlayers[1]],
    }
  }

  const assignment = assignDoublesCourtFromBatch(topPlayers, {
    allowAdjacentSkillMixing: options.allowAdjacentSkillMixing ?? false,
    preferHistory: isVeteranBatch(topPlayers),
  })
  if (!assignment) return null

  return {
    courtIndex,
    teamA: assignment.teamA,
    teamB: assignment.teamB,
  }
}

export function advanceLadderRunFreeze(snapshot, generatedPlayerIds, players, options = {}) {
  const numberOfCourts = options.numberOfCourts ?? snapshot?.numberOfCourts ?? 1
  const gameMode = options.gameMode ?? snapshot?.gameMode ?? 'doubles'
  const groupSize = groupSizeForMode(gameMode)
  const generatedSet = new Set(generatedPlayerIds)

  const fresh = captureLadderRunFreeze(players, {
    ...options,
    numberOfCourts,
    gameMode,
  })
  if (!fresh) return null

  const onDeckCourt = fresh.onDeckCourt
  const leadIds = onDeckCourt
    ? onDeckCourtIds(onDeckCourt)
    : fresh.queueIds.slice(0, groupSize)
  const leadSet = new Set(leadIds)
  const blockSize = ladderRunFreezeBlockSize(numberOfCourts, gameMode)
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

export function ladderRunOnDeckSize(gameMode = 'doubles') {
  return groupSizeForMode(gameMode)
}

export function applyLadderRunMatchResult(players, result, options = {}) {
  const { skillAdjustment = 1 } = options
  const adjustmentThreshold = Math.max(1, Number(skillAdjustment) || 1)
  const { teamAIds = [], teamBIds = [], winningTeam } = result
  const winnerIds = new Set(winningTeam === 'A' ? teamAIds : teamBIds)
  const loserIds = new Set(winningTeam === 'A' ? teamBIds : teamAIds)
  const allMatchPlayerIds = [...teamAIds, ...teamBIds]
  const skillChanges = {}
  const streakChanges = {}

  const updatedPlayers = (players ?? []).map((player) => {
    if (!allMatchPlayerIds.includes(player.id)) return player

    const updated = { ...player }
    if (winnerIds.has(player.id)) {
      updated.wins = (Number(updated.wins) || 0) + 1
      updated.gamesPlayed = (Number(updated.gamesPlayed) || 0) + 1
      const previousSkillLevel = updated.skillLevel
      const previousWinStreak = Number(updated.currentWinStreak) || 0
      const previousLossStreak = Number(updated.currentLossStreak) || 0

      const nextWinStreak = previousWinStreak + 1
      if (nextWinStreak >= adjustmentThreshold) {
        updated.skillLevel = shiftSkillLevel(updated.skillLevel, 1)
        updated.currentWinStreak = 0
      } else {
        updated.currentWinStreak = nextWinStreak
      }
      updated.currentLossStreak = 0
      updated.lastResult = 'win'

      if (updated.skillLevel !== previousSkillLevel) {
        skillChanges[player.id] = {
          from: previousSkillLevel,
          to: updated.skillLevel,
          direction: 'up',
        }
      }
      streakChanges[player.id] = {
        winFrom: previousWinStreak,
        winTo: Number(updated.currentWinStreak) || 0,
        lossFrom: previousLossStreak,
        lossTo: Number(updated.currentLossStreak) || 0,
      }
    } else if (loserIds.has(player.id)) {
      updated.losses = (Number(updated.losses) || 0) + 1
      updated.gamesPlayed = (Number(updated.gamesPlayed) || 0) + 1
      const previousSkillLevel = updated.skillLevel
      const previousWinStreak = Number(updated.currentWinStreak) || 0
      const previousLossStreak = Number(updated.currentLossStreak) || 0

      const nextLossStreak = previousLossStreak + 1
      if (nextLossStreak >= adjustmentThreshold) {
        updated.skillLevel = shiftSkillLevel(updated.skillLevel, -1)
        updated.currentLossStreak = 0
      } else {
        updated.currentLossStreak = nextLossStreak
      }
      updated.currentWinStreak = 0
      updated.lastResult = 'loss'

      if (updated.skillLevel !== previousSkillLevel) {
        skillChanges[player.id] = {
          from: previousSkillLevel,
          to: updated.skillLevel,
          direction: 'down',
        }
      }
      streakChanges[player.id] = {
        winFrom: previousWinStreak,
        winTo: Number(updated.currentWinStreak) || 0,
        lossFrom: previousLossStreak,
        lossTo: Number(updated.currentLossStreak) || 0,
      }
    }

    const partnerCounts = { ...(updated.partnerCounts ?? {}) }
    const ownTeam = winnerIds.has(player.id) ? [...winnerIds] : [...loserIds]
    ownTeam.forEach((id) => {
      if (id !== player.id) {
        partnerCounts[id] = (Number(partnerCounts[id]) || 0) + 1
      }
    })
    updated.partnerCounts = partnerCounts

    const opponentCountsObj = { ...(updated.opponentCounts ?? {}) }
    const opposingTeam = winnerIds.has(player.id) ? [...loserIds] : [...winnerIds]
    opposingTeam.forEach((id) => {
      opponentCountsObj[id] = (Number(opponentCountsObj[id]) || 0) + 1
    })
    updated.opponentCounts = opponentCountsObj

    return updated
  })

  return {
    players: updatedPlayers,
    historyEntry: {
      courtIndex: result.courtIndex,
      teamAIds: [...teamAIds],
      teamBIds: [...teamBIds],
      winningTeam,
      signature: matchSignature(teamAIds, teamBIds),
      timestamp: Date.now(),
      skillChanges,
      streakChanges,
    },
  }
}

export function revertLadderRunMatchResult(players, result) {
  const { teamAIds = [], teamBIds = [], winningTeam } = result
  const winnerIds = new Set(winningTeam === 'A' ? teamAIds : teamBIds)
  const loserIds = new Set(winningTeam === 'A' ? teamBIds : teamAIds)
  const allMatchPlayerIds = [...teamAIds, ...teamBIds]
  const streakChanges = result.streakChanges ?? {}
  const skillChanges = result.skillChanges ?? {}

  return (players ?? []).map((player) => {
    if (!allMatchPlayerIds.includes(player.id)) return player
    const updated = { ...player }

    if (winnerIds.has(player.id)) {
      updated.wins = Math.max(0, (Number(updated.wins) || 0) - 1)
      updated.gamesPlayed = Math.max(0, (Number(updated.gamesPlayed) || 0) - 1)
    } else if (loserIds.has(player.id)) {
      updated.losses = Math.max(0, (Number(updated.losses) || 0) - 1)
      updated.gamesPlayed = Math.max(0, (Number(updated.gamesPlayed) || 0) - 1)
    }

    const streakChange = streakChanges[player.id]
    if (streakChange) {
      updated.currentWinStreak = Math.max(0, Number(streakChange.winFrom) || 0)
      updated.currentLossStreak = Math.max(0, Number(streakChange.lossFrom) || 0)
    } else if (winnerIds.has(player.id)) {
      updated.currentWinStreak = Math.max(0, (Number(updated.currentWinStreak) || 0) - 1)
      updated.currentLossStreak = 0
    } else if (loserIds.has(player.id)) {
      updated.currentLossStreak = Math.max(0, (Number(updated.currentLossStreak) || 0) - 1)
      updated.currentWinStreak = 0
    }

    const skillChange = skillChanges[player.id]
    if (skillChange?.from) {
      updated.skillLevel = skillChange.from
    }

    const partnerCounts = { ...(updated.partnerCounts ?? {}) }
    const ownTeam = winnerIds.has(player.id) ? [...winnerIds] : [...loserIds]
    ownTeam.forEach((id) => {
      if (id === player.id) return
      const nextCount = Math.max(0, (Number(partnerCounts[id]) || 0) - 1)
      if (nextCount === 0) delete partnerCounts[id]
      else partnerCounts[id] = nextCount
    })
    updated.partnerCounts = partnerCounts

    const opponentCountsObj = { ...(updated.opponentCounts ?? {}) }
    const opposingTeam = winnerIds.has(player.id) ? [...loserIds] : [...winnerIds]
    opposingTeam.forEach((id) => {
      const nextCount = Math.max(0, (Number(opponentCountsObj[id]) || 0) - 1)
      if (nextCount === 0) delete opponentCountsObj[id]
      else opponentCountsObj[id] = nextCount
    })
    updated.opponentCounts = opponentCountsObj

    if (updated.gamesPlayed === 0) {
      updated.lastResult = null
    }

    return updated
  })
}
