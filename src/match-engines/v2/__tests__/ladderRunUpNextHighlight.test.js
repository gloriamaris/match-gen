import { describe, expect, it } from 'vitest'
import {
  buildLadderRunUpNextPreview,
  captureLadderRunFreeze,
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

describe('Ladder Run Up Next on-deck highlight count', () => {
  it('highlights four on-deck players when two courts have enough waiting players', () => {
    const players = [
      makePlayer('p1', { skillLevel: 'Intermediate', queueOrder: 1, gamesPlayed: 2 }),
      makePlayer('p2', { skillLevel: 'Intermediate', queueOrder: 2, gamesPlayed: 2 }),
      makePlayer('p3', { skillLevel: 'Advanced', queueOrder: 3, gamesPlayed: 1 }),
      makePlayer('p4', { skillLevel: 'Novice', queueOrder: 4, gamesPlayed: 2 }),
      makePlayer('p5', { skillLevel: 'Beginner', queueOrder: 5, gamesPlayed: 2 }),
      makePlayer('p6', { skillLevel: 'Beginner', queueOrder: 6, gamesPlayed: 3 }),
      makePlayer('p7', { skillLevel: 'Beginner', queueOrder: 7, gamesPlayed: 2 }),
      makePlayer('p8', { skillLevel: 'Novice', queueOrder: 8, gamesPlayed: 2 }),
      makePlayer('p9', { skillLevel: 'Novice', queueOrder: 9, gamesPlayed: 2 }),
      makePlayer('p10', { skillLevel: 'Novice', queueOrder: 10, gamesPlayed: 1 }),
      makePlayer('p11', { skillLevel: 'Novice', queueOrder: 11, gamesPlayed: 1 }),
      makePlayer('p12', { skillLevel: 'Novice', queueOrder: 12, gamesPlayed: 1 }),
    ]
    const courtMatchups = [
      null,
      {
        teamA: [makePlayer('on1'), makePlayer('on2')],
        teamB: [makePlayer('on3'), makePlayer('on4')],
      },
    ]

    const preview = buildLadderRunUpNextPreview(players, {
      numberOfCourts: 2,
      gameMode: 'doubles',
      allowAdjacentSkillMixing: true,
      courtMatchups,
      matchHistory: [],
    })

    expect(preview.queue).toHaveLength(8)
    expect(preview.onDeckPlayers).toHaveLength(4)
  })

  it('captures a freeze block with four on-deck ids when enough players are waiting', () => {
    const players = Array.from({ length: 12 }, (_, index) =>
      makePlayer(`p${index + 1}`, {
        skillLevel: index < 4 ? 'Intermediate' : 'Novice',
        queueOrder: index + 1,
        gamesPlayed: index % 3,
      })
    )
    const courtMatchups = [
      null,
      {
        teamA: [players[0], players[1]],
        teamB: [players[2], players[3]],
      },
    ]

    const snapshot = captureLadderRunFreeze(players, {
      numberOfCourts: 2,
      gameMode: 'doubles',
      allowAdjacentSkillMixing: true,
      courtMatchups,
      matchHistory: [],
    })

    expect(snapshot.queueIds.length).toBeGreaterThanOrEqual(4)
    expect(snapshot.queueIds.slice(0, 4).length).toBe(4)
  })

  it('does not leave only three visible highlights when a stale short freeze is merged with a full live preview', () => {
    const players = Array.from({ length: 10 }, (_, index) =>
      makePlayer(`p${index + 1}`, {
        skillLevel: 'Novice',
        queueOrder: index + 1,
      })
    )
    const staleFreeze = {
      queueIds: ['p1', 'p2', 'p3'],
      onDeckCourt: null,
      numberOfCourts: 2,
      gameMode: 'doubles',
    }
    const livePreview = buildLadderRunUpNextPreview(players, {
      numberOfCourts: 2,
      gameMode: 'doubles',
    })
    const display = mergeFrozenUpNextDisplay(staleFreeze, livePreview, players, 8)
    const frozenOnDeckIds = staleFreeze.queueIds.slice(0, 4)

    expect(display).toHaveLength(8)
    expect(frozenOnDeckIds).toHaveLength(3)
    expect(display.filter((player) => frozenOnDeckIds.includes(player.id))).toHaveLength(3)
  })
})
