import { describe, expect, it } from 'vitest'
import { predictCourtMatchup, predictUpNextMatchups } from '../predictCourtMatchup'
import { V2_GAME_TYPES } from '../v2Storage'

const makePlayer = (id, name, skillLevel, games = 0, extra = {}) => ({
  id,
  name,
  skillLevel: skillLevel.toLowerCase(),
  checkedIn: true,
  gamesPlayed: games,
  teammateId: null,
  medals: 0,
  medalCooldownCourt: null,
  medalCooldownRemaining: 0,
  ...extra,
})

const teamIds = (court) => [
  ...court.teamA.map((player) => player.id),
  ...court.teamB.map((player) => player.id),
].sort()

describe('predictCourtMatchup', () => {
  it('predicts court 1 when courts 2 and 3 are filled', () => {
    const court2 = {
      teamA: [makePlayer('y', 'Yannie', 'Novice'), makePlayer('o', 'Omar', 'Novice')],
      teamB: [makePlayer('j', 'Jonnah', 'Novice'), makePlayer('jf', 'Jone Francis', 'Novice')],
    }
    const court3 = {
      teamA: [makePlayer('ja', 'Jairro', 'Novice'), makePlayer('h', 'Hyan Airre', 'Novice')],
      teamB: [makePlayer('f', 'Felmar', 'Novice'), makePlayer('c', 'Care', 'Novice')],
    }
    const sitting = [
      makePlayer('r', 'Raven', 'Beginner'),
      makePlayer('rr', 'Redz Rojas', 'Beginner'),
      makePlayer('rx', 'Rex Fernandez', 'Beginner'),
      makePlayer('b', 'Baroroy', 'Novice'),
      ...['Quo Tong', 'Pongpong', 'Monique Labor', 'MJ', 'Khoi', 'JP', 'John Edward', 'CJ Dumalagan', 'Borbie', 'Aldan'].map(
        (name, index) => makePlayer(`i${index}`, name, 'Intermediate')
      ),
    ]
    const cooldown = [
      makePlayer('a', 'Arly Jones', 'Beginner', 1),
      makePlayer('g', 'Giselle', 'Beginner', 1),
      makePlayer('gg', 'Gwen Gary', 'Beginner', 1),
      makePlayer('je', 'John Elgin', 'Beginner', 1),
    ]
    const players = [
      ...court2.teamA,
      ...court2.teamB,
      ...court3.teamA,
      ...court3.teamB,
      ...sitting,
      ...cooldown,
    ]
    const courtMatchups = [null, court2, court3]

    const prediction = predictCourtMatchup({
      courtIndex: 0,
      courtMatchups,
      players,
      matchHistory: [],
      numberOfCourts: 3,
      gameType: V2_GAME_TYPES.PROGRESSIVE_PLAY,
      combineSkillLevels: true,
    })

    expect(prediction).not.toBeNull()
    expect(prediction.teamA).toHaveLength(2)
    expect(prediction.teamB).toHaveLength(2)

    const upNext = predictUpNextMatchups({
      courtMatchups,
      players,
      matchHistory: [],
      numberOfCourts: 3,
      gameType: V2_GAME_TYPES.PROGRESSIVE_PLAY,
      combineSkillLevels: true,
    })

    expect(upNext.length).toBeGreaterThan(0)
  })

  it('predicts court 1 when combineSkillLevels is off', () => {
    const court2 = {
      teamA: [makePlayer('y', 'Yannie', 'Novice'), makePlayer('o', 'Omar', 'Novice')],
      teamB: [makePlayer('j', 'Jonnah', 'Novice'), makePlayer('jf', 'Jone Francis', 'Novice')],
    }
    const court3 = {
      teamA: [makePlayer('ja', 'Jairro', 'Novice'), makePlayer('h', 'Hyan Airre', 'Novice')],
      teamB: [makePlayer('f', 'Felmar', 'Novice'), makePlayer('c', 'Care', 'Novice')],
    }
    const sitting = [
      makePlayer('r', 'Raven', 'Beginner'),
      makePlayer('rr', 'Redz Rojas', 'Beginner'),
      makePlayer('rx', 'Rex Fernandez', 'Beginner'),
      makePlayer('b', 'Baroroy', 'Novice'),
    ]
    const players = [
      ...court2.teamA,
      ...court2.teamB,
      ...court3.teamA,
      ...court3.teamB,
      ...sitting,
    ]
    const courtMatchups = [null, court2, court3]

    const prediction = predictCourtMatchup({
      courtIndex: 0,
      courtMatchups,
      players,
      matchHistory: [],
      numberOfCourts: 3,
      gameType: V2_GAME_TYPES.PROGRESSIVE_PLAY,
      combineSkillLevels: false,
    })

    expect(prediction).not.toBeNull()
  })

  it('predicts after recent match history puts court players on cooldown', () => {
    const court2 = {
      teamA: [makePlayer('y', 'Yannie', 'Novice', 1), makePlayer('o', 'Omar', 'Novice', 1)],
      teamB: [makePlayer('j', 'Jonnah', 'Novice', 1), makePlayer('jf', 'Jone Francis', 'Novice', 1)],
    }
    const court3 = {
      teamA: [makePlayer('ja', 'Jairro', 'Novice', 1), makePlayer('h', 'Hyan Airre', 'Novice', 1)],
      teamB: [makePlayer('f', 'Felmar', 'Novice', 1), makePlayer('c', 'Care', 'Novice', 1)],
    }
    const sitting = [
      makePlayer('r', 'Raven', 'Beginner'),
      makePlayer('rr', 'Redz Rojas', 'Beginner'),
      makePlayer('rx', 'Rex Fernandez', 'Beginner'),
      makePlayer('b', 'Baroroy', 'Novice'),
      ...['Quo Tong', 'Pongpong', 'Monique Labor', 'MJ'].map((name, index) =>
        makePlayer(`i${index}`, name, 'Intermediate')
      ),
    ]
    const players = [
      ...court2.teamA,
      ...court2.teamB,
      ...court3.teamA,
      ...court3.teamB,
      ...sitting,
    ]
    const courtMatchups = [null, court2, court3]
    const matchHistory = [
      { teamAIds: ['y', 'o'], teamBIds: ['j', 'jf'], courtIndex: 1 },
      { teamAIds: ['ja', 'h'], teamBIds: ['f', 'c'], courtIndex: 2 },
      { teamAIds: ['r', 'rr'], teamBIds: ['rx', 'b'], courtIndex: 0 },
    ]

    const prediction = predictCourtMatchup({
      courtIndex: 0,
      courtMatchups,
      players,
      matchHistory,
      numberOfCourts: 3,
      gameType: V2_GAME_TYPES.PROGRESSIVE_PLAY,
      combineSkillLevels: true,
    })

    expect(prediction).not.toBeNull()
  })

  it('handles null courtMatchups (before session courts are initialized)', () => {
    const players = [
      makePlayer('1', 'A', 'Beginner'),
      makePlayer('2', 'B', 'Beginner'),
      makePlayer('3', 'C', 'Novice'),
      makePlayer('4', 'D', 'Novice'),
    ]

    const upNext = predictUpNextMatchups({
      courtMatchups: null,
      players,
      matchHistory: [],
      numberOfCourts: 2,
      gameType: V2_GAME_TYPES.PROGRESSIVE_PLAY,
      combineSkillLevels: true,
    })

    expect(upNext.length).toBeGreaterThan(0)
  })

  it('predicts next matchups when all courts are full', () => {
    const court1 = {
      teamA: [makePlayer('a1', 'A1', 'Novice'), makePlayer('a2', 'A2', 'Novice')],
      teamB: [makePlayer('b1', 'B1', 'Novice'), makePlayer('b2', 'B2', 'Novice')],
    }
    const court2 = {
      teamA: [makePlayer('c1', 'C1', 'Novice'), makePlayer('c2', 'C2', 'Novice')],
      teamB: [makePlayer('d1', 'D1', 'Novice'), makePlayer('d2', 'D2', 'Novice')],
    }
    const court3 = {
      teamA: [makePlayer('e1', 'E1', 'Novice'), makePlayer('e2', 'E2', 'Novice')],
      teamB: [makePlayer('f1', 'F1', 'Novice'), makePlayer('f2', 'F2', 'Novice')],
    }
    const waiting = [
      makePlayer('w1', 'Wait 1', 'Beginner'),
      makePlayer('w2', 'Wait 2', 'Beginner'),
      makePlayer('w3', 'Wait 3', 'Beginner'),
      makePlayer('w4', 'Wait 4', 'Beginner'),
      makePlayer('w5', 'Wait 5', 'Beginner'),
      makePlayer('w6', 'Wait 6', 'Beginner'),
      makePlayer('w7', 'Wait 7', 'Beginner'),
      makePlayer('w8', 'Wait 8', 'Beginner'),
    ]
    const players = [
      ...court1.teamA,
      ...court1.teamB,
      ...court2.teamA,
      ...court2.teamB,
      ...court3.teamA,
      ...court3.teamB,
      ...waiting,
    ]
    const courtMatchups = [court1, court2, court3]

    const upNext = predictUpNextMatchups({
      courtMatchups,
      players,
      matchHistory: [],
      numberOfCourts: 3,
      gameType: V2_GAME_TYPES.PROGRESSIVE_PLAY,
      combineSkillLevels: true,
    })

    expect(upNext.length).toBe(3)
    upNext.forEach((prediction) => {
      expect(prediction.teamA).toHaveLength(2)
      expect(prediction.teamB).toHaveLength(2)
    })

    const predictedIds = new Set(
      upNext.flatMap((prediction) => [
        ...prediction.teamA.map((player) => player.id),
        ...prediction.teamB.map((player) => player.id),
      ])
    )
    waiting.forEach((player) => {
      expect(predictedIds.has(player.id)).toBe(true)
    })
  })

  it('matches refresh for an empty court while other courts stay full', () => {
    const court1 = {
      teamA: [makePlayer('a1', 'Arly Jones', 'Beginner', 1), makePlayer('a2', 'Giselle', 'Beginner', 1)],
      teamB: [makePlayer('b1', 'Gwen Gary', 'Beginner', 1), makePlayer('b2', 'John Elgin', 'Beginner', 1)],
    }
    const court2 = {
      teamA: [makePlayer('c1', 'Yannie', 'Novice'), makePlayer('c2', 'Omar', 'Novice')],
      teamB: [makePlayer('d1', 'Jonnah', 'Novice'), makePlayer('d2', 'Jone Francis', 'Novice')],
    }
    const waiting = [
      makePlayer('j1', 'Jairro', 'Novice'),
      makePlayer('j2', 'Hyan Airre', 'Novice'),
      makePlayer('f1', 'Felmar', 'Novice'),
      makePlayer('f2', 'Care', 'Novice'),
      makePlayer('w1', 'Raven', 'Beginner'),
      makePlayer('w2', 'Redz Rojas', 'Beginner'),
      makePlayer('w3', 'Rex Fernandez', 'Beginner'),
      makePlayer('w4', 'Baroroy', 'Novice'),
      ...['Quo Tong', 'Pongpong', 'Monique Labor', 'MJ', 'Khoi', 'JP', 'John Edward', 'CJ Dumalagan', 'Borbie', 'Aldan'].map(
        (name, index) => makePlayer(`i${index}`, name, 'Intermediate')
      ),
    ]
    const players = [
      ...court1.teamA,
      ...court1.teamB,
      ...court2.teamA,
      ...court2.teamB,
      ...waiting,
    ]
    const courtMatchups = [court1, court2, null]

    const refreshCourt3 = predictCourtMatchup({
      courtIndex: 2,
      courtMatchups,
      players,
      matchHistory: [],
      numberOfCourts: 3,
      gameType: V2_GAME_TYPES.PROGRESSIVE_PLAY,
      combineSkillLevels: true,
    })

    const upNext = predictUpNextMatchups({
      courtMatchups,
      players,
      matchHistory: [],
      numberOfCourts: 3,
      gameType: V2_GAME_TYPES.PROGRESSIVE_PLAY,
      combineSkillLevels: true,
    })

    const court3Preview = upNext.find((prediction) => prediction.courtIndex === 2 && !prediction.label.includes('after'))

    expect(refreshCourt3).not.toBeNull()
    expect(court3Preview).toBeDefined()
    expect(teamIds(court3Preview)).toEqual(teamIds(refreshCourt3))
  })
})
