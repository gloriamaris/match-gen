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
  it('keeps four on-deck players when groupedBySkillLevel is off', () => {
    const players = Array.from({ length: 12 }, (_, index) =>
      makePlayer(`p${index + 1}`, {
        skillLevel: index % 2 === 0 ? 'Beginner' : 'Advanced',
        queueOrder: index + 1,
        gamesPlayed: 1,
        lastResult: index < 6 ? 'win' : 'loss',
      })
    )
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
      groupedBySkillLevel: false,
      allowAdjacentSkillMixing: false,
      courtMatchups,
      matchHistory: [],
    })

    expect(preview.queue).toHaveLength(8)
    expect(preview.onDeckPlayers).toHaveLength(4)
  })

  it('highlights four on-deck players when two courts have enough waiting players', () => {
    const players = Array.from({ length: 12 }, (_, index) =>
      makePlayer(`p${index + 1}`, {
        skillLevel: 'Novice',
        queueOrder: index + 1,
        gamesPlayed: 1,
        lastResult: 'win',
      })
    )
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
