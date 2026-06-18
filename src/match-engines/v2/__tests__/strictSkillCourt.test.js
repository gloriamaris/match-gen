import { describe, expect, it } from 'vitest'
import {
  generateStrictSkillCourt,
  skillRankOf,
} from '../ProgressivePlay.engine'

const makePlayer = (id, overrides = {}) => ({
  id,
  name: id,
  skillLevel: 'Novice',
  checkedIn: true,
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  queueOrder: 0,
  partnerCounts: {},
  opponentCounts: {},
  ...overrides,
})

const courtPlayerIds = (court) =>
  [...court.teamA, ...court.teamB].map((p) => p.id)

const courtRanks = (court) =>
  [...court.teamA, ...court.teamB].map((p) => skillRankOf(p.skillLevel))

describe('generateStrictSkillCourt', () => {
  it('builds a same-level court when 4 players share a rank', () => {
    const players = [
      makePlayer('a', { skillLevel: 'Novice' }),
      makePlayer('b', { skillLevel: 'Novice' }),
      makePlayer('c', { skillLevel: 'Novice' }),
      makePlayer('d', { skillLevel: 'Novice' }),
    ]
    const court = generateStrictSkillCourt(players, {
      matchHistory: [],
      courts: 1,
    })
    expect(court).not.toBeNull()
    expect(new Set(courtRanks(court)).size).toBe(1)
    expect(courtPlayerIds(court).sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('returns null when no single rank has 4 available players', () => {
    const players = [
      makePlayer('a', { skillLevel: 'Beginner' }),
      makePlayer('b', { skillLevel: 'Novice' }),
      makePlayer('c', { skillLevel: 'Intermediate' }),
      makePlayer('d', { skillLevel: 'Advanced' }),
      makePlayer('e', { skillLevel: 'Novice' }),
      makePlayer('f', { skillLevel: 'Beginner' }),
    ]
    const court = generateStrictSkillCourt(players, {
      matchHistory: [],
      courts: 2,
    })
    expect(court).toBeNull()
  })

  it('never produces a cross-level court', () => {
    const players = [
      makePlayer('i1', { skillLevel: 'Intermediate', gamesPlayed: 2 }),
      makePlayer('i2', { skillLevel: 'Intermediate', gamesPlayed: 2 }),
      makePlayer('b1', { skillLevel: 'Beginner', gamesPlayed: 0 }),
      makePlayer('b2', { skillLevel: 'Beginner', gamesPlayed: 0 }),
      makePlayer('b3', { skillLevel: 'Beginner', gamesPlayed: 0 }),
      makePlayer('b4', { skillLevel: 'Beginner', gamesPlayed: 0 }),
    ]
    const court = generateStrictSkillCourt(players, {
      matchHistory: [],
      courts: 1,
    })
    expect(court).not.toBeNull()
    const ranks = courtRanks(court)
    expect(new Set(ranks).size).toBe(1)
    expect(ranks[0]).toBe(skillRankOf('Beginner'))
  })

  it('prioritizes the rank with the lowest min gamesPlayed among rested players', () => {
    const players = [
      makePlayer('n1', { skillLevel: 'Novice', gamesPlayed: 3 }),
      makePlayer('n2', { skillLevel: 'Novice', gamesPlayed: 3 }),
      makePlayer('n3', { skillLevel: 'Novice', gamesPlayed: 3 }),
      makePlayer('n4', { skillLevel: 'Novice', gamesPlayed: 3 }),
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
    const ranks = courtRanks(court)
    expect(new Set(ranks).size).toBe(1)
    expect(ranks[0]).toBe(skillRankOf('Beginner'))
  })

  it('fills from cooldown players at the same rank when sitting-out is short', () => {
    // 4 Novices total: 3 rested, 1 on cooldown (was in the last match).
    const players = [
      makePlayer('rest1', { skillLevel: 'Novice', gamesPlayed: 1 }),
      makePlayer('rest2', { skillLevel: 'Novice', gamesPlayed: 1 }),
      makePlayer('rest3', { skillLevel: 'Novice', gamesPlayed: 1 }),
      makePlayer('cd', { skillLevel: 'Novice', gamesPlayed: 1 }),
    ]
    const matchHistory = [
      {
        courtIndex: 0,
        teamAIds: ['cd', 'other1'],
        teamBIds: ['other2', 'other3'],
        winningTeam: 'A',
      },
    ]
    const court = generateStrictSkillCourt(players, {
      matchHistory,
      courts: 1,
    })
    expect(court).not.toBeNull()
    expect(new Set(courtRanks(court)).size).toBe(1)
    expect(courtPlayerIds(court).sort()).toEqual(['cd', 'rest1', 'rest2', 'rest3'])
  })

  it('respects excludePlayerIds for players already on other courts', () => {
    const players = [
      makePlayer('a', { skillLevel: 'Novice' }),
      makePlayer('b', { skillLevel: 'Novice' }),
      makePlayer('c', { skillLevel: 'Novice' }),
      makePlayer('d', { skillLevel: 'Novice' }),
      makePlayer('e', { skillLevel: 'Novice' }),
    ]
    const court = generateStrictSkillCourt(players, {
      matchHistory: [],
      courts: 2,
      excludePlayerIds: ['a'],
    })
    expect(court).not.toBeNull()
    const ids = courtPlayerIds(court)
    expect(ids).not.toContain('a')
  })

  it('honors a fairness hint when 4 preferred players share a rank', () => {
    const players = [
      makePlayer('hint1', { skillLevel: 'Beginner', gamesPlayed: 1 }),
      makePlayer('hint2', { skillLevel: 'Beginner', gamesPlayed: 1 }),
      makePlayer('hint3', { skillLevel: 'Beginner', gamesPlayed: 1 }),
      makePlayer('hint4', { skillLevel: 'Beginner', gamesPlayed: 1 }),
      makePlayer('extra', { skillLevel: 'Beginner', gamesPlayed: 0 }),
    ]
    const court = generateStrictSkillCourt(players, {
      matchHistory: [],
      courts: 1,
      preferredPlayerIds: ['hint1', 'hint2', 'hint3', 'hint4'],
    })
    expect(court).not.toBeNull()
    expect(courtPlayerIds(court).sort()).toEqual([
      'hint1',
      'hint2',
      'hint3',
      'hint4',
    ])
  })

  it('returns null when fewer than 4 checked-in players exist', () => {
    const players = [
      makePlayer('a', { skillLevel: 'Novice' }),
      makePlayer('b', { skillLevel: 'Novice' }),
      makePlayer('c', { skillLevel: 'Novice' }),
    ]
    const court = generateStrictSkillCourt(players, {
      matchHistory: [],
      courts: 1,
    })
    expect(court).toBeNull()
  })
})
