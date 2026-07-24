import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toJpeg, toPng } from 'html-to-image'
import {
  generateMatches,
  applyMatchResult,
  revertMatchResult,
  PLAYERS_PER_COURT,
} from '../../match-engines/v2/ProgressivePlay.engine'
import {
  refreshProgressivePlayCourt,
  advanceProgressivePlayFreeze,
  captureProgressivePlayFreeze,
  isProgressivePlayFreezeValid,
  materializeFrozenCourt,
} from '../../match-engines/v2/progressivePlayCourtRefresh'
import {
  applyMatchResult as trApplyMatchResult,
  revertMatchResult as trRevertMatchResult,
  generateCourtAfterScore,
  generateFallbackCourtByPriority,
  selectPrimaryThroneWinner,
} from '../../match-engines/v2/ThroneRun.engine'
import {
  generateRoundRobinCourt,
  applyMatchResult as rrApplyMatchResult,
  revertMatchResult as rrRevertMatchResult,
  applyLeagueMatchResult,
  revertLeagueMatchResult,
  syncLeagueLastMatchFields,
  computeRoundRobinMatchupProgress,
  advanceLeagueFreeze,
  buildLeagueDisplayedUpNext,
  captureLeagueFreeze,
  isLeagueFreezeValid,
  materializeLeagueCourtFromQueueHead,
} from '../../match-engines/v2/RoundRobin.engine'
import {
  applyLadderRunMatchResult,
  advanceLadderRunFreeze,
  buildLadderRunUpNextPreview,
  captureLadderRunFreeze,
  generateLadderRunCourt,
  isLadderRunFreezeValid,
  ladderRunOnDeckSize,
  materializeFrozenLadderRunCourt,
  revertLadderRunMatchResult,
} from '../../match-engines/v2/LadderRun.engine'
import {
  applyGamesGapExclusions,
  buildGamesGapExclusions,
  countAvailableEligiblePlayers,
  resolveGapExclusionsForCourtFill,
  shouldSkipThroneForGamesGap,
  shouldYieldThroneToQueue,
} from '../../match-engines/v2/gamesGap'
import ShareStandingsModal from '../ShareStandingsModal'
import { formatStoredMatchDate, sortMatchHistoryChronologically } from '../../formatStoredMatchDate'
import { parseMatchHistoryCsv } from '../../importMatchHistoryCsv'
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
  DEFAULT_V2_ALLOW_ADJACENT_SKILL_MIXING,
  DEFAULT_V2_COURTS,
  DEFAULT_V2_GAME_MODE,
  DEFAULT_V2_GAME_TYPE,
  DEFAULT_V2_SKILL_ADJUSTMENT,
  DEFAULT_V2_WIN_STREAK,
  V2_GAME_TYPES,
  isV2RoundRobinGameType,
  loadV2AllowAdjacentSkillMixing,
  loadV2CourtMatchups,
  loadV2Courts,
  loadV2GameMode,
  loadV2GameType,
  loadV2SkillAdjustment,
  loadV2WinStreak,
  loadV2MatchHistory,
  loadV2Players,
  loadV2SessionStarted,
  persistV2Session,
  saveV2AllowAdjacentSkillMixing,
  saveV2CourtMatchups,
  saveV2MatchHistory,
  saveV2Players,
  saveV2SkillAdjustment,
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
  const [skillAdjustment, setSkillAdjustment] = useState(loadV2SkillAdjustment)
  const [allowAdjacentSkillMixing, setAllowAdjacentSkillMixing] = useState(
    loadV2AllowAdjacentSkillMixing
  )
  const [isStartingSession, setIsStartingSession] = useState(false)
  const [isEndingSession, setIsEndingSession] = useState(false)
  const startTimeoutRef = useRef(null)
  const endTimeoutRef = useRef(null)

  const [players, setPlayers] = useState(() => loadV2Players())
  const [courtMatchups, setCourtMatchups] = useState(() => loadV2CourtMatchups())
  const [matchHistory, setMatchHistory] = useState(() => loadV2MatchHistory())
  // Frozen Up Next block for Progressive Play. Keeps the highlighted on-deck
  // four (and the wider queue block) stable across score entry so Up Next
  // matches what Generate produces. Re-captured only when it becomes invalid
  // (player checks out / lands on a court, court count changes) or consumed.
  const [progressivePlayFreeze, setProgressivePlayFreeze] = useState(null)
  // Frozen Up Next block for Ladder Run. Keeps the queue stable across score
  // entry; new eligible players are appended at the tail only.
  const [ladderRunFreeze, setLadderRunFreeze] = useState(null)
  // Frozen Up Next block for League. Keeps the queue stable across score entry;
  // new eligible players are appended at the tail only.
  const [leagueFreeze, setLeagueFreeze] = useState(null)
  const [scoreModal, setScoreModal] = useState({
    isOpen: false,
  courtIndex: null,
  })
  const [errorModal, setErrorModal] = useState({
    isOpen: false,
    title: '',
    message: '',
  })
  const [noticeModal, setNoticeModal] = useState({
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

  // Keep the Progressive Play Up Next freeze captured and valid. Re-capture
  // only when it is missing or invalidated (court count change, a frozen player
  // checks out or lands on a court). Score entry never invalidates the block,
  // so the highlighted on-deck players stay put until Generate consumes them.
  useEffect(() => {
    if (gameType !== V2_GAME_TYPES.PROGRESSIVE_PLAY) {
      setProgressivePlayFreeze((prev) => (prev === null ? prev : null))
      return
    }
    const roster = loadV2Players()
    const valid =
      progressivePlayFreeze &&
      progressivePlayFreeze.numberOfCourts === numberOfCourts &&
      isProgressivePlayFreezeValid(progressivePlayFreeze, roster, courtMatchups)
    if (valid) return
    const next = captureProgressivePlayFreeze(roster, {
      courtMatchups: courtMatchups ?? [],
      numberOfCourts,
      matchHistory,
      allowAdjacentSkillMixing,
    })
    setProgressivePlayFreeze((prev) => {
      if (prev === null && next === null) return prev
      return next
    })
  }, [
    gameType,
    numberOfCourts,
    courtMatchups,
    players,
    matchHistory,
    allowAdjacentSkillMixing,
    progressivePlayFreeze,
  ])

  useEffect(() => {
    if (gameType !== V2_GAME_TYPES.LADDER_RUN) {
      setLadderRunFreeze((prev) => (prev === null ? prev : null))
      return
    }
    const roster = loadV2Players()
    const preview = buildLadderRunUpNextPreview(roster, {
      courtMatchups: courtMatchups ?? [],
      numberOfCourts,
      gameMode,
      matchHistory,
      allowAdjacentSkillMixing,
    })
    const onDeckSize = ladderRunOnDeckSize(gameMode)
    const freezeUndersized =
      ladderRunFreeze &&
      (ladderRunFreeze.queueIds?.length ?? 0) < onDeckSize &&
      (preview.queue?.length ?? 0) >= onDeckSize
    const valid =
      ladderRunFreeze &&
      !freezeUndersized &&
      ladderRunFreeze.numberOfCourts === numberOfCourts &&
      ladderRunFreeze.gameMode === gameMode &&
      isLadderRunFreezeValid(ladderRunFreeze, roster, courtMatchups, {
        numberOfCourts,
        gameMode,
      })
    if (valid) return
    const next = captureLadderRunFreeze(roster, {
      courtMatchups: courtMatchups ?? [],
      numberOfCourts,
      gameMode,
      matchHistory,
      allowAdjacentSkillMixing,
    })
    setLadderRunFreeze((prev) => {
      if (prev === null && next === null) return prev
      return next
    })
  }, [
    gameType,
    gameMode,
    numberOfCourts,
    courtMatchups,
    players,
    matchHistory,
    allowAdjacentSkillMixing,
    ladderRunFreeze,
  ])

  useEffect(() => {
    if (gameType !== V2_GAME_TYPES.LEAGUE) {
      setLeagueFreeze((prev) => (prev === null ? prev : null))
      return
    }
    const roster = loadV2Players()
    const valid =
      leagueFreeze &&
      leagueFreeze.numberOfCourts === numberOfCourts &&
      leagueFreeze.gameMode === gameMode &&
      isLeagueFreezeValid(leagueFreeze, roster, courtMatchups, {
        numberOfCourts,
        gameMode,
        matchHistory,
      })
    if (valid) return
    const next = captureLeagueFreeze(roster, {
      courtMatchups: courtMatchups ?? [],
      numberOfCourts,
      gameMode,
      matchHistory,
    })
    setLeagueFreeze((prev) => {
      if (prev === null && next === null) return prev
      return next
    })
  }, [
    gameType,
    gameMode,
    numberOfCourts,
    courtMatchups,
    players,
    matchHistory,
    leagueFreeze,
  ])

  useEffect(() => {
    if (gameType !== V2_GAME_TYPES.LEAGUE) return
    if (!Array.isArray(matchHistory) || matchHistory.length === 0) return

    const playedPlayerIds = new Set()
    matchHistory.forEach((entry) => {
      ;(entry.teamAIds ?? []).forEach((id) => playedPlayerIds.add(id))
      ;(entry.teamBIds ?? []).forEach((id) => playedPlayerIds.add(id))
    })

    if (playedPlayerIds.size === 0) return
    const needsBackfill = players.some(
      (player) => playedPlayerIds.has(player.id) && !player.lastMatch
    )
    if (!needsBackfill) return

    const syncedPlayers = syncLeagueLastMatchFields(players, matchHistory)
    setPlayers(syncedPlayers)
    saveV2Players(syncedPlayers)
  }, [gameType, numberOfCourts, matchHistory, players])

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
    if (typeof window === 'undefined') return
    saveV2SkillAdjustment(skillAdjustment)
  }, [skillAdjustment])

  useEffect(() => {
    if (typeof window === 'undefined') return
    saveV2AllowAdjacentSkillMixing(allowAdjacentSkillMixing)
  }, [allowAdjacentSkillMixing])

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
        skillAdjustment,
        allowAdjacentSkillMixing,
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
      setSkillAdjustment(DEFAULT_V2_SKILL_ADJUSTMENT)
      setAllowAdjacentSkillMixing(DEFAULT_V2_ALLOW_ADJACENT_SKILL_MIXING)
      setPlayers([])
      setCourtMatchups(null)
      setMatchHistory([])
      setProgressivePlayFreeze(null)
      setLadderRunFreeze(null)
      setLeagueFreeze(null)
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

  const showRoundRobinCompleteModal = () => {
    setErrorModal({
      isOpen: true,
      title: 'All Round Robin match ups have been generated',
      message: 'There are no more remaining match ups.',
    })
  }

  const isRoundRobinComplete = (playerList) => {
    if (!isV2RoundRobinGameType(gameType)) return false
    const { remaining, total } = computeRoundRobinMatchupProgress(playerList, {
      gameMode,
    })
    return total > 0 && remaining === 0
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

    if (isRoundRobinComplete(loadV2Players())) {
      showRoundRobinCompleteModal()
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

      const isRoundRobin = isV2RoundRobinGameType(gameType)
      const isLeague = gameType === V2_GAME_TYPES.LEAGUE

      if (isLeague) {
        const { queue } = buildLeagueDisplayedUpNext(currentPlayers, leagueFreeze, {
          courtMatchups: courtMatchups ?? [],
          numberOfCourts,
          gameMode,
          matchHistory,
        })
        const refreshQueue = queue.filter((player) => !otherCourtIdSet.has(player.id))
        generatedCourt = materializeLeagueCourtFromQueueHead(refreshQueue, {
          gameMode,
          courtIndex,
        })
      } else if (isRoundRobin) {
        generatedCourt = generateRoundRobinCourt(effectivePlayers, {
          courtIndex,
          courtMatchups: courtMatchups ?? [],
          matchHistory,
          courts: numberOfCourts,
          gameMode,
          excludePlayerIds: otherCourtPlayerIds,
        })
      }

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
          const loserIds =
            lastMatchOnCourt.winningTeam === 'A'
              ? (lastMatchOnCourt.teamBIds ?? [])
              : (lastMatchOnCourt.teamAIds ?? [])

          const getPlayer = (id) => currentPlayers.find((pl) => pl.id === id)

          const skipThrone = shouldSkipThroneForGamesGap({
            enforceGap,
            maxAllowedGames,
            stayingWinnerIds,
            getPlayer,
            hasZeroGamesPlayerInPool: availableForCourt.some(
              (p) => (Number(p.gamesPlayed) || 0) === 0
            ),
          })

          const yieldThrone = shouldYieldThroneToQueue({
            stayingWinnerIds,
            getPlayer,
            availablePlayers: availableForCourt,
            lastMatchPlayerIds: [...winnerIds, ...loserIds],
          })

          const skipThroneFinal = skipThrone || yieldThrone

          if (!skipThroneFinal && stayingWinnerIds.length === 1) {
            generatedCourt = generateCourtAfterScore(effectivePlayers, {
              winnerIds: stayingWinnerIds,
              courtMatchups: courtMatchups ?? [],
              matchHistory,
              courts: numberOfCourts,
            })
          } else if (!skipThroneFinal && stayingWinnerIds.length === 2) {
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

      let preferredPlayers = []

      if (!generatedCourt && !isRoundRobin) {
        if (gameType === V2_GAME_TYPES.PROGRESSIVE_PLAY) {
          const freezeUsable =
            progressivePlayFreeze &&
            progressivePlayFreeze.numberOfCourts === numberOfCourts &&
            isProgressivePlayFreezeValid(
              progressivePlayFreeze,
              currentPlayers,
              courtMatchups ?? []
            )

          if (freezeUsable) {
            generatedCourt = materializeFrozenCourt(
              progressivePlayFreeze,
              currentPlayers,
              { matchHistory, allowAdjacentSkillMixing }
            )
          }

          if (!generatedCourt) {
            const refresh = refreshProgressivePlayCourt(currentPlayers, {
              courtIndex,
              courtMatchups: courtMatchups ?? [],
              numberOfCourts,
              matchHistory,
              allowAdjacentSkillMixing,
              medalExcludeIds,
            })
            generatedCourt = refresh.court
            preferredPlayers = refresh.preferred
          }
        } else if (gameType === V2_GAME_TYPES.LADDER_RUN) {
          const freezeUsable =
            ladderRunFreeze &&
            ladderRunFreeze.numberOfCourts === numberOfCourts &&
            ladderRunFreeze.gameMode === gameMode &&
            isLadderRunFreezeValid(ladderRunFreeze, currentPlayers, courtMatchups ?? [], {
              numberOfCourts,
              gameMode,
            })

          if (freezeUsable) {
            generatedCourt = materializeFrozenLadderRunCourt(
              ladderRunFreeze,
              currentPlayers,
              {
                gameMode,
                courtIndex,
                allowAdjacentSkillMixing,
              }
            )
          }

          if (!generatedCourt) {
            generatedCourt = generateLadderRunCourt(currentPlayers, {
              numberOfCourts,
              gameMode,
              allowAdjacentSkillMixing,
              courtMatchups: courtMatchups ?? [],
              matchHistory,
              courtIndex,
            })
          }
        } else {
          const result = generateMatches(effectivePlayers, {
            courts: 1,
            cooldownCourts: numberOfCourts,
            matchHistory,
            excludePlayerIds: otherCourtPlayerIds,
            allowAdjacentSkillMixing,
          })
          generatedCourt = result.courts[0] ?? null
        }
      }

      const strictMixing =
        gameType === V2_GAME_TYPES.PROGRESSIVE_PLAY && !allowAdjacentSkillMixing

      if (
        !generatedCourt &&
        !strictMixing &&
        !isRoundRobin &&
        gameType !== V2_GAME_TYPES.PROGRESSIVE_PLAY &&
        gameType !== V2_GAME_TYPES.LADDER_RUN
      ) {
        generatedCourt = generateFallbackCourtByPriority(effectivePlayers, {
          courtIndex,
          courtMatchups: courtMatchups ?? [],
          matchHistory,
          courts: numberOfCourts,
        })
      }

      if (!generatedCourt) {
        if (isRoundRobin && isRoundRobinComplete(currentPlayers)) {
          showRoundRobinCompleteModal()
          return
        }

        const checkedInCount = currentPlayers.filter((player) => player.checkedIn).length
        const eligibleAfterGap = countAvailableEligiblePlayers(
          currentPlayers,
          finalExcludeIds,
          otherCourtPlayerIds
        )
        const minPlayers = isRoundRobin && gameMode === 'singles' ? 2 : 4
        setErrorModal({
          isOpen: true,
          title: `Could not generate Court ${courtIndex + 1}`,
          message:
            checkedInCount < minPlayers
              ? `Not enough checked-in players. At least ${minPlayers} are required.`
              : gameType === V2_GAME_TYPES.LADDER_RUN
                ? 'Not enough players in Up Next to fill this court.'
              : enforceGap && eligibleAfterGap < minPlayers
                ? 'Games gap limit reached — not enough eligible players with fewer games. Score or refresh other courts so lower-game players can play first.'
                : strictMixing
                  ? 'Not enough players of the same skill level to fill a court. Turn on Adjacent Skill Mixing or check in more players at one level.'
                  : isRoundRobin
                    ? 'No valid matchup could be generated with current cooldown rules and players assigned to other courts. Try scoring another court first or edit this court manually.'
                    : 'No valid matchup could be generated with current skill groups, cooldown rules, and players assigned to other courts. Try scoring another court first or edit this court manually.',
        })
        return
      }

      const repeatPartnersUsed = Boolean(generatedCourt?.hasRepeatPartners)
      const { hasRepeatPartners: _repeatFlag, ...courtPayload } = generatedCourt ?? {}
      const replacedCourt = { ...courtPayload, courtIndex }
      const nextMatchups = Array.from({ length: numberOfCourts }, (_, index) => {
        if (index === courtIndex) return replacedCourt
        return courtMatchups?.[index] ?? null
      })

      setCourtMatchups(nextMatchups)
      saveV2CourtMatchups(nextMatchups)

      if (repeatPartnersUsed) {
        setNoticeModal({
          isOpen: true,
          title: 'Match already played',
          message:
            'These players have no fresh teammate combinations left. The court was still generated using a previous pairing.',
        })
      }

      if (gameType === V2_GAME_TYPES.PROGRESSIVE_PLAY && progressivePlayFreeze) {
        const generatedIds = [
          ...generatedCourt.teamA,
          ...generatedCourt.teamB,
        ].map((player) => player.id)
        const nextFreeze = advanceProgressivePlayFreeze(
          progressivePlayFreeze,
          generatedIds,
          currentPlayers,
          {
            courtMatchups: nextMatchups,
            numberOfCourts,
            matchHistory,
            allowAdjacentSkillMixing,
          }
        )
        setProgressivePlayFreeze(nextFreeze)
      }

      if (gameType === V2_GAME_TYPES.LADDER_RUN && ladderRunFreeze) {
        const generatedIds = [
          ...generatedCourt.teamA,
          ...generatedCourt.teamB,
        ].map((player) => player.id)
        const nextFreeze = advanceLadderRunFreeze(
          ladderRunFreeze,
          generatedIds,
          currentPlayers,
          {
            courtMatchups: nextMatchups,
            numberOfCourts,
            gameMode,
            matchHistory,
            allowAdjacentSkillMixing,
          }
        )
        setLadderRunFreeze(nextFreeze)
      }

      if (gameType === V2_GAME_TYPES.LEAGUE && leagueFreeze) {
        const generatedIds = [
          ...generatedCourt.teamA,
          ...generatedCourt.teamB,
        ].map((player) => player.id)
        const nextFreeze = advanceLeagueFreeze(
          leagueFreeze,
          generatedIds,
          currentPlayers,
          {
            courtMatchups: nextMatchups,
            numberOfCourts,
            gameMode,
            matchHistory,
          }
        )
        setLeagueFreeze(nextFreeze)
      }
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

  const handleCloseNoticeModal = () => {
    setNoticeModal({ isOpen: false, title: '', message: '' })
  }

  const handleSubmitScore = ({ scoreA, scoreB, enteredBy }) => {
    const { courtIndex } = scoreModal
    const matchup = courtMatchups?.[courtIndex]
    if (!matchup) return

    const teamAIds = matchup.teamA.map((p) => p.id)
    const teamBIds = matchup.teamB.map((p) => p.id)
    const winningTeam = scoreA > scoreB ? 'A' : 'B'
    const isThroneRun = gameType === V2_GAME_TYPES.THRONE_RUN
    const isRoundRobin = isV2RoundRobinGameType(gameType)
    const isLeague = gameType === V2_GAME_TYPES.LEAGUE
    const isLadderRun = gameType === V2_GAME_TYPES.LADDER_RUN

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
    } else if (isRoundRobin) {
      const result = isLeague
        ? applyLeagueMatchResult(
            players,
            {
              courtIndex,
              teamAIds,
              teamBIds,
              winningTeam,
            },
            { numberOfCourts }
          )
        : rrApplyMatchResult(players, {
            courtIndex,
            teamAIds,
            teamBIds,
            winningTeam,
          })
      updatedPlayers = result.players
      historyEntry = result.historyEntry
    } else if (isLadderRun) {
      const result = applyLadderRunMatchResult(players, {
        courtIndex,
        teamAIds,
        teamBIds,
        winningTeam,
      }, { skillAdjustment })
      updatedPlayers = result.players
      historyEntry = result.historyEntry
    } else {
      const result = applyMatchResult(
        players,
        { courtIndex, teamAIds, teamBIds, winningTeam },
        { skillAdjustment }
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

    if (isLeague && leagueFreeze) {
      const scoredIds = [...teamAIds, ...teamBIds]
      const nextFreeze = advanceLeagueFreeze(
        leagueFreeze,
        scoredIds,
        updatedPlayers,
        {
          courtMatchups: nextMatchups,
          numberOfCourts,
          gameMode,
          matchHistory: nextHistory,
        }
      )
      setLeagueFreeze(nextFreeze)
    }

    if (isRoundRobinComplete(updatedPlayers)) {
      showRoundRobinCompleteModal()
    }

    handleCloseScore()
  }

  // -- Manual match entry ---------------------------------------------------

  const handleAddManualMatch = ({ court, teamAIds, teamBIds, scoreA, scoreB, enteredBy }) => {
    const winningTeam = scoreA > scoreB ? 'A' : 'B'
    const isRoundRobin = isV2RoundRobinGameType(gameType)
    const isLadderRun = gameType === V2_GAME_TYPES.LADDER_RUN

    const { players: updatedPlayers, historyEntry } = isRoundRobin
      ? rrApplyMatchResult(players, {
          courtIndex: null,
          teamAIds,
          teamBIds,
          winningTeam,
        })
      : isLadderRun
        ? applyLadderRunMatchResult(players, {
            courtIndex: null,
            teamAIds,
            teamBIds,
            winningTeam,
          }, { skillAdjustment })
        : applyMatchResult(
            players,
            { courtIndex: null, teamAIds, teamBIds, winningTeam },
            { skillAdjustment }
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

    if (isRoundRobinComplete(updatedPlayers)) {
      showRoundRobinCompleteModal()
    }
  }

  const handleImportMatchHistory = async (file) => {
    if (!file) return

    const text = await file.text()
    const { matches, error } = parseMatchHistoryCsv(text, { players })

    if (error) {
      setToastMessage(error)
      return
    }

    let currentPlayers = players
    const importedEntries = []
    const isRoundRobin = isV2RoundRobinGameType(gameType)
    const isLeague = gameType === V2_GAME_TYPES.LEAGUE
    const isLadderRun = gameType === V2_GAME_TYPES.LADDER_RUN

    matches.forEach((match) => {
      const winningTeam = match.scoreA > match.scoreB ? 'A' : 'B'
      const { players: updatedPlayers, historyEntry } = isRoundRobin
        ? isLeague
          ? applyLeagueMatchResult(
              currentPlayers,
              {
                courtIndex: null,
                teamAIds: match.teamAIds,
                teamBIds: match.teamBIds,
                winningTeam,
              },
              { numberOfCourts }
            )
          : rrApplyMatchResult(currentPlayers, {
              courtIndex: null,
              teamAIds: match.teamAIds,
              teamBIds: match.teamBIds,
              winningTeam,
            })
        : isLadderRun
          ? applyLadderRunMatchResult(currentPlayers, {
              courtIndex: null,
              teamAIds: match.teamAIds,
              teamBIds: match.teamBIds,
              winningTeam,
            }, { skillAdjustment })
          : applyMatchResult(
              currentPlayers,
              {
                courtIndex: null,
                teamAIds: match.teamAIds,
                teamBIds: match.teamBIds,
                winningTeam,
              },
              { skillAdjustment }
            )

      currentPlayers = updatedPlayers
      importedEntries.push({
        ...historyEntry,
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `match-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        court: match.court,
        teamA: match.teamA,
        teamB: match.teamB,
        score: `${match.scoreA} - ${match.scoreB}`,
        enteredBy: match.enteredBy,
        timestamp: match.timestamp ?? historyEntry.timestamp,
      })
    })

    if (isLeague) {
      const nextHistory = [...matchHistory, ...importedEntries]
      currentPlayers = syncLeagueLastMatchFields(currentPlayers, nextHistory)
    }

    setPlayers(currentPlayers)
    saveV2Players(currentPlayers)

    const nextHistory = [...matchHistory, ...importedEntries]
    setMatchHistory(nextHistory)
    saveV2MatchHistory(nextHistory)

    setToastMessage(
      `Imported ${importedEntries.length} match${
        importedEntries.length === 1 ? '' : 'es'
      }`
    )

    if (isRoundRobinComplete(currentPlayers)) {
      showRoundRobinCompleteModal()
    }
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
    const isRoundRobin = isV2RoundRobinGameType(gameType)
    const isLeague = gameType === V2_GAME_TYPES.LEAGUE
    const isLadderRun = gameType === V2_GAME_TYPES.LADDER_RUN
    const useThroneRunEngine =
      isThroneRun &&
      (oldMatch.ejectedWinnerIds != null || oldMatch.courtIndex != null)

    let updatedPlayers = useThroneRunEngine
      ? trRevertMatchResult(players, oldMatch, { maxWinStreak: winStreak })
      : isRoundRobin
        ? isLeague
          ? revertLeagueMatchResult(players, oldMatch, {
              numberOfCourts,
              matchHistory,
            })
          : rrRevertMatchResult(players, oldMatch)
        : isLadderRun
          ? revertLadderRunMatchResult(players, oldMatch, { skillAdjustment })
        : revertMatchResult(players, oldMatch, { skillAdjustment })

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
    } else if (isRoundRobin) {
      const result = isLeague
        ? applyLeagueMatchResult(
            updatedPlayers,
            {
              courtIndex: oldMatch.courtIndex ?? null,
              teamAIds,
              teamBIds,
              winningTeam,
            },
            { numberOfCourts }
          )
        : rrApplyMatchResult(updatedPlayers, {
            courtIndex: oldMatch.courtIndex ?? null,
            teamAIds,
            teamBIds,
            winningTeam,
          })
      updatedPlayers = result.players
      historyEntry = result.historyEntry
    } else if (isLadderRun) {
      const result = applyLadderRunMatchResult(updatedPlayers, {
        courtIndex: oldMatch.courtIndex ?? null,
        teamAIds,
        teamBIds,
        winningTeam,
      }, { skillAdjustment })
      updatedPlayers = result.players
      historyEntry = result.historyEntry
    } else {
      const result = applyMatchResult(
        updatedPlayers,
        {
          courtIndex: oldMatch.courtIndex ?? null,
          teamAIds,
          teamBIds,
          winningTeam,
        },
        { skillAdjustment }
      )
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

    if (isRoundRobinComplete(updatedPlayers)) {
      showRoundRobinCompleteModal()
    }
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
      ['Court', 'Team A', 'Team B', 'Score', 'Verified By', 'Date & Time'],
      ...sortMatchHistoryChronologically(matchHistory).map((match) => [
        match.court,
        match.teamA,
        match.teamB,
        match.score,
        match.enteredBy || '',
        formatStoredMatchDate(match.timestamp),
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
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
              {pageTitle}
            </h1>
            {activeView === 'courts' &&
            (gameType === V2_GAME_TYPES.PROGRESSIVE_PLAY ||
              gameType === V2_GAME_TYPES.LADDER_RUN) ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <label className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Skill Adjustment: {skillAdjustment}
                </label>
                <label className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Adjacent Skill Mixing: {allowAdjacentSkillMixing ? 'On' : 'Off'}
                </label>
              </div>
            ) : null}
          </div>
        ) : null}
        {activeView === 'setup' ? (
          <V2GameSetupPage
            gameType={gameType}
            gameMode={gameMode}
            numberOfCourts={numberOfCourts}
            winStreak={winStreak}
            skillAdjustment={skillAdjustment}
            allowAdjacentSkillMixing={allowAdjacentSkillMixing}
            sessionStarted={sessionStarted}
            isStartingSession={isStartingSession}
            isEndingSession={isEndingSession}
            onSelectGameType={setGameType}
            onSelectGameMode={setGameMode}
            onSelectNumberOfCourts={setNumberOfCourts}
            onSelectWinStreak={setWinStreak}
            onSelectSkillAdjustment={setSkillAdjustment}
            onToggleAdjacentSkillMixing={setAllowAdjacentSkillMixing}
            onStartSession={handleStartSession}
            onEndSession={handleEndSession}
          />
        ) : activeView === 'courts' ? (
          <>
            <V2CourtsView
              gameType={gameType}
              gameMode={gameMode}
              numberOfCourts={numberOfCourts}
              courtMatchups={courtMatchups}
              players={players}
              matchHistory={matchHistory}
              checkedInCount={checkedInCount}
              winStreak={winStreak}
              skillAdjustment={skillAdjustment}
              allowAdjacentSkillMixing={allowAdjacentSkillMixing}
              progressivePlayFreeze={progressivePlayFreeze}
              ladderRunFreeze={ladderRunFreeze}
              leagueFreeze={leagueFreeze}
              onGenerateCourt={handleGenerateCourt}
              onEditCourt={handleOpenEditCourt}
              onOpenScore={handleOpenScore}
            />
            <V2EditCourtModal
              isOpen={editCourtModal.isOpen}
              courtIndex={editCourtModal.courtIndex}
              gameMode={gameMode}
              gameType={gameType}
              currentTeamA={courtMatchups?.[editCourtModal.courtIndex]?.teamA ?? []}
              currentTeamB={courtMatchups?.[editCourtModal.courtIndex]?.teamB ?? []}
              checkedInPlayers={players.filter((p) => p.checkedIn)}
              allowAdjacentSkillMixing={allowAdjacentSkillMixing}
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
            onImportMatchHistory={handleImportMatchHistory}
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

      {noticeModal.isOpen ? (
        <>
          <div
            className="fixed inset-0 z-30 bg-slate-900/50"
            aria-hidden="true"
            onClick={handleCloseNoticeModal}
          />
          <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="generate-notice-title"
              className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-xl"
            >
              <h2 id="generate-notice-title" className="text-lg font-semibold text-slate-900">
                {noticeModal.title}
              </h2>
              <p className="mt-2 text-sm text-slate-600">{noticeModal.message}</p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={handleCloseNoticeModal}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

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
