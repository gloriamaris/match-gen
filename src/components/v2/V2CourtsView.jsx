import React, { useRef } from 'react'
import { Check, Pencil, RefreshCw } from 'lucide-react'
import {
  getCooldownIds,
  selectFairnessPool,
  shouldUseCheckInOrder,
} from '../../match-engines/v2/ProgressivePlay.engine'
import { V2_GAME_TYPES } from './v2Storage'

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

const groupPlayersBySkillLevelInPickOrder = (playerList, pickOrderPlayers) => {
  const pickIndex = new Map(pickOrderPlayers.map((player, index) => [player.id, index]))
  const sortByPickOrder = (a, b) =>
    (pickIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
    (pickIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER)

  return SKILL_LEVEL_ORDER.map((skillLevel) => {
    const players = playerList
      .filter((player) => getNormalizedSkillLevel(player) === skillLevel)
      .sort(sortByPickOrder)
    return {
      skillLevel,
      label: getSkillLabel(skillLevel),
      stars: SKILL_STARS_BY_LEVEL[skillLevel],
      players,
    }
  }).filter((group) => group.players.length > 0)
}

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
  numberOfCourts,
  courtMatchups,
  players = [],
  matchHistory = [],
  checkedInCount = 0,
  winStreak = 0,
  lockUpNext = false,
  onGenerateCourt = noop,
  onEditCourt = noop,
  onOpenScore = noop,
}) {
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
  const cooldownIds = getCooldownIds(matchHistory, numberOfCourts)
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

  const eligiblePlayers = checkedInPlayers.filter((p) => !onCourtIds.has(p.id))
  const useCheckInOrder = shouldUseCheckInOrder(eligiblePlayers, matchHistory)
  const { selected: liveUpNextPlayers } =
    eligiblePlayers.length >= 4
      ? selectFairnessPool(eligiblePlayers, numberOfCourts, matchHistory, {
          useCheckInOrder,
          cooldownSlots: numberOfCourts,
        })
      : { selected: [] }
  const liveUpNextGroups = groupPlayersBySkillLevelInPickOrder(
    liveUpNextPlayers,
    liveUpNextPlayers
  )

  const upNextSnapshotRef = useRef({
    players: liveUpNextPlayers,
    groups: liveUpNextGroups,
  })
  if (!lockUpNext) {
    upNextSnapshotRef.current = {
      players: liveUpNextPlayers,
      groups: liveUpNextGroups,
    }
  }
  const upNextPlayers = lockUpNext
    ? upNextSnapshotRef.current.players
    : liveUpNextPlayers
  const upNextGroups = lockUpNext
    ? upNextSnapshotRef.current.groups
    : liveUpNextGroups

  const playersWithMedals = checkedInPlayers
    .filter((p) => (Number(p.medals) || 0) > 0)
    .sort((a, b) => (Number(b.medals) || 0) - (Number(a.medals) || 0) || a.name.localeCompare(b.name))

  const playersOnWinStreak = checkedInPlayers
    .filter((p) => (Number(p.currentWinStreak) || 0) > 0)
    .sort((a, b) => (Number(b.currentWinStreak) || 0) - (Number(a.currentWinStreak) || 0) || a.name.localeCompare(b.name))

  const winnersCount = new Set([...playersWithMedals, ...playersOnWinStreak].map((p) => p.id)).size
  const showWinnersSection = gameType === V2_GAME_TYPES.THRONE_RUN
  const showUpNextSection = upNextPlayers.length > 0

  const playerNameById = new Map(players.map((p) => [p.id, p.name]))
  const latestMatch = matchHistory.length > 0 ? matchHistory[matchHistory.length - 1] : null
  const latestSkillMovements = latestMatch?.skillChanges
    ? Object.entries(latestMatch.skillChanges)
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
    : []

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

  const notEnoughPlayers = checkedInCount < 4

  return (
    <div className="relative space-y-6">
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
              <div className="border-b border-amber-200 px-4 py-3 sm:px-5">
                <h2
                  id="up-next-heading"
                  className="text-sm font-semibold text-slate-900"
                >
                  Up Next ({upNextPlayers.length})
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {gameType === V2_GAME_TYPES.PROGRESSIVE_PLAY
                    ? 'Grouped by skill level, ordered by fairness priority — excludes players currently on court'
                    : 'Prioritized for the next refresh — excludes players currently on court'}
                </p>
              </div>
              <div className="p-4 sm:p-5">
                <V2PlayerStatusGroups
                  groups={upNextGroups}
                  groupHeadingClassName="text-amber-600"
                  chipClassName="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
                  gamesClassName="ml-1 font-normal text-amber-500"
                />
              </div>
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

      {playingPlayers.length > 0 ||
      sittingOutPlayers.length > 0 ||
      cooldownPlayers.length > 0 ? (
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

      {latestSkillMovements.length > 0 ? (
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
              A game cannot start until at least 4 players have checked in.
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
