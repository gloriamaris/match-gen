import { describe, expect, it } from 'vitest'
import {
  V2_MAX_GAMES_GAP,
  buildGamesGapExclusions,
  getSessionGamesStats,
  shouldSkipThroneForGamesGap,
  shouldYieldThroneToQueue,
  applyGamesGapExclusions,
  resolveGapExclusionsForCourtFill,
  countAvailableEligiblePlayers,
} from '../gamesGap'

const player = (id, gamesPlayed, overrides = {}) => ({
  id,
  name: id,
  checkedIn: true,
  gamesPlayed,
  ...overrides,
})

describe('getSessionGamesStats', () => {
  it('returns spread across checked-in players', () => {
    const stats = getSessionGamesStats([
      player('a', 5),
      player('b', 2),
      player('c', 0),
    ])
    expect(stats).toEqual({
      sessionMinGames: 0,
      sessionMaxGames: 5,
      sessionGap: 5,
    })
  })
})

describe('buildGamesGapExclusions', () => {
  it('does not exclude when session gap is below the limit', () => {
    const result = buildGamesGapExclusions([
      player('a', 4),
      player('b', 3),
      player('c', 3),
    ])

    expect(result.enforceGap).toBe(false)
    expect(result.gapExcludeIds.size).toBe(0)
  })

  it('strictly excludes players above sessionMin + maxGamesGap', () => {
    const result = buildGamesGapExclusions([
      player('leader', 5),
      player('mid', 4),
      player('low', 2),
      player('new', 0),
    ])

    expect(result.enforceGap).toBe(true)
    expect(result.maxAllowedGames).toBe(0 + V2_MAX_GAMES_GAP)
    expect(result.gapExcludeIds.has('leader')).toBe(true)
    expect(result.gapExcludeIds.has('mid')).toBe(true)
    expect(result.gapExcludeIds.has('low')).toBe(false)
    expect(result.gapExcludeIds.has('new')).toBe(false)
  })

  it('uses session-wide minimum, not just the refresh pool', () => {
    const result = buildGamesGapExclusions([
      player('onOtherCourt', 5),
      player('availableLow', 2),
      player('availableMid', 3),
    ])

    expect(result.enforceGap).toBe(true)
    expect(result.maxAllowedGames).toBe(4)
    expect(result.gapExcludeIds.has('onOtherCourt')).toBe(true)
    expect(result.gapExcludeIds.has('availableMid')).toBe(false)
  })

  it('merges medal exclusions with gap exclusions', () => {
    const result = buildGamesGapExclusions([player('a', 5), player('b', 0)], {
      medalExcludeIds: ['medal'],
    })

    expect(result.allExcludeIds.has('a')).toBe(true)
    expect(result.allExcludeIds.has('medal')).toBe(true)
  })
})

describe('shouldSkipThroneForGamesGap', () => {
  const players = new Map([
    ['throne', player('throne', 5)],
    ['fresh', player('fresh', 0)],
  ])

  it('skips when zero-game players are waiting in the pool', () => {
    expect(
      shouldSkipThroneForGamesGap({
        enforceGap: false,
        maxAllowedGames: 2,
        stayingWinnerIds: ['throne'],
        getPlayer: (id) => players.get(id),
        hasZeroGamesPlayerInPool: true,
      })
    ).toBe(true)
  })

  it('skips when throne holder exceeds maxAllowedGames under enforcement', () => {
    expect(
      shouldSkipThroneForGamesGap({
        enforceGap: true,
        maxAllowedGames: 2,
        stayingWinnerIds: ['throne'],
        getPlayer: (id) => players.get(id),
        hasZeroGamesPlayerInPool: false,
      })
    ).toBe(true)
  })

  it('allows throne holder when within the allowed band', () => {
    const within = new Map([['throne', player('throne', 2)]])
    expect(
      shouldSkipThroneForGamesGap({
        enforceGap: true,
        maxAllowedGames: 2,
        stayingWinnerIds: ['throne'],
        getPlayer: (id) => within.get(id),
        hasZeroGamesPlayerInPool: false,
      })
    ).toBe(false)
  })
})

describe('shouldYieldThroneToQueue', () => {
  const winner = (games) =>
    new Map([['throne', player('throne', games, { skillLevel: 'Novice' })]])
  const getFrom = (map) => (id) => map.get(id)

  it('yields when >= 4 lower-game sit-outs share one skill group', () => {
    const winners = winner(3)
    const available = [
      player('a', 1, { skillLevel: 'Beginner' }),
      player('b', 1, { skillLevel: 'Novice' }),
      player('c', 2, { skillLevel: 'Beginner' }),
      player('d', 0, { skillLevel: 'Novice' }),
    ]
    expect(
      shouldYieldThroneToQueue({
        stayingWinnerIds: ['throne'],
        getPlayer: getFrom(winners),
        availablePlayers: available,
        lastMatchPlayerIds: [],
      })
    ).toBe(true)
  })

  it('does not yield when fewer than 4 lower-game sit-outs exist', () => {
    const winners = winner(3)
    const available = [
      player('a', 1, { skillLevel: 'Novice' }),
      player('b', 2, { skillLevel: 'Novice' }),
      player('c', 0, { skillLevel: 'Novice' }),
    ]
    expect(
      shouldYieldThroneToQueue({
        stayingWinnerIds: ['throne'],
        getPlayer: getFrom(winners),
        availablePlayers: available,
        lastMatchPlayerIds: [],
      })
    ).toBe(false)
  })

  it('does not yield when 4 lower-game players are split across groups', () => {
    const winners = winner(3)
    const available = [
      player('a', 1, { skillLevel: 'Beginner' }),
      player('b', 1, { skillLevel: 'Novice' }),
      player('c', 1, { skillLevel: 'Intermediate' }),
      player('d', 1, { skillLevel: 'Advanced' }),
    ]
    expect(
      shouldYieldThroneToQueue({
        stayingWinnerIds: ['throne'],
        getPlayer: getFrom(winners),
        availablePlayers: available,
        lastMatchPlayerIds: [],
      })
    ).toBe(false)
  })

  it('excludes players with games equal to or above the winner', () => {
    const winners = winner(2)
    const available = [
      player('a', 2, { skillLevel: 'Novice' }),
      player('b', 3, { skillLevel: 'Novice' }),
      player('c', 1, { skillLevel: 'Novice' }),
      player('d', 0, { skillLevel: 'Novice' }),
    ]
    expect(
      shouldYieldThroneToQueue({
        stayingWinnerIds: ['throne'],
        getPlayer: getFrom(winners),
        availablePlayers: available,
        lastMatchPlayerIds: [],
      })
    ).toBe(false)
  })

  it('excludes players from the match just scored', () => {
    const winners = winner(3)
    const available = [
      player('a', 1, { skillLevel: 'Novice' }),
      player('b', 1, { skillLevel: 'Novice' }),
      player('c', 1, { skillLevel: 'Novice' }),
      player('justPlayed', 1, { skillLevel: 'Novice' }),
    ]
    expect(
      shouldYieldThroneToQueue({
        stayingWinnerIds: ['throne'],
        getPlayer: getFrom(winners),
        availablePlayers: available,
        lastMatchPlayerIds: ['justPlayed'],
      })
    ).toBe(false)
  })

  it('uses the minimum games among staying winners', () => {
    const winners = new Map([
      ['w1', player('w1', 4, { skillLevel: 'Novice' })],
      ['w2', player('w2', 2, { skillLevel: 'Novice' })],
    ])
    const available = [
      player('a', 1, { skillLevel: 'Novice' }),
      player('b', 1, { skillLevel: 'Novice' }),
      player('c', 1, { skillLevel: 'Novice' }),
      player('d', 3, { skillLevel: 'Novice' }),
    ]
    // winnerGames = min(4, 2) = 2, so only a/b/c (1 game) qualify -> 3 < 4
    expect(
      shouldYieldThroneToQueue({
        stayingWinnerIds: ['w1', 'w2'],
        getPlayer: getFrom(winners),
        availablePlayers: available,
        lastMatchPlayerIds: [],
      })
    ).toBe(false)
  })

  it('returns false when there are no staying winners', () => {
    expect(
      shouldYieldThroneToQueue({
        stayingWinnerIds: [],
        getPlayer: () => undefined,
        availablePlayers: [],
        lastMatchPlayerIds: [],
      })
    ).toBe(false)
  })
})

describe('applyGamesGapExclusions', () => {
  it('marks excluded players as not checked in for engine selection', () => {
    const players = [player('a', 5), player('b', 0)]
    const next = applyGamesGapExclusions(players, new Set(['a']))
    expect(next[0].checkedIn).toBe(false)
    expect(next[1].checkedIn).toBe(true)
  })
})

describe('resolveGapExclusionsForCourtFill', () => {
  it('relaxes gap exclusions from same skill level first', () => {
    const players = [
      player('low1', 0, { skillLevel: 'Novice' }),
      player('low2', 1, { skillLevel: 'Novice' }),
      player('low3', 2, { skillLevel: 'Novice' }),
      player('high', 5, { skillLevel: 'Novice' }),
    ]
    const { gapExcludeIds, allExcludeIds, enforceGap } =
      buildGamesGapExclusions(players)

    const resolved = resolveGapExclusionsForCourtFill(players, {
      gapExcludeIds,
      allExcludeIds,
      enforceGap,
    })

    expect(resolved.has('high')).toBe(false)
    expect(countAvailableEligiblePlayers(players, resolved)).toBe(4)
  })

  it('pulls from one rank below before one rank above within the same group', () => {
    const players = [
      player('nov1', 1, { skillLevel: 'Novice' }),
      player('nov2', 2, { skillLevel: 'Novice' }),
      player('beg1', 5, { skillLevel: 'Beginner' }),
      player('beg2', 5, { skillLevel: 'Beginner' }),
      player('int1', 5, { skillLevel: 'Intermediate' }),
      player('int2', 5, { skillLevel: 'Intermediate' }),
      player('int3', 5, { skillLevel: 'Intermediate' }),
      player('int4', 5, { skillLevel: 'Intermediate' }),
    ]
    const { gapExcludeIds, allExcludeIds, enforceGap } =
      buildGamesGapExclusions(players)

    const resolved = resolveGapExclusionsForCourtFill(players, {
      gapExcludeIds,
      allExcludeIds,
      enforceGap,
    })

    expect(resolved.has('beg1')).toBe(false)
    expect(resolved.has('beg2')).toBe(false)
    expect(resolved.has('int1')).toBe(true)
    expect(resolved.has('nov1')).toBe(false)
    expect(resolved.has('nov2')).toBe(false)
  })

  it('does not relax exclusions across beginner/novice and intermediate/advanced groups', () => {
    const players = [
      player('nov1', 0, { skillLevel: 'Novice' }),
      player('int1', 5, { skillLevel: 'Intermediate' }),
      player('int2', 5, { skillLevel: 'Intermediate' }),
      player('int3', 5, { skillLevel: 'Intermediate' }),
      player('adv1', 5, { skillLevel: 'Advanced' }),
    ]
    const { gapExcludeIds, allExcludeIds, enforceGap } =
      buildGamesGapExclusions(players)

    const resolved = resolveGapExclusionsForCourtFill(players, {
      gapExcludeIds,
      allExcludeIds,
      enforceGap,
    })

    expect(resolved.has('int1')).toBe(true)
    expect(resolved.has('int2')).toBe(true)
    expect(resolved.has('int3')).toBe(true)
    expect(resolved.has('adv1')).toBe(true)
    expect(resolved.has('nov1')).toBe(false)
  })

  it('ignores players assigned to other courts when counting fill need', () => {
    const players = [
      player('low1', 0, { skillLevel: 'Novice' }),
      player('low2', 1, { skillLevel: 'Novice' }),
      player('low3', 2, { skillLevel: 'Novice' }),
      player('high', 5, { skillLevel: 'Novice' }),
    ]
    const { gapExcludeIds, allExcludeIds, enforceGap } =
      buildGamesGapExclusions(players)

    const resolved = resolveGapExclusionsForCourtFill(players, {
      gapExcludeIds,
      allExcludeIds,
      enforceGap,
      otherCourtPlayerIds: ['low1', 'low2', 'low3'],
    })

    expect(resolved.has('high')).toBe(false)
  })
})
