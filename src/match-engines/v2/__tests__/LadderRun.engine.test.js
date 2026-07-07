import { describe, expect, it } from 'vitest'
import {
  applyLadderRunMatchResult,
  advanceLadderRunFreeze,
  buildLadderRunUpNextPreview,
  captureLadderRunFreeze,
  generateLadderRunCourt,
  getLadderRunCooldownIds,
  isLadderRunFreezeValid,
  materializeFrozenLadderRunCourt,
  revertLadderRunMatchResult,
} from '../LadderRun.engine'
import { mergeFrozenUpNextDisplay } from '../progressivePlayCourtRefresh'

const makePlayer = (id, overrides = {}) => ({
  id,
  name: `Player ${id}`,
  skillLevel: 'Intermediate',
  checkedIn: true,
  gamesPlayed: 0,
  queueOrder: 0,
  ...overrides,
})

describe('applyLadderRunMatchResult', () => {
  it('stores lastResult plus partner/opponent history', () => {
    const players = [
      makePlayer('a', { skillLevel: 'Novice' }),
      makePlayer('b', { skillLevel: 'Novice' }),
      makePlayer('c', { skillLevel: 'Intermediate' }),
      makePlayer('d', { skillLevel: 'Intermediate' }),
    ]
    const result = applyLadderRunMatchResult(players, {
      courtIndex: 0,
      teamAIds: ['a', 'b'],
      teamBIds: ['c', 'd'],
      winningTeam: 'A',
    })
    const byId = new Map(result.players.map((player) => [player.id, player]))

    expect(byId.get('a').lastResult).toBe('win')
    expect(byId.get('b').lastResult).toBe('win')
    expect(byId.get('c').lastResult).toBe('loss')
    expect(byId.get('d').lastResult).toBe('loss')
    expect(byId.get('a').skillLevel).toBe('Novice')
    expect(byId.get('c').skillLevel).toBe('Intermediate')
    expect(byId.get('a').partnerCounts.b).toBe(1)
    expect(byId.get('a').opponentCounts.c).toBe(1)
    expect(result.historyEntry.skillChanges).toEqual({})
  })

  it('reverts wins/losses counters from a previous result', () => {
    const players = [makePlayer('a'), makePlayer('b'), makePlayer('c'), makePlayer('d')]
    const result = applyLadderRunMatchResult(players, {
      courtIndex: 0,
      teamAIds: ['a', 'b'],
      teamBIds: ['c', 'd'],
      winningTeam: 'A',
    })
    const reverted = revertLadderRunMatchResult(result.players, {
      courtIndex: 0,
      teamAIds: ['a', 'b'],
      teamBIds: ['c', 'd'],
      winningTeam: 'A',
    })
    const byId = new Map(reverted.map((player) => [player.id, player]))

    expect(byId.get('a').gamesPlayed).toBe(0)
    expect(byId.get('a').wins).toBe(0)
    expect(byId.get('c').losses).toBe(0)
  })
})

describe('buildLadderRunUpNextPreview', () => {
  it('groups doubles players by check-in order and same skill level', () => {
    const players = [
      makePlayer('n1', { skillLevel: 'Novice', queueOrder: 1 }),
      makePlayer('b1', { skillLevel: 'Beginner', queueOrder: 2 }),
      makePlayer('n2', { skillLevel: 'Novice', queueOrder: 3 }),
      makePlayer('n3', { skillLevel: 'Novice', queueOrder: 4 }),
      makePlayer('n4', { skillLevel: 'Novice', queueOrder: 5 }),
      makePlayer('b2', { skillLevel: 'Beginner', queueOrder: 6 }),
      makePlayer('b3', { skillLevel: 'Beginner', queueOrder: 7 }),
      makePlayer('b4', { skillLevel: 'Beginner', queueOrder: 8 }),
    ]

    const { queue, onDeckPlayers, groups } = buildLadderRunUpNextPreview(players, {
      numberOfCourts: 2,
      gameMode: 'doubles',
      allowAdjacentSkillMixing: false,
    })

    expect(queue.map((player) => player.id)).toEqual([
      'n1',
      'n2',
      'n3',
      'n4',
      'b1',
      'b2',
      'b3',
      'b4',
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0].map((player) => player.id)).toEqual(['n1', 'n2', 'n3', 'n4'])
    expect(groups[1].map((player) => player.id)).toEqual(['b1', 'b2', 'b3', 'b4'])
    expect(onDeckPlayers.map((player) => player.id)).toEqual(['n1', 'n2', 'n3', 'n4'])
  })

  it('limits singles Up Next to courts * 2 with groups of two', () => {
    const players = [
      makePlayer('n1', { skillLevel: 'Novice', queueOrder: 1 }),
      makePlayer('n2', { skillLevel: 'Novice', queueOrder: 2 }),
      makePlayer('b1', { skillLevel: 'Beginner', queueOrder: 3 }),
      makePlayer('b2', { skillLevel: 'Beginner', queueOrder: 4 }),
      makePlayer('i1', { skillLevel: 'Intermediate', queueOrder: 5 }),
      makePlayer('i2', { skillLevel: 'Intermediate', queueOrder: 6 }),
    ]

    const { queue, onDeckPlayers } = buildLadderRunUpNextPreview(players, {
      numberOfCourts: 2,
      gameMode: 'singles',
      allowAdjacentSkillMixing: false,
    })

    expect(queue.map((player) => player.id)).toEqual(['n1', 'n2', 'b1', 'b2'])
    expect(onDeckPlayers.map((player) => player.id)).toEqual(['n1', 'n2'])
  })

  it('fills short same-level groups from adjacent levels when mixing is on', () => {
    const players = [
      makePlayer('n1', { skillLevel: 'Novice', queueOrder: 1 }),
      makePlayer('n2', { skillLevel: 'Novice', queueOrder: 2 }),
      makePlayer('b1', { skillLevel: 'Beginner', queueOrder: 3 }),
      makePlayer('b2', { skillLevel: 'Beginner', queueOrder: 4 }),
      makePlayer('b3', { skillLevel: 'Beginner', queueOrder: 5 }),
      makePlayer('b4', { skillLevel: 'Beginner', queueOrder: 6 }),
    ]

    const { queue, groups } = buildLadderRunUpNextPreview(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      allowAdjacentSkillMixing: true,
    })

    expect(groups[0].map((player) => player.id)).toEqual(['n1', 'n2', 'b1', 'b2'])
    expect(queue.map((player) => player.id)).toEqual(['n1', 'n2', 'b1', 'b2'])
  })

  it('fallback-fills only same-skill players when strict grouping cannot form a full group', () => {
    const players = [
      makePlayer('n1', { skillLevel: 'Novice', queueOrder: 1 }),
      makePlayer('n2', { skillLevel: 'Novice', queueOrder: 2 }),
      makePlayer('b1', { skillLevel: 'Beginner', queueOrder: 3 }),
      makePlayer('b2', { skillLevel: 'Beginner', queueOrder: 4 }),
    ]

    const { queue, groups } = buildLadderRunUpNextPreview(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      allowAdjacentSkillMixing: false,
    })

    expect(groups).toEqual([])
    expect(queue.map((player) => player.id)).toEqual(['n1', 'n2'])
  })

  it('does not mix Novice with Advanced when adjacent skill mixing is on', () => {
    const players = [
      makePlayer('i1', { skillLevel: 'Intermediate', queueOrder: 1, gamesPlayed: 1, lastResult: 'win' }),
      makePlayer('a1', { skillLevel: 'Advanced', queueOrder: 2, gamesPlayed: 1, lastResult: 'win' }),
      makePlayer('n1', { skillLevel: 'Novice', queueOrder: 3, gamesPlayed: 1, lastResult: 'win' }),
      makePlayer('n2', { skillLevel: 'Novice', queueOrder: 4, gamesPlayed: 1, lastResult: 'win' }),
      makePlayer('i2', { skillLevel: 'Intermediate', queueOrder: 5, gamesPlayed: 1, lastResult: 'win' }),
      makePlayer('a2', { skillLevel: 'Advanced', queueOrder: 6, gamesPlayed: 1, lastResult: 'win' }),
    ]

    const { queue, groups, onDeckPlayers } = buildLadderRunUpNextPreview(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      allowAdjacentSkillMixing: true,
    })

    const bucketFor = (player) => {
      const rank = { Beginner: 0, Novice: 1, Intermediate: 2, Advanced: 3 }[player.skillLevel]
      return rank >= 2 ? 2 : 1
    }

    groups.forEach((group) => {
      const buckets = new Set(group.map(bucketFor))
      expect(buckets.size).toBe(1)
    })

    const onDeckBuckets = new Set(onDeckPlayers.map(bucketFor))
    expect(onDeckBuckets.size).toBe(1)
    expect(onDeckPlayers.map((player) => player.id).sort()).toEqual([
      'a1',
      'a2',
      'i1',
      'i2',
    ])
  })

  it('fills zero-game anchors from sitting-out players with the same skill level', () => {
    const players = [
      makePlayer('n1', { skillLevel: 'Novice', queueOrder: 1 }),
      makePlayer('n2', { skillLevel: 'Novice', queueOrder: 2 }),
      makePlayer('n3', { skillLevel: 'Novice', queueOrder: 3, gamesPlayed: 1 }),
      makePlayer('n4', { skillLevel: 'Novice', queueOrder: 4, gamesPlayed: 1 }),
    ]

    const { queue, groups } = buildLadderRunUpNextPreview(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      allowAdjacentSkillMixing: false,
    })

    expect(groups[0].map((player) => player.id)).toEqual(['n1', 'n2', 'n3', 'n4'])
    expect(queue.map((player) => player.id)).toEqual(['n1', 'n2', 'n3', 'n4'])
  })

  it('excludes checked-out and on-court players but still fallback-fills Up Next', () => {
    const players = [
      makePlayer('n1', { skillLevel: 'Novice', queueOrder: 1 }),
      makePlayer('n2', { skillLevel: 'Novice', queueOrder: 2, checkedIn: false }),
      makePlayer('n3', { skillLevel: 'Novice', queueOrder: 3 }),
      makePlayer('n4', { skillLevel: 'Novice', queueOrder: 4 }),
      makePlayer('n5', { skillLevel: 'Novice', queueOrder: 5 }),
    ]
    const courtMatchups = [
      {
        teamA: [players[4]],
        teamB: [makePlayer('on-court', { skillLevel: 'Novice' })],
      },
    ]

    const { queue } = buildLadderRunUpNextPreview(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      courtMatchups,
    })

    expect(queue.map((player) => player.id)).toEqual(['n1', 'n3', 'n4'])
  })

  it('tops up Up Next from cooldown when sitting-out players cannot fill a court', () => {
    const players = [
      makePlayer('n1', { skillLevel: 'Novice', queueOrder: 1 }),
      makePlayer('n2', { skillLevel: 'Novice', queueOrder: 2 }),
      makePlayer('n3', { skillLevel: 'Novice', queueOrder: 3, gamesPlayed: 1 }),
      makePlayer('n4', { skillLevel: 'Novice', queueOrder: 4, gamesPlayed: 1 }),
      makePlayer('n5', { skillLevel: 'Novice', queueOrder: 5, gamesPlayed: 1 }),
      makePlayer('n6', { skillLevel: 'Novice', queueOrder: 6, gamesPlayed: 1 }),
    ]
    const matchHistory = [
      {
        teamAIds: ['n3', 'n4'],
        teamBIds: ['n5', 'n6'],
      },
    ]

    const preview = buildLadderRunUpNextPreview(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      matchHistory,
    })

    // n1, n2 are sitting out; n3-n6 are on cooldown. Since sitting-out alone
    // cannot make a full court, cooldown players top the group up to four.
    expect(preview.queue.map((player) => player.id)).toEqual(['n1', 'n2', 'n3', 'n4'])
    expect(preview.onDeckPlayers.map((player) => player.id)).toEqual([
      'n1',
      'n2',
      'n3',
      'n4',
    ])
  })

  it('tops up multiple courts from cooldown while keeping sitting-out first', () => {
    const players = Array.from({ length: 10 }, (_, index) =>
      makePlayer(`p${index + 1}`, {
        skillLevel: 'Novice',
        queueOrder: index + 1,
        gamesPlayed: index + 1 > 6 ? 1 : 0,
      })
    )
    // p7-p10 played the most recent match, so they are on cooldown.
    const matchHistory = [
      {
        teamAIds: ['p7', 'p8'],
        teamBIds: ['p9', 'p10'],
      },
    ]

    const preview = buildLadderRunUpNextPreview(players, {
      numberOfCourts: 2,
      gameMode: 'doubles',
      matchHistory,
    })

    // Six sitting-out players fill the first court and start the second; the
    // remaining two slots are topped up from cooldown (p7, p8).
    expect(preview.queue.map((player) => player.id)).toEqual([
      'p1',
      'p2',
      'p3',
      'p4',
      'p5',
      'p6',
      'p7',
      'p8',
    ])
  })

  it('builds Up Next when only some sitting-out players still have zero games', () => {
    const players = [
      makePlayer('n1', { skillLevel: 'Novice', queueOrder: 1 }),
      makePlayer('n2', { skillLevel: 'Novice', queueOrder: 2, gamesPlayed: 1 }),
      makePlayer('n3', { skillLevel: 'Novice', queueOrder: 3 }),
      makePlayer('n4', { skillLevel: 'Novice', queueOrder: 4, gamesPlayed: 1 }),
      makePlayer('n5', { skillLevel: 'Novice', queueOrder: 5 }),
      makePlayer('n6', { skillLevel: 'Novice', queueOrder: 6, gamesPlayed: 1 }),
      makePlayer('n7', { skillLevel: 'Novice', queueOrder: 7 }),
      makePlayer('n8', { skillLevel: 'Novice', queueOrder: 8, gamesPlayed: 1 }),
    ]

    const preview = buildLadderRunUpNextPreview(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      allowAdjacentSkillMixing: false,
    })

    expect(preview.queue.map((player) => player.id)).toEqual([
      'n1',
      'n2',
      'n3',
      'n4',
    ])
  })

  it('fills zero-game groups first, then veteran groups', () => {
    const players = [
      makePlayer('z1', { queueOrder: 1, skillLevel: 'Novice' }),
      makePlayer('z2', { queueOrder: 2, skillLevel: 'Novice' }),
      makePlayer('z3', { queueOrder: 3, skillLevel: 'Novice' }),
      makePlayer('z4', { queueOrder: 4, skillLevel: 'Novice' }),
      makePlayer('v1', { queueOrder: 5, skillLevel: 'Novice', gamesPlayed: 1, lastResult: 'win' }),
      makePlayer('v2', { queueOrder: 6, skillLevel: 'Novice', gamesPlayed: 1, lastResult: 'win' }),
      makePlayer('v3', { queueOrder: 7, skillLevel: 'Novice', gamesPlayed: 1, lastResult: 'win' }),
      makePlayer('v4', { queueOrder: 8, skillLevel: 'Novice', gamesPlayed: 1, lastResult: 'win' }),
    ]

    const preview = buildLadderRunUpNextPreview(players, {
      numberOfCourts: 2,
      gameMode: 'doubles',
      allowAdjacentSkillMixing: false,
    })

    expect(preview.queue.map((player) => player.id)).toEqual([
      'z1',
      'z2',
      'z3',
      'z4',
      'v1',
      'v2',
      'v3',
      'v4',
    ])
  })

  it('groups veterans by winner/loser status', () => {
    const players = [
      makePlayer('w1', { queueOrder: 1, skillLevel: 'Novice', gamesPlayed: 2, lastResult: 'win' }),
      makePlayer('w2', { queueOrder: 2, skillLevel: 'Novice', gamesPlayed: 2, lastResult: 'win' }),
      makePlayer('w3', { queueOrder: 3, skillLevel: 'Novice', gamesPlayed: 2, lastResult: 'win' }),
      makePlayer('w4', { queueOrder: 4, skillLevel: 'Novice', gamesPlayed: 2, lastResult: 'win' }),
      makePlayer('l1', { queueOrder: 5, skillLevel: 'Novice', gamesPlayed: 2, lastResult: 'loss' }),
      makePlayer('l2', { queueOrder: 6, skillLevel: 'Novice', gamesPlayed: 2, lastResult: 'loss' }),
      makePlayer('l3', { queueOrder: 7, skillLevel: 'Novice', gamesPlayed: 2, lastResult: 'loss' }),
      makePlayer('l4', { queueOrder: 8, skillLevel: 'Novice', gamesPlayed: 2, lastResult: 'loss' }),
    ]

    const preview = buildLadderRunUpNextPreview(players, {
      numberOfCourts: 2,
      gameMode: 'doubles',
    })

    expect(preview.groups).toHaveLength(2)
    expect(preview.groups[0].every((player) => player.lastResult === 'win')).toBe(true)
    expect(preview.groups[1].every((player) => player.lastResult === 'loss')).toBe(true)
  })

  it('excludes players on cooldown from Up Next for one match', () => {
    const players = Array.from({ length: 8 }, (_, index) =>
      makePlayer(`p${index + 1}`, { skillLevel: 'Novice', queueOrder: index + 1 })
    )
    const matchHistory = [
      {
        teamAIds: ['p1', 'p2'],
        teamBIds: ['p3', 'p4'],
      },
    ]

    const cooldownIds = getLadderRunCooldownIds(matchHistory)
    expect([...cooldownIds].sort()).toEqual(['p1', 'p2', 'p3', 'p4'])

    const preview = buildLadderRunUpNextPreview(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      matchHistory,
    })

    expect(preview.queue.map((player) => player.id)).toEqual([
      'p5',
      'p6',
      'p7',
      'p8',
    ])
  })

  it('tops up entirely from cooldown when everyone is on cooldown', () => {
    const players = Array.from({ length: 8 }, (_, index) =>
      makePlayer(`p${index + 1}`, { skillLevel: 'Novice', queueOrder: index + 1 })
    )
    const matchHistory = [
      {
        teamAIds: ['p1', 'p2'],
        teamBIds: ['p3', 'p4'],
      },
      {
        teamAIds: ['p5', 'p6'],
        teamBIds: ['p7', 'p8'],
      },
    ]

    const cooldownIds = getLadderRunCooldownIds(matchHistory)
    expect([...cooldownIds].sort()).toEqual([
      'p1',
      'p2',
      'p3',
      'p4',
      'p5',
      'p6',
      'p7',
      'p8',
    ])

    const preview = buildLadderRunUpNextPreview(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      matchHistory,
    })

    // No sitting-out players remain, so Up Next tops up from cooldown in
    // check-in order to keep the next court ready.
    expect(preview.queue.map((player) => player.id)).toEqual([
      'p1',
      'p2',
      'p3',
      'p4',
    ])
  })

  it('caps Up Next at courts * groupSize even when more players are sitting out', () => {
    const players = Array.from({ length: 34 }, (_, index) =>
      makePlayer(`p${index + 1}`, { skillLevel: 'Novice', queueOrder: index + 1 })
    )
    const courtMatchups = Array.from({ length: 4 }, (_, courtIndex) => ({
      teamA: [players[courtIndex * 4], players[courtIndex * 4 + 1]],
      teamB: [players[courtIndex * 4 + 2], players[courtIndex * 4 + 3]],
    }))

    const preview = buildLadderRunUpNextPreview(players, {
      numberOfCourts: 4,
      gameMode: 'doubles',
      allowAdjacentSkillMixing: false,
      courtMatchups,
    })

    expect(preview.queue).toHaveLength(16)
    expect(preview.queue.map((player) => player.id)).toEqual(
      Array.from({ length: 16 }, (_, index) => `p${index + 17}`)
    )
    expect(preview.onDeckPlayers.map((player) => player.id)).toEqual([
      'p17',
      'p18',
      'p19',
      'p20',
    ])
  })

  it('keeps locked pairs together in Up Next using the higher skill level', () => {
    const players = [
      makePlayer('b1', {
        skillLevel: 'Beginner',
        queueOrder: 1,
        teammateId: 'n1',
      }),
      makePlayer('n1', {
        skillLevel: 'Novice',
        queueOrder: 2,
        teammateId: 'b1',
      }),
      makePlayer('n2', { skillLevel: 'Novice', queueOrder: 3 }),
      makePlayer('n3', { skillLevel: 'Novice', queueOrder: 4 }),
      makePlayer('n4', { skillLevel: 'Novice', queueOrder: 5 }),
    ]

    const preview = buildLadderRunUpNextPreview(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      allowAdjacentSkillMixing: false,
    })

    expect(preview.queue.map((player) => player.id)).toEqual([
      'b1',
      'n1',
      'n2',
      'n3',
    ])
  })

  it('reunites a locked pair from cooldown when topping up Up Next', () => {
    const players = [
      makePlayer('b1', {
        skillLevel: 'Beginner',
        queueOrder: 1,
        teammateId: 'n1',
      }),
      makePlayer('n1', {
        skillLevel: 'Novice',
        queueOrder: 2,
        teammateId: 'b1',
        gamesPlayed: 1,
      }),
      makePlayer('n2', { skillLevel: 'Novice', queueOrder: 3 }),
      makePlayer('n3', { skillLevel: 'Novice', queueOrder: 4 }),
      makePlayer('n4', { skillLevel: 'Novice', queueOrder: 5 }),
      makePlayer('n5', { skillLevel: 'Novice', queueOrder: 6 }),
    ]
    const matchHistory = [
      {
        teamAIds: ['n1', 'n5'],
        teamBIds: ['n6', 'on-court'],
      },
    ]

    const preview = buildLadderRunUpNextPreview(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      matchHistory,
    })

    // b1's locked partner n1 is on cooldown, so the pair cannot form from the
    // sitting-out pool. The cooldown top-up brings n1 back and keeps the pair
    // together (collective skill level = Novice), completing the group.
    expect(preview.queue.map((player) => player.id)).toEqual(['b1', 'n1', 'n2', 'n3'])
  })
})

describe('generateLadderRunCourt', () => {
  it('prefers mixed doubles pairings when possible', () => {
    const players = [
      makePlayer('m1', { gender: 'Male', skillLevel: 'Novice', queueOrder: 1 }),
      makePlayer('m2', { gender: 'Male', skillLevel: 'Novice', queueOrder: 2 }),
      makePlayer('f1', { gender: 'Female', skillLevel: 'Novice', queueOrder: 3 }),
      makePlayer('f2', { gender: 'Female', skillLevel: 'Novice', queueOrder: 4 }),
    ]

    const court = generateLadderRunCourt(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      allowAdjacentSkillMixing: false,
      courtMatchups: [],
      courtIndex: 0,
    })

    expect(court).not.toBeNull()
    const teamAGenders = court.teamA.map((player) => player.gender)
    const teamBGenders = court.teamB.map((player) => player.gender)
    expect(new Set(teamAGenders).size).toBe(2)
    expect(new Set(teamBGenders).size).toBe(2)
  })

  it('does not place Novice teams against Advanced teams when adjacent mixing is on', () => {
    const players = [
      makePlayer('n1', { gender: 'Male', skillLevel: 'Novice', queueOrder: 1, gamesPlayed: 1, lastResult: 'win' }),
      makePlayer('n2', { gender: 'Male', skillLevel: 'Novice', queueOrder: 2, gamesPlayed: 1, lastResult: 'win' }),
      makePlayer('a1', { gender: 'Male', skillLevel: 'Advanced', queueOrder: 3, gamesPlayed: 1, lastResult: 'win' }),
      makePlayer('a2', { gender: 'Male', skillLevel: 'Advanced', queueOrder: 4, gamesPlayed: 1, lastResult: 'win' }),
    ]

    const court = generateLadderRunCourt(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      allowAdjacentSkillMixing: true,
      courtMatchups: [],
      courtIndex: 0,
    })

    expect(court).toBeNull()
  })

  it('with adjacent mixing on, prefers Beginner+Novice and Intermediate+Advanced pairings', () => {
    const players = [
      makePlayer('b1', { gender: 'Male', skillLevel: 'Beginner', queueOrder: 1 }),
      makePlayer('b2', { gender: 'Male', skillLevel: 'Beginner', queueOrder: 2 }),
      makePlayer('n1', { gender: 'Male', skillLevel: 'Novice', queueOrder: 3 }),
      makePlayer('n2', { gender: 'Male', skillLevel: 'Novice', queueOrder: 4 }),
    ]

    const court = generateLadderRunCourt(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      allowAdjacentSkillMixing: true,
      courtMatchups: [],
      courtIndex: 0,
    })

    expect(court).not.toBeNull()
    const teamA = court.teamA.map((player) => player.skillLevel).sort()
    const teamB = court.teamB.map((player) => player.skillLevel).sort()
    expect(teamA).toEqual(['Beginner', 'Novice'])
    expect(teamB).toEqual(['Beginner', 'Novice'])
  })

  it('with adjacent mixing off, falls back to queue-order split', () => {
    const players = [
      makePlayer('n1', { gender: 'Male', skillLevel: 'Novice', queueOrder: 1 }),
      makePlayer('n2', { gender: 'Male', skillLevel: 'Novice', queueOrder: 2 }),
      makePlayer('n3', { gender: 'Male', skillLevel: 'Novice', queueOrder: 3 }),
      makePlayer('n4', { gender: 'Male', skillLevel: 'Novice', queueOrder: 4 }),
    ]

    const court = generateLadderRunCourt(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      allowAdjacentSkillMixing: false,
      courtMatchups: [],
      courtIndex: 0,
    })

    expect(court).not.toBeNull()
    expect(court.teamA.map((player) => player.id)).toEqual(['n1', 'n2'])
    expect(court.teamB.map((player) => player.id)).toEqual(['n3', 'n4'])
  })

  it('in singles mode, uses first two on-deck players as 1v1', () => {
    const players = [
      makePlayer('p1', { skillLevel: 'Novice', queueOrder: 1 }),
      makePlayer('p2', { skillLevel: 'Novice', queueOrder: 2 }),
      makePlayer('p3', { skillLevel: 'Beginner', queueOrder: 3 }),
      makePlayer('p4', { skillLevel: 'Beginner', queueOrder: 4 }),
    ]

    const court = generateLadderRunCourt(players, {
      numberOfCourts: 1,
      gameMode: 'singles',
      allowAdjacentSkillMixing: false,
      courtMatchups: [],
      courtIndex: 2,
    })

    expect(court).not.toBeNull()
    expect(court.courtIndex).toBe(2)
    expect(court.teamA.map((player) => player.id)).toEqual(['p1'])
    expect(court.teamB.map((player) => player.id)).toEqual(['p2'])
  })

  it('returns null when on-deck players are fewer than required', () => {
    const players = [
      makePlayer('p1', { skillLevel: 'Novice', queueOrder: 1 }),
      makePlayer('p2', { skillLevel: 'Novice', queueOrder: 2 }),
      makePlayer('p3', { skillLevel: 'Novice', queueOrder: 3 }),
    ]

    const court = generateLadderRunCourt(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      allowAdjacentSkillMixing: false,
      courtMatchups: [],
      courtIndex: 0,
    })

    expect(court).toBeNull()
  })

  it('uses Up Next source and excludes players already on another court', () => {
    const players = [
      makePlayer('p1', { skillLevel: 'Novice', queueOrder: 1 }),
      makePlayer('p2', { skillLevel: 'Novice', queueOrder: 2 }),
      makePlayer('p3', { skillLevel: 'Novice', queueOrder: 3 }),
      makePlayer('p4', { skillLevel: 'Novice', queueOrder: 4 }),
      makePlayer('p5', { skillLevel: 'Novice', queueOrder: 5 }),
      makePlayer('p6', { skillLevel: 'Novice', queueOrder: 6 }),
      makePlayer('p7', { skillLevel: 'Novice', queueOrder: 7 }),
      makePlayer('p8', { skillLevel: 'Novice', queueOrder: 8 }),
    ]
    const courtMatchups = [
      {
        teamA: [players[0], players[1]],
        teamB: [players[2], players[3]],
      },
      null,
    ]

    const court = generateLadderRunCourt(players, {
      numberOfCourts: 2,
      gameMode: 'doubles',
      allowAdjacentSkillMixing: false,
      courtMatchups,
      courtIndex: 1,
    })

    expect(court).not.toBeNull()
    const assignedIds = [...court.teamA, ...court.teamB].map((player) => player.id)
    expect(assignedIds.sort()).toEqual(['p5', 'p6', 'p7', 'p8'])
  })

  it('keeps locked pairs on the same team when generating a court', () => {
    const players = [
      makePlayer('a1', {
        gender: 'Male',
        skillLevel: 'Novice',
        queueOrder: 1,
        teammateId: 'a2',
      }),
      makePlayer('a2', {
        gender: 'Female',
        skillLevel: 'Novice',
        queueOrder: 2,
        teammateId: 'a1',
      }),
      makePlayer('b1', { gender: 'Male', skillLevel: 'Novice', queueOrder: 3 }),
      makePlayer('b2', { gender: 'Female', skillLevel: 'Novice', queueOrder: 4 }),
    ]

    const court = generateLadderRunCourt(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      allowAdjacentSkillMixing: false,
      courtMatchups: [],
      courtIndex: 0,
    })

    expect(court).not.toBeNull()
    const teamAIds = court.teamA.map((player) => player.id).sort()
    const teamBIds = court.teamB.map((player) => player.id).sort()
    expect(teamAIds.includes('a1') && teamAIds.includes('a2')).toBe(true)
    expect(teamBIds.includes('a1') && teamBIds.includes('a2')).toBe(false)
  })

  it('forces prior non-locked partners to face each other for veterans', () => {
    const players = [
      makePlayer('a', {
        queueOrder: 1,
        gamesPlayed: 2,
        lastResult: 'win',
        partnerCounts: { b: 1 },
      }),
      makePlayer('b', {
        queueOrder: 2,
        gamesPlayed: 2,
        lastResult: 'win',
        partnerCounts: { a: 1 },
      }),
      makePlayer('c', { queueOrder: 3, gamesPlayed: 2, lastResult: 'win' }),
      makePlayer('d', { queueOrder: 4, gamesPlayed: 2, lastResult: 'win' }),
    ]

    const court = generateLadderRunCourt(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      allowAdjacentSkillMixing: false,
      courtMatchups: [],
      courtIndex: 0,
      matchHistory: [],
    })

    expect(court).not.toBeNull()
    const teamA = court.teamA.map((player) => player.id)
    const teamB = court.teamB.map((player) => player.id)
    const areTogether =
      (teamA.includes('a') && teamA.includes('b')) ||
      (teamB.includes('a') && teamB.includes('b'))
    expect(areTogether).toBe(false)
  })

  it('can swap in another veteran to improve freshness', () => {
    const players = [
      makePlayer('a', {
        queueOrder: 1,
        gamesPlayed: 2,
        lastResult: 'win',
        skillLevel: 'Novice',
        partnerCounts: { b: 1, c: 1, d: 1 },
      }),
      makePlayer('b', {
        queueOrder: 2,
        gamesPlayed: 2,
        lastResult: 'win',
        skillLevel: 'Novice',
        partnerCounts: { a: 1 },
      }),
      makePlayer('c', {
        queueOrder: 3,
        gamesPlayed: 2,
        lastResult: 'win',
        skillLevel: 'Novice',
        partnerCounts: { a: 1 },
      }),
      makePlayer('d', {
        queueOrder: 4,
        gamesPlayed: 2,
        lastResult: 'win',
        skillLevel: 'Novice',
        partnerCounts: { a: 1 },
      }),
      makePlayer('e', { queueOrder: 5, gamesPlayed: 2, lastResult: 'win', skillLevel: 'Novice' }),
    ]

    const court = generateLadderRunCourt(players, {
      numberOfCourts: 2,
      gameMode: 'doubles',
      allowAdjacentSkillMixing: false,
      courtMatchups: [],
      courtIndex: 0,
      matchHistory: [],
    })

    expect(court).not.toBeNull()
    const assignedIds = [...court.teamA, ...court.teamB].map((player) => player.id)
    expect(assignedIds).toContain('e')
  })

  it('falls back to original on-deck four when no better veteran swap exists', () => {
    const players = [
      makePlayer('a', { queueOrder: 1, gamesPlayed: 2, lastResult: 'win', skillLevel: 'Novice' }),
      makePlayer('b', { queueOrder: 2, gamesPlayed: 2, lastResult: 'win', skillLevel: 'Novice' }),
      makePlayer('c', { queueOrder: 3, gamesPlayed: 2, lastResult: 'win', skillLevel: 'Novice' }),
      makePlayer('d', { queueOrder: 4, gamesPlayed: 2, lastResult: 'win', skillLevel: 'Novice' }),
      makePlayer('e', { queueOrder: 5, gamesPlayed: 2, lastResult: 'loss', skillLevel: 'Novice' }),
    ]

    const court = generateLadderRunCourt(players, {
      numberOfCourts: 2,
      gameMode: 'doubles',
      allowAdjacentSkillMixing: false,
      courtMatchups: [],
      courtIndex: 0,
      matchHistory: [],
    })

    expect(court).not.toBeNull()
    const assignedIds = [...court.teamA, ...court.teamB].map((player) => player.id).sort()
    expect(assignedIds).toEqual(['a', 'b', 'c', 'd'])
  })

  it('in veteran singles, prefers same-status fresh opponents', () => {
    const players = [
      makePlayer('a', { queueOrder: 1, gamesPlayed: 2, lastResult: 'win', skillLevel: 'Novice' }),
      makePlayer('b', {
        queueOrder: 2,
        gamesPlayed: 2,
        lastResult: 'win',
        skillLevel: 'Novice',
        opponentCounts: { a: 1 },
      }),
      makePlayer('c', { queueOrder: 3, gamesPlayed: 2, lastResult: 'win', skillLevel: 'Novice' }),
      makePlayer('d', { queueOrder: 4, gamesPlayed: 2, lastResult: 'win', skillLevel: 'Novice' }),
    ]

    const court = generateLadderRunCourt(players, {
      numberOfCourts: 2,
      gameMode: 'singles',
      allowAdjacentSkillMixing: false,
      courtMatchups: [],
      courtIndex: 0,
      matchHistory: [],
    })

    expect(court).not.toBeNull()
    expect(court.teamA[0].id).toBe('a')
    expect(court.teamB[0].id).toBe('c')
  })
})

describe('LadderRun Up Next freeze', () => {
  it('keeps the frozen queue unchanged after a match is scored', () => {
    const players = [
      makePlayer('p1', { skillLevel: 'Novice', queueOrder: 1 }),
      makePlayer('p2', { skillLevel: 'Novice', queueOrder: 2 }),
      makePlayer('p3', { skillLevel: 'Novice', queueOrder: 3 }),
      makePlayer('p4', { skillLevel: 'Novice', queueOrder: 4 }),
      makePlayer('p5', { skillLevel: 'Novice', queueOrder: 5 }),
      makePlayer('p6', { skillLevel: 'Novice', queueOrder: 6 }),
      makePlayer('p7', { skillLevel: 'Novice', queueOrder: 7 }),
      makePlayer('p8', { skillLevel: 'Novice', queueOrder: 8 }),
    ]

    const snapshot = captureLadderRunFreeze(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      courtMatchups: [],
      matchHistory: [],
    })
    const frozenTopBefore = snapshot.queueIds.slice(0, 4)

    const { players: updatedPlayers } = applyLadderRunMatchResult(players, {
      courtIndex: 0,
      teamAIds: ['p1', 'p2'],
      teamBIds: ['p3', 'p4'],
      winningTeam: 'A',
    })
    const nextHistory = [
      {
        teamAIds: ['p1', 'p2'],
        teamBIds: ['p3', 'p4'],
        winningTeam: 'A',
      },
    ]

    expect(snapshot.queueIds.slice(0, 4)).toEqual(frozenTopBefore)
    expect(
      isLadderRunFreezeValid(snapshot, updatedPlayers, [], {
        numberOfCourts: 1,
        gameMode: 'doubles',
      })
    ).toBe(true)

    const livePreview = buildLadderRunUpNextPreview(updatedPlayers, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      courtMatchups: [],
      matchHistory: nextHistory,
    })
    const display = mergeFrozenUpNextDisplay(snapshot, livePreview, updatedPlayers)
    expect(display.slice(0, 4).map((player) => player.id)).toEqual(frozenTopBefore)
  })

  it('caps frozen display at courts times group size when appending new tail players', () => {
    const players = Array.from({ length: 17 }, (_, index) =>
      makePlayer(`p${index + 1}`, { skillLevel: 'Novice', queueOrder: index + 1 })
    )
    const snapshot = captureLadderRunFreeze(players.slice(0, 16), {
      numberOfCourts: 4,
      gameMode: 'doubles',
      courtMatchups: [],
      matchHistory: [],
    })
    const livePreview = buildLadderRunUpNextPreview(players, {
      numberOfCourts: 4,
      gameMode: 'doubles',
      courtMatchups: [],
      matchHistory: [],
    })

    const display = mergeFrozenUpNextDisplay(
      snapshot,
      livePreview,
      players,
      16
    )

    expect(display).toHaveLength(16)
    expect(display[15].id).toBe('p16')
  })

  it('materializes the frozen on-deck court without recomputing from live history', () => {
    const players = [
      makePlayer('p1', { skillLevel: 'Novice', queueOrder: 1 }),
      makePlayer('p2', { skillLevel: 'Novice', queueOrder: 2 }),
      makePlayer('p3', { skillLevel: 'Novice', queueOrder: 3 }),
      makePlayer('p4', { skillLevel: 'Novice', queueOrder: 4 }),
    ]
    const snapshot = captureLadderRunFreeze(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      courtMatchups: [],
      matchHistory: [],
    })

    const court = materializeFrozenLadderRunCourt(snapshot, players, {
      gameMode: 'doubles',
      courtIndex: 0,
    })

    expect(court).not.toBeNull()
    expect(court.teamA.map((player) => player.id)).toEqual(
      snapshot.onDeckCourt.teamAIds
    )
    expect(court.teamB.map((player) => player.id)).toEqual(
      snapshot.onDeckCourt.teamBIds
    )
  })

  it('advances the freeze after a court is generated and appends fresh players last', () => {
    const players = Array.from({ length: 8 }, (_, index) =>
      makePlayer(`p${index + 1}`, { skillLevel: 'Novice', queueOrder: index + 1 })
    )
    const snapshot = captureLadderRunFreeze(players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      courtMatchups: [],
      matchHistory: [],
    })
    const generatedIds = snapshot.queueIds.slice(0, 4)
    const courtMatchups = [
      {
        teamA: generatedIds.slice(0, 2).map((id) => players.find((player) => player.id === id)),
        teamB: generatedIds.slice(2, 4).map((id) => players.find((player) => player.id === id)),
      },
    ]

    const next = advanceLadderRunFreeze(snapshot, generatedIds, players, {
      numberOfCourts: 1,
      gameMode: 'doubles',
      courtMatchups,
      matchHistory: [],
    })

    expect(next.queueIds.slice(0, 4)).toEqual(['p5', 'p6', 'p7', 'p8'])
    expect(next.queueIds).not.toEqual(snapshot.queueIds)
    expect(new Set(next.queueIds).size).toBe(next.queueIds.length)
  })
})
