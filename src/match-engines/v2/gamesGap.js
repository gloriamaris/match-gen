// =============================================================================
// Games gap fairness — session-wide spread limit for V2 court generation
// =============================================================================
//
// When sessionGap >= maxGamesGap, players more than maxGamesGap ahead of the
// session minimum cannot be placed on a refreshed court. Skill-group rules in
// Progressive Play / Throne Run still apply to whoever remains eligible.
//
// When fewer than four gap-eligible players remain in a skill group, gap
// exclusions are relaxed for sit-out players in that group: same skill level
// first, then one rank below, then one rank above (never crossing groups).

import {
  skillGroupOf,
  skillRankOf,
  hasPartneredBefore,
  hasOpposedBefore,
  identifyLockedTeams,
} from './ProgressivePlay.engine'

export const V2_MAX_GAMES_GAP = 2
export const PLAYERS_PER_COURT = 4

export function getSessionGamesStats(checkedInPlayers) {
  const gamesCounts = (checkedInPlayers ?? []).map(
    (player) => Number(player.gamesPlayed) || 0
  )
  if (gamesCounts.length === 0) {
    return { sessionMinGames: 0, sessionMaxGames: 0, sessionGap: 0 }
  }
  const sessionMinGames = Math.min(...gamesCounts)
  const sessionMaxGames = Math.max(...gamesCounts)
  return {
    sessionMinGames,
    sessionMaxGames,
    sessionGap: sessionMaxGames - sessionMinGames,
  }
}

export function buildGamesGapExclusions(players, options = {}) {
  const {
    maxGamesGap = V2_MAX_GAMES_GAP,
    medalExcludeIds = [],
  } = options

  const checkedIn = (players ?? []).filter((player) => player.checkedIn)
  const { sessionMinGames, sessionMaxGames, sessionGap } =
    getSessionGamesStats(checkedIn)
  const maxAllowedGames = sessionMinGames + maxGamesGap
  const enforceGap = sessionGap >= maxGamesGap

  const gapExcludeIds = new Set()
  if (enforceGap) {
    checkedIn.forEach((player) => {
      if ((Number(player.gamesPlayed) || 0) > maxAllowedGames) {
        gapExcludeIds.add(player.id)
      }
    })
  }

  const medalExcludeSet = new Set(medalExcludeIds)
  const allExcludeIds = new Set([...medalExcludeSet, ...gapExcludeIds])

  return {
    sessionMinGames,
    sessionMaxGames,
    sessionGap,
    maxAllowedGames,
    maxGamesGap,
    enforceGap,
    gapExcludeIds,
    allExcludeIds,
  }
}

// Shared exclusion set for Up Next preview and empty-court generation so both
// paths filter the same eligible pool (games-gap, medals, relaxation).
export function resolveProgressivePlayQueueExclusions(players, options = {}) {
  const { otherCourtPlayerIds = [], medalExcludeIds = [] } = options
  const { gapExcludeIds, allExcludeIds, enforceGap } = buildGamesGapExclusions(
    players,
    { medalExcludeIds }
  )
  return resolveGapExclusionsForCourtFill(players, {
    gapExcludeIds,
    allExcludeIds,
    medalExcludeIds,
    otherCourtPlayerIds,
    enforceGap,
  })
}

export function shouldSkipThroneForGamesGap({
  enforceGap,
  maxAllowedGames,
  stayingWinnerIds = [],
  getPlayer,
  hasZeroGamesPlayerInPool = false,
}) {
  if (hasZeroGamesPlayerInPool) return true
  if (!enforceGap) return false

  return stayingWinnerIds.some((id) => {
    const player = getPlayer(id)
    return player && (Number(player.gamesPlayed) || 0) > maxAllowedGames
  })
}

// Resolve a player's mutual locked partner, or null when the teammateId is
// missing, one-way, or points at an unknown player. getPlayer resolves across
// the whole roster so a partner on another court is still detected.
const mutualLockedPartner = (player, getPlayer) => {
  if (!player.teammateId) return null
  const teammate = getPlayer?.(player.teammateId)
  if (!teammate || teammate.teammateId !== player.id) return null
  return teammate
}

// A quartet is only countable when every locked player has their partner inside
// it. A sit-out whose locked partner is elsewhere cannot complete this court.
const isLockedPairComplete = (four, getPlayer) => {
  const quartetIds = new Set(four.map((player) => player.id))
  return four.every((player) => {
    const teammate = mutualLockedPartner(player, getPlayer)
    if (!teammate) return true
    return quartetIds.has(teammate.id)
  })
}

const isValidPartnerPair = (a, b) => {
  if (a.teammateId === b.id && b.teammateId === a.id) return true
  return !hasPartneredBefore(a, b)
}

// Enumerate the ways to split four players into two teams where both teammate
// pairs are fresh (or locked). Locked pairs are kept intact as a single team.
const enumerateFreshPartnerMatchups = (four) => {
  const { lockedTeams } = identifyLockedTeams(four)

  if (lockedTeams.length === 2) {
    return [
      { teamA: lockedTeams[0].players, teamB: lockedTeams[1].players },
    ]
  }

  if (lockedTeams.length === 1) {
    const lockedIds = new Set(lockedTeams[0].players.map((p) => p.id))
    const solos = four.filter((player) => !lockedIds.has(player.id))
    if (solos.length !== 2) return []
    if (!isValidPartnerPair(solos[0], solos[1])) return []
    return [{ teamA: lockedTeams[0].players, teamB: solos }]
  }

  const [a, b, c, d] = four
  const partitions = [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ]
  return partitions
    .filter(
      ([teamA, teamB]) =>
        isValidPartnerPair(teamA[0], teamA[1]) &&
        isValidPartnerPair(teamB[0], teamB[1])
    )
    .map(([teamA, teamB]) => ({ teamA, teamB }))
}

const hasFreshOpponents = (teamA, teamB) =>
  teamA.every((playerA) =>
    teamB.every((playerB) => !hasOpposedBefore(playerA, playerB))
  )

// True when some four eligible sit-outs in this skill group can form a court
// with fresh teammate pairs. Returns immediately when an opponent-fresh court
// exists; otherwise falls back to any fresh-partner court.
const groupHasYieldableQuorum = (eligibleInGroup, getPlayer) => {
  const n = eligibleInGroup.length
  if (n < PLAYERS_PER_COURT) return false

  let foundFreshPartners = false
  for (let i = 0; i < n - 3; i += 1) {
    for (let j = i + 1; j < n - 2; j += 1) {
      for (let k = j + 1; k < n - 1; k += 1) {
        for (let l = k + 1; l < n; l += 1) {
          const four = [
            eligibleInGroup[i],
            eligibleInGroup[j],
            eligibleInGroup[k],
            eligibleInGroup[l],
          ]
          if (!isLockedPairComplete(four, getPlayer)) continue
          const matchups = enumerateFreshPartnerMatchups(four)
          if (matchups.length === 0) continue
          foundFreshPartners = true
          for (const { teamA, teamB } of matchups) {
            if (hasFreshOpponents(teamA, teamB)) return true
          }
        }
      }
    }
  }
  return foundFreshPartners
}

// Yield the throne back to the fairness queue when enough lower-game players
// are waiting. Returns true when four court-eligible sit-outs in a single skill
// group (with fewer games than the staying winner(s)) can form a court with
// fresh teammate pairs — preferring a court that also avoids repeat opponents,
// and falling back to a fresh-partner-only court when no opponent-fresh court
// exists. Locked pairs must be complete within the candidate quartet.
//
// availablePlayers should already be filtered to court-eligible sit-outs
// (checkedIn, not on another court, not on medal cooldown). Players from the
// match just scored are excluded via lastMatchPlayerIds so winners/losers who
// just played don't count toward the threshold.
export function shouldYieldThroneToQueue({
  stayingWinnerIds = [],
  getPlayer,
  availablePlayers = [],
  lastMatchPlayerIds = [],
}) {
  if (stayingWinnerIds.length === 0) return false

  const winnerGamesValues = stayingWinnerIds
    .map((id) => getPlayer?.(id))
    .filter(Boolean)
    .map((player) => Number(player.gamesPlayed) || 0)

  if (winnerGamesValues.length === 0) return false

  const winnerGames = Math.min(...winnerGamesValues)
  const lastMatchSet = new Set(lastMatchPlayerIds)

  const eligibleByGroup = new Map()
  availablePlayers.forEach((player) => {
    if (!player.checkedIn) return
    if (lastMatchSet.has(player.id)) return
    if ((Number(player.gamesPlayed) || 0) >= winnerGames) return
    const group = skillGroupOf(player.skillLevel)
    if (!eligibleByGroup.has(group)) eligibleByGroup.set(group, [])
    eligibleByGroup.get(group).push(player)
  })

  for (const eligibleInGroup of eligibleByGroup.values()) {
    if (groupHasYieldableQuorum(eligibleInGroup, getPlayer)) return true
  }
  return false
}

export function applyGamesGapExclusions(players, excludeIds) {
  if (!excludeIds || excludeIds.size === 0) return players
  return players.map((player) =>
    excludeIds.has(player.id) ? { ...player, checkedIn: false } : player
  )
}

const skillProximityTier = (anchorRank, candidateRank) => {
  if (candidateRank === anchorRank) return 0
  if (candidateRank < anchorRank) return 1
  return 2
}

const playersInSkillGroup = (players, skillGroup) =>
  players.filter((player) => skillGroupOf(player.skillLevel) === skillGroup)

const sortSitOutFillCandidates = (candidates, anchorRank) =>
  [...candidates].sort((a, b) => {
    const tierDiff =
      skillProximityTier(anchorRank, skillRankOf(a.skillLevel)) -
      skillProximityTier(anchorRank, skillRankOf(b.skillLevel))
    if (tierDiff !== 0) return tierDiff
    const gamesDiff =
      (Number(a.gamesPlayed) || 0) - (Number(b.gamesPlayed) || 0)
    if (gamesDiff !== 0) return gamesDiff
    return String(a.id).localeCompare(String(b.id))
  })

const pickAnchorGroup = (gapEligible, gapExcludedSitOut) => {
  const candidates = [...gapEligible, ...gapExcludedSitOut]
  const groups = new Set(candidates.map((player) => skillGroupOf(player.skillLevel)))
  let bestGroup = null
  let bestEligibleCount = -1
  let bestMinGames = Infinity

  groups.forEach((group) => {
    const eligibleInGroup = playersInSkillGroup(gapEligible, group)
    const eligibleCount = eligibleInGroup.length
    const minGames =
      eligibleInGroup.length > 0
        ? Math.min(...eligibleInGroup.map((player) => Number(player.gamesPlayed) || 0))
        : Math.min(
            ...playersInSkillGroup(gapExcludedSitOut, group).map(
              (player) => Number(player.gamesPlayed) || 0
            )
          )

    if (
      eligibleCount > bestEligibleCount ||
      (eligibleCount === bestEligibleCount && minGames < bestMinGames)
    ) {
      bestGroup = group
      bestEligibleCount = eligibleCount
      bestMinGames = minGames
    }
  })

  return bestGroup
}

export function resolveGapExclusionsForCourtFill(players, options = {}) {
  const {
    gapExcludeIds,
    allExcludeIds,
    medalExcludeIds = [],
    otherCourtPlayerIds = [],
    enforceGap = false,
    minCourtSize = PLAYERS_PER_COURT,
  } = options

  if (!enforceGap || gapExcludeIds.size === 0) {
    return allExcludeIds
  }

  const otherCourtSet = new Set(otherCourtPlayerIds)
  const medalSet = new Set(medalExcludeIds)

  const isAvailableForCourt = (player) =>
    player.checkedIn &&
    !otherCourtSet.has(player.id) &&
    !medalSet.has(player.id)

  const gapEligible = players.filter(
    (player) => isAvailableForCourt(player) && !gapExcludeIds.has(player.id)
  )
  const gapExcludedSitOut = players.filter(
    (player) => isAvailableForCourt(player) && gapExcludeIds.has(player.id)
  )

  const anchorGroup = pickAnchorGroup(gapEligible, gapExcludedSitOut)
  if (anchorGroup == null) return allExcludeIds

  const eligibleInGroup = playersInSkillGroup(gapEligible, anchorGroup)
  if (eligibleInGroup.length >= minCourtSize) {
    return allExcludeIds
  }

  const sitOutInGroup = playersInSkillGroup(gapExcludedSitOut, anchorGroup)
  if (sitOutInGroup.length === 0) {
    return allExcludeIds
  }

  const anchorRankSource =
    eligibleInGroup.length > 0
      ? [...eligibleInGroup].sort(
          (a, b) =>
            (Number(a.gamesPlayed) || 0) - (Number(b.gamesPlayed) || 0) ||
            String(a.id).localeCompare(String(b.id))
        )[0]
      : sortSitOutFillCandidates(sitOutInGroup, skillRankOf(sitOutInGroup[0].skillLevel))[0]

  const anchorRank = skillRankOf(anchorRankSource.skillLevel)
  const needed = minCourtSize - eligibleInGroup.length
  const relaxedIds = sortSitOutFillCandidates(sitOutInGroup, anchorRank)
    .slice(0, needed)
    .map((player) => player.id)

  if (relaxedIds.length === 0) {
    return allExcludeIds
  }

  const nextExcludeIds = new Set(allExcludeIds)
  relaxedIds.forEach((id) => nextExcludeIds.delete(id))
  return nextExcludeIds
}

export function countAvailableEligiblePlayers(players, excludeIds, otherCourtPlayerIds = []) {
  const otherCourtSet = new Set(otherCourtPlayerIds)
  return players.filter(
    (player) =>
      player.checkedIn &&
      !otherCourtSet.has(player.id) &&
      !(excludeIds?.has(player.id))
  ).length
}
