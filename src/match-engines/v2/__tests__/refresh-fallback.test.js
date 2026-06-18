import { describe, expect, it } from 'vitest'
import {
  generateMatches,
  generateStrictSkillCourt,
  skillRankOf,
} from '../ProgressivePlay.engine'
import {
  generateCourtAfterScore,
  generateFallbackCourtByPriority,
  selectPrimaryThroneWinner,
} from '../ThroneRun.engine'

const makePlayer = (id, overrides = {}) => ({
  id,
  name: id,
  skillLevel: 'Novice',
  checkedIn: true,
  gamesPlayed: 1,
  wins: 0,
  losses: 0,
  partnerCounts: {},
  opponentCounts: {},
  ...overrides,
})

// ---------------------------------------------------------------------------
// Existing simulation tests (Throne + PP both fail)
// ---------------------------------------------------------------------------

describe('refresh fallback simulation', () => {
  it('4-player session after Beginner+Novice win may fail PP fallback', () => {
    const players = [
      makePlayer('A', { skillLevel: 'Beginner' }),
      makePlayer('B', { skillLevel: 'Novice' }),
      makePlayer('C', { skillLevel: 'Beginner' }),
      makePlayer('D', { skillLevel: 'Novice' }),
    ]
    const afterWin = [
      makePlayer('A', { skillLevel: 'Novice', gamesPlayed: 1 }),
      makePlayer('B', { skillLevel: 'Intermediate', gamesPlayed: 1 }),
      makePlayer('C', { skillLevel: 'Beginner', gamesPlayed: 1 }),
      makePlayer('D', { skillLevel: 'Novice', gamesPlayed: 1 }),
    ]
    const history = [
      {
        courtIndex: 0,
        teamAIds: ['A', 'B'],
        teamBIds: ['C', 'D'],
        winningTeam: 'A',
      },
    ]
    const courtMatchups = [null]

    let generatedCourt = generateCourtAfterScore(afterWin, {
      winnerIds: ['A', 'B'],
      courtMatchups,
      matchHistory: history,
      courts: 1,
    })
    expect(generatedCourt).toBeNull()

    const w1 = afterWin.find((p) => p.id === 'A')
    const w2 = afterWin.find((p) => p.id === 'B')
    const primary = selectPrimaryThroneWinner(w1, w2)
    generatedCourt = generateCourtAfterScore(afterWin, {
      winnerIds: [primary.id],
      courtMatchups,
      matchHistory: history,
      courts: 1,
    })
    expect(generatedCourt).toBeNull()

    const result = generateMatches(afterWin, {
      courts: 1,
      cooldownCourts: 1,
      matchHistory: history,
      excludePlayerIds: [],
    })
    expect(result.courts[0] ?? null).toBeNull()
  })

  it('12-player session PP fallback succeeds after split promotion', () => {
    const afterWin = [
      makePlayer('A', { skillLevel: 'Novice', gamesPlayed: 1 }),
      makePlayer('B', { skillLevel: 'Intermediate', gamesPlayed: 1 }),
      ...Array.from({ length: 10 }, (_, i) =>
        makePlayer(`P${i}`, { skillLevel: i % 2 === 0 ? 'Novice' : 'Beginner' })
      ),
    ]
    const history = [
      {
        courtIndex: 0,
        teamAIds: ['A', 'B'],
        teamBIds: ['P0', 'P1'],
        winningTeam: 'A',
      },
    ]
    const result = generateMatches(afterWin, {
      courts: 1,
      cooldownCourts: 2,
      matchHistory: history,
      excludePlayerIds: [],
    })
    expect(result.courts[0] ?? null).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// generateFallbackCourtByPriority tests
// ---------------------------------------------------------------------------

describe('generateFallbackCourtByPriority', () => {
  it('returns null when fewer than 4 checked-in players exist', () => {
    const players = [
      makePlayer('A'),
      makePlayer('B'),
      makePlayer('C'),
    ]
    const court = generateFallbackCourtByPriority(players, {
      courtIndex: 0,
      courtMatchups: [null],
      matchHistory: [],
      courts: 1,
    })
    expect(court).toBeNull()
  })

  it('returns null when 4 checked-in but 1 on another court leaves only 3', () => {
    const players = [
      makePlayer('A'),
      makePlayer('B'),
      makePlayer('C'),
      makePlayer('D'),
    ]
    const courtMatchups = [
      null,
      { teamA: [players[3]], teamB: [] },
    ]
    const court = generateFallbackCourtByPriority(players, {
      courtIndex: 0,
      courtMatchups,
      matchHistory: [],
      courts: 2,
    })
    expect(court).toBeNull()
  })

  it('lowest-gamesPlayed player is always the starter (teamA[0])', () => {
    const players = [
      makePlayer('A', { gamesPlayed: 5, skillLevel: 'Novice' }),
      makePlayer('B', { gamesPlayed: 0, skillLevel: 'Novice' }),
      makePlayer('C', { gamesPlayed: 3, skillLevel: 'Novice' }),
      makePlayer('D', { gamesPlayed: 2, skillLevel: 'Novice' }),
    ]
    const court = generateFallbackCourtByPriority(players, {
      courtIndex: 0,
      courtMatchups: [null],
      matchHistory: [],
      courts: 1,
    })
    expect(court).not.toBeNull()
    expect(court.teamA[0].id).toBe('B')
  })

  it('prefers same-skill players before adjacent levels', () => {
    const players = [
      makePlayer('starter', { gamesPlayed: 0, skillLevel: 'Intermediate' }),
      makePlayer('same1', { gamesPlayed: 1, skillLevel: 'Intermediate' }),
      makePlayer('same2', { gamesPlayed: 1, skillLevel: 'Intermediate' }),
      makePlayer('adj1', { gamesPlayed: 1, skillLevel: 'Advanced' }),
      makePlayer('far1', { gamesPlayed: 1, skillLevel: 'Beginner' }),
    ]
    const court = generateFallbackCourtByPriority(players, {
      courtIndex: 0,
      courtMatchups: [null],
      matchHistory: [],
      courts: 1,
    })
    expect(court).not.toBeNull()
    const ids = [court.teamA[1].id, court.teamB[0].id, court.teamB[1].id]
    expect(ids).toContain('same1')
    expect(ids).toContain('same2')
    expect(ids).toContain('adj1')
    expect(ids).not.toContain('far1')
  })

  it('falls back to adjacent levels when same-skill pool is too small', () => {
    const players = [
      makePlayer('starter', { gamesPlayed: 0, skillLevel: 'Intermediate' }),
      makePlayer('same1', { gamesPlayed: 1, skillLevel: 'Intermediate' }),
      makePlayer('adj1', { gamesPlayed: 1, skillLevel: 'Advanced' }),
      makePlayer('adj2', { gamesPlayed: 1, skillLevel: 'Novice' }),
    ]
    const court = generateFallbackCourtByPriority(players, {
      courtIndex: 0,
      courtMatchups: [null],
      matchHistory: [],
      courts: 1,
    })
    expect(court).not.toBeNull()
    const ids = [court.teamA[1].id, court.teamB[0].id, court.teamB[1].id]
    expect(ids).toContain('same1')
    expect(ids).toContain('adj1')
    expect(ids).toContain('adj2')
  })

  it('prefers rested (Sitting Out) players over cooldown players', () => {
    const players = [
      makePlayer('starter', { gamesPlayed: 0, skillLevel: 'Novice' }),
      makePlayer('rested1', { gamesPlayed: 2, skillLevel: 'Novice' }),
      makePlayer('rested2', { gamesPlayed: 2, skillLevel: 'Novice' }),
      makePlayer('cd1', { gamesPlayed: 1, skillLevel: 'Novice' }),
      makePlayer('cd2', { gamesPlayed: 1, skillLevel: 'Novice' }),
    ]
    const history = [
      {
        courtIndex: 0,
        teamAIds: ['cd1', 'cd2'],
        teamBIds: ['starter', 'rested1'],
        winningTeam: 'A',
      },
    ]
    const court = generateFallbackCourtByPriority(players, {
      courtIndex: 0,
      courtMatchups: [null],
      matchHistory: history,
      courts: 1,
    })
    expect(court).not.toBeNull()
    const ids = [court.teamA[1].id, court.teamB[0].id, court.teamB[1].id]
    expect(ids).toContain('rested2')
  })

  it('uses cooldown players as last resort when not enough rested', () => {
    const players = [
      makePlayer('A', { gamesPlayed: 0, skillLevel: 'Novice' }),
      makePlayer('B', { gamesPlayed: 1, skillLevel: 'Novice' }),
      makePlayer('C', { gamesPlayed: 1, skillLevel: 'Novice' }),
      makePlayer('D', { gamesPlayed: 1, skillLevel: 'Novice' }),
    ]
    const history = [
      {
        courtIndex: 0,
        teamAIds: ['B', 'C'],
        teamBIds: ['D', 'A'],
        winningTeam: 'A',
      },
    ]
    const court = generateFallbackCourtByPriority(players, {
      courtIndex: 0,
      courtMatchups: [null],
      matchHistory: history,
      courts: 1,
    })
    expect(court).not.toBeNull()
    const allIds = [...court.teamA, ...court.teamB].map((p) => p.id)
    expect(allIds).toHaveLength(4)
    expect(new Set(allIds).size).toBe(4)
  })

  it('excludes players on other courts but not the target court', () => {
    const players = [
      makePlayer('A', { gamesPlayed: 0 }),
      makePlayer('B', { gamesPlayed: 1 }),
      makePlayer('C', { gamesPlayed: 1 }),
      makePlayer('D', { gamesPlayed: 1 }),
      makePlayer('E', { gamesPlayed: 1 }),
      makePlayer('F', { gamesPlayed: 1 }),
      makePlayer('G', { gamesPlayed: 2 }),
      makePlayer('H', { gamesPlayed: 2 }),
    ]
    const courtMatchups = [
      null,
      { teamA: [players[4], players[5]], teamB: [players[6], players[7]] },
    ]
    const court = generateFallbackCourtByPriority(players, {
      courtIndex: 0,
      courtMatchups,
      matchHistory: [],
      courts: 2,
    })
    expect(court).not.toBeNull()
    const allIds = [...court.teamA, ...court.teamB].map((p) => p.id)
    expect(allIds).not.toContain('E')
    expect(allIds).not.toContain('F')
    expect(allIds).not.toContain('G')
    expect(allIds).not.toContain('H')
    expect(allIds).toContain('A')
  })

  it('resolves the 4-player cross-group scenario that Throne + PP cannot', () => {
    const afterWin = [
      makePlayer('A', { skillLevel: 'Novice', gamesPlayed: 1 }),
      makePlayer('B', { skillLevel: 'Intermediate', gamesPlayed: 1 }),
      makePlayer('C', { skillLevel: 'Beginner', gamesPlayed: 1 }),
      makePlayer('D', { skillLevel: 'Novice', gamesPlayed: 1 }),
    ]
    const history = [
      {
        courtIndex: 0,
        teamAIds: ['A', 'B'],
        teamBIds: ['C', 'D'],
        winningTeam: 'A',
      },
    ]

    const throneResult = generateCourtAfterScore(afterWin, {
      winnerIds: ['A', 'B'],
      courtMatchups: [null],
      matchHistory: history,
      courts: 1,
    })
    expect(throneResult).toBeNull()

    const ppResult = generateMatches(afterWin, {
      courts: 1,
      cooldownCourts: 1,
      matchHistory: history,
      excludePlayerIds: [],
    })
    expect(ppResult.courts[0] ?? null).toBeNull()

    const fallback = generateFallbackCourtByPriority(afterWin, {
      courtIndex: 0,
      courtMatchups: [null],
      matchHistory: history,
      courts: 1,
    })
    expect(fallback).not.toBeNull()
    const allIds = [...fallback.teamA, ...fallback.teamB].map((p) => p.id)
    expect(allIds).toHaveLength(4)
    expect(new Set(allIds).size).toBe(4)
  })

  it('stable tie-break by id when gamesPlayed are equal', () => {
    const players = [
      makePlayer('Z', { gamesPlayed: 0, skillLevel: 'Novice' }),
      makePlayer('A', { gamesPlayed: 0, skillLevel: 'Novice' }),
      makePlayer('M', { gamesPlayed: 0, skillLevel: 'Novice' }),
      makePlayer('B', { gamesPlayed: 0, skillLevel: 'Novice' }),
    ]
    const court = generateFallbackCourtByPriority(players, {
      courtIndex: 0,
      courtMatchups: [null],
      matchHistory: [],
      courts: 1,
    })
    expect(court).not.toBeNull()
    expect(court.teamA[0].id).toBe('A')
  })

  it('does not select non-checked-in players', () => {
    const players = [
      makePlayer('A', { gamesPlayed: 0 }),
      makePlayer('B', { gamesPlayed: 0 }),
      makePlayer('C', { gamesPlayed: 0 }),
      makePlayer('D', { gamesPlayed: 0, checkedIn: false }),
    ]
    const court = generateFallbackCourtByPriority(players, {
      courtIndex: 0,
      courtMatchups: [null],
      matchHistory: [],
      courts: 1,
    })
    expect(court).toBeNull()
  })

  it('fills from far-skill rested before any cooldown player', () => {
    const players = [
      makePlayer('starter', { gamesPlayed: 0, skillLevel: 'Beginner' }),
      makePlayer('far', { gamesPlayed: 1, skillLevel: 'Advanced' }),
      makePlayer('adj', { gamesPlayed: 1, skillLevel: 'Novice' }),
      makePlayer('cd_same', { gamesPlayed: 1, skillLevel: 'Beginner' }),
      makePlayer('extra', { gamesPlayed: 2, skillLevel: 'Beginner' }),
    ]
    const history = [
      {
        courtIndex: 0,
        teamAIds: ['cd_same', 'extra'],
        teamBIds: ['starter', 'adj'],
        winningTeam: 'A',
      },
    ]
    const court = generateFallbackCourtByPriority(players, {
      courtIndex: 0,
      courtMatchups: [null],
      matchHistory: history,
      courts: 2,
    })
    expect(court).not.toBeNull()
    const fillIds = [court.teamA[1].id, court.teamB[0].id, court.teamB[1].id]
    expect(fillIds).toContain('far')
    expect(fillIds.indexOf('far')).toBeLessThan(fillIds.indexOf('cd_same'))
    expect(court.teamA[1].id).not.toBe('cd_same')
  })

  it('prefers mixed partner and opponent pairings when possible', () => {
    const players = [
      makePlayer('starter', { skillLevel: 'Novice', gamesPlayed: 0, gender: 'Male' }),
      makePlayer('female', { skillLevel: 'Novice', gamesPlayed: 1, gender: 'Female' }),
      makePlayer('male', { skillLevel: 'Novice', gamesPlayed: 1, gender: 'Male' }),
      makePlayer('female2', { skillLevel: 'Novice', gamesPlayed: 1, gender: 'Female' }),
    ]
    const court = generateFallbackCourtByPriority(players, {
      courtIndex: 0,
      courtMatchups: [null],
      matchHistory: [],
      courts: 1,
    })

    expect(court.teamA[1].id).toBe('female')
    expect(court.teamB.map((player) => player.id).sort()).toEqual(['female2', 'male'])
  })
})

// ---------------------------------------------------------------------------
// Strict-mode regression: same scenario where the legacy fallback mixes
// skill levels, generateStrictSkillCourt must not.
// ---------------------------------------------------------------------------

describe('strict skill mode vs legacy fallback', () => {
  it('legacy fallback returns a cross-level court for a mixed pool', () => {
    const players = [
      makePlayer('i1', { skillLevel: 'Intermediate', gamesPlayed: 0 }),
      makePlayer('i2', { skillLevel: 'Intermediate', gamesPlayed: 2 }),
      makePlayer('b1', { skillLevel: 'Beginner', gamesPlayed: 2 }),
      makePlayer('b2', { skillLevel: 'Beginner', gamesPlayed: 2 }),
    ]
    const court = generateFallbackCourtByPriority(players, {
      courtIndex: 0,
      courtMatchups: [null],
      matchHistory: [],
      courts: 1,
    })
    expect(court).not.toBeNull()
    const ranks = [...court.teamA, ...court.teamB].map((p) =>
      skillRankOf(p.skillLevel)
    )
    expect(new Set(ranks).size).toBeGreaterThan(1)
  })

  it('strict builder never produces a cross-level court for the same pool', () => {
    const players = [
      makePlayer('i1', { skillLevel: 'Intermediate', gamesPlayed: 0 }),
      makePlayer('i2', { skillLevel: 'Intermediate', gamesPlayed: 2 }),
      makePlayer('b1', { skillLevel: 'Beginner', gamesPlayed: 2 }),
      makePlayer('b2', { skillLevel: 'Beginner', gamesPlayed: 2 }),
    ]
    const court = generateStrictSkillCourt(players, {
      matchHistory: [],
      courts: 1,
    })
    expect(court).toBeNull()
  })

  it('strict builder picks the lowest-games same-level group when one exists', () => {
    const players = [
      makePlayer('i1', { skillLevel: 'Intermediate', gamesPlayed: 3 }),
      makePlayer('i2', { skillLevel: 'Intermediate', gamesPlayed: 3 }),
      makePlayer('i3', { skillLevel: 'Intermediate', gamesPlayed: 3 }),
      makePlayer('i4', { skillLevel: 'Intermediate', gamesPlayed: 3 }),
      makePlayer('b1', { skillLevel: 'Beginner', gamesPlayed: 0 }),
      makePlayer('b2', { skillLevel: 'Beginner', gamesPlayed: 1 }),
      makePlayer('b3', { skillLevel: 'Beginner', gamesPlayed: 1 }),
      makePlayer('b4', { skillLevel: 'Beginner', gamesPlayed: 1 }),
    ]
    const court = generateStrictSkillCourt(players, {
      matchHistory: [],
      courts: 2,
    })
    expect(court).not.toBeNull()
    const ranks = [...court.teamA, ...court.teamB].map((p) =>
      skillRankOf(p.skillLevel)
    )
    expect(new Set(ranks).size).toBe(1)
    expect(ranks[0]).toBe(skillRankOf('Beginner'))
  })
})
