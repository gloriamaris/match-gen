import React, { useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Pencil, RefreshCw } from 'lucide-react'
import {
  buildLadderRunUpNextPreview,
  getLadderRunCooldownIds,
  getPlayerLastResult,
  isLadderRunFreezeValid,
  ladderRunOnDeckSize,
} from '../../match-engines/v2/LadderRun.engine'
import {
  getCooldownIds,
} from '../../match-engines/v2/ProgressivePlay.engine'
import {
  buildProgressivePlayUpNextPreview,
  isProgressivePlayFreezeValid,
  mergeFrozenUpNextDisplay,
} from '../../match-engines/v2/progressivePlayCourtRefresh'
import { computeRoundRobinMatchupProgress, buildLeagueUpNextPreview, isLeagueFreezeValid, leagueOnDeckSize } from '../../match-engines/v2/RoundRobin.engine'
import {
  isV2CourtsQueueUiGameType,
  isV2RoundRobinGameType,
  loadV2Players,
  V2_GAME_TYPES,
} from './v2Storage'

const SKILL_RANK = {
  beginner: 0,
  novice: 1,
  intermediate: 2,
  advanced: 3,
}

const SKILL_STARS_BY_LEVEL = {
  beginner: '⭐',
  novice: '⭐⭐',
  intermediate: '⭐⭐⭐',
  advanced: '⭐⭐⭐⭐',
}

const SKILL_LEVEL_ORDER = ['beginner', 'novice', 'intermediate', 'advanced']

const getGridClasses = (visibleCount) => {
  if (visibleCount <= 1) return 'grid gap-6 grid-cols-1'
  if (visibleCount === 2) return 'grid gap-6 md:grid-cols-2'
  if (visibleCount === 3) return 'grid gap-6 md:grid-cols-2 xl:grid-cols-3'
  return 'grid gap-6 md:grid-cols-2 xl:grid-cols-3'
}

const noop = () => {}

const normalizeSkillLevel = (skillLevel) =>
  String(skillLevel ?? '').trim().toLowerCase()

const getNormalizedSkillLevel = (player) => {
  const key = normalizeSkillLevel(player?.skillLevel)
  return SKILL_RANK[key] !== undefined ? key : 'beginner'
}

const getSkillLabel = (skillLevel) => {
  const normalized = normalizeSkillLevel(skillLevel)
  if (!normalized) return 'Beginner'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

const sortPlayersByGamesAndQueue = (a, b) => {
  const gamesDiff =
    (Number(a.gamesPlayed) || 0) - (Number(b.gamesPlayed) || 0)
  if (gamesDiff !== 0) return gamesDiff
  return (Number(a.queueOrder) || 0) - (Number(b.queueOrder) || 0)
}

const sortPlayersByQueueOrderOldestFirst = (a, b) => {
  const aQueueOrder = Number.isFinite(Number(a.queueOrder))
    ? Number(a.queueOrder)
    : Number.POSITIVE_INFINITY
  const bQueueOrder = Number.isFinite(Number(b.queueOrder))
    ? Number(b.queueOrder)
    : Number.POSITIVE_INFINITY
  if (aQueueOrder !== bQueueOrder) return aQueueOrder - bQueueOrder
  return String(a.name ?? '').localeCompare(String(b.name ?? ''))
}

const groupPlayersBySkillLevel = (playerList, { preserveOrder = false } = {}) =>
  SKILL_LEVEL_ORDER.map((skillLevel) => {
    const players = playerList.filter(
      (player) => getNormalizedSkillLevel(player) === skillLevel
    )
    return {
      skillLevel,
      label: getSkillLabel(skillLevel),
      stars: SKILL_STARS_BY_LEVEL[skillLevel],
      players: preserveOrder
        ? players
        : [...players].sort(sortPlayersByGamesAndQueue),
    }
  }).filter((group) => group.players.length > 0)

const getTeamSkillStars = (teamPlayers) => {
  if (!Array.isArray(teamPlayers) || teamPlayers.length === 0) {
    return SKILL_STARS_BY_LEVEL.beginner
  }

  const highestSkillLevel = teamPlayers.reduce((currentHighest, player) => {
    const candidateLevel = normalizeSkillLevel(player?.skillLevel)
    const candidateRank = SKILL_RANK[candidateLevel] ?? SKILL_RANK.beginner
    const currentRank = SKILL_RANK[currentHighest] ?? SKILL_RANK.beginner
    return candidateRank > currentRank ? candidateLevel : currentHighest
  }, 'beginner')

  return SKILL_STARS_BY_LEVEL[highestSkillLevel] ?? SKILL_STARS_BY_LEVEL.beginner
}

function V2PlayerStatusGroups({
  groups,
  groupHeadingClassName,
  chipClassName,
  gamesClassName,
}) {
  return (
    <div className="mt-2 space-y-3">
      {groups.map((group) => {
        const hasHeading = Boolean(group.label) || Boolean(group.stars)
        return (
          <div key={group.skillLevel}>
            {hasHeading ? (
              <p
                className={`text-[11px] font-semibold uppercase tracking-wide ${groupHeadingClassName}`}
              >
                {group.label} {group.stars}
              </p>
            ) : null}
            <div className={`${hasHeading ? 'mt-1.5 ' : ''}flex flex-wrap gap-1.5`}>
              {group.players.map((player) => (
                <span key={player.id} className={chipClassName}>
                  {player.name}
                  <span className={gamesClassName}>
                    ({Number(player.gamesPlayed) || 0})
                  </span>
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function V2CourtsView({
  gameType,
  gameMode = 'doubles',
  numberOfCourts,
  courtMatchups,
  players = [],
  matchHistory = [],
  checkedInCount = 0,
  winStreak = 0,
  skillAdjustment = 1,
  allowAdjacentSkillMixing = true,
  progressivePlayFreeze = null,
  ladderRunFreeze = null,
  leagueFreeze = null,
  onGenerateCourt = noop,
  onEditCourt = noop,
  onOpenScore = noop,
}) {
  const minPlayers = gameMode === 'singles' ? 2 : 4
  const [isUpNextExpanded, setIsUpNextExpanded] = useState(true)
  if (numberOfCourts <= 0) {
    return null
  }

  // Compute players currently on courts vs sitting out
  const onCourtIds = new Set()
  ;(courtMatchups ?? []).forEach((matchup) => {
    if (!matchup) return
    matchup.teamA?.forEach((p) => onCourtIds.add(p.id))
    matchup.teamB?.forEach((p) => onCourtIds.add(p.id))
  })

  const checkedInPlayers = players.filter((p) => p.checkedIn)
  const isRoundRobin = isV2RoundRobinGameType(gameType)
  const isLeague = gameType === V2_GAME_TYPES.LEAGUE
  const isLadderRun = gameType === V2_GAME_TYPES.LADDER_RUN
  const isCourtsQueueUi = isV2CourtsQueueUiGameType(gameType)
  const roundRobinProgress = useMemo(
    () =>
      isRoundRobin
        ? computeRoundRobinMatchupProgress(players, { gameMode })
        : null,
    [isRoundRobin, players, gameMode]
  )
  const cooldownIds = isLadderRun
    ? getLadderRunCooldownIds(matchHistory)
    : getCooldownIds(matchHistory, numberOfCourts)
  const playingPlayers = checkedInPlayers.filter((p) => onCourtIds.has(p.id))
  const cooldownPlayers = checkedInPlayers.filter(
    (p) => !onCourtIds.has(p.id) && cooldownIds.has(p.id)
  )
  const sittingOutPlayers = checkedInPlayers.filter(
    (p) => !onCourtIds.has(p.id) && !cooldownIds.has(p.id)
  )
  const playingGroups = groupPlayersBySkillLevel(playingPlayers)
  const sittingOutGroups = groupPlayersBySkillLevel(sittingOutPlayers)
  const cooldownGroups = groupPlayersBySkillLevel(cooldownPlayers)

  // Preview uses the same refresh path as Generate for the first empty court.
  const rosterPlayers = loadV2Players()
  const isProgressivePlay = gameType === V2_GAME_TYPES.PROGRESSIVE_PLAY
  const upNextPreview = isProgressivePlay
    ? buildProgressivePlayUpNextPreview(rosterPlayers, {
        courtMatchups,
        numberOfCourts,
        matchHistory,
        allowAdjacentSkillMixing,
      })
    : null

  const ladderRunPreview = isLadderRun
    ? buildLadderRunUpNextPreview(rosterPlayers, {
        numberOfCourts,
        gameMode,
        allowAdjacentSkillMixing,
        courtMatchups,
        matchHistory,
      })
    : null

  const leaguePreview = isLeague
    ? buildLeagueUpNextPreview(rosterPlayers, {
        numberOfCourts,
        gameMode,
        courtMatchups,
        matchHistory,
      })
    : null

  // When a valid freeze exists, the frozen block leads the queue and only the
  // tail below it re-sorts. Otherwise fall back to the live preview ordering.
  const progressiveFreezeActive =
    isProgressivePlay &&
    isProgressivePlayFreezeValid(progressivePlayFreeze, rosterPlayers, courtMatchups)
  const ladderRunFreezeActive =
    isLadderRun &&
    isLadderRunFreezeValid(ladderRunFreeze, rosterPlayers, courtMatchups, {
      numberOfCourts,
      gameMode,
    })
  const leagueFreezeActive =
    isLeague &&
    isLeagueFreezeValid(leagueFreeze, rosterPlayers, courtMatchups, {
      numberOfCourts,
      gameMode,
    })
  const ladderRunMaxSlots =
    Math.max(numberOfCourts, 1) * (gameMode === 'singles' ? 2 : 4)
  const progressiveMaxSlots = Math.max(numberOfCourts, 1) * 4
  const leagueMaxSlots =
    Math.max(numberOfCourts, 1) * (gameMode === 'singles' ? 2 : 4)
  const upNextPlayers = isLadderRun
    ? ladderRunFreezeActive
      ? mergeFrozenUpNextDisplay(
          ladderRunFreeze,
          ladderRunPreview,
          rosterPlayers,
          ladderRunMaxSlots
        )
      : (ladderRunPreview?.queue ?? [])
    : isLeague
      ? leagueFreezeActive
        ? mergeFrozenUpNextDisplay(
            leagueFreeze,
            leaguePreview,
            rosterPlayers,
            leagueMaxSlots
          )
        : (leaguePreview?.queue ?? [])
      : progressiveFreezeActive
        ? mergeFrozenUpNextDisplay(
            progressivePlayFreeze,
            upNextPreview,
            rosterPlayers,
            progressiveMaxSlots
          )
        : (upNextPreview?.queue ?? [])
  const upNextOnDeckIds = new Set(
    isLadderRun
      ? (() => {
          const onDeckSize = ladderRunOnDeckSize(gameMode)
          if (!ladderRunFreezeActive) {
            return (ladderRunPreview?.onDeckPlayers ?? [])
              .slice(0, onDeckSize)
              .map((player) => player.id)
          }
          const frozenOnDeck = (ladderRunFreeze.queueIds ?? []).slice(0, onDeckSize)
          const displayedOnDeck = upNextPlayers
            .slice(0, onDeckSize)
            .map((player) => player.id)
          const displayedIds = new Set(upNextPlayers.map((player) => player.id))
          const visibleFrozen = frozenOnDeck.filter((id) => displayedIds.has(id))
          if (visibleFrozen.length >= onDeckSize) return visibleFrozen
          const merged = [...visibleFrozen]
          const seen = new Set(merged)
          for (const id of displayedOnDeck) {
            if (merged.length >= onDeckSize) break
            if (!seen.has(id)) {
              merged.push(id)
              seen.add(id)
            }
          }
          return merged
        })()
      : isLeague
        ? leagueFreezeActive
          ? leagueFreeze.queueIds.slice(0, leagueOnDeckSize(gameMode))
          : (leaguePreview?.onDeckPlayers ?? []).map((player) => player.id)
        : progressiveFreezeActive
          ? progressivePlayFreeze.queueIds.slice(0, 4)
          : (upNextPreview?.onDeckPlayers ?? []).map((player) => player.id)
  )

  const playersWithMedals = checkedInPlayers
    .filter((p) => (Number(p.medals) || 0) > 0)
    .sort((a, b) => (Number(b.medals) || 0) - (Number(a.medals) || 0) || a.name.localeCompare(b.name))

  const playersOnWinStreak = checkedInPlayers
    .filter((p) => (Number(p.currentWinStreak) || 0) > 0)
    .sort((a, b) => (Number(b.currentWinStreak) || 0) - (Number(a.currentWinStreak) || 0) || a.name.localeCompare(b.name))

  const winnersCount = new Set([...playersWithMedals, ...playersOnWinStreak].map((p) => p.id)).size
  const winnerPlayers = isLadderRun
    ? checkedInPlayers
        .filter((player) => getPlayerLastResult(player, matchHistory) === 'win')
        .sort(sortPlayersByQueueOrderOldestFirst)
    : []
  const loserPlayers = isLadderRun
    ? checkedInPlayers
        .filter((player) => getPlayerLastResult(player, matchHistory) === 'loss')
        .sort(sortPlayersByQueueOrderOldestFirst)
    : []
  const winnerGroups = groupPlayersBySkillLevel(winnerPlayers, { preserveOrder: true })
  const loserGroups = groupPlayersBySkillLevel(loserPlayers, { preserveOrder: true })
  const showWinnersSection = gameType === V2_GAME_TYPES.THRONE_RUN
  const showWinnersLosersSection =
    isLadderRun && (winnerPlayers.length > 0 || loserPlayers.length > 0)
  const showUpNextSection = isCourtsQueueUi || upNextPlayers.length > 0
  const showQueueOverviewSection =
    isCourtsQueueUi ||
    playingPlayers.length > 0 ||
    sittingOutPlayers.length > 0 ||
    cooldownPlayers.length > 0

  const playerNameById = new Map(players.map((p) => [p.id, p.name]))
  const latestMatch = matchHistory.length > 0 ? matchHistory[matchHistory.length - 1] : null
  const latestSkillMovements =
    !latestMatch?.skillChanges
      ? []
      : Object.entries(latestMatch.skillChanges)
          .map(([playerId, change]) => ({
            id: playerId,
            name: playerNameById.get(playerId) ?? 'Unknown player',
            fromLevel: change.from,
            toLevel: change.to,
            direction: change.direction,
          }))
          .sort((a, b) => {
            if (a.direction !== b.direction) {
              return a.direction === 'up' ? -1 : 1
            }
            return a.name.localeCompare(b.name)
          })
  const showSkillMovementsSection =
    gameType === V2_GAME_TYPES.PROGRESSIVE_PLAY ||
    gameType === V2_GAME_TYPES.LADDER_RUN

  const courts = Array.from({ length: numberOfCourts }, (_, index) => {
    const matchup = courtMatchups?.[index] ?? null
    const hasMatchup = Boolean(matchup?.teamA?.length && matchup?.teamB?.length)
    const teamAStars = hasMatchup ? getTeamSkillStars(matchup.teamA) : ''
    const teamBStars = hasMatchup ? getTeamSkillStars(matchup.teamB) : ''
    const teamALabel = hasMatchup
      ? `${matchup.teamA.map((p) => p.name).join(' / ')} ${teamAStars}`
      : null
    const teamBLabel = hasMatchup
      ? `${matchup.teamB.map((p) => p.name).join(' / ')} ${teamBStars}`
      : null

    return {
      index,
      name: `Court ${index + 1}`,
      hasMatchup,
      teams: hasMatchup
        ? [teamALabel, teamBLabel]
        : ['Waiting for players', 'Click refresh to generate'],
    }
  })

  const notEnoughPlayers = checkedInCount < minPlayers

  return (
    <div className="relative space-y-6">
      {isRoundRobin && roundRobinProgress && roundRobinProgress.total > 0 ? (
        <p className="text-sm font-semibold text-slate-600">
          Remaining Matchups: {roundRobinProgress.remaining}/
          {roundRobinProgress.total}
        </p>
      ) : null}
      <div className={getGridClasses(numberOfCourts)}>
        {courts.map((court) => (
          <div key={court.index} className="space-y-3">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-stretch">
                <div className="grid flex-1 grid-rows-2 divide-y divide-slate-200 text-sm font-medium text-slate-700">
                  {court.teams.map((team, teamIndex) => (
                    <div
                      key={`${court.index}-${teamIndex}`}
                      className={`flex items-center px-4 py-4 sm:px-5 ${
                        !court.hasMatchup ? 'text-slate-400' : ''
                      }`}
                    >
                      {team}
                    </div>
                  ))}
                </div>
                <div className="flex w-12 flex-col items-center justify-center gap-3 border-l border-slate-200 bg-slate-50 py-4 text-slate-600">
                  <button
                    type="button"
                    onClick={() => onGenerateCourt(court.index)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                    aria-label={`Refresh court ${court.index + 1}`}
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditCourt(court.index)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                    aria-label={`Edit court ${court.index + 1}`}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenScore(court.index)}
                    disabled={!court.hasMatchup}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm transition ${
                      court.hasMatchup
                        ? 'hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-800'
                        : 'cursor-not-allowed opacity-50'
                    }`}
                    aria-label={`Open score for court ${court.index + 1}`}
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

      {!notEnoughPlayers && (showUpNextSection || showWinnersSection) ? (
        <div
          className={`mt-20 grid gap-6 ${
            showUpNextSection && showWinnersSection ? 'md:grid-cols-2' : ''
          }`}
        >
          {showUpNextSection ? (
            <section
              aria-labelledby="up-next-heading"
              className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm"
            >
              <button
                type="button"
                onClick={() => setIsUpNextExpanded((prev) => !prev)}
                className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition hover:bg-amber-50/50 sm:px-5 ${
                  isUpNextExpanded ? 'border-b border-amber-200' : ''
                }`}
                aria-expanded={isUpNextExpanded}
                aria-controls="up-next-panel"
              >
                <div className="min-w-0 flex-1">
                  <h2
                    id="up-next-heading"
                    className="text-sm font-semibold text-slate-900"
                  >
                    Up Next ({upNextPlayers.length})
                  </h2>
                  {isLadderRun ? (
                    upNextPlayers.length > 0 ? (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Grouped by check-in order, recent win/loss status, and
                        skill level for the next courts.
                      </p>
                    ) : null
                  ) : isLeague ? (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {leagueFreezeActive
                        ? 'Highlighted players are locked in and fill the next court when you generate. New check-ins are added after the queue.'
                        : 'Checked-in players waiting for the next court, in check-in order. Highlighted players fill the next court when you generate.'}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {progressiveFreezeActive
                        ? 'Highlighted players are locked in and fill the next court when you generate. The rest stay in order until then; players further down may shift as scores come in.'
                        : 'Fairness-ordered queue — the highlighted players fill the next court when you generate, the rest follow in priority order'}
                    </p>
                  )}
                </div>
                {isUpNextExpanded ? (
                  <ChevronUp
                    className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                    aria-hidden="true"
                  />
                ) : (
                  <ChevronDown
                    className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                    aria-hidden="true"
                  />
                )}
              </button>
              {isUpNextExpanded ? (
                <div id="up-next-panel" className="p-4 sm:p-5">
                  <ol className="space-y-1.5">
                    {upNextPlayers.map((player, index) => {
                      const isOnDeck = upNextOnDeckIds.has(player.id)
                      return (
                        <li
                          key={player.id}
                          className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                            isOnDeck
                              ? 'border-amber-300 bg-amber-50 text-amber-900'
                              : 'border-slate-200 bg-white text-slate-600'
                          }`}
                        >
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                              isOnDeck
                                ? 'bg-amber-200 text-amber-800'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span>{player.name}</span>
                            <span
                              className={`ml-1.5 font-normal ${
                                isOnDeck ? 'text-amber-600' : 'text-slate-400'
                              }`}
                            >
                              {getSkillLabel(player.skillLevel)}{' '}
                              {SKILL_STARS_BY_LEVEL[getNormalizedSkillLevel(player)]}
                            </span>
                          </span>
                          <span
                            className={`font-normal ${
                              isOnDeck ? 'text-amber-500' : 'text-slate-400'
                            }`}
                          >
                            ({Number(player.gamesPlayed) || 0})
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              ) : null}
            </section>
          ) : null}

          {showWinnersSection ? (
            <section
              aria-labelledby="winners-heading"
              className="overflow-hidden rounded-2xl border border-yellow-300 bg-white shadow-sm"
            >
              <div className="border-b border-yellow-300 px-4 py-3 sm:px-5">
                <h2
                  id="winners-heading"
                  className="text-sm font-semibold text-slate-900"
                >
                  Winners 🎉 ({winnersCount})
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Players on a {winStreak}-win streak
                </p>
              </div>
              <div className="space-y-4 p-4 sm:p-5">
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold text-yellow-700">
                    Medals ({playersWithMedals.length})
                  </h3>
                  {playersWithMedals.length === 0 ? (
                    <p className="text-sm text-yellow-600">No medals yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {playersWithMedals.map((player) => (
                        <span
                          key={player.id}
                          className="inline-flex items-center rounded-lg border border-yellow-300 bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-800"
                        >
                          {player.name}
                          <span className="ml-1" aria-hidden="true">
                            {'🥇'.repeat(Number(player.medals) || 0)}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold text-yellow-700">
                    Win Streaks ({playersOnWinStreak.length})
                  </h3>
                  {playersOnWinStreak.length === 0 ? (
                    <p className="text-sm text-yellow-600">No active win streaks.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {playersOnWinStreak.map((player) => (
                        <span
                          key={player.id}
                          className="inline-flex items-center rounded-lg border border-yellow-300 bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-800"
                        >
                          {player.name}
                          <span className="ml-1 font-normal text-yellow-600">
                            🔥{player.currentWinStreak}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {showQueueOverviewSection ? (
        <section
          aria-labelledby="queue-overview-heading"
          className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${
            notEnoughPlayers ? 'mt-20' : ''
          }`}
        >
          <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
            <h2
              id="queue-overview-heading"
              className="text-sm font-semibold text-slate-900"
            >
              Queue Overview
            </h2>
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                On Court ({playingPlayers.length})
              </h3>
              {playingPlayers.length === 0 ? (
                <p className="mt-2 text-sm text-emerald-500">No players on courts yet.</p>
              ) : (
                <V2PlayerStatusGroups
                  groups={playingGroups}
                  groupHeadingClassName="text-emerald-500"
                  chipClassName="inline-flex items-center rounded-lg border border-emerald-200 bg-white px-2 py-0.5 text-xs font-medium text-emerald-700"
                  gamesClassName="ml-1 font-normal text-emerald-500"
                />
              )}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Sitting Out ({sittingOutPlayers.length})
              </h3>
              {sittingOutPlayers.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">Everyone is playing!</p>
              ) : (
                <V2PlayerStatusGroups
                  groups={sittingOutGroups}
                  groupHeadingClassName="text-slate-400"
                  chipClassName="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600"
                  gamesClassName="ml-1 font-normal text-slate-400"
                />
              )}
            </div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-600">
                On Cooldown ({cooldownPlayers.length})
              </h3>
              {cooldownPlayers.length === 0 ? (
                <p className="mt-2 text-sm text-sky-500">No players on cooldown.</p>
              ) : (
                <V2PlayerStatusGroups
                  groups={cooldownGroups}
                  groupHeadingClassName="text-sky-500"
                  chipClassName="inline-flex items-center rounded-lg border border-sky-200 bg-white px-2 py-0.5 text-xs font-medium text-sky-700"
                  gamesClassName="ml-1 font-normal text-sky-500"
                />
              )}
            </div>
          </div>
        </section>
      ) : null}

      {showWinnersLosersSection ? (
        <section
          aria-labelledby="winners-losers-heading"
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
            <h2
              id="winners-losers-heading"
              className="text-sm font-semibold text-slate-900"
            >
              Winners & Losers
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Grouped by skill level to help pair winners with winners and losers
              with losers.
            </p>
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                Winners ({winnerPlayers.length})
              </h3>
              {winnerPlayers.length === 0 ? (
                <p className="mt-2 text-sm text-emerald-500">
                  No winners with recorded match results yet.
                </p>
              ) : (
                <V2PlayerStatusGroups
                  groups={winnerGroups}
                  groupHeadingClassName="text-emerald-500"
                  chipClassName="inline-flex items-center rounded-lg border border-emerald-200 bg-white px-2 py-0.5 text-xs font-medium text-emerald-700"
                  gamesClassName="ml-1 font-normal text-emerald-500"
                />
              )}
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-rose-600">
                Losers ({loserPlayers.length})
              </h3>
              {loserPlayers.length === 0 ? (
                <p className="mt-2 text-sm text-rose-500">
                  No losers with recorded match results yet.
                </p>
              ) : (
                <V2PlayerStatusGroups
                  groups={loserGroups}
                  groupHeadingClassName="text-rose-500"
                  chipClassName="inline-flex items-center rounded-lg border border-rose-200 bg-white px-2 py-0.5 text-xs font-medium text-rose-700"
                  gamesClassName="ml-1 font-normal text-rose-500"
                />
              )}
            </div>
          </div>
        </section>
      ) : null}

      {showSkillMovementsSection ? (
        <section
          aria-labelledby="skill-movements-heading"
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
            <h2
              id="skill-movements-heading"
              className="text-sm font-semibold text-slate-900"
            >
              Skill Movements ({latestSkillMovements.length})
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Changes from the most recent scored match.
            </p>
          </div>
          {latestSkillMovements.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500 sm:px-5">
              No skill movements yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {latestSkillMovements.map((movement) => {
                const fromKey = normalizeSkillLevel(movement.fromLevel)
                const toKey = normalizeSkillLevel(movement.toLevel)
                const fromStars = SKILL_STARS_BY_LEVEL[fromKey] ?? movement.fromLevel
                const toStars = SKILL_STARS_BY_LEVEL[toKey] ?? movement.toLevel
                const isUp = movement.direction === 'up'
                return (
                  <li
                    key={movement.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-sm sm:px-5"
                  >
                    <span className="font-medium text-slate-800">
                      {movement.name}
                    </span>
                    <span className="text-slate-500">from</span>
                    <span aria-label={`from ${getSkillLabel(movement.fromLevel)}`}>
                      {fromStars}
                    </span>
                    <span className="text-slate-500">to</span>
                    <span aria-label={`to ${getSkillLabel(movement.toLevel)}`}>
                      {toStars}
                    </span>
                    <span
                      className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                        isUp
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-rose-50 text-rose-700'
                      }`}
                      aria-label={isUp ? 'Moved up' : 'Moved down'}
                    >
                      {isUp ? '⬆️ Up' : '⬇️ Down'}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ) : null}

      {notEnoughPlayers ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center px-4">
          <div className="absolute inset-0 rounded-2xl bg-slate-900/60" />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-lg">
            <h2 className="text-lg font-semibold text-slate-900">
              Not enough players checked in
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              A game cannot start until at least {minPlayers} players have checked in.
            </p>
            <p className="mt-3 text-xs font-semibold uppercase text-slate-400">
              Currently checked in: {checkedInCount}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
