// Shared Progressive Play court refresh — used by Up Next preview and Generate.
import {
  applyGamesGapExclusions,
  resolveProgressivePlayQueueExclusions,
} from './gamesGap'
import {
  PLAYERS_PER_COURT,
  buildUpNextQueue,
  generateMatches,
  generateStrictSkillCourt,
} from './ProgressivePlay.engine'
import { generateFallbackCourtByPriority } from './ThroneRun.engine'

export function getOtherCourtPlayerIds(courtMatchups, courtIndex) {
  const ids = []
  ;(courtMatchups ?? []).forEach((matchup, index) => {
    if (index === courtIndex || !matchup) return
    matchup.teamA?.forEach((player) => ids.push(player.id))
    matchup.teamB?.forEach((player) => ids.push(player.id))
  })
  return ids
}

export function getAllOnCourtPlayerIds(courtMatchups) {
  const ids = []
  ;(courtMatchups ?? []).forEach((matchup) => {
    if (!matchup) return
    matchup.teamA?.forEach((player) => ids.push(player.id))
    matchup.teamB?.forEach((player) => ids.push(player.id))
  })
  return ids
}

export function findFirstEmptyCourtIndex(courtMatchups) {
  const index = (courtMatchups ?? []).findIndex(
    (matchup) => !(matchup?.teamA?.length && matchup?.teamB?.length)
  )
  return index >= 0 ? index : null
}

export function orderQueueWithOnDeck(queue, onDeckPlayers) {
  if (!onDeckPlayers?.length) return queue
  const onDeckIds = new Set(onDeckPlayers.map((player) => player.id))
  const remainder = queue.filter((player) => !onDeckIds.has(player.id))
  return [...onDeckPlayers, ...remainder]
}

function buildFullDisplayQueue(players, context, onDeckPlayers) {
  const { queue: fullQueue } = buildUpNextQueue(players, {
    ...context,
    fullQueue: true,
    occupiedPlayerSlots: 0,
  })
  return orderQueueWithOnDeck(fullQueue, onDeckPlayers)
}

export function refreshProgressivePlayCourt(players, options = {}) {
  const {
    courtIndex = 0,
    courtMatchups = [],
    numberOfCourts = 1,
    matchHistory = [],
    allowAdjacentSkillMixing = true,
    medalExcludeIds = [],
  } = options

  const otherCourtPlayerIds = getOtherCourtPlayerIds(courtMatchups, courtIndex)
  const gapExcludeIds = resolveProgressivePlayQueueExclusions(players, {
    otherCourtPlayerIds,
    medalExcludeIds,
  })

  const { queue, preferred } = buildUpNextQueue(players, {
    courts: numberOfCourts,
    matchHistory,
    excludePlayerIds: otherCourtPlayerIds,
    gapExcludeIds: [...gapExcludeIds],
    occupiedPlayerSlots: otherCourtPlayerIds.length,
  })

  // Eligible pool for actually building the court: drop games-gap exclusions and
  // mark on-court players as not checked in so the fairness selection inside
  // generateMatches is never starved by ranking-then-removing them. Passing them
  // via excludePlayerIds instead lets selectFairnessPool pick the high-priority
  // on-court players first and then filter them out, leaving too few sit-outs to
  // form a valid skill-grouped court — which previously cascaded into the
  // cross-skill `fallback-priority` path and produced non-adjacent matchups.
  const otherCourtIdSet = new Set(otherCourtPlayerIds)
  const eligiblePool = applyGamesGapExclusions(players, gapExcludeIds).map(
    (player) =>
      otherCourtIdSet.has(player.id)
        ? { ...player, checkedIn: false }
        : player
  )

  let court = null
  let onDeckPlayers = preferred
  let source = 'none'

  if (preferred.length === PLAYERS_PER_COURT) {
    const preferredResult = generateMatches(preferred, {
      courts: 1,
      matchHistory,
      allowAdjacentSkillMixing,
    })
    court = preferredResult.courts[0] ?? null
    if (court) {
      source = 'preferred'
      onDeckPlayers = preferred
    }
  }

  if (!court) {
    const fallbackResult = generateMatches(eligiblePool, {
      courts: 1,
      cooldownCourts: numberOfCourts,
      matchHistory,
      allowAdjacentSkillMixing,
    })
    court = fallbackResult.courts[0] ?? null
    if (court) {
      source = 'fallback'
      onDeckPlayers = [...court.teamA, ...court.teamB]
    }
  }

  const strictMixing = !allowAdjacentSkillMixing
  if (!court && strictMixing) {
    court = generateStrictSkillCourt(eligiblePool, {
      matchHistory,
      courts: numberOfCourts,
      preferredPlayerIds: preferred.map((player) => player.id),
    })
    if (court) {
      source = 'strict'
      onDeckPlayers = [...court.teamA, ...court.teamB]
    }
  }

  if (!court && allowAdjacentSkillMixing) {
    court = generateFallbackCourtByPriority(eligiblePool, {
      courtIndex,
      courtMatchups,
      matchHistory,
      courts: numberOfCourts,
    })
    if (court) {
      source = 'fallback-priority'
      onDeckPlayers = [...court.teamA, ...court.teamB]
    }
  }

  if (!court) {
    onDeckPlayers = []
  }

  return {
    court,
    queue: orderQueueWithOnDeck(queue, onDeckPlayers),
    preferred,
    onDeckPlayers,
    source,
    otherCourtPlayerIds,
    gapExcludeIds,
  }
}

export function buildProgressivePlayUpNextPreview(players, options = {}) {
  const courtMatchups = options.courtMatchups ?? []
  const emptyCourtIndex = findFirstEmptyCourtIndex(courtMatchups)

  // Every court is occupied — preview the actual matchup that would fill the
  // next court to open. Run the real refresh against a virtual empty court so
  // ALL on-court players are excluded and the on-deck four form a valid
  // (adjacent-skill) court, exactly what Generate will place. Using `preferred`
  // alone here is wrong: the fairness top four may span non-adjacent skills and
  // never survive court generation, so Up Next would disagree with Generate.
  if (emptyCourtIndex === null) {
    const virtualMatchups = [...courtMatchups, null]
    const refresh = refreshProgressivePlayCourt(players, {
      ...options,
      courtMatchups: virtualMatchups,
      courtIndex: virtualMatchups.length - 1,
    })

    const queueContext = {
      courts: options.numberOfCourts ?? 1,
      matchHistory: options.matchHistory ?? [],
      excludePlayerIds: refresh.otherCourtPlayerIds,
      gapExcludeIds: [...refresh.gapExcludeIds],
    }

    return {
      courtIndex: null,
      ...refresh,
      queue: buildFullDisplayQueue(players, queueContext, refresh.onDeckPlayers),
      allCourtsFull: true,
    }
  }

  const refresh = refreshProgressivePlayCourt(players, {
    ...options,
    courtIndex: emptyCourtIndex,
    medalExcludeIds: (players ?? [])
      .filter(
        (player) =>
          player.medalCooldownCourt === emptyCourtIndex &&
          (player.medalCooldownRemaining || 0) > 0
      )
      .map((player) => player.id),
  })

  const queueContext = {
    courts: options.numberOfCourts ?? 1,
    matchHistory: options.matchHistory ?? [],
    excludePlayerIds: refresh.otherCourtPlayerIds,
    gapExcludeIds: [...refresh.gapExcludeIds],
  }

  return {
    courtIndex: emptyCourtIndex,
    allCourtsFull: false,
    ...refresh,
    queue: buildFullDisplayQueue(players, queueContext, refresh.onDeckPlayers),
  }
}

export function courtPlayerIds(court) {
  if (!court) return []
  return [...court.teamA, ...court.teamB].map((player) => player.id)
}

// -----------------------------------------------------------------------------
// Up Next freeze — keep the highlighted on-deck players (and the wider queue
// block) stable across score entry so what the user sees matches what Generate
// produces. The block holds `numberOfCourts * PLAYERS_PER_COURT` player ids;
// the first PLAYERS_PER_COURT are the highlighted on-deck four.
// -----------------------------------------------------------------------------

function freezeBlockSize(numberOfCourts) {
  return Math.max(numberOfCourts ?? 1, 1) * PLAYERS_PER_COURT
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

// Build the ordered id block, leading with the on-deck court so the highlighted
// four always equal a real, generatable court. The rest of the block follows in
// preview order, then any extra ids needed to reach `blockSize`.
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

export function captureProgressivePlayFreeze(players, options = {}) {
  const numberOfCourts = options.numberOfCourts ?? 1
  const preview = buildProgressivePlayUpNextPreview(players, options)
  const onDeckCourt = courtToTeamIds(preview.court)
  const queueIds = buildFreezeQueueIds(
    onDeckCourt,
    (preview.queue ?? []).map((player) => player.id),
    freezeBlockSize(numberOfCourts)
  )

  if (queueIds.length === 0) return null

  return {
    queueIds,
    onDeckCourt,
    numberOfCourts,
  }
}

export function isProgressivePlayFreezeValid(snapshot, players, courtMatchups) {
  if (!snapshot?.queueIds?.length) return false
  const byId = new Map((players ?? []).map((player) => [player.id, player]))
  const onCourtIds = new Set(getAllOnCourtPlayerIds(courtMatchups))
  return snapshot.queueIds.every((id) => {
    const player = byId.get(id)
    return Boolean(player?.checkedIn) && !onCourtIds.has(id)
  })
}

export function materializeFreezePlayers(snapshot, players) {
  if (!snapshot?.queueIds?.length) return []
  const byId = new Map((players ?? []).map((player) => [player.id, player]))
  return snapshot.queueIds.map((id) => byId.get(id)).filter(Boolean)
}

export function materializeFrozenCourt(snapshot, players, generateOptions = {}) {
  if (!snapshot?.queueIds?.length) return null
  const byId = new Map((players ?? []).map((player) => [player.id, player]))

  if (snapshot.onDeckCourt) {
    const teamA = snapshot.onDeckCourt.teamAIds
      .map((id) => byId.get(id))
      .filter(Boolean)
    const teamB = snapshot.onDeckCourt.teamBIds
      .map((id) => byId.get(id))
      .filter(Boolean)
    if (teamA.length + teamB.length === PLAYERS_PER_COURT) {
      return { teamA, teamB }
    }
  }

  const topPlayers = snapshot.queueIds
    .slice(0, PLAYERS_PER_COURT)
    .map((id) => byId.get(id))
    .filter(Boolean)
  if (topPlayers.length < PLAYERS_PER_COURT) return null

  const { matchHistory = [], allowAdjacentSkillMixing = true } = generateOptions
  const result = generateMatches(topPlayers, {
    courts: 1,
    matchHistory,
    allowAdjacentSkillMixing,
  })
  return result.courts[0] ?? null
}

// After a court is generated, advance the block: recompute a fresh, valid
// on-deck court (excluding the just-generated four) and lead the block with it
// so the new highlighted four still equal what the next Generate will place.
// Remaining frozen players follow for tail stability, then top up to full size.
export function advanceProgressivePlayFreeze(
  snapshot,
  generatedPlayerIds,
  players,
  options = {}
) {
  const numberOfCourts = options.numberOfCourts ?? snapshot?.numberOfCourts ?? 1
  const generatedSet = new Set(generatedPlayerIds)

  const fresh = captureProgressivePlayFreeze(players, {
    ...options,
    numberOfCourts,
  })
  if (!fresh) return null

  const onDeckCourt = fresh.onDeckCourt
  const leadIds = onDeckCourt
    ? onDeckCourtIds(onDeckCourt)
    : fresh.queueIds.slice(0, PLAYERS_PER_COURT)
  const leadSet = new Set(leadIds)

  const blockSize = freezeBlockSize(numberOfCourts)
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

  // Keep previously-frozen players (minus the generated four and the new
  // on-deck four) so the tail stays stable, then fill any gap from the fresh
  // capture order.
  appendFrom(snapshot?.queueIds ?? [])
  appendFrom(fresh.queueIds)

  if (merged.length === 0) return null

  return { queueIds: merged, onDeckCourt, numberOfCourts }
}

export function mergeFrozenUpNextDisplay(snapshot, livePreview, players) {
  const frozenPlayers = materializeFreezePlayers(snapshot, players)
  const frozenIds = new Set(frozenPlayers.map((player) => player.id))
  const tail = (livePreview?.queue ?? []).filter(
    (player) => !frozenIds.has(player.id)
  )
  return [...frozenPlayers, ...tail]
}
