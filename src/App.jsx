import { useEffect, useRef, useState } from 'react'
import { toJpeg, toPng } from 'html-to-image'
import {
  ClipboardList,
  Home,
  Info,
  LayoutGrid,
  Trophy,
  Users,
  X,
} from 'lucide-react'
import playersData from './players.json'
import ReactMarkdown from 'react-markdown'
import AppLayout from './components/AppLayout'
import CourtsView from './components/CourtsView'
import GameSetupView from './components/GameSetupView'
import HistoryView from './components/HistoryView'
import PasswordPrompt from './components/PasswordPrompt'
import PlayersView from './components/PlayersView'
import ShareStandingsModal from './components/ShareStandingsModal'
import StandingsView from './components/StandingsView'
import * as roundRobinEngineDefault from './match-engines/RoundRobinDoubles.engine'
import * as roundRobinCustomTeamsEngine from './match-engines/RoundRobinDoublesCustomTeams.engine'
import * as splitStayRandomEngine from './match-engines/SplitStayDoublesRandom.engine'
import * as winnerLoserQueueEngine from './match-engines/WinnerLoserQueueDoubles.engine'
import matchEnginePlainDoc from '../docs/match-engine-plain.md?raw'
import standingsPlainDoc from '../docs/standings-plain.md?raw'

const STORAGE_KEYS = {
  players: 'matchGen.players',
  matchHistory: 'matchGen.matchHistory',
  sessionStarted: 'matchGen.sessionStarted',
  gameType: 'matchGen.gameType',
  playerFormat: 'matchGen.playerFormat',
  numberOfCourts: 'matchGen.numberOfCourts',
  roundRobinTotalPairs: 'matchGen.roundRobinTotalPairs',
  courtMatchups: 'matchGen.courtMatchups',
  lastCourtTeams: 'matchGen.lastCourtTeams',
  shareCoverPhoto: 'matchGen.shareCoverPhoto',
  sharePrimaryPhoto: 'matchGen.sharePrimaryPhoto',
  shareCoverPhotoName: 'matchGen.shareCoverPhotoName',
  sharePrimaryPhotoName: 'matchGen.sharePrimaryPhotoName',
  shareEventDate: 'matchGen.shareEventDate',
}

const DEFAULT_SHARE_COVER_PHOTO = '/img/cover-photo.jpg'
const DEFAULT_SHARE_PRIMARY_PHOTO = '/img/primary-photo.jpg'
const DEFAULT_SHARE_COVER_PHOTO_NAME = 'cover-photo.jpg'
const DEFAULT_SHARE_PRIMARY_PHOTO_NAME = 'primary-photo.jpg'
const DEFAULT_SHARE_EVENT_NAME = 'Event Name'
const DEFAULT_SHARE_EVENT_DATE = ''

const MIN_COURTS = 1
const MAX_COURTS = 10
const PLAYERS_PER_COURT = 4

const clampCourtCount = (value) => {
  if (!Number.isInteger(value)) return 2
  if (value < MIN_COURTS) return MIN_COURTS
  if (value > MAX_COURTS) return MAX_COURTS
  return value
}

const resizeCourtArray = (arr, count, fillValue) => {
  const source = Array.isArray(arr) ? arr : []
  const next = source.slice(0, count)
  while (next.length < count) {
    next.push(typeof fillValue === 'function' ? fillValue() : fillValue)
  }
  return next
}

const getCourtLabel = (courtIndex) => `Court ${(courtIndex ?? 0) + 1}`

const basePlayers = playersData.map((player) => {
  const rating = player.duprRating || player.clubRating || ''
  const type =
    player.duprRating ? 'DUPR' : player.clubRating ? 'Self Rating' : 'DUPR'

  return {
    id: player.id,
    name: player.name,
    teamName: player.teamName ?? '',
    gender: player.gender ?? '',
    rating,
    duprRating: player.duprRating ?? '',
    clubRating: player.clubRating ?? '',
    type,
    court: player.court,
    checkedIn: false,
    wins: 0,
    losses: 0,
    winStreak: 0,
    gamesPlayed: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointDifferential: 0,
  }
})

const ADMIN_STANDBY_IDS = new Set(['player-1', 'player-4'])
const PARTNER_MEMORY_ROUNDS = 2
const OPEN_ROTATION_MAX_GAMES_GAP = 1
const buildOpenRotationCooldown = (previousIds, recentMatchPlayerIds, maxSize) => {
  const previous = Array.isArray(previousIds) ? previousIds : []
  const incoming = []
  const seenIncoming = new Set()
  recentMatchPlayerIds.forEach((id) => {
    if (!id || seenIncoming.has(id)) return
    seenIncoming.add(id)
    incoming.push(id)
  })
  if (!Number.isFinite(maxSize) || maxSize <= 0) return []
  if (incoming.length === 0) return previous.slice(-maxSize)
  const incomingSet = new Set(incoming)
  const retained = previous.filter((id) => !incomingSet.has(id))
  return [...retained, ...incoming].slice(-maxSize)
}

const loadPlayers = () => {
  if (typeof window === 'undefined') return basePlayers
  const stored = window.localStorage.getItem(STORAGE_KEYS.players)
  if (!stored) return basePlayers
  try {
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return basePlayers
    return parsed.map((player) => {
      const duprRating =
        player.duprRating ??
        (player.type === 'DUPR' ? player.rating : '') ??
        ''
      const clubRating =
        player.clubRating ??
        (player.type === 'Self Rating' ? player.rating : '') ??
        ''

      return {
        ...player,
        duprRating,
        clubRating,
        gender: player.gender ?? '',
        wins: player.wins ?? 0,
        losses: player.losses ?? 0,
        winStreak: player.winStreak ?? 0,
        gamesPlayed: player.gamesPlayed ?? 0,
        pointsFor: player.pointsFor ?? 0,
        pointsAgainst: player.pointsAgainst ?? 0,
        pointDifferential:
          player.pointDifferential ??
          (player.pointsFor ?? 0) - (player.pointsAgainst ?? 0),
      }
    })
  } catch (error) {
    return basePlayers
  }
}

const loadMatchHistory = () => {
  if (typeof window === 'undefined') return []
  const stored = window.localStorage.getItem(STORAGE_KEYS.matchHistory)
  if (!stored) return []
  try {
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    return []
  }
}

const loadCourtMatchups = (courtCount) => {
  const count = clampCourtCount(courtCount)
  const defaultArray = Array(count).fill(null)
  if (typeof window === 'undefined') return defaultArray
  const stored = window.localStorage.getItem(STORAGE_KEYS.courtMatchups)
  if (!stored) return defaultArray
  try {
    const parsed = JSON.parse(stored)
    if (Array.isArray(parsed)) {
      return resizeCourtArray(parsed, count, null)
    }
    return defaultArray
  } catch (error) {
    return defaultArray
  }
}

const normalizeStoredTeams = (teams) => {
  if (!Array.isArray(teams)) return null
  return teams.map((team) =>
    Array.isArray(team)
      ? team
          .map((player) =>
            typeof player === 'string' ? player : player?.id
          )
          .filter(Boolean)
      : []
  )
}

const loadLastCourtTeams = (courtCount) => {
  const count = clampCourtCount(courtCount)
  const defaultArray = Array(count).fill(null)
  if (typeof window === 'undefined') return defaultArray
  const stored = window.localStorage.getItem(STORAGE_KEYS.lastCourtTeams)
  if (!stored) return defaultArray
  try {
    const parsed = JSON.parse(stored)
    if (Array.isArray(parsed)) {
      const normalized = parsed.map((entry) => normalizeStoredTeams(entry))
      return resizeCourtArray(normalized, count, null)
    }
    return defaultArray
  } catch (error) {
    return defaultArray
  }
}

const TEAM_ANIMALS = [
  'Antelope',
  'Bear',
  'Cat',
  'Dog',
  'Elephant',
  'Fox',
  'Giraffe',
  'Hippo',
  'Iguana',
  'Jaguar',
]

const getRandomTeamAnimal = () =>
  TEAM_ANIMALS[Math.floor(Math.random() * TEAM_ANIMALS.length)]

const loadSessionStarted = () => {
  if (typeof window === 'undefined') return false
  const stored = window.localStorage.getItem(STORAGE_KEYS.sessionStarted)
  return stored === 'true'
}

const loadGameType = () => {
  if (typeof window === 'undefined') return 'claim'
  const stored = window.localStorage.getItem(STORAGE_KEYS.gameType)
  return stored || 'claim'
}

const loadPlayerFormat = () => {
  if (typeof window === 'undefined') return 'random'
  const stored = window.localStorage.getItem(STORAGE_KEYS.playerFormat)
  return stored || 'random'
}

const loadNumberOfCourts = () => {
  if (typeof window === 'undefined') return 2
  const stored = Number(window.localStorage.getItem(STORAGE_KEYS.numberOfCourts))
  return clampCourtCount(stored)
}

const loadInitialView = () => (loadSessionStarted() ? 'courts' : 'home')

const loadSharePhoto = (storageKey, fallbackPath) => {
  if (typeof window === 'undefined') return fallbackPath
  const stored = window.localStorage.getItem(storageKey)
  return stored || fallbackPath
}

const loadSharePhotoName = (storageKey, fallbackName) => {
  if (typeof window === 'undefined') return fallbackName
  const stored = window.localStorage.getItem(storageKey)
  return stored || fallbackName
}

const loadShareValue = (storageKey, fallbackValue) => {
  if (typeof window === 'undefined') return fallbackValue
  const stored = window.localStorage.getItem(storageKey)
  return stored ?? fallbackValue
}

const escapeCsvValue = (value) => {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const downloadCsv = (filename, rows) => {
  const csv = rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

const buildCustomTeams = (players) => {
  const teams = new Map()

  players.forEach((player) => {
    const teamName = player.teamName?.trim()
    if (!teamName) return
    const group = teams.get(teamName)
    if (group) {
      group.push(player)
    } else {
      teams.set(teamName, [player])
    }
  })

  return [...teams.entries()]
    .map(([name, members]) => ({
      id: name,
      name,
      players: members.slice(0, 2),
      gamesPlayed: members.reduce(
        (max, player) => Math.max(max, player.gamesPlayed ?? 0),
        0
      ),
    }))
    .filter((team) => team.players.length === 2)
}

const buildSortedTeamStandings = (players) =>
  buildCustomTeams(players)
    .map((team) => {
      const primaryPlayer = team.players[0]
      return {
        ...team,
        name: team.players.map((player) => player.name).join(' / '),
        wins: primaryPlayer?.wins ?? 0,
        losses: primaryPlayer?.losses ?? 0,
        pointDifferential: primaryPlayer?.pointDifferential ?? 0,
        gamesPlayed: primaryPlayer?.gamesPlayed ?? team.gamesPlayed ?? 0,
      }
    })
    .sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    if (b.pointDifferential !== a.pointDifferential) {
      return b.pointDifferential - a.pointDifferential
    }
    return 0
  })

const getTeamName = (team) => team[0]?.teamName ?? team[1]?.teamName ?? ''

const buildMatchKey = (teamA, teamB) =>
  [teamA, teamB].sort((a, b) => a.localeCompare(b)).join('::')

const getTeamNameFromMatch = (teamLabel, playerLookup) => {
  if (!teamLabel) return ''
  const players = teamLabel
    .split('/')
    .map((name) => name.trim())
    .filter(Boolean)
  if (players.length === 0) return ''
  const teamNames = players
    .map((name) => playerLookup.get(name))
    .filter(Boolean)
  if (teamNames.length === 0) return ''
  const [first, ...rest] = teamNames
  return rest.every((value) => value === first) ? first : ''
}

const getPlayedMatchupsFromHistory = (history = [], players = []) => {
  const playerLookup = new Map(
    players.map((player) => [player.name, player.teamName || ''])
  )
  const matchups = []
  history.forEach((match) => {
    const teamA =
      match.teamAName || getTeamNameFromMatch(match.teamA, playerLookup)
    const teamB =
      match.teamBName || getTeamNameFromMatch(match.teamB, playerLookup)
    if (!teamA || !teamB) return
    const matchKey = buildMatchKey(teamA, teamB)
    if (!matchups.includes(matchKey)) {
      matchups.push(matchKey)
    }
  })
  return matchups
}

const shuffleList = (items) => {
  const list = [...items]
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[list[index], list[swapIndex]] = [list[swapIndex], list[index]]
  }
  return list
}

const buildPartnerKey = (firstId, secondId) => {
  if (!firstId || !secondId) return ''
  return [firstId, secondId].sort((a, b) => a.localeCompare(b)).join('::')
}

const getTeamPlayerIdsFromLabel = (teamLabel, playerIdLookupByName) => {
  if (!teamLabel) return []
  return teamLabel
    .split('/')
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => playerIdLookupByName.get(name))
    .filter(Boolean)
}

// Partner memory is intentionally GLOBAL (not per-court). Walk the most
// recent `windowSize` matches across all courts so a pair that just played on
// Court 1 is still discouraged when generating Court 2's next match. Callers
// typically pass `PARTNER_MEMORY_ROUNDS * numberOfCourts` so the original
// "last N rounds" intent scales with the number of courts in play.
const getRecentPartnerHistory = (
  history = [],
  players = [],
  windowSize = PARTNER_MEMORY_ROUNDS
) => {
  if (windowSize <= 0) return new Set()
  const playerIdLookupByName = new Map(players.map((player) => [player.name, player.id]))
  const recentPairs = new Set()
  let matchesCounted = 0

  for (let index = 0; index < history.length; index += 1) {
    const match = history[index]
    if (!match) continue
    const teamAIds = getTeamPlayerIdsFromLabel(match.teamA, playerIdLookupByName)
    const teamBIds = getTeamPlayerIdsFromLabel(match.teamB, playerIdLookupByName)
    const teams = [teamAIds, teamBIds]

    teams.forEach((teamIds) => {
      if (teamIds.length < 2) return
      const partnerKey = buildPartnerKey(teamIds[0], teamIds[1])
      if (partnerKey) recentPairs.add(partnerKey)
    })

    matchesCounted += 1
    if (matchesCounted >= windowSize) break
  }

  return recentPairs
}

const parseCsvRow = (row) => {
  const values = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index]
    if (char === '"') {
      if (inQuotes && row[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  values.push(current.trim())
  return values
}

const parseCsv = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCsvRow)

function App() {
  const [players, setPlayers] = useState(loadPlayers)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeView, setActiveView] = useState(loadInitialView)
  const [sessionStarted, setSessionStarted] = useState(loadSessionStarted)
  const [isStartingSession, setIsStartingSession] = useState(false)
  const [isEndingSession, setIsEndingSession] = useState(false)
  const [gameType, setGameType] = useState(loadGameType)
  const [playerFormat, setPlayerFormat] = useState(loadPlayerFormat)
  const [numberOfCourts, setNumberOfCourts] = useState(loadNumberOfCourts)
  const [exportMenuOpen, setExportMenuOpen] = useState(null)
  const [modalMode, setModalMode] = useState('add')
  const [editingId, setEditingId] = useState(null)
  const [infoModalOpen, setInfoModalOpen] = useState(false)
  const [infoTab, setInfoTab] = useState('match-engine-plain')
  const [courtMatchups, setCourtMatchups] = useState(() =>
    loadCourtMatchups(numberOfCourts)
  )
  const [lastCourtTeams, setLastCourtTeams] = useState(() =>
    loadLastCourtTeams(numberOfCourts)
  )
  const [courtStatus, setCourtStatus] = useState(() =>
    Array(numberOfCourts).fill('idle')
  )
  const [courtHolds, setCourtHolds] = useState(() =>
    Array.from({ length: numberOfCourts }, () => [])
  )
  // Global cooldown for Open Rotation: keep a rolling set of recently
  // finished players across courts so the latest submissions are all
  // temporarily deprioritized.
  const [openRotationCooldownIds, setOpenRotationCooldownIds] = useState([])
  const [matchHistory, setMatchHistory] = useState(loadMatchHistory)
  const [formValues, setFormValues] = useState({
    teamName: '',
    name: '',
    rating: '',
    type: 'DUPR',
    gender: '',
  })
  const [formErrors, setFormErrors] = useState({
    gender: '',
  })
  const [scoreModal, setScoreModal] = useState({
    isOpen: false,
    courtIndex: null,
    teamA: [],
    teamB: [],
    scoreA: '',
    scoreB: '',
    enteredBy: '',
  })
  const [manualMatchModal, setManualMatchModal] = useState({
    isOpen: false,
    court: '',
    teamAIds: ['', ''],
    teamBIds: ['', ''],
    scoreA: '',
    scoreB: '',
    verifiedBy: '',
  })
  const [scoreErrors, setScoreErrors] = useState({
    scoreA: '',
    scoreB: '',
    verifiedBy: '',
  })
  const [manualMatchErrors, setManualMatchErrors] = useState({
    court: '',
    teamA: '',
    teamB: '',
    scoreA: '',
    scoreB: '',
    duplicate: '',
  })
  const [roundRobinCompleteModalOpen, setRoundRobinCompleteModalOpen] =
    useState(false)
  const isOpenRotationRandom =
    gameType === 'open-rotation' && playerFormat === 'random'
  const activeMatchEngine =
    isOpenRotationRandom
      ? winnerLoserQueueEngine
      : gameType === 'round-robin' && playerFormat === 'custom'
        ? roundRobinCustomTeamsEngine
        : gameType === 'claim' && playerFormat === 'random'
          ? splitStayRandomEngine
          : roundRobinEngineDefault
  const { buildCourtTeams, enforceExclusivePlayers } = activeMatchEngine
  const [endSessionModal, setEndSessionModal] = useState({
    isOpen: false,
    password: '',
    error: '',
  })
  const [editCourtModal, setEditCourtModal] = useState({
    isOpen: false,
    courtIndex: null,
    teamAIds: ['', ''],
    teamBIds: ['', ''],
  })
  const [editCourtErrors, setEditCourtErrors] = useState({
    teamA: '',
    teamB: '',
    duplicate: '',
  })
  const [resetModal, setResetModal] = useState({
    isOpen: false,
    password: '',
    error: '',
  })
  const [clearHistoryModal, setClearHistoryModal] = useState({
    isOpen: false,
    password: '',
    error: '',
  })
  const [refreshCounts, setRefreshCounts] = useState(() =>
    Array(numberOfCourts).fill(0)
  )
  const [refreshModal, setRefreshModal] = useState({
    isOpen: false,
    courtIndex: null,
    password: '',
    error: '',
  })
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareEventName, setShareEventName] = useState(DEFAULT_SHARE_EVENT_NAME)
  const [shareEventDate, setShareEventDate] = useState(() =>
    loadShareValue(STORAGE_KEYS.shareEventDate, DEFAULT_SHARE_EVENT_DATE)
  )
  const [shareCoverPhotoSrc, setShareCoverPhotoSrc] = useState(() =>
    loadSharePhoto(STORAGE_KEYS.shareCoverPhoto, DEFAULT_SHARE_COVER_PHOTO)
  )
  const [sharePrimaryPhotoSrc, setSharePrimaryPhotoSrc] = useState(() =>
    loadSharePhoto(STORAGE_KEYS.sharePrimaryPhoto, DEFAULT_SHARE_PRIMARY_PHOTO)
  )
  const [shareCoverPhotoName, setShareCoverPhotoName] = useState(() =>
    loadSharePhotoName(
      STORAGE_KEYS.shareCoverPhotoName,
      DEFAULT_SHARE_COVER_PHOTO_NAME
    )
  )
  const [sharePrimaryPhotoName, setSharePrimaryPhotoName] = useState(() =>
    loadSharePhotoName(
      STORAGE_KEYS.sharePrimaryPhotoName,
      DEFAULT_SHARE_PRIMARY_PHOTO_NAME
    )
  )
  const [lastGeneratedTeams, setLastGeneratedTeams] = useState([])
  const playedMatchups = getPlayedMatchupsFromHistory(matchHistory, players)
  const playersTableRef = useRef(null)
  const standingsTableRef = useRef(null)
  const historyTableRef = useRef(null)
  const [toastMessage, setToastMessage] = useState('')
  const checkedInCount = players.filter((player) => player.checkedIn).length
  const roundRobinTeams = buildCustomTeams(
    players.filter((player) => player.checkedIn)
  )
  const roundRobinTeamNames = new Set(
    roundRobinTeams.map((team) => team.name)
  )
  const roundRobinPlayedMatchups = playedMatchups.filter((matchKey) => {
    const [teamA, teamB] = matchKey.split('::')
    return roundRobinTeamNames.has(teamA) && roundRobinTeamNames.has(teamB)
  })
  const roundRobinTotalPairs =
    roundRobinTeams.length > 1
      ? (roundRobinTeams.length * (roundRobinTeams.length - 1)) / 2
      : 0
  const roundRobinRemainingPairs = Math.max(
    0,
    roundRobinTotalPairs - roundRobinPlayedMatchups.length
  )

  useEffect(() => {
    if (
      gameType === 'round-robin' &&
      playerFormat === 'custom' &&
      roundRobinTotalPairs > 0 &&
      roundRobinRemainingPairs === 0
    ) {
      setRoundRobinCompleteModalOpen(true)
    }
  }, [
    gameType,
    playerFormat,
    roundRobinTotalPairs,
    roundRobinRemainingPairs,
  ])
  const teamCounts = players.reduce((counts, player) => {
    if (!player.teamName) return counts
    counts[player.teamName] = (counts[player.teamName] ?? 0) + 1
    return counts
  }, {})
  const availableTeams = TEAM_ANIMALS.filter(
    (animal) => (teamCounts[animal] ?? 0) < 2
  )
  const showTeamName = playerFormat === 'custom' && gameType !== 'claim'
  const visibleCourtCount = Math.min(
    numberOfCourts,
    Math.floor(checkedInCount / PLAYERS_PER_COURT)
  )
  const infoContent =
    infoTab === 'match-engine-plain'
      ? matchEnginePlainDoc
      : standingsPlainDoc

  const handleSelectNumberOfCourts = (nextValue) => {
    const clamped = clampCourtCount(nextValue)
    setNumberOfCourts(clamped)
    setCourtMatchups((prev) => resizeCourtArray(prev, clamped, null))
    setLastCourtTeams((prev) => resizeCourtArray(prev, clamped, null))
    setCourtStatus((prev) => resizeCourtArray(prev, clamped, 'idle'))
    setCourtHolds((prev) => resizeCourtArray(prev, clamped, () => []))
    setRefreshCounts((prev) => resizeCourtArray(prev, clamped, 0))
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEYS.players, JSON.stringify(players))
  }, [players])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      STORAGE_KEYS.matchHistory,
      JSON.stringify(matchHistory)
    )
  }, [matchHistory])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      STORAGE_KEYS.sessionStarted,
      String(sessionStarted)
    )
  }, [sessionStarted])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEYS.gameType, gameType)
  }, [gameType])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEYS.playerFormat, playerFormat)
  }, [playerFormat])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      STORAGE_KEYS.numberOfCourts,
      String(numberOfCourts)
    )
  }, [numberOfCourts])

  useEffect(() => {
    if (gameType !== 'open-rotation') return
    if (playerFormat === 'random') return
    setPlayerFormat('random')
  }, [gameType, playerFormat])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      STORAGE_KEYS.roundRobinTotalPairs,
      String(roundRobinTotalPairs)
    )
  }, [roundRobinTotalPairs])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      STORAGE_KEYS.courtMatchups,
      JSON.stringify(courtMatchups)
    )
  }, [courtMatchups])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      STORAGE_KEYS.lastCourtTeams,
      JSON.stringify(lastCourtTeams)
    )
  }, [lastCourtTeams])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEYS.shareCoverPhoto, shareCoverPhotoSrc)
  }, [shareCoverPhotoSrc])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      STORAGE_KEYS.sharePrimaryPhoto,
      sharePrimaryPhotoSrc
    )
  }, [sharePrimaryPhotoSrc])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      STORAGE_KEYS.shareCoverPhotoName,
      shareCoverPhotoName
    )
  }, [shareCoverPhotoName])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      STORAGE_KEYS.sharePrimaryPhotoName,
      sharePrimaryPhotoName
    )
  }, [sharePrimaryPhotoName])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEYS.shareEventDate, shareEventDate)
  }, [shareEventDate])

  useEffect(() => {
    if (!toastMessage) return
    const timer = window.setTimeout(() => {
      setToastMessage('')
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [toastMessage])

  const handleResetData = () => {
    setResetModal({ isOpen: true, password: '', error: '' })
  }

  const closeResetModal = () => {
    setResetModal({ isOpen: false, password: '', error: '' })
  }

  const openEndSessionModal = () => {
    setEndSessionModal({ isOpen: true, password: '', error: '' })
  }

  const closeEndSessionModal = () => {
    setEndSessionModal({ isOpen: false, password: '', error: '' })
  }

  const confirmEndSession = (event) => {
    event.preventDefault()
    if (endSessionModal.password !== '123456') {
      setEndSessionModal((prev) => ({
        ...prev,
        error: 'Incorrect password',
      }))
      return
    }
    setIsEndingSession(true)
    closeEndSessionModal()
    window.setTimeout(() => {
      setPlayers(basePlayers)
      setCourtMatchups(Array(numberOfCourts).fill(null))
      setLastCourtTeams(Array(numberOfCourts).fill(null))
      setCourtStatus(Array(numberOfCourts).fill('idle'))
      setCourtHolds(Array.from({ length: numberOfCourts }, () => []))
      setOpenRotationCooldownIds([])
      setRefreshCounts(Array(numberOfCourts).fill(0))
      setMatchHistory([])
      setLastGeneratedTeams([])
      setSessionStarted(false)
      setActiveView('home')
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(STORAGE_KEYS.players)
        window.localStorage.removeItem(STORAGE_KEYS.matchHistory)
        window.localStorage.removeItem(STORAGE_KEYS.sessionStarted)
        window.localStorage.removeItem(STORAGE_KEYS.gameType)
        window.localStorage.removeItem(STORAGE_KEYS.playerFormat)
        window.localStorage.removeItem(STORAGE_KEYS.numberOfCourts)
        window.localStorage.removeItem(STORAGE_KEYS.roundRobinTotalPairs)
        window.localStorage.removeItem(STORAGE_KEYS.courtMatchups)
        window.localStorage.removeItem(STORAGE_KEYS.lastCourtTeams)
      }
      setIsEndingSession(false)
      setToastMessage('Session ended')
    }, 1200)
  }

  const confirmReset = (event) => {
    event.preventDefault()
    if (resetModal.password !== '123456') {
      setResetModal((prev) => ({
        ...prev,
        error: 'Incorrect password',
      }))
      return
    }
    setPlayers(basePlayers)
    setCourtMatchups(Array(numberOfCourts).fill(null))
    setLastCourtTeams(Array(numberOfCourts).fill(null))
    setCourtStatus(Array(numberOfCourts).fill('idle'))
    setCourtHolds(Array.from({ length: numberOfCourts }, () => []))
    setOpenRotationCooldownIds([])
    setRefreshCounts(Array(numberOfCourts).fill(0))
    setMatchHistory([])
    setLastGeneratedTeams([])
    setSessionStarted(false)
    setActiveView('home')
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEYS.players)
      window.localStorage.removeItem(STORAGE_KEYS.matchHistory)
      window.localStorage.removeItem(STORAGE_KEYS.sessionStarted)
      window.localStorage.removeItem(STORAGE_KEYS.gameType)
      window.localStorage.removeItem(STORAGE_KEYS.playerFormat)
      window.localStorage.removeItem(STORAGE_KEYS.numberOfCourts)
    window.localStorage.removeItem(STORAGE_KEYS.roundRobinTotalPairs)
    window.localStorage.removeItem(STORAGE_KEYS.courtMatchups)
      window.localStorage.removeItem(STORAGE_KEYS.lastCourtTeams)
    }
    setToastMessage('Storage cleared')
    closeResetModal()
  }

  const openRefreshModal = (courtIndex) => {
    setRefreshModal({
      isOpen: true,
      courtIndex,
      password: '',
      error: '',
    })
  }

  const closeRefreshModal = () => {
    setRefreshModal({
      isOpen: false,
      courtIndex: null,
      password: '',
      error: '',
    })
  }

  const openAddModal = () => {
    setModalMode('add')
    setEditingId(null)
    setFormValues({
      teamName: availableTeams[0] ?? '',
      name: '',
      rating: '',
      type: 'DUPR',
      gender: '',
    })
    setFormErrors({ gender: '' })
    setIsModalOpen(true)
  }

  const openEditModal = (player) => {
    setModalMode('edit')
    setEditingId(player.id)
    setFormValues({
      teamName: player.teamName || getRandomTeamAnimal(),
      name: player.name,
      rating: String(player.rating),
      type: player.type,
      gender: player.gender ?? '',
    })
    setFormErrors({ gender: '' })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setFormErrors({ gender: '' })
    setIsModalOpen(false)
  }

  const openInfoModal = () => {
    setInfoTab('match-engine-plain')
    setInfoModalOpen(true)
  }

  const closeInfoModal = () => {
    setInfoModalOpen(false)
  }

  const handleSave = (event) => {
    event.preventDefault()
    const trimmedGender = (formValues.gender ?? '').trim()
    if (!trimmedGender) {
      setFormErrors({ gender: 'Gender is required' })
      return
    }
    setFormErrors({ gender: '' })
    const ratingValue = formValues.rating.trim()
    const isCustomTeams = playerFormat === 'custom'
    const selectedTeam = formValues.teamName
    if (isCustomTeams && modalMode === 'add') {
      if (!selectedTeam) {
        setToastMessage('All teams are full')
        return
      }
      if ((teamCounts[selectedTeam] ?? 0) >= 2) {
        setToastMessage('That team already has two players')
        return
      }
    }
    if (isCustomTeams && modalMode === 'edit') {
      const currentPlayer = players.find((player) => player.id === editingId)
      const currentTeam = currentPlayer?.teamName ?? ''
      if (selectedTeam && selectedTeam !== currentTeam) {
        if ((teamCounts[selectedTeam] ?? 0) >= 2) {
          setToastMessage('That team already has two players')
          return
        }
      }
    }

    if (modalMode === 'add') {
      const newPlayer = {
        id: crypto.randomUUID(),
        teamName: formValues.teamName,
        name: formValues.name.trim() || 'New Player',
        gender: formValues.gender,
        rating: ratingValue,
        duprRating: formValues.type === 'DUPR' ? ratingValue : '',
        clubRating: formValues.type === 'Self Rating' ? ratingValue : '',
        type: formValues.type,
        checkedIn: false,
        wins: 0,
        losses: 0,
        winStreak: 0,
        gamesPlayed: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDifferential: 0,
      }
      setPlayers((prev) => [...prev, newPlayer])
    } else {
      setPlayers((prev) =>
        prev.map((player) =>
          player.id === editingId
            ? {
                ...player,
                teamName: formValues.teamName,
                name: formValues.name.trim() || player.name,
                gender: formValues.gender,
                rating: ratingValue,
                duprRating: formValues.type === 'DUPR' ? ratingValue : '',
                clubRating: formValues.type === 'Self Rating' ? ratingValue : '',
                type: formValues.type,
              }
            : player
        )
      )
    }

    setIsModalOpen(false)
  }

  const handleDelete = (playerId) => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Delete this player?')
    ) {
      return
    }
    setPlayers((prev) => prev.filter((player) => player.id !== playerId))
  }

  const handleCheckIn = (playerId) => {
    setPlayers((prev) => {
      const maxQueueOrder = prev.reduce((max, player) => {
        const order = player.queueOrder ?? 0
        return order > max ? order : max
      }, 0)
      const nextQueueOrder = maxQueueOrder + 1

      return prev.map((player) => {
        if (player.id !== playerId) return player
        return {
          ...player,
          checkedIn: true,
          gamesPlayed: 0,
          queueOrder: nextQueueOrder,
        }
      })
    })
  }

  const handleCheckOut = (playerId) => {
    setPlayers((prev) =>
      prev.map((player) =>
        player.id === playerId ? { ...player, checkedIn: false } : player
      )
    )
    setOpenRotationCooldownIds((prev) =>
      (Array.isArray(prev) ? prev : []).filter((id) => id !== playerId)
    )
    setCourtHolds((prev) =>
      (Array.isArray(prev) ? prev : []).map((holds) =>
        (holds ?? []).filter((id) => id !== playerId)
      )
    )
    const clearIfContainsPlayer = (teams) => {
      if (!Array.isArray(teams)) return teams
      const containsPlayer = teams.some((team) =>
        team.some((player) => player.id === playerId)
      )
      return containsPlayer ? null : teams
    }
    const nextMatchups = (Array.isArray(courtMatchups) ? courtMatchups : []).map(
      (teams) => clearIfContainsPlayer(teams)
    )
    setCourtMatchups(nextMatchups)
    setCourtStatus((prev) =>
      (Array.isArray(prev) ? prev : []).map((status, index) =>
        nextMatchups[index] ? status : 'waiting'
      )
    )
  }

  const handleGenerateCourts = (courtIndex, options = {}) => {
    if (!Number.isInteger(courtIndex) || courtIndex < 0) return
    if ((refreshCounts[courtIndex] ?? 0) >= 1 && !options.force) {
      openRefreshModal(courtIndex)
      return
    }
    const courtLabel = getCourtLabel(courtIndex)
    const failGenerate = (reason) => {
      setToastMessage(`Unable to generate ${courtLabel}: ${reason}`)
    }
    const occupiedPlayers = new Set(
      (Array.isArray(courtMatchups) ? courtMatchups : []).flatMap(
        (teams, index) => {
          if (index === courtIndex) return []
          if (!Array.isArray(teams)) return []
          return teams.flatMap((team) =>
            (team ?? []).map((player) => player.id)
          )
        }
      )
    )
    const isOpenRotation = gameType === 'open-rotation'
    const isRoundRobinCustom =
      gameType === 'round-robin' && playerFormat === 'custom'
    const holdIds = isOpenRotation
      ? new Set()
      : new Set(courtHolds[courtIndex] ?? [])
    const holdPlayers = isOpenRotation
      ? []
      : (courtHolds[courtIndex] ?? [])
          .map((playerId) => players.find((player) => player.id === playerId))
          .filter(Boolean)
    const eligiblePlayers = isOpenRotation
      ? []
      : players.filter(
          (player) =>
            player.checkedIn &&
            !occupiedPlayers.has(player.id) &&
            !holdIds.has(player.id)
        )
    const roundRobinPlayers = isOpenRotation
      ? []
      : isRoundRobinCustom
        ? players.filter(
            (player) => player.checkedIn && !occupiedPlayers.has(player.id)
          )
        : []
    if (!isOpenRotation) {
      if (isRoundRobinCustom) {
        if (roundRobinPlayers.length < 4) {
          failGenerate('not enough available checked-in players')
          return
        }
      } else if (holdPlayers.length + eligiblePlayers.length < 4) {
        failGenerate('need at least 4 available players')
        return
      }
    }

    if (isRoundRobinCustom) {
      const candidateTeams = buildCustomTeams(roundRobinPlayers)
      if (candidateTeams.length < 2) {
        failGenerate('not enough available teams')
        return
      }

      const candidateNames = candidateTeams.map((team) => team.name)
      const candidateSet = new Set(candidateNames)
      const playedForCandidates = playedMatchups.filter((matchKey) => {
        const [teamA, teamB] = matchKey.split('::')
        return candidateSet.has(teamA) && candidateSet.has(teamB)
      })

      const lastTeams = new Set(lastGeneratedTeams ?? [])
      const preferredTeams = candidateTeams.filter(
        (team) => !lastTeams.has(team.name)
      )
      const shouldAvoidRepeat = preferredTeams.length >= 2
      const minTeamGames = candidateTeams.reduce(
        (min, team) => Math.min(min, team.gamesPlayed),
        Number.POSITIVE_INFINITY
      )
      const minGameTeams = candidateTeams.filter(
        (team) => team.gamesPlayed === minTeamGames
      )
      const hasMinGamesOutsideLast = minGameTeams.some(
        (team) => !lastTeams.has(team.name)
      )

      const orderedTeams = shuffleList(candidateTeams)
      const availablePairs = []

      for (let i = 0; i < orderedTeams.length; i += 1) {
        for (let j = i + 1; j < orderedTeams.length; j += 1) {
          const teamA = orderedTeams[i]
          const teamB = orderedTeams[j]
          const matchKey = buildMatchKey(teamA.name, teamB.name)
          const isMatchRepeat = playedForCandidates.includes(matchKey)
          if (isMatchRepeat) continue

          const repeatsLastTeam =
            lastTeams.has(teamA.name) || lastTeams.has(teamB.name)
          if (hasMinGamesOutsideLast && repeatsLastTeam) continue
          if (!hasMinGamesOutsideLast && shouldAvoidRepeat && repeatsLastTeam)
            continue

          availablePairs.push({
            teams: [teamA, teamB],
            totalGames: teamA.gamesPlayed + teamB.gamesPlayed,
            maxGames: Math.max(teamA.gamesPlayed, teamB.gamesPlayed),
          })
        }
      }

      if (availablePairs.length === 0) {
        setRoundRobinCompleteModalOpen(true)
        return
      }

      const minTotalGames = availablePairs.reduce(
        (min, pair) => Math.min(min, pair.totalGames),
        Number.POSITIVE_INFINITY
      )
      const minTotalPairs = availablePairs.filter(
        (pair) => pair.totalGames === minTotalGames
      )
      const minMaxGames = minTotalPairs.reduce(
        (min, pair) => Math.min(min, pair.maxGames),
        Number.POSITIVE_INFINITY
      )
      const balancedPairs = minTotalPairs.filter(
        (pair) => pair.maxGames === minMaxGames
      )
      const selection = shuffleList(balancedPairs)[0]
      const [teamA, teamB] = selection.teams
      const selectedTeams = [teamA.players, teamB.players]

      setCourtMatchups((prev) =>
        (Array.isArray(prev) ? prev : []).map((teams, index) =>
          index === courtIndex ? selectedTeams : teams
        )
      )
      setCourtStatus((prev) =>
        (Array.isArray(prev) ? prev : []).map((status, index) =>
          index === courtIndex ? 'idle' : status
        )
      )
      setRefreshCounts((prev) =>
        (Array.isArray(prev) ? prev : []).map((count, index) =>
          index === courtIndex ? (count ?? 0) + 1 : count
        )
      )
      setLastGeneratedTeams(selectedTeams.map(getTeamName).filter(Boolean))
      return
    }

    if (isOpenRotation) {
      const eligibleForOpen = players.filter(
        (player) => player.checkedIn && !occupiedPlayers.has(player.id)
      )
      if (eligibleForOpen.length < 4) {
        failGenerate('not enough available checked-in players')
        return
      }

      const sortByOrder = (a, b) =>
        (a.queueOrder ?? 0) - (b.queueOrder ?? 0)
      const cooldownSet = new Set(openRotationCooldownIds)
      const nonCooldownEligible = eligibleForOpen.filter(
        (player) => !cooldownSet.has(player.id)
      )
      const selectionPool =
        cooldownSet.size > 0 && nonCooldownEligible.length >= 4
          ? nonCooldownEligible
          : eligibleForOpen
      const minGamesInSelectionPool = selectionPool.reduce((min, player) => {
        const games = player.gamesPlayed ?? 0
        return games < min ? games : min
      }, Number.POSITIVE_INFINITY)
      const maxPreferredGames = Number.isFinite(minGamesInSelectionPool)
        ? minGamesInSelectionPool + OPEN_ROTATION_MAX_GAMES_GAP
        : Number.POSITIVE_INFINITY
      const withinGapPool = selectionPool.filter(
        (player) => (player.gamesPlayed ?? 0) <= maxPreferredGames
      )
      const fairnessPool = withinGapPool.length >= 4 ? withinGapPool : selectionPool

      // Winners = won their most recent match. Everyone else (just-lost or
      // never-played) goes into the Losers queue, ordered by check-in time
      // / post-match assignment so unplayed players who checked in earlier
      // get picked before later-finishing losers.
      const winnersQueue = fairnessPool
        .filter(
          (player) =>
            (player.gamesPlayed ?? 0) > 0 && (player.winStreak ?? 0) > 0
        )
        .sort(sortByOrder)
      const losersQueue = fairnessPool
        .filter(
          (player) =>
            (player.gamesPlayed ?? 0) === 0 ||
            (player.winStreak ?? 0) === 0
        )
        .sort(sortByOrder)
      const zeroGamePlayers = fairnessPool
        .filter((player) => (player.gamesPlayed ?? 0) === 0)
        .sort(sortByOrder)
      const sortByZeroThenOrder = (a, b) => {
        const aGroup = (a.gamesPlayed ?? 0) === 0 ? 0 : 1
        const bGroup = (b.gamesPlayed ?? 0) === 0 ? 0 : 1
        if (aGroup !== bGroup) return aGroup - bGroup
        return sortByOrder(a, b)
      }

      let candidatePlayers
      if (zeroGamePlayers.length > 0) {
        // Priority mode: ensure never-played players are selected first.
        candidatePlayers = zeroGamePlayers.slice(0, 4)
        if (candidatePlayers.length < 4) {
          const selectedZeroIds = new Set(
            candidatePlayers.map((player) => player.id)
          )
          const supplementalWinners = winnersQueue.filter(
            (player) => !selectedZeroIds.has(player.id)
          )
          const supplementalLosers = losersQueue.filter(
            (player) => !selectedZeroIds.has(player.id)
          )
          const picked = winnerLoserQueueEngine.pickCourtPlayers(
            supplementalWinners,
            supplementalLosers,
            [],
            4 - candidatePlayers.length
          )
          candidatePlayers = [...candidatePlayers, ...picked.players]
        }
      } else {
        // Once everyone has played at least one game, prioritize W/L queues.
        const picked = winnerLoserQueueEngine.pickCourtPlayers(
          winnersQueue,
          losersQueue,
          [],
          4
        )
        candidatePlayers = picked.players
      }

      // If any cooled-down player still appears in the generated 4, try to
      // replace them with a fresh player from the opposite queue first.
      if (cooldownSet.size > 0) {
        const isWinnerQueuePlayer = (player) =>
          (player?.gamesPlayed ?? 0) > 0 && (player?.winStreak ?? 0) > 0
        const findReplacement = (pool, selectedIds) =>
          pool.find(
            (candidate) =>
              candidate &&
              !selectedIds.has(candidate.id) &&
              !cooldownSet.has(candidate.id)
          )

        const selectedIds = new Set(candidatePlayers.map((player) => player.id))
        candidatePlayers = candidatePlayers.map((player) => {
          if (!cooldownSet.has(player.id)) return player

          selectedIds.delete(player.id)
          const zeroGameReplacement = findReplacement(
            zeroGamePlayers,
            selectedIds
          )
          if (zeroGameReplacement) {
            selectedIds.add(zeroGameReplacement.id)
            return zeroGameReplacement
          }
          const preferredPool = isWinnerQueuePlayer(player)
            ? losersQueue
            : winnersQueue
          const fallbackPool = isWinnerQueuePlayer(player)
            ? winnersQueue
            : losersQueue
          const replacement =
            findReplacement(preferredPool, selectedIds) ??
            findReplacement(fallbackPool, selectedIds)

          if (replacement) {
            selectedIds.add(replacement.id)
            return replacement
          }

          selectedIds.add(player.id)
          return player
        })
      }

      let selectedPlayers = enforceExclusivePlayers(
        candidatePlayers,
        ADMIN_STANDBY_IDS
      )

      if (selectedPlayers.length < 4) {
        const selectedIds = new Set(selectedPlayers.map((p) => p.id))
        const fallback = fairnessPool
          .filter((player) => !selectedIds.has(player.id))
          .sort(sortByZeroThenOrder)
        while (selectedPlayers.length < 4 && fallback.length > 0) {
          const next = fallback.shift()
          if (!next || selectedIds.has(next.id)) continue
          if (
            ADMIN_STANDBY_IDS.has(next.id) &&
            selectedPlayers.some((p) => ADMIN_STANDBY_IDS.has(p.id))
          ) {
            continue
          }
          selectedIds.add(next.id)
          selectedPlayers.push(next)
        }
        if (selectedPlayers.length < 4) {
          const overflowFallback = selectionPool
            .filter((player) => !selectedIds.has(player.id))
            .sort(sortByZeroThenOrder)
          while (selectedPlayers.length < 4 && overflowFallback.length > 0) {
            const next = overflowFallback.shift()
            if (!next || selectedIds.has(next.id)) continue
            if (
              ADMIN_STANDBY_IDS.has(next.id) &&
              selectedPlayers.some((p) => ADMIN_STANDBY_IDS.has(p.id))
            ) {
              continue
            }
            selectedIds.add(next.id)
            selectedPlayers.push(next)
          }
        }
      }

      if (selectedPlayers.length < 4) {
        failGenerate('could not build a valid 4-player matchup')
        return
      }

      const recentPartners = getRecentPartnerHistory(
        matchHistory,
        players,
        PARTNER_MEMORY_ROUNDS * Math.max(numberOfCourts, 1)
      )
      const teams = winnerLoserQueueEngine.buildCourtTeams(
        selectedPlayers,
        recentPartners
      )

      setCourtMatchups((prev) =>
        (Array.isArray(prev) ? prev : []).map((existing, index) =>
          index === courtIndex ? teams : existing
        )
      )
      setCourtStatus((prev) =>
        (Array.isArray(prev) ? prev : []).map((status, index) =>
          index === courtIndex ? 'idle' : status
        )
      )
      setRefreshCounts((prev) =>
        (Array.isArray(prev) ? prev : []).map((count, index) =>
          index === courtIndex ? (count ?? 0) + 1 : count
        )
      )
      return
    }

    const targetSize = Math.max(0, 4 - holdPlayers.length)
    const minGames = eligiblePlayers.reduce((min, player) => {
      const games = player.gamesPlayed ?? 0
      return games < min ? games : min
    }, Number.POSITIVE_INFINITY)

    const sortByGames = (a, b) => {
      const gamesA = a.gamesPlayed ?? 0
      const gamesB = b.gamesPlayed ?? 0
      if (gamesA !== gamesB) return gamesA - gamesB
      return a.name.localeCompare(b.name)
    }

    const buildRotationPool = (count) => {
      const remaining = [...eligiblePlayers].sort(sortByGames)
      const pool = []

      while (pool.length < count && remaining.length > 0) {
        const nextGames = remaining[0].gamesPlayed ?? 0
        const group = remaining.filter(
          (player) => (player.gamesPlayed ?? 0) === nextGames
        )
        remaining.splice(0, group.length)
        pool.push(...group)
      }

      return pool.slice(0, count)
    }

    const zeroGamePlayers = eligiblePlayers.filter(
      (player) => (player.gamesPlayed ?? 0) === minGames
    )
    const initialPool =
      targetSize > 0 && zeroGamePlayers.length >= targetSize
        ? [...zeroGamePlayers].sort(sortByGames).slice(0, targetSize)
        : buildRotationPool(targetSize)
    const poolWithStandby = enforceExclusivePlayers(
      initialPool,
      ADMIN_STANDBY_IDS
    )
    const selectedIds = new Set(poolWithStandby.map((player) => player.id))
    const fallbackPool = eligiblePlayers
      .filter((player) => !selectedIds.has(player.id))
      .sort(sortByGames)
    const rotationPool = [...poolWithStandby]

    while (rotationPool.length < targetSize && fallbackPool.length > 0) {
      const nextPlayer = fallbackPool.shift()
      if (
        ADMIN_STANDBY_IDS.has(nextPlayer.id) &&
        rotationPool.some((player) => ADMIN_STANDBY_IDS.has(player.id))
      ) {
        continue
      }
      rotationPool.push(nextPlayer)
    }

    const isSplitStayRandom = gameType === 'claim' && playerFormat === 'random'
    let selectedPlayers = [...holdPlayers, ...rotationPool].slice(0, 4)
    if (isSplitStayRandom) {
      const uniqueSelected = []
      const selectedSet = new Set()
      selectedPlayers.forEach((player) => {
        if (selectedSet.has(player.id)) return
        selectedSet.add(player.id)
        uniqueSelected.push(player)
      })
      if (holdPlayers.length === 2) {
        const holdSet = new Set(holdPlayers.map((player) => player.id))
        const partnerCandidates = uniqueSelected.filter(
          (player) => !holdSet.has(player.id)
        )
        if (partnerCandidates.length < 2) {
          const benchWinner = holdPlayers[1]
          const keepWinner = holdPlayers[0]
          selectedSet.delete(benchWinner.id)
          const filtered = uniqueSelected.filter(
            (player) => player.id !== benchWinner.id
          )
          uniqueSelected.length = 0
          uniqueSelected.push(keepWinner, ...filtered.filter((player) => player.id !== keepWinner.id))
          if (!selectedSet.has(benchWinner.id)) {
            fallbackPool.unshift(benchWinner)
          }
        }
      }
      while (uniqueSelected.length < 4 && fallbackPool.length > 0) {
        const nextPlayer = fallbackPool.shift()
        if (selectedSet.has(nextPlayer.id)) continue
        selectedSet.add(nextPlayer.id)
        uniqueSelected.push(nextPlayer)
      }
      selectedPlayers = uniqueSelected
    }
    const existingTeams =
      (Array.isArray(courtMatchups[courtIndex]) &&
      courtMatchups[courtIndex].length > 0
        ? courtMatchups[courtIndex]
        : (lastCourtTeams[courtIndex] ?? [])
            .map((team) =>
              (team ?? [])
                .map((playerId) =>
                  players.find((player) => player.id === playerId)
                )
                .filter(Boolean)
            )) ?? []
    let round = isSplitStayRandom
      ? (() => {
          const lastPartners = new Map()
          existingTeams.forEach((team) => {
            if (!Array.isArray(team) || team.length < 2) return
            lastPartners.set(team[0].id, team[1].id)
            lastPartners.set(team[1].id, team[0].id)
          })
          if (holdPlayers.length === 2 && selectedPlayers.length >= 4) {
            const holdSet = new Set(holdPlayers.map((player) => player.id))
            const partners = selectedPlayers.filter(
              (player) => !holdSet.has(player.id)
            )
            if (partners.length >= 2) {
              return {
                teams: [
                  [holdPlayers[0], partners[0]],
                  [holdPlayers[1], partners[1]],
                ],
              }
            }
          }
          return { teams: buildCourtTeams(selectedPlayers, lastPartners) }
        })()
      : (() => {
          const partnerHistory = new Set()
          existingTeams.forEach((team) => {
            if (!Array.isArray(team) || team.length < 2) return
            partnerHistory.add(`${team[0].id}:${team[1].id}`)
            partnerHistory.add(`${team[1].id}:${team[0].id}`)
          })
          return { teams: buildCourtTeams(selectedPlayers, partnerHistory) }
        })()

    if (isSplitStayRandom) {
      const candidatePlayers = [...holdPlayers, ...rotationPool, ...fallbackPool]
      const uniqueCandidates = []
      const seenIds = new Set()
      candidatePlayers.forEach((player) => {
        if (!player || seenIds.has(player.id)) return
        seenIds.add(player.id)
        uniqueCandidates.push(player)
      })
      const getGender = (player) => (player?.gender || '').toUpperCase()
      const getGenderPenalty = (team) => {
        if (!Array.isArray(team) || team.length < 2) return 1
        const genderA = getGender(team[0])
        const genderB = getGender(team[1])
        if (!genderA || !genderB) return 0
        return genderA === genderB ? 1 : 0
      }
      if (uniqueCandidates.length >= 4) {
        const pool = uniqueCandidates.slice(0, 4)
        const uniqueHold = []
        const holdIds = new Set()
        holdPlayers.forEach((player) => {
          if (!player || holdIds.has(player.id)) return
          holdIds.add(player.id)
          uniqueHold.push(player)
        })
        const recentPartnerKeys = getRecentPartnerHistory(
          matchHistory,
          players,
          PARTNER_MEMORY_ROUNDS * Math.max(numberOfCourts, 1)
        )
        existingTeams.forEach((team) => {
          if (!Array.isArray(team) || team.length < 2) return
          const partnerKey = buildPartnerKey(team[0]?.id, team[1]?.id)
          if (partnerKey) recentPartnerKeys.add(partnerKey)
        })
        const candidatePairings = []
        const addPairing = (teamA, teamB) => {
          if (!teamA || !teamB) return
          if (teamA.length < 2 || teamB.length < 2) return
          const isDuplicateWithinTeam =
            teamA[0].id === teamA[1].id || teamB[0].id === teamB[1].id
          const usedIds = new Set([...teamA, ...teamB].map((player) => player.id))
          if (isDuplicateWithinTeam || usedIds.size < 4) return
          const teamAKey = buildPartnerKey(teamA[0].id, teamA[1].id)
          const teamBKey = buildPartnerKey(teamB[0].id, teamB[1].id)
          const repeatCount =
            (recentPartnerKeys.has(teamAKey) ? 1 : 0) +
            (recentPartnerKeys.has(teamBKey) ? 1 : 0)
          const genderPenalty = getGenderPenalty(teamA) + getGenderPenalty(teamB)
          candidatePairings.push({
            teams: [teamA, teamB],
            repeatCount,
            genderPenalty,
          })
        }

        if (uniqueHold.length >= 2) {
          const others = pool.filter((player) => !holdIds.has(player.id))
          if (others.length >= 2) {
            addPairing(
              [uniqueHold[0], others[0]],
              [uniqueHold[1], others[1]]
            )
            addPairing(
              [uniqueHold[0], others[1]],
              [uniqueHold[1], others[0]]
            )
          }
        } else if (uniqueHold.length === 1) {
          const others = pool.filter((player) => !holdIds.has(player.id))
          if (others.length >= 3) {
            addPairing(
              [uniqueHold[0], others[0]],
              [others[1], others[2]]
            )
            addPairing(
              [uniqueHold[0], others[1]],
              [others[0], others[2]]
            )
            addPairing(
              [uniqueHold[0], others[2]],
              [others[0], others[1]]
            )
          }
        } else {
          addPairing([pool[0], pool[1]], [pool[2], pool[3]])
          addPairing([pool[0], pool[2]], [pool[1], pool[3]])
          addPairing([pool[0], pool[3]], [pool[1], pool[2]])
        }
        if (candidatePairings.length > 0) {
          const minRepeatCount = candidatePairings.reduce(
            (min, pairing) => Math.min(min, pairing.repeatCount),
            Number.POSITIVE_INFINITY
          )
          const antiRepeatCandidates = candidatePairings.filter(
            (pairing) => pairing.repeatCount === minRepeatCount
          )
          const minGenderPenalty = antiRepeatCandidates.reduce(
            (min, pairing) => Math.min(min, pairing.genderPenalty),
            Number.POSITIVE_INFINITY
          )
          const balancedCandidates = antiRepeatCandidates.filter(
            (pairing) => pairing.genderPenalty === minGenderPenalty
          )
          const selectedPairing =
            shuffleList(balancedCandidates)[0] ?? shuffleList(candidatePairings)[0]
          round = { teams: selectedPairing.teams }
          if (minRepeatCount > 0) {
            setToastMessage(
              `No fully fresh partners in last ${PARTNER_MEMORY_ROUNDS} rounds. Using least-repeat fallback.`
            )
          }
        }
      }
    }

    setCourtMatchups((prev) =>
      (Array.isArray(prev) ? prev : []).map((existing, index) =>
        index === courtIndex ? round.teams : existing
      )
    )
    setCourtStatus((prev) =>
      (Array.isArray(prev) ? prev : []).map((status, index) =>
        index === courtIndex ? 'idle' : status
      )
    )
    setRefreshCounts((prev) =>
      (Array.isArray(prev) ? prev : []).map((count, index) =>
        index === courtIndex ? (count ?? 0) + 1 : count
      )
    )
  }

  const openScoreModal = (courtIndex) => {
    const teams = courtMatchups[courtIndex]
    if (!teams || teams.length < 2) return

    setScoreModal({
      isOpen: true,
      courtIndex,
      teamA: teams[0],
      teamB: teams[1],
      scoreA: '',
      scoreB: '',
      enteredBy: '',
    })
    setScoreErrors({
      scoreA: '',
      scoreB: '',
      verifiedBy: '',
    })
  }

  const closeScoreModal = () => {
    setScoreModal({
      isOpen: false,
      courtIndex: null,
      teamA: [],
      teamB: [],
      scoreA: '',
      scoreB: '',
      enteredBy: '',
    })
    setScoreErrors({
      scoreA: '',
      scoreB: '',
      verifiedBy: '',
    })
  }

  const openManualMatchModal = () => {
    setExportMenuOpen(null)
    setManualMatchModal({
      isOpen: true,
      court: 'Court 1',
      teamAIds: ['', ''],
      teamBIds: ['', ''],
      scoreA: '',
      scoreB: '',
      verifiedBy: '',
    })
    setManualMatchErrors({
      court: '',
      teamA: '',
      teamB: '',
      scoreA: '',
      scoreB: '',
      duplicate: '',
    })
  }

  const closeManualMatchModal = () => {
    setManualMatchModal({
      isOpen: false,
      court: '',
      teamAIds: ['', ''],
      teamBIds: ['', ''],
      scoreA: '',
      scoreB: '',
      verifiedBy: '',
    })
    setManualMatchErrors({
      court: '',
      teamA: '',
      teamB: '',
      scoreA: '',
      scoreB: '',
      duplicate: '',
    })
  }

  const openClearHistoryModal = () => {
    setClearHistoryModal({ isOpen: true, password: '', error: '' })
  }

  const closeClearHistoryModal = () => {
    setClearHistoryModal({ isOpen: false, password: '', error: '' })
  }

  const confirmClearHistory = (event) => {
    event.preventDefault()
    if (clearHistoryModal.password !== '123456') {
      setClearHistoryModal((prev) => ({
        ...prev,
        error: 'Incorrect password',
      }))
      return
    }
    setMatchHistory([])
    setPlayers((prev) =>
      prev.map((player) => ({
        ...player,
        wins: 0,
        losses: 0,
        winStreak: 0,
        gamesPlayed: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDifferential: 0,
        queueOrder: 0,
      }))
    )
    setCourtMatchups(Array(numberOfCourts).fill(null))
    setCourtStatus(Array(numberOfCourts).fill('waiting'))
    setCourtHolds(Array.from({ length: numberOfCourts }, () => []))
    setRefreshCounts(Array(numberOfCourts).fill(0))
    setOpenRotationCooldownIds([])
    setLastCourtTeams(Array(numberOfCourts).fill(null))
    setLastGeneratedTeams([])
    setExportMenuOpen(null)
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEYS.matchHistory)
      window.localStorage.removeItem(STORAGE_KEYS.courtMatchups)
      window.localStorage.removeItem(STORAGE_KEYS.lastCourtTeams)
    }
    setToastMessage('Match history cleared')
    closeClearHistoryModal()
  }

  const handleManualMatchSubmit = (event) => {
    event.preventDefault()
    const scoreA = Number.parseInt(manualMatchModal.scoreA, 10)
    const scoreB = Number.parseInt(manualMatchModal.scoreB, 10)
    const teamAIds = manualMatchModal.teamAIds.filter(Boolean)
    const teamBIds = manualMatchModal.teamBIds.filter(Boolean)
    const allIds = [...teamAIds, ...teamBIds]
    const hasDuplicates = new Set(allIds).size !== allIds.length
    const nextErrors = {
      court: manualMatchModal.court.trim() ? '' : 'Court is required',
      teamA: teamAIds.length === 2 ? '' : 'Select two players',
      teamB: teamBIds.length === 2 ? '' : 'Select two players',
      scoreA: Number.isNaN(scoreA) ? 'Score is required' : '',
      scoreB: Number.isNaN(scoreB) ? 'Score is required' : '',
      duplicate: hasDuplicates ? 'Players can only appear once' : '',
    }

    setManualMatchErrors(nextErrors)

    if (
      nextErrors.court ||
      nextErrors.teamA ||
      nextErrors.teamB ||
      nextErrors.scoreA ||
      nextErrors.scoreB ||
      nextErrors.duplicate
    ) {
      return
    }

    const teamAPlayers = teamAIds
      .map((id) => players.find((player) => player.id === id))
      .filter(Boolean)
    const teamBPlayers = teamBIds
      .map((id) => players.find((player) => player.id === id))
      .filter(Boolean)
    const winnerIds = new Set(
      (scoreA > scoreB ? teamAPlayers : teamBPlayers).map((player) => player.id)
    )

    setPlayers((prev) =>
      prev.map((player) => {
        const isTeamA = teamAIds.includes(player.id)
        const isTeamB = teamBIds.includes(player.id)
        if (!isTeamA && !isTeamB) return player

        const pointsFor = player.pointsFor ?? 0
        const pointsAgainst = player.pointsAgainst ?? 0
        const gamesPlayed = player.gamesPlayed ?? 0
        const isWinner = winnerIds.has(player.id)
        const nextWinStreak = isWinner ? (player.winStreak ?? 0) + 1 : 0
        const nextPointsFor = pointsFor + (isTeamA ? scoreA : scoreB)
        const nextPointsAgainst = pointsAgainst + (isTeamA ? scoreB : scoreA)
        const nextPointDifferential = nextPointsFor - nextPointsAgainst

        return {
          ...player,
          wins: isWinner ? player.wins + 1 : player.wins,
          losses: !isWinner ? player.losses + 1 : player.losses,
          winStreak: nextWinStreak,
          gamesPlayed: gamesPlayed + 1,
          pointsFor: nextPointsFor,
          pointsAgainst: nextPointsAgainst,
          pointDifferential: nextPointDifferential,
        }
      })
    )

    setMatchHistory((prev) => [
      {
        id: crypto.randomUUID(),
        court: manualMatchModal.court.trim(),
        teamA: teamAPlayers.map((player) => player.name).join(' / '),
        teamB: teamBPlayers.map((player) => player.name).join(' / '),
        score: `${scoreA} - ${scoreB}`,
        enteredBy: manualMatchModal.verifiedBy.trim(),
        signature: '',
      },
      ...prev,
    ])
    if (gameType === 'open-rotation') {
      const cooldownSize = Math.max(
        PLAYERS_PER_COURT,
        visibleCourtCount * PLAYERS_PER_COURT
      )
      setOpenRotationCooldownIds((prev) =>
        buildOpenRotationCooldown(prev, [...teamAIds, ...teamBIds], cooldownSize)
      )
    }
    setToastMessage('Match added to history')
    closeManualMatchModal()
  }

  const openEditCourtModal = (courtIndex) => {
    const currentMatchup = courtMatchups[courtIndex]
    const teamAIds = currentMatchup?.[0]?.map((player) => player.id) ?? []
    const teamBIds = currentMatchup?.[1]?.map((player) => player.id) ?? []
    const normalizeIds = (ids) => [ids[0] ?? '', ids[1] ?? '']

    setEditCourtModal({
      isOpen: true,
      courtIndex,
      teamAIds: normalizeIds(teamAIds),
      teamBIds: normalizeIds(teamBIds),
    })
    setEditCourtErrors({
      teamA: '',
      teamB: '',
      duplicate: '',
    })
  }

  const closeEditCourtModal = () => {
    setEditCourtModal({
      isOpen: false,
      courtIndex: null,
      teamAIds: ['', ''],
      teamBIds: ['', ''],
    })
    setEditCourtErrors({
      teamA: '',
      teamB: '',
      duplicate: '',
    })
  }

  const handleEditCourtSubmit = (event) => {
    event.preventDefault()
    const teamAIds = editCourtModal.teamAIds.filter(Boolean)
    const teamBIds = editCourtModal.teamBIds.filter(Boolean)
    const allIds = [...teamAIds, ...teamBIds]
    const hasDuplicates = new Set(allIds).size !== allIds.length
    const nextErrors = {
      teamA: teamAIds.length === 2 ? '' : 'Select two players',
      teamB: teamBIds.length === 2 ? '' : 'Select two players',
      duplicate: hasDuplicates ? 'Players can only appear once' : '',
    }

    setEditCourtErrors(nextErrors)

    if (nextErrors.teamA || nextErrors.teamB || nextErrors.duplicate) {
      return
    }

    const teamAPlayers = teamAIds
      .map((id) => players.find((player) => player.id === id))
      .filter(Boolean)
    const teamBPlayers = teamBIds
      .map((id) => players.find((player) => player.id === id))
      .filter(Boolean)

    const { courtIndex } = editCourtModal
    setCourtMatchups((prev) =>
      (Array.isArray(prev) ? prev : []).map((teams, index) =>
        index === courtIndex ? [teamAPlayers, teamBPlayers] : teams
      )
    )
    setCourtStatus((prev) =>
      (Array.isArray(prev) ? prev : []).map((status, index) =>
        index === courtIndex ? 'idle' : status
      )
    )
    closeEditCourtModal()
  }

  const handleScoreSubmit = (event) => {
    event.preventDefault()
    const scoreA = Number.parseInt(scoreModal.scoreA, 10)
    const scoreB = Number.parseInt(scoreModal.scoreB, 10)
    const nextErrors = {
      scoreA: Number.isNaN(scoreA) ? 'Score is required' : '',
      scoreB: Number.isNaN(scoreB) ? 'Score is required' : '',
      verifiedBy: scoreModal.enteredBy ? '' : 'Select a verifier',
    }

    setScoreErrors(nextErrors)

    if (
      nextErrors.scoreA ||
      nextErrors.scoreB ||
      nextErrors.verifiedBy
    ) {
      return
    }

    const isTeamAWin = scoreA > scoreB
    const minGamesCheckedIn = players.reduce((min, player) => {
      if (!player.checkedIn) return min
      const games = player.gamesPlayed ?? 0
      return games < min ? games : min
    }, Number.POSITIVE_INFINITY)
    const maxGamesForHold = Number.isFinite(minGamesCheckedIn)
      ? minGamesCheckedIn + 1
      : Number.POSITIVE_INFINITY
    const isSplitStayRandom = gameType === 'claim' && playerFormat === 'random'
    const isOpenRotation = gameType === 'open-rotation'
    const winnerIds = new Set(
      (isTeamAWin ? scoreModal.teamA : scoreModal.teamB).map(
        (player) => player.id
      )
    )
    const nextHoldIds = []

    // For Open Rotation, rebuild queueOrder globally every score submission so
    // values stay coherent and never drift over a long session. Order:
    //   1) all non-match players sorted by current queueOrder (ascending)
    //   2) match winners (appended in submitted order)
    //   3) match losers (appended in submitted order)
    // Then we reassign sequential 1..N. This preserves the existing
    // "winners/losers go to the back" semantics while eliminating stale values.
    let openRotationOrderMap = null
    if (isOpenRotation) {
      const matchPlayerIds = new Set([
        ...scoreModal.teamA.map((player) => player.id),
        ...scoreModal.teamB.map((player) => player.id),
      ])
      const nonMatchPlayers = players
        .filter((player) => !matchPlayerIds.has(player.id))
        .slice()
        .sort((a, b) => (a.queueOrder ?? 0) - (b.queueOrder ?? 0))
      const allMatchPlayers = [...scoreModal.teamA, ...scoreModal.teamB]
      const matchWinners = allMatchPlayers.filter((player) =>
        winnerIds.has(player.id)
      )
      const matchLosers = allMatchPlayers.filter(
        (player) => !winnerIds.has(player.id)
      )
      const rebuiltOrder = [...nonMatchPlayers, ...matchWinners, ...matchLosers]
      openRotationOrderMap = new Map()
      rebuiltOrder.forEach((player, index) => {
        openRotationOrderMap.set(player.id, index + 1)
      })
    }

    setPlayers((prev) =>
      prev.map((player) => {
        const isTeamA = scoreModal.teamA.some((member) => member.id === player.id)
        const isTeamB = scoreModal.teamB.some((member) => member.id === player.id)
        const queueOrderUpdate =
          isOpenRotation && openRotationOrderMap?.has(player.id)
            ? { queueOrder: openRotationOrderMap.get(player.id) }
            : {}

        if (!isTeamA && !isTeamB) {
          return { ...player, ...queueOrderUpdate }
        }

        const pointsFor = player.pointsFor ?? 0
        const pointsAgainst = player.pointsAgainst ?? 0
        const gamesPlayed = player.gamesPlayed ?? 0
        const isWinner = winnerIds.has(player.id)
        const nextWinStreak = isWinner ? (player.winStreak ?? 0) + 1 : 0
        const nextGames = gamesPlayed + 1
        const staysOnCourt = isOpenRotation
          ? false
          : isSplitStayRandom
            ? isWinner && nextWinStreak < 2
            : isWinner && nextWinStreak < 2 && nextGames <= maxGamesForHold
        // Open Rotation never stays on court but still preserves the streak
        // value so the engine can classify the player as a winner or loser
        // when picking from the Winners/Losers queues next round.
        const normalizedWinStreak = isOpenRotation
          ? nextWinStreak
          : staysOnCourt
            ? nextWinStreak
            : 0

        if (staysOnCourt) {
          nextHoldIds.push(player.id)
        }

        const nextPointsFor = pointsFor + (isTeamA ? scoreA : scoreB)
        const nextPointsAgainst = pointsAgainst + (isTeamA ? scoreB : scoreA)
        const nextPointDifferential = nextPointsFor - nextPointsAgainst

        return {
          ...player,
          wins: isWinner ? player.wins + 1 : player.wins,
          losses: !isWinner ? player.losses + 1 : player.losses,
          winStreak: normalizedWinStreak,
          gamesPlayed: nextGames,
          pointsFor: nextPointsFor,
          pointsAgainst: nextPointsAgainst,
          pointDifferential: nextPointDifferential,
          ...queueOrderUpdate,
        }
      })
    )
    const { courtIndex } = scoreModal
    const holdsToWrite =
      (gameType === 'round-robin' && playerFormat === 'custom') || isOpenRotation
        ? []
        : nextHoldIds
    setCourtHolds((prev) =>
      (Array.isArray(prev) ? prev : []).map((holds, index) =>
        index === courtIndex ? holdsToWrite : holds
      )
    )

    const teamAName = scoreModal.teamA.map((player) => player.name).join(' / ')
    const teamBName = scoreModal.teamB.map((player) => player.name).join(' / ')
    const courtLabel = getCourtLabel(courtIndex)
    const teamAKey = getTeamName(scoreModal.teamA)
    const teamBKey = getTeamName(scoreModal.teamB)
    setMatchHistory((prev) => [
      {
        id: crypto.randomUUID(),
        court: courtLabel,
        teamA: teamAName,
        teamB: teamBName,
        teamAName: teamAKey,
        teamBName: teamBKey,
        score: `${scoreA} - ${scoreB}`,
        enteredBy: scoreModal.enteredBy.trim(),
      },
      ...prev,
    ])

    setLastCourtTeams((prev) =>
      (Array.isArray(prev) ? prev : []).map((teams, index) =>
        index === courtIndex
          ? [
              scoreModal.teamA.map((player) => player.id),
              scoreModal.teamB.map((player) => player.id),
            ]
          : teams
      )
    )
    if (isOpenRotation) {
      const cooldownSize = Math.max(
        PLAYERS_PER_COURT,
        visibleCourtCount * PLAYERS_PER_COURT
      )
      const recentMatchPlayerIds = [
        ...scoreModal.teamA.map((player) => player.id),
        ...scoreModal.teamB.map((player) => player.id),
      ]
      setOpenRotationCooldownIds((prev) =>
        buildOpenRotationCooldown(prev, recentMatchPlayerIds, cooldownSize)
      )
    }

    setCourtMatchups((prev) =>
      (Array.isArray(prev) ? prev : []).map((teams, index) =>
        index === courtIndex ? null : teams
      )
    )
    setCourtStatus((prev) =>
      (Array.isArray(prev) ? prev : []).map((status, index) =>
        index === courtIndex ? 'waiting' : status
      )
    )
    setRefreshCounts((prev) =>
      (Array.isArray(prev) ? prev : []).map((count, index) =>
        index === courtIndex ? 0 : count
      )
    )

    setToastMessage('Score saved successfully')
    closeScoreModal()
  }

  const confirmRefresh = (event) => {
    event.preventDefault()
    if (refreshModal.password !== '123456') {
      setRefreshModal((prev) => ({
        ...prev,
        error: 'Incorrect password',
      }))
      return
    }
    const courtIndex = refreshModal.courtIndex
    closeRefreshModal()
    handleGenerateCourts(courtIndex, { force: true })
  }

  const normalizePlayerType = (value) => {
    const normalized = String(value || '').trim().toLowerCase()
    if (
      normalized === 'self rating' ||
      normalized === 'self-rated' ||
      normalized === 'self'
    ) {
      return 'Self Rating'
    }
    return 'DUPR'
  }

  const normalizeGender = (value) => {
    const normalized = String(value || '').trim().toLowerCase()
    if (normalized === 'm' || normalized === 'male') return 'M'
    if (normalized === 'f' || normalized === 'female') return 'F'
    return ''
  }

  const handleImportPlayers = async (file) => {
    if (!file) return

    const text = await file.text()
    const rows = parseCsv(text)
    if (rows.length < 2) {
      setToastMessage('No player rows found in that file')
      return
    }

    const headers = rows[0].map((header) => header.trim().toLowerCase())
    const findHeaderIndex = (candidates) =>
      headers.findIndex((header) => candidates.includes(header))
    const nameIndex = findHeaderIndex(['player', 'player name', 'name'])
    const teamIndex = findHeaderIndex(['team name', 'team'])
    const ratingIndex = findHeaderIndex(['rating'])
    const typeIndex = findHeaderIndex(['type'])
    const statusIndex = findHeaderIndex(['status'])
    const genderIndex = findHeaderIndex(['gender', 'sex'])

    if (nameIndex === -1) {
      setToastMessage('CSV must include a Player column')
      return
    }

    if (genderIndex === -1) {
      setToastMessage('CSV must include a Gender column (M/F)')
      return
    }

    const invalidGenderRows = []
    const imported = []
    rows.slice(1).forEach((row, rowOffset) => {
      const name = row[nameIndex]?.trim()
      if (!name) return

      const teamName = teamIndex !== -1 ? row[teamIndex]?.trim() : ''
      const rating = ratingIndex !== -1 ? row[ratingIndex]?.trim() : ''
      const typeValue = typeIndex !== -1 ? row[typeIndex]?.trim() : ''
      const genderValue = row[genderIndex]?.trim() ?? ''
      const statusValue =
        statusIndex !== -1 ? row[statusIndex]?.trim().toLowerCase() : ''
      const type = normalizePlayerType(typeValue)
      const gender = normalizeGender(genderValue)
      const checkedIn =
        statusValue.includes('checked in') || statusValue === 'in'

      if (!gender) {
        // rowOffset is 0-indexed within the data rows; +2 accounts for the
        // header row and 1-based row numbering when we surface the error.
        invalidGenderRows.push({ rowNumber: rowOffset + 2, name })
        return
      }

      imported.push({
        id: crypto.randomUUID(),
        name,
        teamName: playerFormat === 'custom' ? teamName : '',
        gender,
        rating,
        duprRating: type === 'DUPR' ? rating : '',
        clubRating: type === 'Self Rating' ? rating : '',
        type,
        checkedIn,
        wins: 0,
        losses: 0,
        winStreak: 0,
        gamesPlayed: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDifferential: 0,
      })
    })

    if (invalidGenderRows.length > 0) {
      const preview = invalidGenderRows
        .slice(0, 3)
        .map(({ rowNumber, name }) => `row ${rowNumber} (${name})`)
        .join(', ')
      const more =
        invalidGenderRows.length > 3
          ? ` and ${invalidGenderRows.length - 3} more`
          : ''
      setToastMessage(
        `Import cancelled — ${invalidGenderRows.length} player${
          invalidGenderRows.length === 1 ? '' : 's'
        } missing or invalid gender (M/F): ${preview}${more}`
      )
      return
    }

    if (imported.length === 0) {
      setToastMessage('No valid players found in that file')
      return
    }

    setPlayers(imported)
    setToastMessage(`Imported ${imported.length} players`)
  }

  const exportStandingsCsv = () => {
    const rows = [
      ['Rank', 'Player', 'Wins', 'Losses', 'PD', 'Games'],
      ...[...players]
        .sort((a, b) => {
          if (b.wins !== a.wins) return b.wins - a.wins
          if (b.pointDifferential !== a.pointDifferential) {
            return b.pointDifferential - a.pointDifferential
          }
          return 0
        })
        .map((player, index) => [
          index + 1,
          player.name,
          player.wins,
          player.losses,
          player.pointDifferential,
          player.gamesPlayed,
        ]),
    ]
    downloadCsv('standings.csv', rows)
  }

  const exportPlayersCsv = () => {
    const rows = [
      [
        'Player',
        'Gender',
        ...(showTeamName ? ['Team Name'] : []),
        'Rating',
        'Type',
        'Status',
      ],
      ...players.map((player) => [
        player.name,
        player.gender || '',
        ...(showTeamName ? [player.teamName || ''] : []),
        player.rating,
        player.type,
        player.checkedIn ? 'Checked In' : 'Checked Out',
      ]),
    ]
    downloadCsv('players.csv', rows)
  }

  const exportHistoryCsv = () => {
    const rows = [
      ['Court', 'Team A', 'Team B', 'Score', 'Verified By'],
      ...matchHistory.map((match) => [
        match.court,
        match.teamA,
        match.teamB,
        match.score,
        match.enteredBy || '',
      ]),
    ]
    downloadCsv('match-history.csv', rows)
  }

  const exportTableAsPdf = (title, tableRef, filename) => {
    if (!tableRef.current) return
    const tableHtml = tableRef.current.outerHTML
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
            h1 { font-size: 18px; margin: 0 0 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
            th { background: #f8fafc; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; }
            td.text-center, th.text-center { text-align: center; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          ${tableHtml}
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
    if (filename) {
      try {
        printWindow.document.title = filename
      } catch {
        // noop: some browsers block title changes after print
      }
    }
  }

  const exportStandingsPdf = () => {
    exportTableAsPdf('Standings', standingsTableRef, 'standings.pdf')
  }

  const buildSortedStandings = () =>
    [...players].sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins
      if (b.pointDifferential !== a.pointDifferential) {
        return b.pointDifferential - a.pointDifferential
      }
      return 0
    })

  const openStandingsShareModal = () => {
    if (players.length === 0) {
      setToastMessage('No standings to share yet')
      return
    }
    setShareModalOpen(true)
  }

  const handleShareImageUpload = (event, setImageSrc, setImageName) => {
    const [file] = event.target.files || []
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageSrc(reader.result)
        setImageName(file.name)
      }
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const saveStandingsImage = async (format, node) => {
    if (!node) {
      setToastMessage('Unable to capture standings card')
      return
    }

    const normalizedFormat = format === 'jpg' ? 'jpg' : 'png'
    const baseFileName =
      shareEventName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'standings'

    let exportRoot = null
    try {
      const rect = node.getBoundingClientRect()
      const exportWidth = Math.ceil(rect.width)
      const exportHeight = Math.ceil(rect.height)

      exportRoot = document.createElement('div')
      exportRoot.style.position = 'fixed'
      exportRoot.style.left = '-10000px'
      exportRoot.style.top = '0'
      exportRoot.style.margin = '0'
      exportRoot.style.padding = '0'
      exportRoot.style.zIndex = '-1'
      exportRoot.style.width = `${exportWidth}px`
      exportRoot.style.height = `${exportHeight}px`
      exportRoot.style.overflow = 'hidden'
      exportRoot.style.display = 'block'

      const exportNode = node.cloneNode(true)
      exportNode.style.margin = '0'
      exportNode.style.transform = 'none'
      exportNode.style.width = `${exportWidth}px`
      exportNode.style.maxWidth = `${exportWidth}px`

      exportRoot.appendChild(exportNode)
      document.body.appendChild(exportRoot)

      if (document.fonts?.ready) {
        await document.fonts.ready
      }

      const options = {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#F4F5F0',
        width: exportWidth,
        height: exportHeight,
      }
      const dataUrl =
        normalizedFormat === 'jpg'
          ? await toJpeg(exportNode, { ...options, quality: 0.95 })
          : await toPng(exportNode, options)

      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `${baseFileName}.${normalizedFormat}`
      link.click()
      setToastMessage(`Standings saved as ${normalizedFormat.toUpperCase()}`)
    } catch {
      setToastMessage('Could not save image. Try another photo or browser.')
    } finally {
      if (exportRoot?.parentNode) {
        exportRoot.parentNode.removeChild(exportRoot)
      }
    }
  }

  const exportPlayersPdf = () => {
    exportTableAsPdf('Players', playersTableRef, 'players.pdf')
  }

  const exportHistoryPdf = () => {
    exportTableAsPdf('Match History', historyTableRef, 'match-history.pdf')
  }

  const isSplitStayRandom = gameType === 'claim' && playerFormat === 'random'
  const isRoundRobinCustomTeams =
    gameType === 'round-robin' && playerFormat === 'custom'
  const shareStandingsRows = isRoundRobinCustomTeams
    ? buildSortedTeamStandings(players)
    : isSplitStayRandom
      ? buildSortedStandings().slice(0, 10)
      : buildSortedStandings()
  const sortedPlayers = [...players].sort((a, b) =>
    a.name.localeCompare(b.name)
  )
  const selectedManualIds = new Set(
    [...manualMatchModal.teamAIds, ...manualMatchModal.teamBIds].filter(Boolean)
  )
  const getAvailablePlayers = (currentId) =>
    sortedPlayers.filter(
      (player) => player.id === currentId || !selectedManualIds.has(player.id)
    )
  const checkedInPlayers = sortedPlayers.filter((player) => player.checkedIn)
  const selectedCourtIds = new Set(
    [...editCourtModal.teamAIds, ...editCourtModal.teamBIds].filter(Boolean)
  )
  const getAvailableCourtPlayers = (currentId) =>
    checkedInPlayers.filter(
      (player) => player.id === currentId || !selectedCourtIds.has(player.id)
    )
  const editCourtLabel =
    typeof editCourtModal.courtIndex === 'number'
      ? getCourtLabel(editCourtModal.courtIndex)
      : 'Court'

  return (
    <>
      <AppLayout
        sidebar={
          <>
            <button
              type="button"
            onClick={() => setActiveView('home')}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm transition hover:bg-blue-700"
              aria-label="Home"
              title="Home"
            >
              <Home className="h-5 w-5" aria-hidden="true" />
            </button>
          <button
              type="button"
              onClick={() => setActiveView('courts')}
            disabled={!sessionStarted}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm transition ${
              sessionStarted
                ? 'hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-800'
                : 'cursor-not-allowed opacity-40'
            }`}
            aria-label="Courts"
            title="Courts"
            >
              <LayoutGrid className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setActiveView('players')}
            disabled={!sessionStarted}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition ${
              activeView === 'players' ? 'bg-slate-100 text-slate-900' : ''
            } ${
              sessionStarted
                ? 'hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900'
                : 'cursor-not-allowed opacity-40'
            }`}
            aria-label="Players"
            title="Players"
            >
              <Users className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setActiveView('history')}
            disabled={!sessionStarted}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition ${
              activeView === 'history' ? 'bg-slate-100 text-slate-900' : ''
            } ${
              sessionStarted
                ? 'hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900'
                : 'cursor-not-allowed opacity-40'
            }`}
            aria-label="Match history"
            title="Match history"
            >
              <ClipboardList className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setActiveView('standings')}
            disabled={!sessionStarted}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition ${
              activeView === 'standings' ? 'bg-slate-100 text-slate-900' : ''
            } ${
              sessionStarted
                ? 'hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900'
                : 'cursor-not-allowed opacity-40'
            }`}
            aria-label="Standings"
            title="Standings"
            >
              <Trophy className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={openInfoModal}
            disabled={!sessionStarted}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition ${
              sessionStarted
                ? 'hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900'
                : 'cursor-not-allowed opacity-40'
            }`}
              aria-label="Documentation"
              title="Documentation"
            >
              <Info className="h-5 w-5" aria-hidden="true" />
            </button>
          </>
        }
      >
        <h1 className="mb-6 text-xl font-semibold text-slate-900 sm:text-2xl">
          {activeView === 'home'
            ? 'Game Setup'
            : 'HAPPY PICKLERS MATCH GENERATOR'}
        </h1>
        {activeView === 'home' ? (
          <GameSetupView
            gameType={gameType}
            playerFormat={playerFormat}
            numberOfCourts={numberOfCourts}
            sessionStarted={sessionStarted}
            isStartingSession={isStartingSession}
            isEndingSession={isEndingSession}
            onSelectGameType={(nextGameType) => {
              setGameType(nextGameType)
              if (nextGameType === 'claim') {
                setPlayerFormat('random')
              }
              if (nextGameType === 'round-robin') {
                setPlayerFormat('custom')
              }
              if (nextGameType === 'open-rotation') {
                setPlayerFormat('random')
              }
            }}
            onSelectPlayerFormat={setPlayerFormat}
            onSelectNumberOfCourts={handleSelectNumberOfCourts}
            onStartSession={() => {
              if (isStartingSession) return
              setIsStartingSession(true)
              setToastMessage('Session started')
              window.setTimeout(() => {
                setSessionStarted(true)
                setActiveView('courts')
                setIsStartingSession(false)
              }, 1200)
            }}
            onEndSession={() => {
              if (isEndingSession) return
              openEndSessionModal()
            }}
          />
        ) : activeView === 'players' ? (
          <>
            <PlayersView
              players={players}
              playerFormat={playerFormat}
              gameType={gameType}
              onAdd={openAddModal}
              exportMenuOpen={exportMenuOpen}
              setExportMenuOpen={setExportMenuOpen}
              onExportCsv={exportPlayersCsv}
              onExportPdf={exportPlayersPdf}
              onImportPlayers={handleImportPlayers}
              playersTableRef={playersTableRef}
              onCheckIn={handleCheckIn}
              onCheckOut={handleCheckOut}
              onEdit={openEditModal}
              onDelete={handleDelete}
            />
          </>
        ) : activeView === 'standings' ? (
          <StandingsView
            players={players}
            playerFormat={playerFormat}
            standingsTableRef={standingsTableRef}
            exportMenuOpen={exportMenuOpen}
            setExportMenuOpen={setExportMenuOpen}
            onExportCsv={exportStandingsCsv}
            onExportPdf={exportStandingsPdf}
            onShare={openStandingsShareModal}
          />
        ) : activeView === 'history' ? (
          <HistoryView
            matchHistory={matchHistory}
            historyTableRef={historyTableRef}
            exportMenuOpen={exportMenuOpen}
            setExportMenuOpen={setExportMenuOpen}
            onExportCsv={exportHistoryCsv}
            onExportPdf={exportHistoryPdf}
            onAddMatch={openManualMatchModal}
            onClearHistory={openClearHistoryModal}
          />
        ) : (
          <div className="space-y-4">
            {gameType === 'round-robin' && playerFormat === 'custom' ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                Round robin remaining matchups:{' '}
                <span className="font-semibold text-slate-900">
                  {roundRobinRemainingPairs}
                </span>{' '}
                of {roundRobinTotalPairs}
              </div>
            ) : null}
            <CourtsView
              visibleCourtCount={visibleCourtCount}
              courtMatchups={courtMatchups}
              courtStatus={courtStatus}
              onGenerateCourts={handleGenerateCourts}
              onEditCourt={openEditCourtModal}
              onOpenScore={openScoreModal}
            />
          </div>
        )}
        {activeView === 'courts' && checkedInCount < 4 ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center px-4">
            <div className="absolute inset-0 rounded-2xl bg-slate-900/60" />
            <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-lg">
              <h2 className="text-lg font-semibold text-slate-900">
                Not enough players checked in
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                A game cannot start until at least 4 players have checked in.
              </p>
              <p className="mt-3 text-xs font-semibold uppercase text-slate-400">
                Currently checked in: {checkedInCount}
              </p>
            </div>
          </div>
        ) : null}
      </AppLayout>

      {isStartingSession ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/60 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-lg">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Starting Session
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-900">
              Preparing courts...
            </p>
          </div>
        </div>
      ) : null}
      {isEndingSession ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/60 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-lg">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Ending Session
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-900">
              Clearing session data...
            </p>
          </div>
        </div>
      ) : null}

      {isModalOpen ? (
        <div className="fixed inset-0 z-10 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={closeModal}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {modalMode === 'edit' ? 'Edit Player' : 'Add Player'}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full border border-slate-200 p-1.5 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form className="mt-4 space-y-4" onSubmit={handleSave}>
              {showTeamName ? (
                modalMode === 'add' ? (
                  availableTeams.length > 0 ? (
                    <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                      Team Name
                      <select
                        value={formValues.teamName}
                        onChange={(event) =>
                          setFormValues((prev) => ({
                            ...prev,
                            teamName: event.target.value,
                          }))
                        }
                        className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                      >
                        {availableTeams.map((animal) => (
                          <option key={animal} value={animal}>
                            {animal}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null
                ) : (
                  <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                    Team Name
                    <select
                      value={formValues.teamName}
                      onChange={(event) =>
                        setFormValues((prev) => ({
                          ...prev,
                          teamName: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                    >
                      {TEAM_ANIMALS.map((animal) => (
                        <option key={animal} value={animal}>
                          {animal}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              ) : null}
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Player Name
                <input
                  type="text"
                  placeholder="e.g. Jordan Smith"
                  value={formValues.name}
                  onChange={(event) =>
                    setFormValues((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                <span>
                  Gender <span className="text-red-500">*</span>
                </span>
                <select
                  required
                  aria-invalid={formErrors.gender ? 'true' : 'false'}
                  value={formValues.gender}
                  onChange={(event) => {
                    const nextGender = event.target.value
                    setFormValues((prev) => ({
                      ...prev,
                      gender: nextGender,
                    }))
                    if (nextGender) {
                      setFormErrors((prev) => ({ ...prev, gender: '' }))
                    }
                  }}
                  className={`rounded-xl border px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400 ${
                    formErrors.gender
                      ? 'border-red-400'
                      : 'border-slate-200'
                  }`}
                >
                  <option value="">Select gender</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
                {formErrors.gender ? (
                  <p className="text-xs text-red-500">{formErrors.gender}</p>
                ) : null}
              </label>

              {playerFormat === 'custom' ? null : (
                <>
                  <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                    Rating
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 3.75"
                      value={formValues.rating}
                      onChange={(event) =>
                        setFormValues((prev) => ({
                          ...prev,
                          rating: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                    />
                  </label>

                  <fieldset className="space-y-3">
                    <legend className="text-sm font-medium text-slate-700">
                      Rating Type
                    </legend>
                    <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                      <input
                        type="radio"
                        name="ratingType"
                        value="DUPR"
                        className="h-4 w-4 border-slate-300 text-slate-900"
                        checked={formValues.type === 'DUPR'}
                        onChange={(event) =>
                          setFormValues((prev) => ({
                            ...prev,
                            type: event.target.value,
                          }))
                        }
                      />
                      DUPR
                    </label>
                    <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                      <input
                        type="radio"
                        name="ratingType"
                        value="Self Rating"
                        className="h-4 w-4 border-slate-300 text-slate-900"
                        checked={formValues.type === 'Self Rating'}
                        onChange={(event) =>
                          setFormValues((prev) => ({
                            ...prev,
                            type: event.target.value,
                          }))
                        }
                      />
                      Self Rating
                    </label>
                  </fieldset>
                </>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 hover:shadow-md"
                >
                  {modalMode === 'edit' ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {roundRobinCompleteModalOpen ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-900/60"
            onClick={() => setRoundRobinCompleteModalOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-lg">
            <h2 className="text-lg font-semibold text-slate-900">
              Round Robin finished!
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              All teams have played each other.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setRoundRobinCompleteModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setRoundRobinCompleteModalOpen(false)
                  setActiveView('standings')
                }}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Go to the Standings
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editCourtModal.isOpen ? (
        <div className="fixed inset-0 z-10 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={closeEditCourtModal}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Edit Court
                </h2>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  {editCourtLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditCourtModal}
                className="rounded-full border border-slate-200 p-1.5 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close edit court modal"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form className="mt-4 space-y-4" onSubmit={handleEditCourtSubmit}>
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Team A</p>
                <div className="grid grid-cols-2 gap-3">
                  {[0, 1].map((slot) => (
                    <label
                      key={`edit-team-a-${slot}`}
                      className="flex flex-col gap-2 text-xs font-medium text-slate-600"
                    >
                      Player {slot + 1}
                      <select
                        value={editCourtModal.teamAIds[slot]}
                        onChange={(event) =>
                          setEditCourtModal((prev) => ({
                            ...prev,
                            teamAIds: prev.teamAIds.map((value, index) =>
                              index === slot ? event.target.value : value
                            ),
                          }))
                        }
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                      >
                        <option value="">Select player</option>
                        {getAvailableCourtPlayers(
                          editCourtModal.teamAIds[slot]
                        ).map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {editCourtErrors.teamA ? (
                  <p className="text-xs text-red-500">
                    {editCourtErrors.teamA}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Team B</p>
                <div className="grid grid-cols-2 gap-3">
                  {[0, 1].map((slot) => (
                    <label
                      key={`edit-team-b-${slot}`}
                      className="flex flex-col gap-2 text-xs font-medium text-slate-600"
                    >
                      Player {slot + 3}
                      <select
                        value={editCourtModal.teamBIds[slot]}
                        onChange={(event) =>
                          setEditCourtModal((prev) => ({
                            ...prev,
                            teamBIds: prev.teamBIds.map((value, index) =>
                              index === slot ? event.target.value : value
                            ),
                          }))
                        }
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                      >
                        <option value="">Select player</option>
                        {getAvailableCourtPlayers(
                          editCourtModal.teamBIds[slot]
                        ).map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {editCourtErrors.teamB ? (
                  <p className="text-xs text-red-500">
                    {editCourtErrors.teamB}
                  </p>
                ) : null}
                {editCourtErrors.duplicate ? (
                  <p className="text-xs text-red-500">
                    {editCourtErrors.duplicate}
                  </p>
                ) : null}
              </div>

              <p className="text-xs text-slate-500">
                Only checked-in players are available.
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEditCourtModal}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 hover:shadow-md"
                >
                  Update court
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {manualMatchModal.isOpen ? (
        <div className="fixed inset-0 z-10 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={closeManualMatchModal}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Manual Match Entry
              </h2>
              <button
                type="button"
                onClick={closeManualMatchModal}
                className="rounded-full border border-slate-200 p-1.5 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close manual match modal"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form className="mt-4 space-y-4" onSubmit={handleManualMatchSubmit}>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Court
                <input
                  type="text"
                  value={manualMatchModal.court}
                  onChange={(event) =>
                    setManualMatchModal((prev) => ({
                      ...prev,
                      court: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                  placeholder="Court 1"
                />
                {manualMatchErrors.court ? (
                  <p className="text-xs text-red-500">
                    {manualMatchErrors.court}
                  </p>
                ) : null}
              </label>

              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Team A</p>
                <div className="grid grid-cols-2 gap-3">
                  {[0, 1].map((slot) => (
                    <label
                      key={`team-a-${slot}`}
                      className="flex flex-col gap-2 text-xs font-medium text-slate-600"
                    >
                      Player {slot + 1}
                      <select
                        value={manualMatchModal.teamAIds[slot]}
                        onChange={(event) =>
                          setManualMatchModal((prev) => ({
                            ...prev,
                            teamAIds: prev.teamAIds.map((value, index) =>
                              index === slot ? event.target.value : value
                            ),
                          }))
                        }
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                      >
                        <option value="">Select player</option>
                        {getAvailablePlayers(
                          manualMatchModal.teamAIds[slot]
                        ).map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {manualMatchErrors.teamA ? (
                  <p className="text-xs text-red-500">
                    {manualMatchErrors.teamA}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Team B</p>
                <div className="grid grid-cols-2 gap-3">
                  {[0, 1].map((slot) => (
                    <label
                      key={`team-b-${slot}`}
                      className="flex flex-col gap-2 text-xs font-medium text-slate-600"
                    >
                      Player {slot + 3}
                      <select
                        value={manualMatchModal.teamBIds[slot]}
                        onChange={(event) =>
                          setManualMatchModal((prev) => ({
                            ...prev,
                            teamBIds: prev.teamBIds.map((value, index) =>
                              index === slot ? event.target.value : value
                            ),
                          }))
                        }
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                      >
                        <option value="">Select player</option>
                        {getAvailablePlayers(
                          manualMatchModal.teamBIds[slot]
                        ).map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {manualMatchErrors.teamB ? (
                  <p className="text-xs text-red-500">
                    {manualMatchErrors.teamB}
                  </p>
                ) : null}
                {manualMatchErrors.duplicate ? (
                  <p className="text-xs text-red-500">
                    {manualMatchErrors.duplicate}
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  Score A
                  <select
                    value={manualMatchModal.scoreA}
                    onChange={(event) =>
                      setManualMatchModal((prev) => ({
                        ...prev,
                        scoreA: event.target.value,
                      }))
                    }
                    className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                  >
                    <option value="">Select score</option>
                    {Array.from({ length: 16 }, (_, index) => index).map(
                      (score) => (
                        <option key={score} value={score}>
                          {score}
                        </option>
                      )
                    )}
                  </select>
                  {manualMatchErrors.scoreA ? (
                    <p className="text-xs text-red-500">
                      {manualMatchErrors.scoreA}
                    </p>
                  ) : null}
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  Score B
                  <select
                    value={manualMatchModal.scoreB}
                    onChange={(event) =>
                      setManualMatchModal((prev) => ({
                        ...prev,
                        scoreB: event.target.value,
                      }))
                    }
                    className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                  >
                    <option value="">Select score</option>
                    {Array.from({ length: 16 }, (_, index) => index).map(
                      (score) => (
                        <option key={score} value={score}>
                          {score}
                        </option>
                      )
                    )}
                  </select>
                  {manualMatchErrors.scoreB ? (
                    <p className="text-xs text-red-500">
                      {manualMatchErrors.scoreB}
                    </p>
                  ) : null}
                </label>
              </div>

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Verified by
                <input
                  type="text"
                  value={manualMatchModal.verifiedBy}
                  onChange={(event) =>
                    setManualMatchModal((prev) => ({
                      ...prev,
                      verifiedBy: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                  placeholder="Optional"
                />
              </label>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeManualMatchModal}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 hover:shadow-md"
                >
                  Add match
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {scoreModal.isOpen ? (
        <div className="fixed inset-0 z-10 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={closeScoreModal}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Enter Match Score
              </h2>
              <button
                type="button"
                onClick={closeScoreModal}
                className="rounded-full border border-slate-200 p-1.5 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close score modal"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form className="mt-4 space-y-4" onSubmit={handleScoreSubmit}>
              <div className="space-y-2 rounded-xl border border-slate-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Team A
                </p>
                <p className="text-sm font-medium text-slate-800">
                  {scoreModal.teamA.map((player) => player.name).join(' / ')}
                </p>
                <select
                  value={scoreModal.scoreA}
                  onChange={(event) =>
                    setScoreModal((prev) => ({
                      ...prev,
                      scoreA: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                >
                  <option value="">Select score</option>
                  {Array.from({ length: 16 }, (_, index) => index).map(
                    (score) => (
                      <option key={score} value={score}>
                        {score}
                      </option>
                    )
                  )}
                </select>
                {scoreErrors.scoreA ? (
                  <p className="text-xs text-red-500">{scoreErrors.scoreA}</p>
                ) : null}
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Team B
                </p>
                <p className="text-sm font-medium text-slate-800">
                  {scoreModal.teamB.map((player) => player.name).join(' / ')}
                </p>
                <select
                  value={scoreModal.scoreB}
                  onChange={(event) =>
                    setScoreModal((prev) => ({
                      ...prev,
                      scoreB: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                >
                  <option value="">Select score</option>
                  {Array.from({ length: 16 }, (_, index) => index).map(
                    (score) => (
                      <option key={score} value={score}>
                        {score}
                      </option>
                    )
                  )}
                </select>
                {scoreErrors.scoreB ? (
                  <p className="text-xs text-red-500">{scoreErrors.scoreB}</p>
                ) : null}
              </div>

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Verified by
                <select
                  value={scoreModal.enteredBy}
                  onChange={(event) =>
                    setScoreModal((prev) => ({
                      ...prev,
                      enteredBy: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                >
                  <option value="">Select player</option>
                  {[...scoreModal.teamA, ...scoreModal.teamB]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((player) => (
                      <option key={player.id} value={player.name}>
                        {player.name}
                      </option>
                    ))}
                  <option value="Admin - Monique">Admin - Monique</option>
                  <option value="Admin - John">Admin - John</option>
                </select>
                {scoreErrors.verifiedBy ? (
                  <p className="text-xs text-red-500">
                    {scoreErrors.verifiedBy}
                  </p>
                ) : null}
              </label>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeScoreModal}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 hover:shadow-md"
                >
                  Save Scores
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {infoModalOpen ? (
        <div className="fixed inset-0 z-10 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={closeInfoModal}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Documentation
              </h2>
              <button
                type="button"
                onClick={closeInfoModal}
                className="rounded-full border border-slate-200 p-1.5 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close documentation"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setInfoTab('match-engine-plain')}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                  infoTab === 'match-engine-plain'
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100'
                }`}
              >
                Match Engine (Plain)
              </button>
              <button
                type="button"
                onClick={() => setInfoTab('standings-plain')}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                  infoTab === 'standings-plain'
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100'
                }`}
              >
                Standings (Plain)
              </button>
            </div>

            <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <ReactMarkdown
                components={{
                  h1: ({ node, ...props }) => (
                    <h1
                      className="mb-2 text-base font-semibold text-slate-900"
                      {...props}
                    />
                  ),
                  h2: ({ node, ...props }) => (
                    <h2
                      className="mt-4 text-sm font-semibold uppercase tracking-wide text-slate-500"
                      {...props}
                    />
                  ),
                  h3: ({ node, ...props }) => (
                    <h3
                      className="mt-3 text-sm font-semibold text-slate-700"
                      {...props}
                    />
                  ),
                  p: ({ node, ...props }) => (
                    <p className="mt-2 leading-relaxed" {...props} />
                  ),
                  ul: ({ node, ...props }) => (
                    <ul className="mt-2 list-disc space-y-1 pl-5" {...props} />
                  ),
                  ol: ({ node, ...props }) => (
                    <ol
                      className="mt-2 list-decimal space-y-1 pl-5"
                      {...props}
                    />
                  ),
                  li: ({ node, ...props }) => (
                    <li className="leading-relaxed" {...props} />
                  ),
                  a: ({ node, ...props }) => (
                    <a className="text-emerald-600 underline" {...props} />
                  ),
                  code: ({ node, ...props }) => (
                    <code
                      className="rounded bg-white px-1 py-0.5 font-mono text-xs text-slate-800"
                      {...props}
                    />
                  ),
                  pre: ({ node, ...props }) => (
                    <pre
                      className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800"
                      {...props}
                    />
                  ),
                }}
              >
                {infoContent}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      ) : null}
      <ShareStandingsModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        onSaveImage={saveStandingsImage}
        standings={shareStandingsRows}
        nameColumnLabel={isRoundRobinCustomTeams ? 'Player Names' : 'Player Name'}
        eventName={shareEventName}
        onEventNameChange={(event) => setShareEventName(event.target.value)}
        eventDate={shareEventDate}
        onEventDateChange={(event) => setShareEventDate(event.target.value)}
        coverPhotoSrc={shareCoverPhotoSrc}
        primaryPhotoSrc={sharePrimaryPhotoSrc}
        coverPhotoName={shareCoverPhotoName}
        primaryPhotoName={sharePrimaryPhotoName}
        onCoverPhotoUpload={(event) =>
          handleShareImageUpload(
            event,
            setShareCoverPhotoSrc,
            setShareCoverPhotoName
          )
        }
        onPrimaryPhotoUpload={(event) =>
          handleShareImageUpload(
            event,
            setSharePrimaryPhotoSrc,
            setSharePrimaryPhotoName
          )
        }
      />
      <PasswordPrompt
        isOpen={resetModal.isOpen}
        title="Confirm Reset"
        confirmLabel="Reset"
        onClose={closeResetModal}
        onSubmit={confirmReset}
        password={resetModal.password}
        onPasswordChange={(event) =>
          setResetModal((prev) => ({
            ...prev,
            password: event.target.value,
            error: '',
          }))
        }
        error={resetModal.error}
        closeAriaLabel="Close reset modal"
      />
      <PasswordPrompt
        isOpen={endSessionModal.isOpen}
        title="End Session"
        confirmLabel="End session"
        isDanger
        onClose={closeEndSessionModal}
        onSubmit={confirmEndSession}
        password={endSessionModal.password}
        onPasswordChange={(event) =>
          setEndSessionModal((prev) => ({
            ...prev,
            password: event.target.value,
            error: '',
          }))
        }
        error={endSessionModal.error}
        closeAriaLabel="Close end session modal"
      />
      <PasswordPrompt
        isOpen={refreshModal.isOpen}
        title="Refresh Court"
        confirmLabel="Confirm"
        onClose={closeRefreshModal}
        onSubmit={confirmRefresh}
        password={refreshModal.password}
        onPasswordChange={(event) =>
          setRefreshModal((prev) => ({
            ...prev,
            password: event.target.value,
            error: '',
          }))
        }
        error={refreshModal.error}
        closeAriaLabel="Close refresh modal"
      />
      <PasswordPrompt
        isOpen={clearHistoryModal.isOpen}
        title="Clear Match History"
        confirmLabel="Clear history"
        isDanger
        onClose={closeClearHistoryModal}
        onSubmit={confirmClearHistory}
        password={clearHistoryModal.password}
        onPasswordChange={(event) =>
          setClearHistoryModal((prev) => ({
            ...prev,
            password: event.target.value,
            error: '',
          }))
        }
        error={clearHistoryModal.error}
        closeAriaLabel="Close clear history modal"
      />
      {toastMessage ? (
        <div className="fixed bottom-6 right-6 z-20 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg">
          {toastMessage}
        </div>
      ) : null}
    </>
  )
}

export default App
