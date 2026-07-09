import { describe, expect, it } from 'vitest'
import {
  getCooldownIds,
  generateLeagueCourt,
  generateRoundRobinCourt,
  applyMatchResult,
  revertMatchResult,
  applyLeagueMatchResult,
  revertLeagueMatchResult,
  derivePlayerLastMatch,
  metCount,
  computeRoundRobinMatchupProgress,
  buildLeagueUpNextPreview,
  captureLeagueFreeze,
  isLeagueFreezeValid,
  advanceLeagueFreeze,
} from '../RoundRobin.engine'
import { mergeFrozenUpNextDisplay } from '../progressivePlayCourtRefresh'

const mk = (id, overrides = {}) => ({
  id,
  name: id,
  checkedIn: true,
  queueOrder: 0,
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  skillLevel: 'Beginner',
  partnerCounts: {},
  opponentCounts: {},
  ...overrides,
})

const idsOf = (team) => team.map((p) => p.id).sort()

const playGame = (players, court, winningTeam = 'A') => {
  const { players: next, historyEntry } = applyMatchResult(players, {
    courtIndex: court.courtIndex ?? 0,
    teamAIds: court.teamA.map((p) => p.id),
    teamBIds: court.teamB.map((p) => p.id),
    winningTeam,
  })
  return { players: next, historyEntry }
}

const isFreshCourt = (players, court) => {
  const byId = new Map(players.map((player) => [player.id, player]))
  const [a1, a2] = court.teamA.map((player) => byId.get(player.id))
  const [b1, b2] = court.teamB.map((player) => byId.get(player.id))
  if (!a1 || !a2 || !b1 || !b2) return false

  const partneredBefore = (left, right) =>
    (Number(left.partnerCounts?.[right.id]) || 0) > 0 ||
    (Number(right.partnerCounts?.[left.id]) || 0) > 0
  const opposedBefore = (left, right) =>
    (Number(left.opponentCounts?.[right.id]) || 0) > 0 ||
    (Number(right.opponentCounts?.[left.id]) || 0) > 0

  if (partneredBefore(a1, a2) || partneredBefore(b1, b2)) return false
  const crossPairs = [
    [a1, b1],
    [a1, b2],
    [a2, b1],
    [a2, b2],
  ]
  return crossPairs.every(([left, right]) => !opposedBefore(left, right))
}

describe('computeRoundRobinMatchupProgress', () => {
  it('uses one-match cooldown window when courts are 3 or fewer', () => {
    const cooldown = getCooldownIds(
      [
        { teamAIds: ['a', 'b'], teamBIds: ['c', 'd'] },
        { teamAIds: ['e', 'f'], teamBIds: ['g', 'h'] },
      ],
      3
    )

    expect([...cooldown].sort()).toEqual(['e', 'f', 'g', 'h'])
  })

  it('uses two-match cooldown window when courts are 4 or more', () => {
    const cooldown = getCooldownIds(
      [
        { teamAIds: ['a', 'b'], teamBIds: ['c', 'd'] },
        { teamAIds: ['e', 'f'], teamBIds: ['g', 'h'] },
      ],
      4
    )

    expect([...cooldown].sort()).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
    ])
  })

  it('returns 0/0 when not enough checked-in players', () => {
    expect(
      computeRoundRobinMatchupProgress([mk('a')], { gameMode: 'doubles' })
    ).toEqual({ remaining: 0, total: 0 })
  })

  it('computes singles totals from player pairs', () => {
    const players = [mk('a'), mk('b'), mk('c'), mk('d')]
    expect(computeRoundRobinMatchupProgress(players, { gameMode: 'singles' })).toEqual({
      remaining: 6,
      total: 6,
    })
  })

  it('computes doubles totals from player pairs when there are no locked teams', () => {
    const players = [mk('a'), mk('b'), mk('c'), mk('d')]
    expect(computeRoundRobinMatchupProgress(players, { gameMode: 'doubles' })).toEqual({
      remaining: 1,
      total: 1,
    })
  })

  it('computes team round robin totals for locked doubles teams (8 teams → 28)', () => {
    const players = Array.from({ length: 16 }, (_, index) => {
      const teamIndex = Math.floor(index / 2)
      const isFirst = index % 2 === 0
      const partnerIndex = isFirst ? index + 1 : index - 1
      return mk(`p${index}`, {
        teammateId: `p${partnerIndex}`,
        name: `Player ${teamIndex + 1}${isFirst ? 'a' : 'b'}`,
      })
    })
    expect(computeRoundRobinMatchupProgress(players, { gameMode: 'doubles' })).toEqual({
      remaining: 28,
      total: 28,
    })
  })

  it('decrements team remaining after a locked team vs team match', () => {
    const players = [
      mk('a', { teammateId: 'b' }),
      mk('b', { teammateId: 'a' }),
      mk('c', { teammateId: 'd' }),
      mk('d', { teammateId: 'c' }),
      mk('e', { teammateId: 'f' }),
      mk('f', { teammateId: 'e' }),
      mk('g', { teammateId: 'h' }),
      mk('h', { teammateId: 'g' }),
    ]
    expect(computeRoundRobinMatchupProgress(players, { gameMode: 'doubles' })).toEqual({
      remaining: 6,
      total: 6,
    })

    const { players: afterOne } = applyMatchResult(players, {
      courtIndex: 0,
      teamAIds: ['a', 'b'],
      teamBIds: ['c', 'd'],
      winningTeam: 'A',
    })
    expect(
      computeRoundRobinMatchupProgress(afterOne, { gameMode: 'doubles' })
    ).toEqual({ remaining: 5, total: 6 })
  })

  it('decrements remaining as player pairs meet when there are no locked teams', () => {
    const players = [mk('a'), mk('b'), mk('c'), mk('d')]
    const { players: afterOne } = applyMatchResult(players, {
      courtIndex: 0,
      teamAIds: ['a', 'b'],
      teamBIds: ['c', 'd'],
      winningTeam: 'A',
    })
    expect(
      computeRoundRobinMatchupProgress(afterOne, { gameMode: 'doubles' })
    ).toEqual({ remaining: 0, total: 1 })
  })

  it('uses the same total for locked pairs (4 players, 2 locked teams)', () => {
    const players = [
      mk('a', { teammateId: 'b' }),
      mk('b', { teammateId: 'a' }),
      mk('c', { teammateId: 'd' }),
      mk('d', { teammateId: 'c' }),
    ]
    expect(computeRoundRobinMatchupProgress(players, { gameMode: 'doubles' })).toEqual({
      remaining: 1,
      total: 1,
    })
  })

  it('ignores unchecked-in players', () => {
    const players = [
      mk('a'),
      mk('b'),
      mk('c'),
      mk('d'),
      mk('e', { checkedIn: false }),
    ]
    expect(computeRoundRobinMatchupProgress(players, { gameMode: 'doubles' })).toEqual({
      remaining: 1,
      total: 1,
    })
  })

  it('decrements remaining after each new team-vs-team match (4 teams)', () => {
    const players = [
      mk('a', { teammateId: 'b' }),
      mk('b', { teammateId: 'a' }),
      mk('c', { teammateId: 'd' }),
      mk('d', { teammateId: 'c' }),
      mk('e', { teammateId: 'f' }),
      mk('f', { teammateId: 'e' }),
      mk('g', { teammateId: 'h' }),
      mk('h', { teammateId: 'g' }),
    ]
    expect(computeRoundRobinMatchupProgress(players, { gameMode: 'doubles' })).toEqual({
      remaining: 6,
      total: 6,
    })

    const afterFirst = applyMatchResult(players, {
      courtIndex: 0,
      teamAIds: ['a', 'b'],
      teamBIds: ['g', 'h'],
      winningTeam: 'A',
    }).players
    expect(computeRoundRobinMatchupProgress(afterFirst, { gameMode: 'doubles' })).toEqual({
      remaining: 5,
      total: 6,
    })

    const afterSecond = applyMatchResult(afterFirst, {
      courtIndex: 1,
      teamAIds: ['c', 'd'],
      teamBIds: ['e', 'f'],
      winningTeam: 'A',
    }).players
    expect(computeRoundRobinMatchupProgress(afterSecond, { gameMode: 'doubles' })).toEqual({
      remaining: 4,
      total: 6,
    })
  })
})

describe('generateRoundRobinCourt — locked team scheduling', () => {
  const fourTeams = () => [
    mk('a', { teammateId: 'b' }),
    mk('b', { teammateId: 'a' }),
    mk('c', { teammateId: 'd' }),
    mk('d', { teammateId: 'c' }),
    mk('e', { teammateId: 'f' }),
    mk('f', { teammateId: 'e' }),
    mk('g', { teammateId: 'h' }),
    mk('h', { teammateId: 'g' }),
  ]

  const teamIds = (court) => ({
    a: court.teamA.map((p) => p.id).sort().join(','),
    b: court.teamB.map((p) => p.id).sort().join(','),
  })

  const isTeamPair = (court, left, right) => {
    const { a, b } = teamIds(court)
    const leftKey = [...left].sort().join(',')
    const rightKey = [...right].sort().join(',')
    return (
      (a === leftKey && b === rightKey) || (a === rightKey && b === leftKey)
    )
  }

  it('schedules an unmet team pairing after two team matchups are scored', () => {
    let players = fourTeams()
    players = applyMatchResult(players, {
      courtIndex: 0,
      teamAIds: ['a', 'b'],
      teamBIds: ['g', 'h'],
      winningTeam: 'A',
    }).players
    players = applyMatchResult(players, {
      courtIndex: 1,
      teamAIds: ['c', 'd'],
      teamBIds: ['e', 'f'],
      winningTeam: 'A',
    }).players

    const court = generateRoundRobinCourt(players, {
      courtIndex: 0,
      matchHistory: [],
      courts: 2,
      gameMode: 'doubles',
    })

    expect(isTeamPair(court, ['a', 'b'], ['g', 'h'])).toBe(false)
    expect(isTeamPair(court, ['c', 'd'], ['e', 'f'])).toBe(false)
  })
})

describe('generateRoundRobinCourt — doubles', () => {
  it('returns a 2v2 court', () => {
    const players = [mk('a'), mk('b'), mk('c'), mk('d')]
    const court = generateRoundRobinCourt(players, {
      courtIndex: 0,
      matchHistory: [],
      courts: 1,
      gameMode: 'doubles',
    })
    expect(court).not.toBeNull()
    expect(court.teamA).toHaveLength(2)
    expect(court.teamB).toHaveLength(2)
  })

  it('returns null when fewer than 4 players are available', () => {
    const players = [mk('a'), mk('b'), mk('c')]
    const court = generateRoundRobinCourt(players, {
      courtIndex: 0,
      matchHistory: [],
      courts: 1,
      gameMode: 'doubles',
    })
    expect(court).toBeNull()
  })

  it('rotates partners so a repeated partnership is avoided', () => {
    // a & b have already partnered once.
    const players = [
      mk('a', { partnerCounts: { b: 1 } }),
      mk('b', { partnerCounts: { a: 1 } }),
      mk('c'),
      mk('d'),
    ]
    const court = generateRoundRobinCourt(players, {
      courtIndex: 0,
      matchHistory: [],
      courts: 1,
      gameMode: 'doubles',
    })
    const aWithB =
      (court.teamA.some((p) => p.id === 'a') &&
        court.teamA.some((p) => p.id === 'b')) ||
      (court.teamB.some((p) => p.id === 'a') &&
        court.teamB.some((p) => p.id === 'b'))
    expect(aWithB).toBe(false)
  })

  it('prefers foursomes whose members have met the fewest times', () => {
    // a, b, c, d have all met (played together). e and f are fresh.
    const met = { a: 1, b: 1, c: 1, d: 1 }
    const players = [
      mk('a', { gamesPlayed: 1, opponentCounts: { ...met, a: undefined } }),
      mk('b', { gamesPlayed: 1 }),
      mk('c', { gamesPlayed: 1 }),
      mk('d', { gamesPlayed: 1 }),
      mk('e'),
      mk('f'),
    ]
    // Mark a-b-c-d as mutually met.
    ;['a', 'b', 'c', 'd'].forEach((x) => {
      const p = players.find((pl) => pl.id === x)
      p.opponentCounts = {}
      ;['a', 'b', 'c', 'd'].forEach((y) => {
        if (x !== y) p.opponentCounts[y] = 1
      })
    })
    const court = generateRoundRobinCourt(players, {
      courtIndex: 0,
      matchHistory: [],
      courts: 1,
      gameMode: 'doubles',
    })
    const chosen = [...court.teamA, ...court.teamB].map((p) => p.id)
    expect(chosen).toContain('e')
    expect(chosen).toContain('f')
  })

  it('keeps rested players in the next court (cooldown)', () => {
    let players = [mk('a'), mk('b'), mk('c'), mk('d'), mk('e'), mk('f')]
    const court1 = generateRoundRobinCourt(players, {
      courtIndex: 0,
      matchHistory: [],
      courts: 1,
      gameMode: 'doubles',
    })
    const game1Ids = new Set([...court1.teamA, ...court1.teamB].map((p) => p.id))
    const restedIds = players
      .filter((p) => !game1Ids.has(p.id))
      .map((p) => p.id)

    const result = playGame(players, court1)
    players = result.players
    const matchHistory = [result.historyEntry]

    const court2 = generateRoundRobinCourt(players, {
      courtIndex: 0,
      matchHistory,
      courts: 1,
      gameMode: 'doubles',
    })
    const game2Ids = [...court2.teamA, ...court2.teamB].map((p) => p.id)
    restedIds.forEach((id) => expect(game2Ids).toContain(id))
  })
})

describe('generateRoundRobinCourt — locked pairs (doubles)', () => {
  const teamContains = (team, id) => team.some((p) => p.id === id)
  const sameTeam = (court, id1, id2) =>
    (teamContains(court.teamA, id1) && teamContains(court.teamA, id2)) ||
    (teamContains(court.teamB, id1) && teamContains(court.teamB, id2))

  it('keeps a locked pair together as one team (pair + 2 solos)', () => {
    const players = [
      mk('a', { teammateId: 'b' }),
      mk('b', { teammateId: 'a' }),
      mk('c'),
      mk('d'),
    ]
    const court = generateRoundRobinCourt(players, {
      courtIndex: 0,
      matchHistory: [],
      courts: 1,
      gameMode: 'doubles',
    })
    expect(sameTeam(court, 'a', 'b')).toBe(true)
    // The two solos form the opposing team.
    expect(sameTeam(court, 'c', 'd')).toBe(true)
  })

  it('keeps two locked pairs on opposite teams', () => {
    const players = [
      mk('a', { teammateId: 'b' }),
      mk('b', { teammateId: 'a' }),
      mk('c', { teammateId: 'd' }),
      mk('d', { teammateId: 'c' }),
    ]
    const court = generateRoundRobinCourt(players, {
      courtIndex: 0,
      matchHistory: [],
      courts: 1,
      gameMode: 'doubles',
    })
    expect(sameTeam(court, 'a', 'b')).toBe(true)
    expect(sameTeam(court, 'c', 'd')).toBe(true)
    expect(sameTeam(court, 'a', 'c')).toBe(false)
  })

  it('does not deprioritize a locked pair for repeatedly partnering each other', () => {
    // a & b are locked and have already partnered several times. Despite the
    // high partner count, they should still be picked because their forced
    // partnership is excluded from the met-score and they have the fewest games.
    const players = [
      mk('a', { teammateId: 'b', gamesPlayed: 1, partnerCounts: { b: 3 } }),
      mk('b', { teammateId: 'a', gamesPlayed: 1, partnerCounts: { a: 3 } }),
      mk('c', { gamesPlayed: 5 }),
      mk('d', { gamesPlayed: 5 }),
      mk('e', { gamesPlayed: 5 }),
      mk('f', { gamesPlayed: 5 }),
    ]
    const court = generateRoundRobinCourt(players, {
      courtIndex: 0,
      matchHistory: [],
      courts: 1,
      gameMode: 'doubles',
    })
    const chosen = [...court.teamA, ...court.teamB].map((p) => p.id)
    expect(chosen).toContain('a')
    expect(chosen).toContain('b')
    expect(sameTeam(court, 'a', 'b')).toBe(true)
  })

  it('ignores teammateId in singles (1v1)', () => {
    const players = [
      mk('a', { teammateId: 'b' }),
      mk('b', { teammateId: 'a' }),
      mk('c'),
      mk('d'),
    ]
    const court = generateRoundRobinCourt(players, {
      courtIndex: 0,
      matchHistory: [],
      courts: 1,
      gameMode: 'singles',
    })
    expect(court.teamA).toHaveLength(1)
    expect(court.teamB).toHaveLength(1)
  })

  it('excludes incomplete pairs from matchups when only one partner is checked in', () => {
    const players = [
      mk('a', { teammateId: 'b' }),
      mk('b', { teammateId: 'a', checkedIn: false }),
      mk('c', { teammateId: 'd' }),
      mk('d', { teammateId: 'c' }),
      mk('e', { teammateId: 'f' }),
      mk('f', { teammateId: 'e' }),
      mk('g', { teammateId: 'h' }),
      mk('h', { teammateId: 'g' }),
    ]
    expect(computeRoundRobinMatchupProgress(players, { gameMode: 'doubles' })).toEqual({
      remaining: 3,
      total: 3,
    })
  })

  it('does not place a checked-in player on court when their partner is checked out', () => {
    const players = [
      mk('a', { teammateId: 'b' }),
      mk('b', { teammateId: 'a', checkedIn: false }),
      mk('c'),
      mk('d'),
      mk('e'),
      mk('f'),
    ]
    const court = generateRoundRobinCourt(players, {
      courtIndex: 0,
      matchHistory: [],
      courts: 1,
      gameMode: 'doubles',
    })
    const chosen = [...court.teamA, ...court.teamB].map((p) => p.id)
    expect(chosen).not.toContain('a')
  })
})

describe('generateRoundRobinCourt — singles', () => {
  it('returns a 1v1 court', () => {
    const players = [mk('a'), mk('b'), mk('c'), mk('d')]
    const court = generateRoundRobinCourt(players, {
      courtIndex: 0,
      matchHistory: [],
      courts: 1,
      gameMode: 'singles',
    })
    expect(court.teamA).toHaveLength(1)
    expect(court.teamB).toHaveLength(1)
  })

  it('returns null when fewer than 2 players are available', () => {
    const players = [mk('a')]
    const court = generateRoundRobinCourt(players, {
      courtIndex: 0,
      matchHistory: [],
      courts: 1,
      gameMode: 'singles',
    })
    expect(court).toBeNull()
  })

  it('uses rested players for the next match (cooldown / coverage)', () => {
    let players = [mk('a'), mk('b'), mk('c'), mk('d')]
    const court1 = generateRoundRobinCourt(players, {
      courtIndex: 0,
      matchHistory: [],
      courts: 1,
      gameMode: 'singles',
    })
    const game1Ids = new Set([court1.teamA[0].id, court1.teamB[0].id])
    const expectedRested = players
      .filter((p) => !game1Ids.has(p.id))
      .map((p) => p.id)
      .sort()

    const result = playGame(players, court1)
    players = result.players

    const court2 = generateRoundRobinCourt(players, {
      courtIndex: 0,
      matchHistory: [result.historyEntry],
      courts: 1,
      gameMode: 'singles',
    })
    const game2Ids = [court2.teamA[0].id, court2.teamB[0].id].sort()
    expect(game2Ids).toEqual(expectedRested)
  })
})

describe('applyMatchResult / revertMatchResult', () => {
  it('updates games, wins/losses and partner/opponent counts without changing skill', () => {
    const players = [mk('a'), mk('b'), mk('c'), mk('d')]
    const { players: next, historyEntry } = applyMatchResult(players, {
      courtIndex: 0,
      teamAIds: ['a', 'b'],
      teamBIds: ['c', 'd'],
      winningTeam: 'A',
    })

    const a = next.find((p) => p.id === 'a')
    const c = next.find((p) => p.id === 'c')

    expect(a.wins).toBe(1)
    expect(a.losses).toBe(0)
    expect(a.gamesPlayed).toBe(1)
    expect(a.partnerCounts).toEqual({ b: 1 })
    expect(a.opponentCounts).toEqual({ c: 1, d: 1 })
    expect(a.skillLevel).toBe('Beginner')

    expect(c.losses).toBe(1)
    expect(c.gamesPlayed).toBe(1)
    expect(c.partnerCounts).toEqual({ d: 1 })
    expect(c.opponentCounts).toEqual({ a: 1, b: 1 })
    expect(c.skillLevel).toBe('Beginner')

    expect(historyEntry.skillChanges).toEqual({})
    // metCount sums both directions, so a single shared game reads as 2.
    expect(metCount(a, c)).toBe(2)
  })

  it('revert restores the previous state', () => {
    const players = [mk('a'), mk('b'), mk('c'), mk('d')]
    const result = { courtIndex: 0, teamAIds: ['a', 'b'], teamBIds: ['c', 'd'], winningTeam: 'A' }
    const { players: applied } = applyMatchResult(players, result)
    const reverted = revertMatchResult(applied, result)

    reverted.forEach((player) => {
      expect(player.gamesPlayed).toBe(0)
      expect(player.wins).toBe(0)
      expect(player.losses).toBe(0)
      expect(player.partnerCounts).toEqual({})
      expect(player.opponentCounts).toEqual({})
    })
  })

  it('achieves full singles coverage before any rematch', () => {
    // 4 players, single court. Over the first 6 games every distinct pair should
    // appear exactly once before any pairing repeats.
    let players = [mk('a'), mk('b'), mk('c'), mk('d')]
    let matchHistory = []
    const seen = new Set()

    for (let i = 0; i < 6; i += 1) {
      const court = generateRoundRobinCourt(players, {
        courtIndex: 0,
        matchHistory,
        courts: 1,
        gameMode: 'singles',
      })
      const pair = idsOf([court.teamA[0], court.teamB[0]]).join('-')
      expect(seen.has(pair)).toBe(false)
      seen.add(pair)
      const result = playGame(players, court)
      players = result.players
      matchHistory = [...matchHistory, result.historyEntry]
    }

    expect(seen.size).toBe(6)
  })
})

describe('league lastMatch storage helpers', () => {
  it('sets per-player lastMatch when League has more than 2 courts', () => {
    const players = [mk('a'), mk('b'), mk('c'), mk('d')]
    const { players: next } = applyLeagueMatchResult(
      players,
      {
        courtIndex: 2,
        teamAIds: ['a', 'b'],
        teamBIds: ['c', 'd'],
        winningTeam: 'A',
      },
      { numberOfCourts: 3 }
    )

    expect(next.find((p) => p.id === 'a').lastMatch).toEqual({
      courtIndex: 2,
      teamAIds: ['a', 'b'],
      teamBIds: ['c', 'd'],
      result: 'win',
    })
    expect(next.find((p) => p.id === 'c').lastMatch).toEqual({
      courtIndex: 2,
      teamAIds: ['a', 'b'],
      teamBIds: ['c', 'd'],
      result: 'loss',
    })
  })

  it('sets lastMatch even when League has 2 courts or fewer', () => {
    const players = [mk('a'), mk('b'), mk('c'), mk('d')]
    const { players: next } = applyLeagueMatchResult(
      players,
      {
        courtIndex: 1,
        teamAIds: ['a', 'b'],
        teamBIds: ['c', 'd'],
        winningTeam: 'A',
      },
      { numberOfCourts: 2 }
    )

    expect(next.find((p) => p.id === 'a').lastMatch).toEqual({
      courtIndex: 1,
      teamAIds: ['a', 'b'],
      teamBIds: ['c', 'd'],
      result: 'win',
    })
    expect(next.find((p) => p.id === 'c').lastMatch).toEqual({
      courtIndex: 1,
      teamAIds: ['a', 'b'],
      teamBIds: ['c', 'd'],
      result: 'loss',
    })
  })

  it('revertLeagueMatchResult restores prior lastMatch from history', () => {
    const players = [mk('a'), mk('b'), mk('c'), mk('d'), mk('e'), mk('f')]

    const first = applyLeagueMatchResult(
      players,
      {
        courtIndex: 0,
        teamAIds: ['a', 'b'],
        teamBIds: ['c', 'd'],
        winningTeam: 'A',
      },
      { numberOfCourts: 3 }
    )
    const firstHistory = { ...first.historyEntry, id: 'm1', timestamp: 1000 }

    const second = applyLeagueMatchResult(
      first.players,
      {
        courtIndex: 1,
        teamAIds: ['a', 'e'],
        teamBIds: ['b', 'f'],
        winningTeam: 'B',
      },
      { numberOfCourts: 3 }
    )
    const secondResult = {
      courtIndex: 1,
      teamAIds: ['a', 'e'],
      teamBIds: ['b', 'f'],
      winningTeam: 'B',
      id: 'm2',
    }
    const secondHistory = { ...second.historyEntry, id: 'm2', timestamp: 2000 }

    const reverted = revertLeagueMatchResult(second.players, secondResult, {
      numberOfCourts: 3,
      matchHistory: [firstHistory, secondHistory],
    })

    expect(reverted.find((p) => p.id === 'a').lastMatch).toEqual({
      courtIndex: 0,
      teamAIds: ['a', 'b'],
      teamBIds: ['c', 'd'],
      result: 'win',
    })
    expect(reverted.find((p) => p.id === 'b').lastMatch).toEqual({
      courtIndex: 0,
      teamAIds: ['a', 'b'],
      teamBIds: ['c', 'd'],
      result: 'win',
    })
    expect(reverted.find((p) => p.id === 'e').lastMatch).toBeNull()
    expect(reverted.find((p) => p.id === 'f').lastMatch).toBeNull()
  })

  it('derivePlayerLastMatch picks newest timestamp from unsorted history', () => {
    const history = [
      {
        timestamp: 10,
        courtIndex: 0,
        teamAIds: ['a', 'b'],
        teamBIds: ['c', 'd'],
        winningTeam: 'A',
      },
      {
        timestamp: 30,
        courtIndex: 2,
        teamAIds: ['a', 'f'],
        teamBIds: ['g', 'h'],
        winningTeam: 'B',
      },
      {
        timestamp: 20,
        courtIndex: 1,
        teamAIds: ['a', 'e'],
        teamBIds: ['i', 'j'],
        winningTeam: 'A',
      },
    ]

    expect(derivePlayerLastMatch('a', history)).toEqual({
      courtIndex: 2,
      teamAIds: ['a', 'f'],
      teamBIds: ['g', 'h'],
      result: 'loss',
    })
  })
})

describe('generateLeagueCourt — doubles priorities', () => {
  it('prefers mixed-skill teams when fresh assignments exist', () => {
    const players = [
      mk('a', { skillLevel: 'Beginner', gender: 'Male' }),
      mk('b', { skillLevel: 'Beginner', gender: 'Male' }),
      mk('c', { skillLevel: 'Advanced', gender: 'Male' }),
      mk('d', { skillLevel: 'Advanced', gender: 'Male' }),
    ]

    const court = generateLeagueCourt(players, {
      courtIndex: 0,
      courts: 1,
      gameMode: 'doubles',
      matchHistory: [],
      courtMatchups: [],
    })

    const teamASkills = new Set(court.teamA.map((player) => player.skillLevel))
    const teamBSkills = new Set(court.teamB.map((player) => player.skillLevel))
    expect(teamASkills.size).toBe(2)
    expect(teamBSkills.size).toBe(2)
    expect(isFreshCourt(players, court)).toBe(true)
  })

  it('prefers mixed-gender teams when skill preference is tied', () => {
    const players = [
      mk('a', { skillLevel: 'Beginner', gender: 'Male' }),
      mk('b', { skillLevel: 'Advanced', gender: 'Male' }),
      mk('c', { skillLevel: 'Beginner', gender: 'Female' }),
      mk('d', { skillLevel: 'Advanced', gender: 'Female' }),
    ]

    const court = generateLeagueCourt(players, {
      courtIndex: 0,
      courts: 1,
      gameMode: 'doubles',
      matchHistory: [],
      courtMatchups: [],
    })

    const teamAGenders = new Set(court.teamA.map((player) => player.gender))
    const teamBGenders = new Set(court.teamB.map((player) => player.gender))
    expect(teamAGenders.size).toBe(2)
    expect(teamBGenders.size).toBe(2)
    expect(isFreshCourt(players, court)).toBe(true)
  })

  it('falls back to original pairing when no fresh combinations exist', () => {
    const repeatedCounts = { b: 1, c: 1, d: 1 }
    const players = [
      mk('a', {
        partnerCounts: repeatedCounts,
        opponentCounts: repeatedCounts,
      }),
      mk('b', {
        partnerCounts: { a: 1, c: 1, d: 1 },
        opponentCounts: { a: 1, c: 1, d: 1 },
      }),
      mk('c', {
        partnerCounts: { a: 1, b: 1, d: 1 },
        opponentCounts: { a: 1, b: 1, d: 1 },
      }),
      mk('d', {
        partnerCounts: { a: 1, b: 1, c: 1 },
        opponentCounts: { a: 1, b: 1, c: 1 },
      }),
    ]

    const court = generateLeagueCourt(players, {
      courtIndex: 0,
      courts: 1,
      gameMode: 'doubles',
      matchHistory: [],
      courtMatchups: [],
    })

    expect(court).not.toBeNull()
    expect(court.teamA).toHaveLength(2)
    expect(court.teamB).toHaveLength(2)
  })

  it('replaces exhausted foursomes and finds a fresh combination', () => {
    const players = [
      mk('a', {
        queueOrder: 1,
        partnerCounts: { b: 1, c: 1, d: 1 },
        opponentCounts: { b: 1, c: 1, d: 1 },
      }),
      mk('b', {
        queueOrder: 2,
        partnerCounts: { a: 1, c: 1, d: 1 },
        opponentCounts: { a: 1, c: 1, d: 1 },
      }),
      mk('c', {
        queueOrder: 3,
        partnerCounts: { a: 1, b: 1, d: 1 },
        opponentCounts: { a: 1, b: 1, d: 1 },
      }),
      mk('d', {
        queueOrder: 4,
        partnerCounts: { a: 1, b: 1, c: 1 },
        opponentCounts: { a: 1, b: 1, c: 1 },
      }),
      mk('e', { queueOrder: 5, skillLevel: 'Novice', gender: 'Male' }),
      mk('f', { queueOrder: 6, skillLevel: 'Intermediate', gender: 'Female' }),
      mk('g', { queueOrder: 7, skillLevel: 'Beginner', gender: 'Female' }),
      mk('h', { queueOrder: 8, skillLevel: 'Advanced', gender: 'Male' }),
    ]

    const court = generateLeagueCourt(players, {
      courtIndex: 0,
      courts: 1,
      gameMode: 'doubles',
      matchHistory: [],
      courtMatchups: [],
    })

    const chosenIds = new Set([...court.teamA, ...court.teamB].map((player) => player.id))
    expect(chosenIds.has('e')).toBe(true)
    expect(chosenIds.has('f')).toBe(true)
    expect(isFreshCourt(players, court)).toBe(true)
  })

  it('keeps locked pairs together in league doubles', () => {
    const players = [
      mk('a', { teammateId: 'b', skillLevel: 'Beginner', gender: 'Male' }),
      mk('b', { teammateId: 'a', skillLevel: 'Advanced', gender: 'Female' }),
      mk('c', { skillLevel: 'Beginner', gender: 'Male' }),
      mk('d', { skillLevel: 'Advanced', gender: 'Female' }),
    ]

    const court = generateLeagueCourt(players, {
      courtIndex: 0,
      courts: 1,
      gameMode: 'doubles',
      matchHistory: [],
      courtMatchups: [],
    })

    const sameTeam =
      (court.teamA.some((player) => player.id === 'a') &&
        court.teamA.some((player) => player.id === 'b')) ||
      (court.teamB.some((player) => player.id === 'a') &&
        court.teamB.some((player) => player.id === 'b'))
    expect(sameTeam).toBe(true)
  })

  it('keeps locked pairs together when no fresh league assignment exists', () => {
    const repeatedCounts = { b: 1, c: 1, d: 1 }
    const players = [
      mk('a', {
        teammateId: 'b',
        partnerCounts: repeatedCounts,
        opponentCounts: repeatedCounts,
      }),
      mk('b', {
        teammateId: 'a',
        partnerCounts: { a: 1, c: 1, d: 1 },
        opponentCounts: { a: 1, c: 1, d: 1 },
      }),
      mk('c', {
        partnerCounts: { a: 1, b: 1, d: 1 },
        opponentCounts: { a: 1, b: 1, d: 1 },
      }),
      mk('d', {
        partnerCounts: { a: 1, b: 1, c: 1 },
        opponentCounts: { a: 1, b: 1, c: 1 },
      }),
    ]

    const court = generateLeagueCourt(players, {
      courtIndex: 0,
      courts: 1,
      gameMode: 'doubles',
      matchHistory: [],
      courtMatchups: [],
    })

    expect(court).not.toBeNull()
    const sameTeam =
      (court.teamA.some((player) => player.id === 'a') &&
        court.teamA.some((player) => player.id === 'b')) ||
      (court.teamB.some((player) => player.id === 'a') &&
        court.teamB.some((player) => player.id === 'b'))
    expect(sameTeam).toBe(true)
  })
})

describe('generateLeagueCourt — dynamic last-court rule', () => {
  const makeRoster = (count = 8) =>
    Array.from({ length: count }, (_, index) =>
      mk(`p${index + 1}`, { queueOrder: index + 1 })
    )

  const selectedIds = (court) =>
    new Set([...court.teamA, ...court.teamB].map((player) => player.id))

  const withLastCourt = (players, playerId, courtIndex) =>
    players.map((player) =>
      player.id === playerId
        ? {
            ...player,
            lastMatch: {
              courtIndex,
              teamAIds: [playerId, 'x1'],
              teamBIds: ['x2', 'x3'],
              result: 'win',
            },
          }
        : player
    )

  it('uses queue head as anchor and excludes others who last played the same court', () => {
    let players = makeRoster(20)
    players = withLastCourt(players, 'p1', 2)
    players = withLastCourt(players, 'p5', 2)
    players = withLastCourt(players, 'p6', 2)

    const court = generateLeagueCourt(players, {
      courtIndex: 2,
      courts: 4,
      gameMode: 'doubles',
      matchHistory: [],
      courtMatchups: [],
    })

    const chosen = selectedIds(court)
    expect(chosen.has('p1')).toBe(true)
    expect(chosen.has('p5')).toBe(false)
    expect(chosen.has('p6')).toBe(false)
  })

  it('applies anchor-last-court exclusion even when generating a different court index', () => {
    let players = makeRoster(20)
    players = withLastCourt(players, 'p1', 1)
    players = withLastCourt(players, 'p5', 1)
    players = withLastCourt(players, 'p6', 1)

    const court = generateLeagueCourt(players, {
      courtIndex: 2,
      courts: 4,
      gameMode: 'doubles',
      matchHistory: [],
      courtMatchups: [],
    })

    const chosen = selectedIds(court)
    expect(chosen.has('p1')).toBe(true)
    expect(chosen.has('p5')).toBe(false)
    expect(chosen.has('p6')).toBe(false)
  })

  it('uses anchor-last-court exclusion for other anchor court values', () => {
    let players = makeRoster(20)
    players = withLastCourt(players, 'p1', 0)
    players = withLastCourt(players, 'p5', 0)
    players = withLastCourt(players, 'p6', 0)

    const court = generateLeagueCourt(players, {
      courtIndex: 2,
      courts: 4,
      gameMode: 'doubles',
      matchHistory: [],
      courtMatchups: [],
    })

    const chosen = selectedIds(court)
    expect(chosen.has('p1')).toBe(true)
    expect(chosen.has('p5')).toBe(false)
    expect(chosen.has('p6')).toBe(false)
  })

  it('falls back to normal League selection when anchor has no last-court data', () => {
    const players = makeRoster(8)
    const court = generateLeagueCourt(players, {
      courtIndex: 2,
      courts: 4,
      gameMode: 'doubles',
      matchHistory: [],
      courtMatchups: [],
    })

    expect(court).not.toBeNull()
    expect(selectedIds(court).size).toBe(4)
  })

  it('falls back when not enough players remain after excluding the target court', () => {
    let players = makeRoster(6)
    players = withLastCourt(players, 'p1', 0)
    players = withLastCourt(players, 'p2', 0)
    players = withLastCourt(players, 'p3', 0)
    players = withLastCourt(players, 'p4', 0)
    players = withLastCourt(players, 'p5', 0)

    const court = generateLeagueCourt(players, {
      courtIndex: 0,
      courts: 2,
      gameMode: 'doubles',
      matchHistory: [],
      courtMatchups: [],
    })

    expect(court).not.toBeNull()
    expect(selectedIds(court).size).toBe(4)
  })

  it('derives last court from matchHistory when excluding remaining players', () => {
    let players = makeRoster(20)
    players = withLastCourt(players, 'p1', 3)

    const court = generateLeagueCourt(players, {
      courtIndex: 3,
      courts: 4,
      gameMode: 'doubles',
      matchHistory: [
        {
          courtIndex: 3,
          teamAIds: ['p2', 'p5'],
          teamBIds: ['p9', 'p10'],
          winningTeam: 'A',
          timestamp: 1,
        },
      ],
      courtMatchups: [],
    })

    const chosen = selectedIds(court)
    expect(chosen.has('p1')).toBe(true)
    expect(chosen.has('p2')).toBe(false)
    expect(chosen.has('p5')).toBe(false)
  })

  it('includes locked partners when applying the dynamic last-court rule', () => {
    let players = makeRoster(20).map((player) =>
      player.id === 'p1'
        ? { ...player, teammateId: 'p2' }
        : player.id === 'p2'
          ? { ...player, teammateId: 'p1' }
          : player
    )
    players = withLastCourt(players, 'p1', 2)
    players = withLastCourt(players, 'p5', 2)
    players = withLastCourt(players, 'p6', 2)

    const court = generateLeagueCourt(players, {
      courtIndex: 2,
      courts: 4,
      gameMode: 'doubles',
      matchHistory: [],
      courtMatchups: [],
    })

    const chosen = selectedIds(court)
    expect(chosen.has('p1')).toBe(true)
    expect(chosen.has('p2')).toBe(true)
    const sameTeam =
      (court.teamA.some((player) => player.id === 'p1') &&
        court.teamA.some((player) => player.id === 'p2')) ||
      (court.teamB.some((player) => player.id === 'p1') &&
        court.teamB.some((player) => player.id === 'p2'))
    expect(sameTeam).toBe(true)
  })

  it('does not apply dynamic rule when checked-in is not above courts times players-per-court', () => {
    let players = makeRoster(8)
    players = withLastCourt(players, 'p1', 2)
    players = withLastCourt(players, 'p2', 2)
    players = withLastCourt(players, 'p3', 2)
    players = withLastCourt(players, 'p4', 2)

    const court = generateLeagueCourt(players, {
      courtIndex: 2,
      courts: 2,
      gameMode: 'doubles',
      matchHistory: [],
      courtMatchups: [],
    })

    const chosen = selectedIds(court)
    expect(chosen.has('p2')).toBe(true)
    expect(chosen.has('p3')).toBe(true)
    expect(chosen.has('p4')).toBe(true)
  })

  it('falls back to normal League generation when large-roster filter leaves too few players', () => {
    let players = makeRoster(20)
    players = withLastCourt(players, 'p1', 0)
    players = withLastCourt(players, 'p2', 0)
    players = withLastCourt(players, 'p3', 0)
    players = withLastCourt(players, 'p4', 0)
    players = withLastCourt(players, 'p5', 0)

    const court = generateLeagueCourt(players, {
      courtIndex: 0,
      courts: 4,
      gameMode: 'doubles',
      matchHistory: [],
      courtMatchups: [],
      excludePlayerIds: [
        'p7',
        'p8',
        'p9',
        'p10',
        'p11',
        'p12',
        'p13',
        'p14',
        'p15',
        'p16',
        'p17',
        'p18',
        'p19',
        'p20',
      ],
    })

    expect(court).not.toBeNull()
    expect(selectedIds(court).size).toBe(4)
  })
})

describe('buildLeagueUpNextPreview', () => {
  it('limits doubles Up Next to courts * 4 in check-in order when all games are 0', () => {
    const players = [
      mk('d', { queueOrder: 4 }),
      mk('a', { queueOrder: 1 }),
      mk('c', { queueOrder: 3 }),
      mk('b', { queueOrder: 2 }),
      mk('e', { queueOrder: 5 }),
      mk('f', { queueOrder: 6 }),
      mk('g', { queueOrder: 7 }),
      mk('h', { queueOrder: 8 }),
      mk('i', { queueOrder: 9 }),
    ]

    const { queue, onDeckPlayers } = buildLeagueUpNextPreview(players, {
      numberOfCourts: 2,
      gameMode: 'doubles',
      courtMatchups: [],
      matchHistory: [],
    })

    expect(queue.map((player) => player.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
    ])
    expect(onDeckPlayers.map((player) => player.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('limits singles Up Next to courts * 2 in check-in order when all games are 0', () => {
    const players = [
      mk('c', { queueOrder: 3 }),
      mk('a', { queueOrder: 1 }),
      mk('b', { queueOrder: 2 }),
      mk('d', { queueOrder: 4 }),
    ]

    const { queue, onDeckPlayers } = buildLeagueUpNextPreview(players, {
      numberOfCourts: 2,
      gameMode: 'singles',
      courtMatchups: [],
      matchHistory: [],
    })

    expect(queue.map((player) => player.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(onDeckPlayers.map((player) => player.id)).toEqual(['a', 'b'])
  })

  it('excludes on-court and cooldown players from Up Next', () => {
    const players = [
      mk('a', { queueOrder: 1 }),
      mk('b', { queueOrder: 2 }),
      mk('c', { queueOrder: 3 }),
      mk('d', { queueOrder: 4 }),
      mk('e', { queueOrder: 5 }),
    ]
    const courtMatchups = [
      {
        teamA: [players[0], players[1]],
        teamB: [players[2], players[3]],
      },
    ]
    const matchHistory = [
      {
        teamAIds: ['a', 'b'],
        teamBIds: ['c', 'd'],
      },
    ]

    const { queue } = buildLeagueUpNextPreview(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      courtMatchups,
      matchHistory,
    })

    expect(queue.map((player) => player.id)).toEqual(['e'])
  })

  it('orders by fewest games when not everyone has zero games', () => {
    const players = [
      mk('a', { queueOrder: 1, gamesPlayed: 2 }),
      mk('b', { queueOrder: 2, gamesPlayed: 0 }),
      mk('c', { queueOrder: 3, gamesPlayed: 1 }),
      mk('d', { queueOrder: 4, gamesPlayed: 0 }),
    ]

    const { queue } = buildLeagueUpNextPreview(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      courtMatchups: [],
      matchHistory: [],
    })

    expect(queue.map((player) => player.id)).toEqual(['b', 'd', 'c', 'a'])
  })

  it('fills Up Next from sitting out first, then cooldown', () => {
    const players = [
      mk('a', { queueOrder: 1, gamesPlayed: 0 }),
      mk('b', { queueOrder: 2, gamesPlayed: 0 }),
      mk('c', { queueOrder: 3, gamesPlayed: 1 }),
      mk('d', { queueOrder: 4, gamesPlayed: 1 }),
      mk('e', { queueOrder: 5, gamesPlayed: 0 }),
      mk('f', { queueOrder: 6, gamesPlayed: 0 }),
    ]
    const courtMatchups = [
      {
        teamA: [players[4], players[5]],
        teamB: [mk('x'), mk('y')],
      },
    ]
    const matchHistory = [
      {
        teamAIds: ['c', 'd'],
        teamBIds: ['z1', 'z2'],
      },
    ]

    const { queue } = buildLeagueUpNextPreview(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      courtMatchups,
      matchHistory,
    })

    // c and d are on cooldown, so they should appear only after sitting-out a and b.
    expect(queue.map((player) => player.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('reaches courts * groupSize by topping up from cooldown at the bottom', () => {
    const players = [
      mk('a', { queueOrder: 1 }),
      mk('b', { queueOrder: 2 }),
      mk('c', { queueOrder: 3 }),
      mk('d', { queueOrder: 4, gamesPlayed: 1 }),
      mk('e', { queueOrder: 5, gamesPlayed: 1 }),
      mk('f', { queueOrder: 6, gamesPlayed: 1 }),
      mk('g', { queueOrder: 7, gamesPlayed: 1 }),
      mk('h', { queueOrder: 8, gamesPlayed: 1 }),
      mk('i', { queueOrder: 9, gamesPlayed: 1 }),
    ]
    const matchHistory = [
      {
        teamAIds: ['d', 'e'],
        teamBIds: ['f', 'g'],
      },
    ]

    const { queue } = buildLeagueUpNextPreview(players, {
      numberOfCourts: 2,
      gameMode: 'doubles',
      courtMatchups: [],
      matchHistory,
    })

    expect(queue.map((player) => player.id)).toEqual([
      'a',
      'b',
      'c',
      'h',
      'i',
      'd',
      'e',
      'f',
    ])
  })
})

describe('League Up Next freeze', () => {
  it('captures a frozen queue block sized to courts * players per court', () => {
    const players = Array.from({ length: 8 }, (_, index) =>
      mk(`p${index + 1}`, { queueOrder: index + 1 })
    )

    const snapshot = captureLeagueFreeze(players, {
      numberOfCourts: 2,
      gameMode: 'doubles',
      courtMatchups: [],
      matchHistory: [],
    })

    expect(snapshot).not.toBeNull()
    expect(snapshot.queueIds).toHaveLength(8)
    expect(snapshot.numberOfCourts).toBe(2)
    expect(snapshot.gameMode).toBe('doubles')
  })

  it('appends newly checked-in players after the frozen queue in display order', () => {
    const players = Array.from({ length: 4 }, (_, index) =>
      mk(`p${index + 1}`, { queueOrder: index + 1 })
    )
    const snapshot = captureLeagueFreeze(players, {
      numberOfCourts: 2,
      gameMode: 'doubles',
      courtMatchups: [],
      matchHistory: [],
    })
    const expandedPlayers = [...players, mk('p5', { queueOrder: 5 })]
    const livePreview = buildLeagueUpNextPreview(expandedPlayers, {
      numberOfCourts: 2,
      gameMode: 'doubles',
      courtMatchups: [],
      matchHistory: [],
    })

    const merged = mergeFrozenUpNextDisplay(
      snapshot,
      livePreview,
      expandedPlayers,
      8
    )

    expect(merged.map((player) => player.id).slice(0, 4)).toEqual(
      snapshot.queueIds.slice(0, 4)
    )
    expect(merged.map((player) => player.id)).toContain('p5')
    expect(merged.map((player) => player.id).indexOf('p5')).toBe(4)
  })

  it('invalidates freeze when a queued player checks out', () => {
    const players = [
      mk('a', { queueOrder: 1 }),
      mk('b', { queueOrder: 2 }),
      mk('c', { queueOrder: 3 }),
      mk('d', { queueOrder: 4 }),
    ]
    const snapshot = captureLeagueFreeze(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      courtMatchups: [],
      matchHistory: [],
    })
    const checkedOut = players.map((player) =>
      player.id === 'c' ? { ...player, checkedIn: false } : player
    )

    expect(
      isLeagueFreezeValid(snapshot, checkedOut, [], {
        numberOfCourts: 1,
        gameMode: 'doubles',
      })
    ).toBe(false)
  })

  it('advances freeze by leading with a fresh on-deck court and keeping tail order', () => {
    const players = Array.from({ length: 8 }, (_, index) =>
      mk(`p${index + 1}`, { queueOrder: index + 1 })
    )
    const snapshot = captureLeagueFreeze(players, {
      numberOfCourts: 2,
      gameMode: 'doubles',
      courtMatchups: [],
      matchHistory: [],
    })
    const generatedIds = snapshot.onDeckCourt
      ? [...snapshot.onDeckCourt.teamAIds, ...snapshot.onDeckCourt.teamBIds]
      : snapshot.queueIds.slice(0, 4)
    const byId = new Map(players.map((player) => [player.id, player]))
    const courtMatchups = [
      {
        teamA: generatedIds.slice(0, 2).map((id) => byId.get(id)),
        teamB: generatedIds.slice(2, 4).map((id) => byId.get(id)),
      },
    ]

    const next = advanceLeagueFreeze(snapshot, generatedIds, players, {
      numberOfCourts: 2,
      gameMode: 'doubles',
      courtMatchups,
      matchHistory: [],
    })

    expect(next).not.toBeNull()
    expect(next.queueIds).toHaveLength(4)
    expect(next.queueIds).toEqual(['p5', 'p6', 'p7', 'p8'])
    expect(next.queueIds.slice(0, 4)).toEqual(
      next.onDeckCourt
        ? [...next.onDeckCourt.teamAIds, ...next.onDeckCourt.teamBIds]
        : next.queueIds.slice(0, 4)
    )
    generatedIds.forEach((id) => {
      expect(next.queueIds).not.toContain(id)
    })
  })
})
