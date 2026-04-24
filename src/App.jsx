import { useEffect, useRef, useState } from 'react'
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
import PlayersView from './components/PlayersView'
import StandingsView from './components/StandingsView'
import {
  buildRoundFromPlayers,
  enforceExclusivePlayers,
  sortPlayersBySkill,
} from './matchEngine'
import matchEnginePlainDoc from '../docs/match-engine-plain.md?raw'
import standingsPlainDoc from '../docs/standings-plain.md?raw'

const STORAGE_KEYS = {
  players: 'matchGen.players',
  matchHistory: 'matchGen.matchHistory',
  sessionStarted: 'matchGen.sessionStarted',
}

const defaultCourtTeams = {
  champions: ['Player 1 / Player 2', 'Player 3 / Player 4'],
  battlefield: ['Player 5 / Player 6', 'Player 7 / Player 8'],
}

const courts = [
  {
    id: 'champions',
    name: 'Court 1',
  },
  {
    id: 'battlefield',
    name: 'Court 2',
  },
]

const basePlayers = playersData.map((player) => {
  const rating = player.duprRating || player.clubRating || ''
  const type =
    player.duprRating ? 'DUPR' : player.clubRating ? 'Self Rating' : 'DUPR'

  return {
    id: player.id,
    name: player.name,
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

const loadSessionStarted = () => {
  if (typeof window === 'undefined') return false
  const stored = window.localStorage.getItem(STORAGE_KEYS.sessionStarted)
  return stored === 'true'
}

const loadInitialView = () => (loadSessionStarted() ? 'courts' : 'home')

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

function App() {
  const [players, setPlayers] = useState(loadPlayers)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeView, setActiveView] = useState(loadInitialView)
  const [sessionStarted, setSessionStarted] = useState(loadSessionStarted)
  const [isStartingSession, setIsStartingSession] = useState(false)
  const [isEndingSession, setIsEndingSession] = useState(false)
  const [gameType, setGameType] = useState('claim')
  const [playerFormat, setPlayerFormat] = useState('random')
  const [exportMenuOpen, setExportMenuOpen] = useState(null)
  const [modalMode, setModalMode] = useState('add')
  const [editingId, setEditingId] = useState(null)
  const [infoModalOpen, setInfoModalOpen] = useState(false)
  const [infoTab, setInfoTab] = useState('match-engine-plain')
  const [courtMatchups, setCourtMatchups] = useState({
    champions: null,
    battlefield: null,
  })
  const [courtStatus, setCourtStatus] = useState({
    champions: 'idle',
    battlefield: 'idle',
  })
  const [courtHolds, setCourtHolds] = useState({
    champions: [],
    battlefield: [],
  })
  const [matchHistory, setMatchHistory] = useState(loadMatchHistory)
  const [formValues, setFormValues] = useState({
    name: '',
    rating: '',
    type: 'DUPR',
  })
  const [scoreModal, setScoreModal] = useState({
    isOpen: false,
    courtId: null,
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
  const [endSessionModal, setEndSessionModal] = useState({
    isOpen: false,
    password: '',
    error: '',
  })
  const [editCourtModal, setEditCourtModal] = useState({
    isOpen: false,
    courtId: null,
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
  const [refreshCounts, setRefreshCounts] = useState({
    champions: 0,
    battlefield: 0,
  })
  const [refreshModal, setRefreshModal] = useState({
    isOpen: false,
    courtId: null,
    password: '',
    error: '',
  })
  const standingsTableRef = useRef(null)
  const historyTableRef = useRef(null)
  const [toastMessage, setToastMessage] = useState('')
  const checkedInCount = players.filter((player) => player.checkedIn).length
  const isBattlefieldDisabled = checkedInCount < 8
  const infoContent =
    infoTab === 'match-engine-plain'
      ? matchEnginePlainDoc
      : standingsPlainDoc

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
      setCourtMatchups({ champions: null, battlefield: null })
      setCourtStatus({ champions: 'idle', battlefield: 'idle' })
      setCourtHolds({ champions: [], battlefield: [] })
      setRefreshCounts({ champions: 0, battlefield: 0 })
      setMatchHistory([])
      setSessionStarted(false)
      setActiveView('home')
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(STORAGE_KEYS.players)
        window.localStorage.removeItem(STORAGE_KEYS.matchHistory)
        window.localStorage.removeItem(STORAGE_KEYS.sessionStarted)
      }
      setIsEndingSession(false)
      setToastMessage('Session ended')
    }, 2000)
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
    setCourtMatchups({ champions: null, battlefield: null })
    setCourtStatus({ champions: 'idle', battlefield: 'idle' })
    setCourtHolds({ champions: [], battlefield: [] })
    setRefreshCounts({ champions: 0, battlefield: 0 })
    setMatchHistory([])
    setSessionStarted(false)
    setActiveView('home')
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEYS.players)
      window.localStorage.removeItem(STORAGE_KEYS.matchHistory)
      window.localStorage.removeItem(STORAGE_KEYS.sessionStarted)
    }
    setToastMessage('Storage cleared')
    closeResetModal()
  }

  const openRefreshModal = (courtId) => {
    setRefreshModal({
      isOpen: true,
      courtId,
      password: '',
      error: '',
    })
  }

  const closeRefreshModal = () => {
    setRefreshModal({
      isOpen: false,
      courtId: null,
      password: '',
      error: '',
    })
  }

  const openAddModal = () => {
    setModalMode('add')
    setEditingId(null)
    setFormValues({
      name: '',
      rating: '',
      type: 'DUPR',
    })
    setIsModalOpen(true)
  }

  const openEditModal = (player) => {
    setModalMode('edit')
    setEditingId(player.id)
    setFormValues({
      name: player.name,
      rating: String(player.rating),
      type: player.type,
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
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
    const ratingValue = formValues.rating.trim()

    if (modalMode === 'add') {
      const newPlayer = {
        id: crypto.randomUUID(),
        name: formValues.name.trim() || 'New Player',
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
                name: formValues.name.trim() || player.name,
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
      const minGames = prev.reduce((min, player) => {
        if (!player.checkedIn || player.id === playerId) return min
        const games = player.gamesPlayed ?? 0
        return games < min ? games : min
      }, Number.POSITIVE_INFINITY)
      const normalizedGames = Number.isFinite(minGames) ? minGames : 0

      return prev.map((player) => {
        if (player.id !== playerId) return player
        const currentGames = player.gamesPlayed ?? 0
        return {
          ...player,
          checkedIn: true,
          gamesPlayed: Math.max(currentGames, normalizedGames),
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
    setCourtHolds((prev) => ({
      champions: (prev.champions ?? []).filter((id) => id !== playerId),
      battlefield: (prev.battlefield ?? []).filter((id) => id !== playerId),
    }))
    const clearIfContainsPlayer = (teams) => {
      if (!Array.isArray(teams)) return teams
      const containsPlayer = teams.some((team) =>
        team.some((player) => player.id === playerId)
      )
      return containsPlayer ? null : teams
    }
    const nextMatchups = {
      champions: clearIfContainsPlayer(courtMatchups.champions),
      battlefield: clearIfContainsPlayer(courtMatchups.battlefield),
    }
    setCourtMatchups(nextMatchups)
    setCourtStatus((prev) => ({
      ...prev,
      champions: nextMatchups.champions ? prev.champions : 'waiting',
      battlefield: nextMatchups.battlefield ? prev.battlefield : 'waiting',
    }))
  }

  const handleGenerateCourts = (courtId, options = {}) => {
    if (refreshCounts[courtId] >= 1 && !options.force) {
      openRefreshModal(courtId)
      return
    }
    const occupiedPlayers = new Set(
      (courtId === 'battlefield'
        ? courtMatchups.champions
        : courtMatchups.battlefield
      )?.flatMap((team) => team.map((player) => player.id)) ?? []
    )
    const holdIds = new Set(courtHolds[courtId] ?? [])
    const holdPlayers = (courtHolds[courtId] ?? [])
      .map((playerId) => players.find((player) => player.id === playerId))
      .filter(Boolean)
    const eligiblePlayers = players.filter(
      (player) =>
        player.checkedIn &&
        !occupiedPlayers.has(player.id) &&
        !holdIds.has(player.id)
    )
    if (holdPlayers.length + eligiblePlayers.length < 4) return
    if (courtId === 'battlefield' && isBattlefieldDisabled) return

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

    const selectedPlayers = [...holdPlayers, ...rotationPool].slice(0, 4)
    const round = buildRoundFromPlayers(selectedPlayers, [])

    setCourtMatchups((prev) => ({
      ...prev,
      champions: courtId === 'champions' ? round.champions : prev.champions,
      battlefield:
        courtId === 'battlefield' && !isBattlefieldDisabled
          ? round.champions
          : prev.battlefield,
    }))
    if (courtId === 'champions') {
      setCourtStatus((prev) => ({ ...prev, champions: 'idle' }))
    }
    if (courtId === 'battlefield') {
      setCourtStatus((prev) => ({ ...prev, battlefield: 'idle' }))
    }
    setRefreshCounts((prev) => ({ ...prev, [courtId]: prev[courtId] + 1 }))
  }

  const openScoreModal = (courtId) => {
    const teams = courtMatchups[courtId]
    if (!teams || teams.length < 2) return

    setScoreModal({
      isOpen: true,
      courtId,
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
      courtId: null,
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
    setToastMessage('Match added to history')
    closeManualMatchModal()
  }

  const openEditCourtModal = (courtId) => {
    const currentMatchup = courtMatchups[courtId]
    const teamAIds = currentMatchup?.[0]?.map((player) => player.id) ?? []
    const teamBIds = currentMatchup?.[1]?.map((player) => player.id) ?? []
    const normalizeIds = (ids) => [ids[0] ?? '', ids[1] ?? '']

    setEditCourtModal({
      isOpen: true,
      courtId,
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
      courtId: null,
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

    setCourtMatchups((prev) => ({
      ...prev,
      [editCourtModal.courtId]: [teamAPlayers, teamBPlayers],
    }))
    setCourtStatus((prev) => ({
      ...prev,
      [editCourtModal.courtId]: 'idle',
    }))
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
    const winnerIds = new Set(
      (isTeamAWin ? scoreModal.teamA : scoreModal.teamB).map(
        (player) => player.id
      )
    )
    const nextHoldIds = []

    setPlayers((prev) =>
      prev.map((player) => {
        const isTeamA = scoreModal.teamA.some((member) => member.id === player.id)
        const isTeamB = scoreModal.teamB.some((member) => member.id === player.id)
        if (!isTeamA && !isTeamB) return player

        const pointsFor = player.pointsFor ?? 0
        const pointsAgainst = player.pointsAgainst ?? 0
        const gamesPlayed = player.gamesPlayed ?? 0
        const isWinner = winnerIds.has(player.id)
        const nextWinStreak = isWinner ? (player.winStreak ?? 0) + 1 : 0
        const nextGames = gamesPlayed + 1
        const staysOnCourt =
          isWinner && nextWinStreak < 2 && nextGames <= maxGamesForHold
        const normalizedWinStreak = staysOnCourt ? nextWinStreak : 0

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
        }
      })
    )
    setCourtHolds((prev) => ({ ...prev, [scoreModal.courtId]: nextHoldIds }))

    const teamAName = scoreModal.teamA.map((player) => player.name).join(' / ')
    const teamBName = scoreModal.teamB.map((player) => player.name).join(' / ')
    const courtLabel =
      scoreModal.courtId === 'champions' ? 'Court 1' : 'Court 2'
    setMatchHistory((prev) => [
      {
        id: crypto.randomUUID(),
        court: courtLabel,
        teamA: teamAName,
        teamB: teamBName,
        score: `${scoreA} - ${scoreB}`,
        enteredBy: scoreModal.enteredBy.trim(),
      },
      ...prev,
    ])

    if (scoreModal.courtId === 'champions') {
      setCourtMatchups((prev) => ({ ...prev, champions: null }))
      setCourtStatus((prev) => ({ ...prev, champions: 'waiting' }))
      setRefreshCounts((prev) => ({ ...prev, champions: 0 }))
    }

    if (scoreModal.courtId === 'battlefield') {
      setCourtMatchups((prev) => ({ ...prev, battlefield: null }))
      setCourtStatus((prev) => ({ ...prev, battlefield: 'waiting' }))
      setRefreshCounts((prev) => ({ ...prev, battlefield: 0 }))
    }

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
    const courtId = refreshModal.courtId
    closeRefreshModal()
    handleGenerateCourts(courtId, { force: true })
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

  const exportHistoryPdf = () => {
    exportTableAsPdf('Match History', historyTableRef, 'match-history.pdf')
  }

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
    courts.find((court) => court.id === editCourtModal.courtId)?.name ?? 'Court'

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
            sessionStarted={sessionStarted}
            isStartingSession={isStartingSession}
            isEndingSession={isEndingSession}
            onSelectGameType={setGameType}
            onSelectPlayerFormat={setPlayerFormat}
            onStartSession={() => {
              if (isStartingSession) return
              setIsStartingSession(true)
              setToastMessage('Session started')
              window.setTimeout(() => {
                setSessionStarted(true)
                setActiveView('courts')
                setIsStartingSession(false)
              }, 2000)
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
              onBack={() => setActiveView('courts')}
              onAdd={openAddModal}
              onCheckIn={handleCheckIn}
              onCheckOut={handleCheckOut}
              onEdit={openEditModal}
              onDelete={handleDelete}
            />
          </>
        ) : activeView === 'standings' ? (
          <StandingsView
            players={players}
            standingsTableRef={standingsTableRef}
            exportMenuOpen={exportMenuOpen}
            setExportMenuOpen={setExportMenuOpen}
            onExportCsv={exportStandingsCsv}
            onExportPdf={exportStandingsPdf}
            onBack={() => setActiveView('courts')}
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
            onBack={() => setActiveView('courts')}
          />
        ) : (
          <CourtsView
            courts={courts}
            defaultCourtTeams={defaultCourtTeams}
            courtMatchups={courtMatchups}
            courtStatus={courtStatus}
            isBattlefieldDisabled={isBattlefieldDisabled}
            onGenerateCourts={handleGenerateCourts}
            onEditCourt={openEditCourtModal}
            onOpenScore={openScoreModal}
          />
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
                  <input
                    type="number"
                    min="0"
                    value={manualMatchModal.scoreA}
                    onChange={(event) =>
                      setManualMatchModal((prev) => ({
                        ...prev,
                        scoreA: event.target.value,
                      }))
                    }
                    className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                    placeholder="0"
                  />
                  {manualMatchErrors.scoreA ? (
                    <p className="text-xs text-red-500">
                      {manualMatchErrors.scoreA}
                    </p>
                  ) : null}
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  Score B
                  <input
                    type="number"
                    min="0"
                    value={manualMatchModal.scoreB}
                    onChange={(event) =>
                      setManualMatchModal((prev) => ({
                        ...prev,
                        scoreB: event.target.value,
                      }))
                    }
                    className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                    placeholder="0"
                  />
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
                <input
                  type="number"
                  min="0"
                  value={scoreModal.scoreA}
                  onChange={(event) =>
                    setScoreModal((prev) => ({
                      ...prev,
                      scoreA: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                  placeholder="Team A score"
                />
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
                <input
                  type="number"
                  min="0"
                  value={scoreModal.scoreB}
                  onChange={(event) =>
                    setScoreModal((prev) => ({
                      ...prev,
                      scoreB: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                  placeholder="Team B score"
                />
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
      {resetModal.isOpen ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={closeResetModal}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Confirm Reset
              </h2>
              <button
                type="button"
                onClick={closeResetModal}
                className="rounded-full border border-slate-200 p-1.5 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close reset modal"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <form className="mt-4 space-y-4" onSubmit={confirmReset}>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Password
                <input
                  type="password"
                  value={resetModal.password}
                  onChange={(event) =>
                    setResetModal((prev) => ({
                      ...prev,
                      password: event.target.value,
                      error: '',
                    }))
                  }
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                  placeholder="Enter password"
                />
              </label>
              {resetModal.error ? (
                <p className="text-xs text-red-500">{resetModal.error}</p>
              ) : null}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeResetModal}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 hover:shadow-md"
                >
                  Reset
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {endSessionModal.isOpen ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={closeEndSessionModal}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                End Session
              </h2>
              <button
                type="button"
                onClick={closeEndSessionModal}
                className="rounded-full border border-slate-200 p-1.5 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close end session modal"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <form className="mt-4 space-y-4" onSubmit={confirmEndSession}>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Password
                <input
                  type="password"
                  value={endSessionModal.password}
                  onChange={(event) =>
                    setEndSessionModal((prev) => ({
                      ...prev,
                      password: event.target.value,
                      error: '',
                    }))
                  }
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                  placeholder="Enter password"
                />
              </label>
              {endSessionModal.error ? (
                <p className="text-xs text-red-500">{endSessionModal.error}</p>
              ) : null}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEndSessionModal}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
                >
                  End session
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {refreshModal.isOpen ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={closeRefreshModal}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Refresh Court
              </h2>
              <button
                type="button"
                onClick={closeRefreshModal}
                className="rounded-full border border-slate-200 p-1.5 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close refresh modal"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <form className="mt-4 space-y-4" onSubmit={confirmRefresh}>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Password
                <input
                  type="password"
                  value={refreshModal.password}
                  onChange={(event) =>
                    setRefreshModal((prev) => ({
                      ...prev,
                      password: event.target.value,
                      error: '',
                    }))
                  }
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                  placeholder="Enter password"
                />
              </label>
              {refreshModal.error ? (
                <p className="text-xs text-red-500">{refreshModal.error}</p>
              ) : null}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeRefreshModal}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 hover:shadow-md"
                >
                  Confirm
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {toastMessage ? (
        <div className="fixed bottom-6 right-6 z-20 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg">
          {toastMessage}
        </div>
      ) : null}
    </>
  )
}

export default App
