export const V2_STORAGE_PREFIX = 'matchGen.v2.'

export const V2_STORAGE_KEYS = {
  gameType: `${V2_STORAGE_PREFIX}gameType`,
  gameMode: `${V2_STORAGE_PREFIX}gameMode`,
  courts: `${V2_STORAGE_PREFIX}courts`,
  winStreak: `${V2_STORAGE_PREFIX}winStreak`,
  skillAdjustment: `${V2_STORAGE_PREFIX}skillAdjustment`,
  allowAdjacentSkillMixing: `${V2_STORAGE_PREFIX}allowAdjacentSkillMixing`,
  sessionStarted: `${V2_STORAGE_PREFIX}sessionStarted`,
  sessionId: `${V2_STORAGE_PREFIX}sessionId`,
  players: `${V2_STORAGE_PREFIX}players`,
  courtMatchups: `${V2_STORAGE_PREFIX}courtMatchups`,
  matchHistory: `${V2_STORAGE_PREFIX}matchHistory`,
}

export const V2_GAME_TYPES = {
  ROUND_ROBIN: 'round-robin',
  PROGRESSIVE_PLAY: 'progressive-play',
  THRONE_RUN: 'throne-run',
  LADDER_RUN: 'ladder-run',
}

export const DEFAULT_V2_GAME_TYPE = V2_GAME_TYPES.PROGRESSIVE_PLAY
export const DEFAULT_V2_GAME_MODE = 'doubles'
export const DEFAULT_V2_COURTS = 2
export const DEFAULT_V2_WIN_STREAK = 0
export const DEFAULT_V2_SKILL_ADJUSTMENT = 1
export const DEFAULT_V2_ALLOW_ADJACENT_SKILL_MIXING = false

export const V2_TEAM_COLOR_CLASSES = [
  'border-emerald-200 bg-emerald-50 text-emerald-700',
  'border-blue-200 bg-blue-50 text-blue-700',
  'border-violet-200 bg-violet-50 text-violet-700',
  'border-amber-200 bg-amber-50 text-amber-700',
  'border-rose-200 bg-rose-50 text-rose-700',
  'border-cyan-200 bg-cyan-50 text-cyan-700',
  'border-orange-200 bg-orange-50 text-orange-700',
  'border-indigo-200 bg-indigo-50 text-indigo-700',
]

export function getTeamColorForCode(teamCode) {
  if (!teamCode || typeof teamCode !== 'string') {
    return V2_TEAM_COLOR_CLASSES[0]
  }
  const index = teamCode.charCodeAt(0) - 65
  if (index < 0) {
    return V2_TEAM_COLOR_CLASSES[0]
  }
  return V2_TEAM_COLOR_CLASSES[index % V2_TEAM_COLOR_CLASSES.length]
}

export function getUsedTeamCodes(players) {
  const used = new Set()
  players.forEach((player) => {
    if (player.teammateId && player.teamCode) {
      used.add(player.teamCode)
    }
  })
  return used
}

export function allocateNextTeamMetadata(players) {
  const used = getUsedTeamCodes(players)
  for (let index = 0; index < 26; index += 1) {
    const teamCode = String.fromCharCode(65 + index)
    if (!used.has(teamCode)) {
      return {
        teamCode,
        teamColor: getTeamColorForCode(teamCode),
      }
    }
  }
  return {
    teamCode: 'Z',
    teamColor: getTeamColorForCode('Z'),
  }
}

function createUniqueId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function loadV2SessionStarted() {
  return window.localStorage.getItem(V2_STORAGE_KEYS.sessionStarted) === 'true'
}

export function loadV2GameType() {
  const stored =
    window.localStorage.getItem(V2_STORAGE_KEYS.gameType) || DEFAULT_V2_GAME_TYPE
  if (
    stored === V2_GAME_TYPES.ROUND_ROBIN ||
    stored === V2_GAME_TYPES.PROGRESSIVE_PLAY ||
    stored === V2_GAME_TYPES.THRONE_RUN ||
    stored === V2_GAME_TYPES.LADDER_RUN
  ) {
    return stored
  }
  return DEFAULT_V2_GAME_TYPE
}

export function loadV2GameMode() {
  return (
    window.localStorage.getItem(V2_STORAGE_KEYS.gameMode) || DEFAULT_V2_GAME_MODE
  )
}

export function loadV2Courts() {
  const stored = Number(window.localStorage.getItem(V2_STORAGE_KEYS.courts))
  if (!Number.isInteger(stored) || stored < 1 || stored > 6) {
    return DEFAULT_V2_COURTS
  }
  return stored
}

export function loadV2WinStreak() {
  const stored = Number(window.localStorage.getItem(V2_STORAGE_KEYS.winStreak))
  if (!Number.isInteger(stored) || stored < 0 || stored > 5) {
    return DEFAULT_V2_WIN_STREAK
  }
  return stored
}

export function saveV2WinStreak(winStreak) {
  window.localStorage.setItem(V2_STORAGE_KEYS.winStreak, String(winStreak))
}

export function loadV2SkillAdjustment() {
  const stored = Number(window.localStorage.getItem(V2_STORAGE_KEYS.skillAdjustment))
  if (!Number.isInteger(stored) || stored < 1 || stored > 5) {
    return DEFAULT_V2_SKILL_ADJUSTMENT
  }
  return stored
}

export function saveV2SkillAdjustment(skillAdjustment) {
  window.localStorage.setItem(V2_STORAGE_KEYS.skillAdjustment, String(skillAdjustment))
}

export function loadV2AllowAdjacentSkillMixing() {
  const stored = window.localStorage.getItem(V2_STORAGE_KEYS.allowAdjacentSkillMixing)
  if (stored === 'true') return true
  if (stored === 'false') return false
  return DEFAULT_V2_ALLOW_ADJACENT_SKILL_MIXING
}

export function saveV2AllowAdjacentSkillMixing(value) {
  window.localStorage.setItem(
    V2_STORAGE_KEYS.allowAdjacentSkillMixing,
    value ? 'true' : 'false'
  )
}

export function persistV2Session({
  gameType,
  gameMode,
  courts,
  winStreak,
  skillAdjustment,
  allowAdjacentSkillMixing,
}) {
  const sessionId = createUniqueId('session')
  window.localStorage.setItem(V2_STORAGE_KEYS.gameType, gameType)
  window.localStorage.setItem(V2_STORAGE_KEYS.gameMode, gameMode)
  window.localStorage.setItem(V2_STORAGE_KEYS.courts, String(courts))
  window.localStorage.setItem(V2_STORAGE_KEYS.winStreak, String(winStreak))
  window.localStorage.setItem(
    V2_STORAGE_KEYS.skillAdjustment,
    String(skillAdjustment ?? DEFAULT_V2_SKILL_ADJUSTMENT)
  )
  window.localStorage.setItem(
    V2_STORAGE_KEYS.allowAdjacentSkillMixing,
    (allowAdjacentSkillMixing ?? DEFAULT_V2_ALLOW_ADJACENT_SKILL_MIXING)
      ? 'true'
      : 'false'
  )
  window.localStorage.setItem(V2_STORAGE_KEYS.sessionStarted, 'true')
  window.localStorage.setItem(V2_STORAGE_KEYS.sessionId, sessionId)
  return sessionId
}

export function loadV2Players() {
  const stored = window.localStorage.getItem(V2_STORAGE_KEYS.players)
  if (!stored) return []
  try {
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    const players = parsed.map((player) => ({
      id:
        typeof player.id === 'string' && player.id.trim()
          ? player.id
          : createUniqueId('player'),
      name: player.name ?? '',
      gender: player.gender ?? '',
      skillLevel: player.skillLevel ?? '',
      teammateId:
        typeof player.teammateId === 'string' && player.teammateId.trim()
          ? player.teammateId
          : null,
      teamCode:
        typeof player.teamCode === 'string' && player.teamCode.trim()
          ? player.teamCode
          : null,
      teamColor:
        typeof player.teamColor === 'string' && player.teamColor.trim()
          ? player.teamColor
          : null,
      checkedIn: Boolean(player.checkedIn),
      queueOrder: Number(player.queueOrder) || 0,
      gamesPlayed: Number(player.gamesPlayed) || 0,
      wins: Number(player.wins) || 0,
      losses: Number(player.losses) || 0,
      currentWinStreak: Number(player.currentWinStreak) || 0,
      currentLossStreak: Number(player.currentLossStreak) || 0,
      medals: Number(player.medals) || 0,
      medalCooldownCourt: player.medalCooldownCourt != null ? Number(player.medalCooldownCourt) : null,
      medalCooldownRemaining: Number(player.medalCooldownRemaining) || 0,
      partnerCounts:
        player.partnerCounts && typeof player.partnerCounts === 'object'
          ? player.partnerCounts
          : {},
      opponentCounts:
        player.opponentCounts && typeof player.opponentCounts === 'object'
          ? player.opponentCounts
          : {},
    }))
    return normalizeV2PlayersTeamMetadata(players)
  } catch {
    return []
  }
}

export function normalizeV2PlayersTeamMetadata(players) {
  const nextPlayers = players.map((player) => ({ ...player }))
  const playersById = new Map(nextPlayers.map((player) => [player.id, player]))
  const seenPairs = new Set()

  nextPlayers.forEach((player) => {
    if (!player.teammateId) {
      if (player.teamCode || player.teamColor) {
        player.teamCode = null
        player.teamColor = null
      }
      return
    }

    const teammate = playersById.get(player.teammateId)
    if (!teammate || teammate.teammateId !== player.id) {
      player.teammateId = null
      player.teamCode = null
      player.teamColor = null
      return
    }

    const pairKey = [player.id, teammate.id].sort().join(':')
    if (seenPairs.has(pairKey)) return
    seenPairs.add(pairKey)

    if (player.teamCode) {
      const teamColor = getTeamColorForCode(player.teamCode)
      player.teamColor = teamColor
      teammate.teamCode = player.teamCode
      teammate.teamColor = teamColor
      return
    }

    const teamMeta = allocateNextTeamMetadata(nextPlayers)
    player.teamCode = teamMeta.teamCode
    player.teamColor = teamMeta.teamColor
    teammate.teamCode = teamMeta.teamCode
    teammate.teamColor = teamMeta.teamColor
  })

  return nextPlayers
}

export function saveV2Players(players) {
  window.localStorage.setItem(V2_STORAGE_KEYS.players, JSON.stringify(players))
}

export function createV2Player({ name, gender, skillLevel }) {
  return {
    id: createUniqueId('player'),
    name: name.trim(),
    gender,
    skillLevel,
    teammateId: null,
    teamCode: null,
    teamColor: null,
    checkedIn: false,
    queueOrder: 0,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    currentWinStreak: 0,
    currentLossStreak: 0,
    medals: 0,
    medalCooldownCourt: null,
    medalCooldownRemaining: 0,
    partnerCounts: {},
    opponentCounts: {},
  }
}

export function loadV2CourtMatchups() {
  const stored = window.localStorage.getItem(V2_STORAGE_KEYS.courtMatchups)
  if (!stored) return null
  try {
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveV2CourtMatchups(matchups) {
  if (matchups == null) {
    window.localStorage.removeItem(V2_STORAGE_KEYS.courtMatchups)
  } else {
    window.localStorage.setItem(
      V2_STORAGE_KEYS.courtMatchups,
      JSON.stringify(matchups)
    )
  }
}

export function loadV2MatchHistory() {
  const stored = window.localStorage.getItem(V2_STORAGE_KEYS.matchHistory)
  if (!stored) return []
  try {
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveV2MatchHistory(history) {
  window.localStorage.setItem(
    V2_STORAGE_KEYS.matchHistory,
    JSON.stringify(history ?? [])
  )
}

export function clearV2Session() {
  const keysToRemove = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key?.startsWith(V2_STORAGE_PREFIX)) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach((key) => window.localStorage.removeItem(key))
}
