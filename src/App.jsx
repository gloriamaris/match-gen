import { useEffect, useRef, useState } from 'react'
import {
  Check,
  ClipboardList,
  Info,
  LayoutGrid,
  Plus,
  RefreshCw,
  RotateCcw,
  Trophy,
  Users,
  X,
} from 'lucide-react'
import playersData from './players.json'
import SignatureCanvas from 'react-signature-canvas'
import ReactMarkdown from 'react-markdown'
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
  const [activeView, setActiveView] = useState('courts')
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
  const [scoreErrors, setScoreErrors] = useState({
    scoreA: '',
    scoreB: '',
    verifiedBy: '',
    signature: '',
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
  const signatureRef = useRef(null)
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
    setRefreshCounts({ champions: 0, battlefield: 0 })
    setMatchHistory([])
    setActiveView('courts')
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEYS.players)
      window.localStorage.removeItem(STORAGE_KEYS.matchHistory)
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
    setPlayers((prev) =>
      prev.map((player) =>
        player.id === playerId ? { ...player, checkedIn: true } : player
      )
    )
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
    const eligiblePlayers = players.filter(
      (player) => player.checkedIn && !occupiedPlayers.has(player.id)
    )
    if (eligiblePlayers.length < 4) return
    if (courtId === 'battlefield' && isBattlefieldDisabled) return

    const minGames = eligiblePlayers.reduce((min, player) => {
      const games = player.gamesPlayed ?? 0
      return games < min ? games : min
    }, Number.POSITIVE_INFINITY)

    const buildRotationPool = () => {
      const remaining = [...eligiblePlayers].sort((a, b) => {
        const gamesA = a.gamesPlayed ?? 0
        const gamesB = b.gamesPlayed ?? 0
        if (gamesA !== gamesB) return gamesA - gamesB
        return a.name.localeCompare(b.name)
      })
      const pool = []

      while (pool.length < 8 && remaining.length > 0) {
        const nextGames = remaining[0].gamesPlayed ?? 0
        const group = remaining.filter(
          (player) => (player.gamesPlayed ?? 0) === nextGames
        )
        remaining.splice(0, group.length)
        pool.push(...group)
      }

      return pool.slice(0, 8)
    }

    const zeroGamePlayers = eligiblePlayers.filter(
      (player) => (player.gamesPlayed ?? 0) === minGames
    )
    const initialPool =
      zeroGamePlayers.length >= 8
        ? sortPlayersBySkill(zeroGamePlayers).slice(0, 8)
        : buildRotationPool()
    const poolWithStandby = enforceExclusivePlayers(
      initialPool,
      ADMIN_STANDBY_IDS
    )
    const selectedIds = new Set(poolWithStandby.map((player) => player.id))
    const fallbackPool = eligiblePlayers
      .filter((player) => !selectedIds.has(player.id))
      .sort((a, b) => {
        const gamesA = a.gamesPlayed ?? 0
        const gamesB = b.gamesPlayed ?? 0
        if (gamesA !== gamesB) return gamesA - gamesB
        return a.name.localeCompare(b.name)
      })
    const rotationPool = [...poolWithStandby]

    while (rotationPool.length < 8 && fallbackPool.length > 0) {
      const nextPlayer = fallbackPool.shift()
      if (
        ADMIN_STANDBY_IDS.has(nextPlayer.id) &&
        rotationPool.some((player) => ADMIN_STANDBY_IDS.has(player.id))
      ) {
        continue
      }
      rotationPool.push(nextPlayer)
    }

    const sorted = sortPlayersBySkill(rotationPool)
    const championsPlayers = sorted.slice(0, 4)
    const battlefieldPlayers = sorted.slice(-4)
    const round = buildRoundFromPlayers(championsPlayers, battlefieldPlayers)

    setCourtMatchups((prev) => ({
      ...prev,
      champions: courtId === 'champions' ? round.champions : prev.champions,
      battlefield:
        courtId === 'battlefield' && !isBattlefieldDisabled
          ? round.battlefield
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
      signature: '',
    })
    signatureRef.current?.clear()
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
      signature: '',
    })
    signatureRef.current?.clear()
  }

  const handleScoreSubmit = (event) => {
    event.preventDefault()
    const scoreA = Number.parseInt(scoreModal.scoreA, 10)
    const scoreB = Number.parseInt(scoreModal.scoreB, 10)
    const signatureEmpty = signatureRef.current?.isEmpty?.() ?? true
    const nextErrors = {
      scoreA: Number.isNaN(scoreA) ? 'Score is required' : '',
      scoreB: Number.isNaN(scoreB) ? 'Score is required' : '',
      verifiedBy: scoreModal.enteredBy ? '' : 'Select a verifier',
      signature: signatureEmpty ? 'Signature is required' : '',
    }

    setScoreErrors(nextErrors)

    if (
      nextErrors.scoreA ||
      nextErrors.scoreB ||
      nextErrors.verifiedBy ||
      nextErrors.signature
    ) {
      return
    }

    setPlayers((prev) =>
      prev.map((player) => {
        const isTeamA = scoreModal.teamA.some((member) => member.id === player.id)
        const isTeamB = scoreModal.teamB.some((member) => member.id === player.id)
        if (!isTeamA && !isTeamB) return player

        const pointsFor = player.pointsFor ?? 0
        const pointsAgainst = player.pointsAgainst ?? 0
        const gamesPlayed = player.gamesPlayed ?? 0
        const isWinner = (scoreA > scoreB && isTeamA) || (scoreB > scoreA && isTeamB)

        const nextPointsFor = pointsFor + (isTeamA ? scoreA : scoreB)
        const nextPointsAgainst = pointsAgainst + (isTeamA ? scoreB : scoreA)
        const nextPointDifferential = nextPointsFor - nextPointsAgainst

        return {
          ...player,
          wins: isWinner ? player.wins + 1 : player.wins,
          losses: !isWinner ? player.losses + 1 : player.losses,
          gamesPlayed: gamesPlayed + 1,
          pointsFor: nextPointsFor,
          pointsAgainst: nextPointsAgainst,
          pointDifferential: nextPointDifferential,
        }
      })
    )

    const teamAName = scoreModal.teamA.map((player) => player.name).join(' / ')
    const teamBName = scoreModal.teamB.map((player) => player.name).join(' / ')
    const courtLabel =
      scoreModal.courtId === 'champions' ? 'Court 1' : 'Court 2'
    const signatureData = signatureRef.current?.isEmpty()
      ? ''
      : signatureRef.current?.getCanvas().toDataURL('image/png')

    setMatchHistory((prev) => [
      {
        id: crypto.randomUUID(),
        court: courtLabel,
        teamA: teamAName,
        teamB: teamBName,
        score: `${scoreA} - ${scoreB}`,
        enteredBy: scoreModal.enteredBy.trim(),
        signature: signatureData,
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

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm sm:min-h-[560px] sm:flex-row">
        <aside className="flex w-full items-center gap-3 border-b border-slate-200 px-4 py-3 sm:w-20 sm:flex-col sm:justify-start sm:gap-5 sm:border-b-0 sm:border-r sm:px-3 sm:py-6">
          <button
            type="button"
            onClick={() => setActiveView('courts')}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-800"
          >
            <LayoutGrid className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setActiveView('players')}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 ${
              activeView === 'players' ? 'bg-slate-100 text-slate-900' : ''
            }`}
          >
            <Users className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setActiveView('history')}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 ${
              activeView === 'history' ? 'bg-slate-100 text-slate-900' : ''
            }`}
          >
            <ClipboardList className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setActiveView('standings')}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 ${
              activeView === 'standings' ? 'bg-slate-100 text-slate-900' : ''
            }`}
          >
            <Trophy className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={openInfoModal}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Open documentation"
          >
            <Info className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleResetData}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
          >
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
          </button>
        </aside>

        <main className="relative flex-1 px-4 py-6 sm:px-8 sm:py-10">
          <h1 className="mb-6 text-xl font-semibold text-slate-900 sm:text-2xl">
            HAPPY PICKLERS MATCH GENERATOR
          </h1>
          {activeView === 'players' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  Players
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveView('courts')}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                >
                  Back to courts
                </button>
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-left text-sm text-slate-700">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Player Name</th>
                      <th className="px-4 py-3">Rating</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {players.map((player, index) => (
                      <tr key={player.id}>
                        <td className="px-4 py-3 text-slate-500">
                          {index + 1}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {player.name}
                        </td>
                        <td className="px-4 py-3">{player.rating}</td>
                        <td className="px-4 py-3">{player.type}</td>
                        <td className="px-4 py-3">
                          {player.checkedIn ? (
                            <span className="text-xs font-semibold uppercase text-slate-400">
                              Checked In
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleCheckIn(player.id)}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                            >
                              Check In
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(player)}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                            >
                              Edit
                            </button>
                          {player.gamesPlayed > 0 || player.checkedIn ? null : (
                            <button
                              type="button"
                              onClick={() => handleDelete(player.id)}
                              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50"
                            >
                              Delete
                            </button>
                          )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeView === 'standings' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  Standings
                </h2>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setExportMenuOpen((prev) =>
                          prev === 'standings' ? null : 'standings'
                        )
                      }
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                    >
                      Export
                    </button>
                    {exportMenuOpen === 'standings' ? (
                      <div className="absolute right-0 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-lg">
                        <button
                          type="button"
                          onClick={() => {
                            exportStandingsCsv()
                            setExportMenuOpen(null)
                          }}
                          className="w-full rounded-lg px-3 py-2 text-left font-medium text-slate-700 transition hover:bg-slate-100"
                        >
                          Export as CSV
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            exportStandingsPdf()
                            setExportMenuOpen(null)
                          }}
                          className="w-full rounded-lg px-3 py-2 text-left font-medium text-slate-700 transition hover:bg-slate-100"
                        >
                          Export as PDF
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveView('courts')}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                  >
                    Back to courts
                  </button>
                </div>
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table
                  ref={standingsTableRef}
                  className="w-full text-left text-sm text-slate-700"
                >
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Player</th>
                      <th className="px-4 py-3 text-center">Wins</th>
                      <th className="px-4 py-3 text-center">Losses</th>
                      <th className="px-4 py-3 text-center">PD</th>
                      <th className="px-4 py-3 text-center">Games</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {[...players]
                      .sort((a, b) => {
                        if (b.wins !== a.wins) return b.wins - a.wins
                        if (b.pointDifferential !== a.pointDifferential) {
                          return b.pointDifferential - a.pointDifferential
                        }
                        return 0
                      })
                      .map((player, index) => {
                        const hasStats =
                          player.wins > 0 ||
                          player.losses > 0 ||
                          player.pointDifferential !== 0 ||
                          player.gamesPlayed > 0

                        return (
                        <tr key={player.id}>
                          <td className="px-4 py-3 text-slate-500">
                            {index + 1}
                          </td>
                          <td
                            className={`px-4 py-3 font-medium ${
                              index < 4 && hasStats
                                ? 'text-emerald-600'
                                : 'text-slate-800'
                            }`}
                          >
                            {player.name}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {player.wins}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {player.losses}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {player.pointDifferential}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {player.gamesPlayed}
                          </td>
                        </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeView === 'history' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  Match History
                </h2>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setExportMenuOpen((prev) =>
                          prev === 'history' ? null : 'history'
                        )
                      }
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                    >
                      Export
                    </button>
                    {exportMenuOpen === 'history' ? (
                      <div className="absolute right-0 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-lg">
                        <button
                          type="button"
                          onClick={() => {
                            exportHistoryCsv()
                            setExportMenuOpen(null)
                          }}
                          className="w-full rounded-lg px-3 py-2 text-left font-medium text-slate-700 transition hover:bg-slate-100"
                        >
                          Export as CSV
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            exportHistoryPdf()
                            setExportMenuOpen(null)
                          }}
                          className="w-full rounded-lg px-3 py-2 text-left font-medium text-slate-700 transition hover:bg-slate-100"
                        >
                          Export as PDF
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveView('courts')}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                  >
                    Back to courts
                  </button>
                </div>
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table
                  ref={historyTableRef}
                  className="w-full text-left text-sm text-slate-700"
                >
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Court</th>
                      <th className="px-4 py-3">Team A</th>
                      <th className="px-4 py-3">Team B</th>
                      <th className="px-4 py-3">Score</th>
                      <th className="px-4 py-3">Verified</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {matchHistory.length === 0 ? (
                      <tr>
                        <td
                          className="px-4 py-6 text-center text-sm text-slate-500"
                          colSpan={6}
                        >
                          No games recorded yet.
                        </td>
                      </tr>
                    ) : (
                      matchHistory.map((match, index) => {
                        const [scoreA, scoreB] = match.score
                          .split('-')
                          .map((value) => Number.parseInt(value.trim(), 10))
                        const hasWinner =
                          !Number.isNaN(scoreA) &&
                          !Number.isNaN(scoreB) &&
                          scoreA !== scoreB
                        const teamAClass =
                          hasWinner && scoreA > scoreB
                            ? 'text-emerald-600 font-semibold'
                            : ''
                        const teamBClass =
                          hasWinner && scoreB > scoreA
                            ? 'text-emerald-600 font-semibold'
                            : ''

                        return (
                          <tr key={match.id}>
                            <td className="px-4 py-3 text-slate-500">
                              {index + 1}
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-800">
                              {match.court}
                            </td>
                            <td className={`px-4 py-3 ${teamAClass}`}>
                              {match.teamA}
                            </td>
                            <td className={`px-4 py-3 ${teamBClass}`}>
                              {match.teamB}
                            </td>
                            <td className="px-4 py-3">{match.score}</td>
                            <td className="px-4 py-3">
                              {match.enteredBy || '—'}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {courts.map((court) => (
                <div key={court.name} className="space-y-3">
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-stretch">
                      <div className="flex-1 divide-y divide-slate-200 text-sm font-medium text-slate-700">
                        {(court.id === 'battlefield' && isBattlefieldDisabled
                          ? ['Waiting for more players', 'Need 8 checked-in players']
                          : court.id === 'champions' &&
                              courtStatus.champions === 'waiting'
                            ? ['Waiting for players', 'Click refresh to generate']
                            : court.id === 'battlefield' &&
                                courtStatus.battlefield === 'waiting'
                              ? ['Waiting for players', 'Click refresh to generate']
                              : (courtMatchups[court.id] ?? []).length
                                ? courtMatchups[court.id].map((team) =>
                                    team.map((player) => player.name).join(' / ')
                                  )
                                : defaultCourtTeams[court.id]
                        ).map((team) => (
                          <div
                            key={team}
                            className={`px-4 py-4 sm:px-5 ${
                              (court.id === 'battlefield' && isBattlefieldDisabled) ||
                              (court.id === 'champions' &&
                                courtStatus.champions === 'waiting') ||
                              (court.id === 'battlefield' &&
                                courtStatus.battlefield === 'waiting')
                                ? 'text-slate-400'
                                : ''
                            }`}
                          >
                            {team}
                          </div>
                        ))}
                      </div>
                      <div className="flex w-12 flex-col items-center justify-between border-l border-slate-200 bg-slate-50 py-3 text-slate-600">
                        <button
                          type="button"
                          onClick={() => handleGenerateCourts(court.id)}
                          disabled={court.id === 'battlefield' && isBattlefieldDisabled}
                          className={`flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition ${
                            court.id === 'battlefield' && isBattlefieldDisabled
                              ? 'cursor-not-allowed opacity-40'
                              : 'hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                        >
                          <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openScoreModal(court.id)}
                          disabled={
                            !courtMatchups[court.id] ||
                            (court.id === 'battlefield' && isBattlefieldDisabled)
                          }
                          className={`flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm transition ${
                            courtMatchups[court.id]
                              ? court.id === 'battlefield' && isBattlefieldDisabled
                                ? 'cursor-not-allowed opacity-50'
                                : 'hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-800'
                              : 'cursor-not-allowed opacity-50'
                          }`}
                        >
                          <Check className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <p className="text-center text-sm font-semibold text-slate-600">
                    {court.name}
                  </p>
                </div>
              ))}
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
        </main>
      </div>

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

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm font-medium text-slate-700">
                  Signature
                  <button
                    type="button"
                    onClick={() => signatureRef.current?.clear()}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
                  >
                    Clear
                  </button>
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <SignatureCanvas
                    ref={signatureRef}
                    canvasProps={{
                      className: 'h-32 w-full',
                    }}
                    backgroundColor="white"
                    penColor="#111827"
                  />
                </div>
                {scoreErrors.signature ? (
                  <p className="text-xs text-red-500">
                    {scoreErrors.signature}
                  </p>
                ) : null}
              </div>

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
    </div>
  )
}

export default App
