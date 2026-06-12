import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toJpeg, toPng } from 'html-to-image'
import {
  generateMatches,
  applyMatchResult,
  revertMatchResult,
} from '../../match-engines/v2/ProgressivePlay.engine'
import {
  applyMatchResult as trApplyMatchResult,
  revertMatchResult as trRevertMatchResult,
  generateCourtAfterScore,
  generateFallbackCourtByPriority,
  selectPrimaryThroneWinner,
} from '../../match-engines/v2/ThroneRun.engine'
import {
  applyGamesGapExclusions,
  buildGamesGapExclusions,
  countAvailableEligiblePlayers,
  resolveGapExclusionsForCourtFill,
  shouldSkipThroneForGamesGap,
} from '../../match-engines/v2/gamesGap'
import ShareStandingsModal from '../ShareStandingsModal'
import V2CourtsView from './V2CourtsView'
import V2EditCourtModal from './V2EditCourtModal'
import V2GameSetupPage from './V2GameSetupPage'
import V2HistoryView from './V2HistoryView'
import V2Layout from './V2Layout'
import V2PlayersView from './V2PlayersView'
import V2ScoreModal from './V2ScoreModal'
import V2Sidebar from './V2Sidebar'
import V2StandingsView, { computeStandings } from './V2StandingsView'
import {
  clearV2Session,
  DEFAULT_V2_COURTS,
  DEFAULT_V2_GAME_MODE,
  DEFAULT_V2_GAME_TYPE,
  DEFAULT_V2_WIN_STREAK,
  V2_GAME_TYPES,
  loadV2CourtMatchups,
  loadV2Courts,
  loadV2GameMode,
  loadV2GameType,
  loadV2WinStreak,
  loadV2MatchHistory,
  loadV2Players,
  loadV2SessionStarted,
  persistV2Session,
  saveV2CourtMatchups,
  saveV2MatchHistory,
  saveV2Players,
  saveV2WinStreak,
} from './v2Storage'

function loadInitialView() {
  return loadV2SessionStarted() ? 'players' : 'setup'
}

const V2_SHARE_STORAGE_KEYS = {
  coverPhoto: 'matchGen.v2.shareCoverPhoto',
  primaryPhoto: 'matchGen.v2.sharePrimaryPhoto',
  coverPhotoName: 'matchGen.v2.shareCoverPhotoName',
  primaryPhotoName: 'matchGen.v2.sharePrimaryPhotoName',
  eventDate: 'matchGen.v2.shareEventDate',
}

const DEFAULT_SHARE_COVER_PHOTO = '/img/cover-photo.jpg'
const DEFAULT_SHARE_PRIMARY_PHOTO = '/img/primary-photo.jpg'
const DEFAULT_SHARE_COVER_PHOTO_NAME = 'cover-photo.jpg'
const DEFAULT_SHARE_PRIMARY_PHOTO_NAME = 'primary-photo.jpg'
const DEFAULT_SHARE_EVENT_NAME = 'Event Name'
const DEFAULT_SHARE_EVENT_DATE = ''

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

export default function AppV2() {
  const [activeView, setActiveView] = useState(loadInitialView)
  const [sessionStarted, setSessionStarted] = useState(loadV2SessionStarted)
  const [gameType, setGameType] = useState(loadV2GameType)
  const [gameMode, setGameMode] = useState(loadV2GameMode)
  const [numberOfCourts, setNumberOfCourts] = useState(loadV2Courts)
  const [winStreak, setWinStreak] = useState(loadV2WinStreak)
  const [isStartingSession, setIsStartingSession] = useState(false)
  const [isEndingSession, setIsEndingSession] = useState(false)
  const startTimeoutRef = useRef(null)
  const endTimeoutRef = useRef(null)

  const [players, setPlayers] = useState(() => loadV2Players())
  const [courtMatchups, setCourtMatchups] = useState(() => loadV2CourtMatchups())
  const [matchHistory, setMatchHistory] = useState(() => loadV2MatchHistory())
  const [scoreModal, setScoreModal] = useState({
    isOpen: false,
    courtIndex: null,
  })
  const [errorModal, setErrorModal] = useState({
    isOpen: false,
    title: '',
    message: '',
  })
  const [editCourtModal, setEditCourtModal] = useState({
    isOpen: false,
    courtIndex: null,
  })
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareEventName, setShareEventName] = useState(DEFAULT_SHARE_EVENT_NAME)
  const [shareEventDate, setShareEventDate] = useState(() =>
    loadShareValue(V2_SHARE_STORAGE_KEYS.eventDate, DEFAULT_SHARE_EVENT_DATE)
  )
  const [shareCoverPhotoSrc, setShareCoverPhotoSrc] = useState(() =>
    loadSharePhoto(V2_SHARE_STORAGE_KEYS.coverPhoto, DEFAULT_SHARE_COVER_PHOTO)
  )
  const [sharePrimaryPhotoSrc, setSharePrimaryPhotoSrc] = useState(() =>
    loadSharePhoto(
      V2_SHARE_STORAGE_KEYS.primaryPhoto,
      DEFAULT_SHARE_PRIMARY_PHOTO
    )
  )
  const [shareCoverPhotoName, setShareCoverPhotoName] = useState(() =>
    loadSharePhotoName(
      V2_SHARE_STORAGE_KEYS.coverPhotoName,
      DEFAULT_SHARE_COVER_PHOTO_NAME
    )
  )
  const [sharePrimaryPhotoName, setSharePrimaryPhotoName] = useState(() =>
    loadSharePhotoName(
      V2_SHARE_STORAGE_KEYS.primaryPhotoName,
      DEFAULT_SHARE_PRIMARY_PHOTO_NAME
    )
  )
  const [toastMessage, setToastMessage] = useState('')
  const [exportMenuOpen, setExportMenuOpen] = useState(null)
  const standingsTableRef = useRef(null)
  const historyTableRef = useRef(null)

  // Re-load players from storage whenever we navigate to a view that reads
  // player stats so standings/history reflect the latest state.
  useEffect(() => {
    if (
      activeView === 'courts' ||
      activeView === 'standings' ||
      activeView === 'history'
    ) {
      setPlayers(loadV2Players())
    }
  }, [activeView])

  useEffect(() => {
    return () => {
      if (startTimeoutRef.current) {
        window.clearTimeout(startTimeoutRef.current)
      }
      if (endTimeoutRef.current) {
        window.clearTimeout(endTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      V2_SHARE_STORAGE_KEYS.coverPhoto,
      shareCoverPhotoSrc
    )
  }, [shareCoverPhotoSrc])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      V2_SHARE_STORAGE_KEYS.primaryPhoto,
      sharePrimaryPhotoSrc
    )
  }, [sharePrimaryPhotoSrc])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      V2_SHARE_STORAGE_KEYS.coverPhotoName,
      shareCoverPhotoName
    )
  }, [shareCoverPhotoName])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      V2_SHARE_STORAGE_KEYS.primaryPhotoName,
      sharePrimaryPhotoName
    )
  }, [sharePrimaryPhotoName])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(V2_SHARE_STORAGE_KEYS.eventDate, shareEventDate)
  }, [shareEventDate])

  useEffect(() => {
    if (typeof window === 'undefined') return
    saveV2WinStreak(winStreak)
  }, [winStreak])

  useEffect(() => {
    if (!toastMessage) return
    const timer = window.setTimeout(() => {
      setToastMessage('')
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [toastMessage])

  const checkedInCount = players.filter((p) => p.checkedIn).length

  // -- Session lifecycle ---------------------------------------------------

  const handleStartSession = () => {
    if (isStartingSession || isEndingSession) return
    setIsStartingSession(true)
    startTimeoutRef.current = window.setTimeout(() => {
      persistV2Session({
        gameType,
        gameMode,
        courts: numberOfCourts,
        winStreak,
      })
      setSessionStarted(true)
      setActiveView('players')
      setIsStartingSession(false)
      startTimeoutRef.current = null
    }, 1500)
  }

  const handleEndSession = () => {
    if (isStartingSession || isEndingSession) return
    setIsEndingSession(true)
    endTimeoutRef.current = window.setTimeout(() => {
      clearV2Session()
      setSessionStarted(false)
      setGameType(DEFAULT_V2_GAME_TYPE)
      setGameMode(DEFAULT_V2_GAME_MODE)
      setNumberOfCourts(DEFAULT_V2_COURTS)
      setWinStreak(DEFAULT_V2_WIN_STREAK)
      setPlayers([])
      setCourtMatchups(null)
      setMatchHistory([])
      setActiveView('setup')
      setIsEndingSession(false)
      endTimeoutRef.current = null
    }, 1500)
  }

  const handleNavigate = (view) => {
    if (isStartingSession || isEndingSession) return
    if (view !== 'setup' && !sessionStarted) return
    setActiveView(view)
  }

  // -- Court generation (Refresh) ------------------------------------------

  const handleGenerateCourt = (courtIndex) => {
    const existingMatchup = courtMatchups?.[courtIndex]
    const hasExistingMatchup =
      existingMatchup?.teamA?.length && existingMatchup?.teamB?.length

    if (
      hasExistingMatchup &&
      !window.confirm(
        `Court ${courtIndex + 1} already has players assigned. Refresh anyway? This will replace the current matchup.`
      )
    ) {
      return
    }

    try {
      const currentPlayers = loadV2Players()
      setPlayers(currentPlayers)

      const otherCourtPlayerIds = []
      ;(courtMatchups ?? []).forEach((matchup, index) => {
        if (index === courtIndex || !matchup) return
        matchup.teamA?.forEach((player) => otherCourtPlayerIds.push(player.id))
        matchup.teamB?.forEach((player) => otherCourtPlayerIds.push(player.id))
      })

      const medalExcludeIds = currentPlayers
        .filter(
          (p) =>
            p.medalCooldownCourt === courtIndex &&
            (p.medalCooldownRemaining || 0) > 0
        )
        .map((p) => p.id)

      const otherCourtIdSet = new Set(otherCourtPlayerIds)
      const availableForCourt = currentPlayers.filter(
        (p) =>
          p.checkedIn &&
          !otherCourtIdSet.has(p.id) &&
          !medalExcludeIds.includes(p.id)
      )

      const {
        enforceGap,
        maxAllowedGames,
        gapExcludeIds,
        allExcludeIds,
      } = buildGamesGapExclusions(currentPlayers, { medalExcludeIds })

      const finalExcludeIds = resolveGapExclusionsForCourtFill(currentPlayers, {
        gapExcludeIds,
        allExcludeIds,
        medalExcludeIds,
        otherCourtPlayerIds,
        enforceGap,
      })

      const effectivePlayers = applyGamesGapExclusions(
        currentPlayers,
        finalExcludeIds
      )

      let generatedCourt = null

      if (gameType === V2_GAME_TYPES.THRONE_RUN) {
        const lastMatchOnCourt = [...matchHistory]
          .reverse()
          .find((entry) => entry.courtIndex === courtIndex)

        if (lastMatchOnCourt) {
          const winnerIds =
            lastMatchOnCourt.winningTeam === 'A'
              ? (lastMatchOnCourt.teamAIds ?? [])
              : (lastMatchOnCourt.teamBIds ?? [])
          const ejectedSet = new Set(lastMatchOnCourt.ejectedWinnerIds ?? [])
          const stayingWinnerIds = winnerIds.filter((id) => !ejectedSet.has(id))

          const skipThrone = shouldSkipThroneForGamesGap({
            enforceGap,
            maxAllowedGames,
            stayingWinnerIds,
            getPlayer: (id) => currentPlayers.find((pl) => pl.id === id),
            hasZeroGamesPlayerInPool: availableForCourt.some(
              (p) => (Number(p.gamesPlayed) || 0) === 0
            ),
          })

          if (!skipThrone && stayingWinnerIds.length === 1) {
            generatedCourt = generateCourtAfterScore(effectivePlayers, {
              winnerIds: stayingWinnerIds,
              courtMatchups: courtMatchups ?? [],
              matchHistory,
              courts: numberOfCourts,
            })
          } else if (!skipThrone && stayingWinnerIds.length === 2) {
            generatedCourt = generateCourtAfterScore(effectivePlayers, {
              winnerIds: stayingWinnerIds,
              courtMatchups: courtMatchups ?? [],
              matchHistory,
              courts: numberOfCourts,
            })

            if (!generatedCourt) {
              const w1 = effectivePlayers.find((p) => p.id === stayingWinnerIds[0])
              const w2 = effectivePlayers.find((p) => p.id === stayingWinnerIds[1])
              if (w1 && w2) {
                const primary = selectPrimaryThroneWinner(w1, w2)
                generatedCourt = generateCourtAfterScore(effectivePlayers, {
                  winnerIds: [primary.id],
                  courtMatchups: courtMatchups ?? [],
                  matchHistory,
                  courts: numberOfCourts,
                })
              }
            }
          }
        }
      }

      if (!generatedCourt) {
        const result = generateMatches(effectivePlayers, {
          courts: 1,
          cooldownCourts: numberOfCourts,
          matchHistory,
          excludePlayerIds: otherCourtPlayerIds,
        })
        generatedCourt = result.courts[0] ?? null
      }

      if (!generatedCourt) {
        generatedCourt = generateFallbackCourtByPriority(effectivePlayers, {
          courtIndex,
          courtMatchups: courtMatchups ?? [],
          matchHistory,
          courts: numberOfCourts,
        })
      }

      if (!generatedCourt) {
        const checkedInCount = currentPlayers.filter((player) => player.checkedIn).length
        const eligibleAfterGap = countAvailableEligiblePlayers(
          currentPlayers,
          finalExcludeIds,
          otherCourtPlayerIds
        )
        setErrorModal({
          isOpen: true,
          title: `Could not generate Court ${courtIndex + 1}`,
          message:
            checkedInCount < 4
              ? 'Not enough checked-in players. At least 4 are required.'
              : enforceGap && eligibleAfterGap < 4
                ? 'Games gap limit reached — not enough eligible players with fewer games. Score or refresh other courts so lower-game players can play first.'
                : 'No valid matchup could be generated with current skill groups, cooldown rules, and players assigned to other courts. Try scoring another court first or edit this court manually.',
        })
        return
      }

      const replacedCourt = { ...generatedCourt, courtIndex }
      const nextMatchups = Array.from({ length: numberOfCourts }, (_, index) => {
        if (index === courtIndex) return replacedCourt
        return courtMatchups?.[index] ?? null
      })

      setCourtMatchups(nextMatchups)
      saveV2CourtMatchups(nextMatchups)
    } catch (error) {
      setErrorModal({
        isOpen: true,
        title: `Failed to generate Court ${courtIndex + 1}`,
        message:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred while generating the court.',
      })
    }
  }

  // -- Player checkout (clear from courts) ------------------------------------

  const handlePlayerCheckOut = (playerId) => {
    setPlayers((prev) => {
      const next = prev.map((p) =>
        p.id === playerId ? { ...p, checkedIn: false } : p
      )
      saveV2Players(next)
      return next
    })

    setCourtMatchups((prev) => {
      if (!Array.isArray(prev)) return prev
      const next = prev.map((matchup) => {
        if (!matchup) return matchup
        const hasPlayer =
          matchup.teamA?.some((p) => p.id === playerId) ||
          matchup.teamB?.some((p) => p.id === playerId)
        return hasPlayer ? null : matchup
      })
      saveV2CourtMatchups(next)
      return next
    })
  }

  // -- Edit court modal -----------------------------------------------------

  const handleOpenEditCourt = (courtIndex) => {
    setEditCourtModal({ isOpen: true, courtIndex })
  }

  const handleCloseEditCourt = () => {
    setEditCourtModal({ isOpen: false, courtIndex: null })
  }

  const handleEditCourtSubmit = ({ courtIndex: ci, teamAIds, teamBIds }) => {
    const teamAPlayers = teamAIds
      .map((id) => players.find((p) => p.id === id))
      .filter(Boolean)
    const teamBPlayers = teamBIds
      .map((id) => players.find((p) => p.id === id))
      .filter(Boolean)

    setCourtMatchups((prev) => {
      const next = [...(prev ?? [])]
      next[ci] = { teamA: teamAPlayers, teamB: teamBPlayers }
      return next
    })
    saveV2CourtMatchups(
      courtMatchups.map((m, i) =>
        i === ci ? { teamA: teamAPlayers, teamB: teamBPlayers } : m
      )
    )
    handleCloseEditCourt()
  }

  // -- Score recording -----------------------------------------------------

  const handleOpenScore = (courtIndex) => {
    const matchup = courtMatchups?.[courtIndex]
    if (!matchup?.teamA?.length || !matchup?.teamB?.length) return
    setScoreModal({ isOpen: true, courtIndex })
  }

  const handleCloseScore = () => {
    setScoreModal({ isOpen: false, courtIndex: null })
  }

  const handleCloseErrorModal = () => {
    setErrorModal({ isOpen: false, title: '', message: '' })
  }

  const handleSubmitScore = ({ scoreA, scoreB, enteredBy }) => {
    const { courtIndex } = scoreModal
    const matchup = courtMatchups?.[courtIndex]
    if (!matchup) return

    const teamAIds = matchup.teamA.map((p) => p.id)
    const teamBIds = matchup.teamB.map((p) => p.id)
    const winningTeam = scoreA > scoreB ? 'A' : 'B'
    const isThroneRun = gameType === V2_GAME_TYPES.THRONE_RUN

    let updatedPlayers
    let historyEntry
    let ejectedWinnerIds = []

    if (isThroneRun) {
      const result = trApplyMatchResult(
        players,
        { courtIndex, teamAIds, teamBIds, winningTeam },
        { maxWinStreak: winStreak }
      )
      updatedPlayers = result.players
      historyEntry = result.historyEntry
      ejectedWinnerIds = result.ejectedWinnerIds
    } else {
      const result = applyMatchResult(
        players,
        { courtIndex, teamAIds, teamBIds, winningTeam }
      )
      updatedPlayers = result.players
      historyEntry = result.historyEntry
    }

    if (isThroneRun) {
      const preExistingCooldownIds = new Set(
        players
          .filter((p) => p.medalCooldownCourt === courtIndex && (p.medalCooldownRemaining || 0) > 0)
          .map((p) => p.id)
      )
      if (preExistingCooldownIds.size > 0) {
        updatedPlayers = updatedPlayers.map((p) => {
          if (!preExistingCooldownIds.has(p.id)) return p
          const next = { ...p, medalCooldownRemaining: (p.medalCooldownRemaining || 0) - 1 }
          if (next.medalCooldownRemaining <= 0) {
            next.medalCooldownCourt = null
            next.medalCooldownRemaining = 0
          }
          return next
        })
      }
    }

    setPlayers(updatedPlayers)
    saveV2Players(updatedPlayers)

    const teamAName = matchup.teamA.map((p) => p.name).join(' / ')
    const teamBName = matchup.teamB.map((p) => p.name).join(' / ')
    const enrichedEntry = {
      ...historyEntry,
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `match-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      court: `Court ${courtIndex + 1}`,
      teamA: teamAName,
      teamB: teamBName,
      score: `${scoreA} - ${scoreB}`,
      enteredBy: enteredBy,
      ...(isThroneRun ? { ejectedWinnerIds } : {}),
    }

    const nextHistory = [...matchHistory, enrichedEntry]
    setMatchHistory(nextHistory)
    saveV2MatchHistory(nextHistory)

    const nextMatchups = courtMatchups.map((m, i) =>
      i === courtIndex ? null : m
    )

    setCourtMatchups(nextMatchups)
    saveV2CourtMatchups(nextMatchups)

    handleCloseScore()
  }

  // -- Manual match entry ---------------------------------------------------

  const handleAddManualMatch = ({ court, teamAIds, teamBIds, scoreA, scoreB, enteredBy }) => {
    const winningTeam = scoreA > scoreB ? 'A' : 'B'

    const { players: updatedPlayers, historyEntry } = applyMatchResult(
      players,
      { courtIndex: null, teamAIds, teamBIds, winningTeam }
    )

    setPlayers(updatedPlayers)
    saveV2Players(updatedPlayers)

    const byId = new Map(players.map((p) => [p.id, p]))
    const teamAName = teamAIds.map((id) => byId.get(id)?.name ?? id).join(' / ')
    const teamBName = teamBIds.map((id) => byId.get(id)?.name ?? id).join(' / ')

    const enrichedEntry = {
      ...historyEntry,
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `match-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      court,
      teamA: teamAName,
      teamB: teamBName,
      score: `${scoreA} - ${scoreB}`,
      enteredBy,
    }

    const nextHistory = [...matchHistory, enrichedEntry]
    setMatchHistory(nextHistory)
    saveV2MatchHistory(nextHistory)
  }

  const handleEditMatch = ({
    matchId,
    court,
    teamAIds,
    teamBIds,
    scoreA,
    scoreB,
    enteredBy,
  }) => {
    const matchIndex = matchHistory.findIndex((match) => match.id === matchId)
    if (matchIndex === -1) return

    const oldMatch = matchHistory[matchIndex]
    const winningTeam = scoreA > scoreB ? 'A' : 'B'
    const isThroneRun = gameType === V2_GAME_TYPES.THRONE_RUN
    const useThroneRunEngine =
      isThroneRun &&
      (oldMatch.ejectedWinnerIds != null || oldMatch.courtIndex != null)

    let updatedPlayers = useThroneRunEngine
      ? trRevertMatchResult(players, oldMatch, { maxWinStreak: winStreak })
      : revertMatchResult(players, oldMatch)

    let historyEntry
    let ejectedWinnerIds

    if (useThroneRunEngine) {
      const result = trApplyMatchResult(
        updatedPlayers,
        {
          courtIndex: oldMatch.courtIndex,
          teamAIds,
          teamBIds,
          winningTeam,
        },
        { maxWinStreak: winStreak }
      )
      updatedPlayers = result.players
      historyEntry = result.historyEntry
      ejectedWinnerIds = result.ejectedWinnerIds
    } else {
      const result = applyMatchResult(updatedPlayers, {
        courtIndex: oldMatch.courtIndex ?? null,
        teamAIds,
        teamBIds,
        winningTeam,
      })
      updatedPlayers = result.players
      historyEntry = result.historyEntry
    }

    setPlayers(updatedPlayers)
    saveV2Players(updatedPlayers)

    const byId = new Map(players.map((player) => [player.id, player]))
    const teamAName = teamAIds
      .map((id) => byId.get(id)?.name ?? id)
      .join(' / ')
    const teamBName = teamBIds
      .map((id) => byId.get(id)?.name ?? id)
      .join(' / ')

    const enrichedEntry = {
      ...historyEntry,
      id: matchId,
      court,
      teamA: teamAName,
      teamB: teamBName,
      score: `${scoreA} - ${scoreB}`,
      enteredBy,
      timestamp: oldMatch.timestamp ?? historyEntry.timestamp,
      ...(useThroneRunEngine ? { ejectedWinnerIds } : {}),
    }

    const nextHistory = [...matchHistory]
    nextHistory[matchIndex] = enrichedEntry
    setMatchHistory(nextHistory)
    saveV2MatchHistory(nextHistory)
  }

  // -- Exports --------------------------------------------------------------

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

  // -- Standings sharing ----------------------------------------------------

  const shareStandingsRows = useMemo(
    () =>
      computeStandings(players, matchHistory).sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins
        if (b.pointDifferential !== a.pointDifferential) {
          return b.pointDifferential - a.pointDifferential
        }
        return 0
      }),
    [players, matchHistory]
  )

  const exportStandingsCsv = () => {
    const rows = [
      ['Rank', 'Player', 'Wins', 'Losses', 'PD', 'Games'],
      ...shareStandingsRows.map((player, index) => [
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

  const exportStandingsPdf = () => {
    exportTableAsPdf('Standings', standingsTableRef, 'standings.pdf')
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

  const exportHistoryPdf = () => {
    exportTableAsPdf('Match History', historyTableRef, 'match-history.pdf')
  }

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

  // -- Render --------------------------------------------------------------

  const sessionOverlayMessage = isStartingSession
    ? 'Creating session...'
    : isEndingSession
      ? 'Deleting session...'
      : null

  const pageTitles = {
    setup: 'Game Setup',
    courts: 'Courts',
    players: 'Players',
    history: 'Match History',
    standings: 'Standings',
    docs: 'Documentation',
  }
  const pageTitle = pageTitles[activeView] ?? ''

  const scoreCourtIndex = scoreModal.courtIndex
  const scoreMatchup = courtMatchups?.[scoreCourtIndex] ?? null

  return (
    <>
      <V2Layout
        sidebar={
          <V2Sidebar
            activeView={activeView}
            sessionStarted={sessionStarted}
            onNavigate={handleNavigate}
          />
        }
        sessionOverlay={
          sessionOverlayMessage ? (
            <>
              <div
                className="absolute inset-0 z-10 bg-slate-900/40"
                aria-hidden="true"
              />
              <div className="absolute inset-0 z-20 flex items-center justify-center px-4">
                <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-lg">
                  <p className="text-lg font-semibold text-slate-900">
                    {sessionOverlayMessage}
                  </p>
                </div>
              </div>
            </>
          ) : null
        }
      >
        {pageTitle ? (
          <h1 className="mb-6 text-xl font-semibold text-slate-900 sm:text-2xl">
            {pageTitle}
          </h1>
        ) : null}
        {activeView === 'setup' ? (
          <V2GameSetupPage
            gameType={gameType}
            gameMode={gameMode}
            numberOfCourts={numberOfCourts}
            winStreak={winStreak}
            sessionStarted={sessionStarted}
            isStartingSession={isStartingSession}
            isEndingSession={isEndingSession}
            onSelectGameType={setGameType}
            onSelectGameMode={setGameMode}
            onSelectNumberOfCourts={setNumberOfCourts}
            onSelectWinStreak={setWinStreak}
            onStartSession={handleStartSession}
            onEndSession={handleEndSession}
          />
        ) : activeView === 'courts' ? (
          <>
            <V2CourtsView
              numberOfCourts={numberOfCourts}
              courtMatchups={courtMatchups}
              players={players}
              matchHistory={matchHistory}
              checkedInCount={checkedInCount}
              winStreak={winStreak}
              onGenerateCourt={handleGenerateCourt}
              onEditCourt={handleOpenEditCourt}
              onOpenScore={handleOpenScore}
            />
            <V2EditCourtModal
              isOpen={editCourtModal.isOpen}
              courtIndex={editCourtModal.courtIndex}
              currentTeamA={courtMatchups?.[editCourtModal.courtIndex]?.teamA ?? []}
              currentTeamB={courtMatchups?.[editCourtModal.courtIndex]?.teamB ?? []}
              checkedInPlayers={players.filter((p) => p.checkedIn)}
              onClose={handleCloseEditCourt}
              onSubmit={handleEditCourtSubmit}
            />
            <V2ScoreModal
              isOpen={scoreModal.isOpen}
              courtIndex={scoreCourtIndex}
              teamA={scoreMatchup?.teamA ?? null}
              teamB={scoreMatchup?.teamB ?? null}
              onClose={handleCloseScore}
              onSubmit={handleSubmitScore}
            />
          </>
        ) : activeView === 'players' ? (
          <V2PlayersView onCheckOut={handlePlayerCheckOut} />
        ) : activeView === 'history' ? (
          <V2HistoryView
            matchHistory={matchHistory}
            players={players}
            onAddMatch={handleAddManualMatch}
            onEditMatch={handleEditMatch}
            historyTableRef={historyTableRef}
            exportMenuOpen={exportMenuOpen}
            setExportMenuOpen={setExportMenuOpen}
            onExportCsv={exportHistoryCsv}
            onExportPdf={exportHistoryPdf}
          />
        ) : activeView === 'standings' ? (
          <V2StandingsView
            players={players}
            matchHistory={matchHistory}
            onShare={openStandingsShareModal}
            standingsTableRef={standingsTableRef}
            exportMenuOpen={exportMenuOpen}
            setExportMenuOpen={setExportMenuOpen}
            onExportCsv={exportStandingsCsv}
            onExportPdf={exportStandingsPdf}
          />
        ) : null}
      </V2Layout>

      <ShareStandingsModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        onSaveImage={saveStandingsImage}
        standings={shareStandingsRows}
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

      {errorModal.isOpen ? (
        <>
          <div
            className="fixed inset-0 z-30 bg-slate-900/50"
            aria-hidden="true"
            onClick={handleCloseErrorModal}
          />
          <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="generate-error-title"
              className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            >
              <h2 id="generate-error-title" className="text-lg font-semibold text-slate-900">
                {errorModal.title}
              </h2>
              <p className="mt-2 text-sm text-slate-600">{errorModal.message}</p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={handleCloseErrorModal}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {toastMessage ? (
        <div className="fixed bottom-6 right-6 z-20 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg">
          {toastMessage}
        </div>
      ) : null}
    </>
  )
}
