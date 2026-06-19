import { describe, expect, it } from 'vitest'
import {
  generateRoundRobinCourt,
  applyMatchResult,
  revertMatchResult,
  metCount,
  computeRoundRobinMatchupProgress,
} from '../RoundRobin.engine'

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

describe('computeRoundRobinMatchupProgress', () => {
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
