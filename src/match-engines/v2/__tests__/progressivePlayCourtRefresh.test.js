import { describe, expect, it } from 'vitest'
import { applyMatchResult } from '../ProgressivePlay.engine'
import {
  advanceProgressivePlayFreeze,
  buildProgressivePlayUpNextPreview,
  captureProgressivePlayFreeze,
  courtPlayerIds,
  isProgressivePlayFreezeValid,
  materializeFrozenCourt,
  refreshProgressivePlayCourt,
} from '../progressivePlayCourtRefresh'

const makePlayer = (id, overrides = {}) => ({
  id,
  name: `Player ${id}`,
  skillLevel: 'Intermediate',
  teammateId: null,
  checkedIn: true,
  wins: 0,
  losses: 0,
  gamesPlayed: 0,
  queueOrder: 0,
  partnerCounts: {},
  opponentCounts: {},
  ...overrides,
})

const makeStaggeredRoster = (count) =>
  Array.from({ length: count }, (_, index) =>
    makePlayer(`P${index}`, { queueOrder: index + 1 })
  )

const emptyCourts = (count) => Array.from({ length: count }, () => null)

const courtFromRefresh = (players, options) => {
  const { court } = refreshProgressivePlayCourt(players, options)
  return court
}

describe('progressivePlayCourtRefresh — Up Next vs Generate parity', () => {
  it('first empty-court generation matches Up Next on-deck players (staggered check-in)', () => {
    const players = makeStaggeredRoster(12)
    const courtMatchups = emptyCourts(2)
    const options = {
      courtMatchups,
      numberOfCourts: 2,
      matchHistory: [],
      allowAdjacentSkillMixing: true,
    }

    const preview = buildProgressivePlayUpNextPreview(players, options)
    const generated = refreshProgressivePlayCourt(players, {
      ...options,
      courtIndex: preview.courtIndex,
    })

    expect(generated.court).not.toBeNull()
    expect(courtPlayerIds(generated.court).sort()).toEqual(
      preview.onDeckPlayers.map((player) => player.id).sort()
    )
    expect(preview.onDeckPlayers.map((player) => player.id)).toEqual(
      preview.preferred.map((player) => player.id)
    )
  })

  it('second court generation matches Up Next while the first court is occupied', () => {
    let players = makeStaggeredRoster(12)
    let matchHistory = []
    const courtMatchups = emptyCourts(2)
    const options = {
      courtMatchups,
      numberOfCourts: 2,
      matchHistory,
      allowAdjacentSkillMixing: true,
    }

    const court1 = courtFromRefresh(players, { ...options, courtIndex: 0 })
    expect(court1).not.toBeNull()

    courtMatchups[0] = court1
    const preview = buildProgressivePlayUpNextPreview(players, {
      ...options,
      courtMatchups,
    })

    const court2 = courtFromRefresh(players, {
      ...options,
      courtMatchups,
      courtIndex: preview.courtIndex,
    })

    expect(court2).not.toBeNull()
    expect(courtPlayerIds(court2).sort()).toEqual(
      preview.onDeckPlayers.map((player) => player.id).sort()
    )
  })

  it('generation after scoring matches Up Next preview (post-match refresh)', () => {
    let players = makeStaggeredRoster(12)
    let matchHistory = []
    const courtMatchups = emptyCourts(2)
    const baseOptions = {
      courtMatchups,
      numberOfCourts: 2,
      allowAdjacentSkillMixing: true,
    }

    const court1 = courtFromRefresh(players, {
      ...baseOptions,
      matchHistory,
      courtIndex: 0,
    })
    courtMatchups[0] = court1

    const scored = applyMatchResult(players, {
      courtIndex: 0,
      teamAIds: court1.teamA.map((player) => player.id),
      teamBIds: court1.teamB.map((player) => player.id),
      winningTeam: 'A',
    })
    players = scored.players
    matchHistory = [scored.historyEntry]
    courtMatchups[0] = null

    const preview = buildProgressivePlayUpNextPreview(players, {
      ...baseOptions,
      courtMatchups,
      matchHistory,
    })

    const nextCourt = refreshProgressivePlayCourt(players, {
      ...baseOptions,
      courtMatchups,
      matchHistory,
      courtIndex: preview.courtIndex,
    })

    expect(nextCourt.court).not.toBeNull()
    expect(courtPlayerIds(nextCourt.court).sort()).toEqual(
      preview.onDeckPlayers.map((player) => player.id).sort()
    )
  })

  it('multi-round session keeps Up Next aligned across successive generations', () => {
    let players = makeStaggeredRoster(16)
    let matchHistory = []
    const courtMatchups = emptyCourts(2)
    const baseOptions = {
      courtMatchups,
      numberOfCourts: 2,
      allowAdjacentSkillMixing: true,
    }

    for (let round = 0; round < 3; round += 1) {
      for (let courtIndex = 0; courtIndex < 2; courtIndex += 1) {
        if (courtMatchups[courtIndex]) continue

        const preview = buildProgressivePlayUpNextPreview(players, {
          ...baseOptions,
          matchHistory,
        })

        const generated = refreshProgressivePlayCourt(players, {
          ...baseOptions,
          matchHistory,
          courtIndex: preview.courtIndex,
        })

        expect(generated.court).not.toBeNull()
        expect(courtPlayerIds(generated.court).sort()).toEqual(
          preview.onDeckPlayers.map((player) => player.id).sort()
        )

        courtMatchups[courtIndex] = generated.court
      }

      for (let courtIndex = 0; courtIndex < 2; courtIndex += 1) {
        const matchup = courtMatchups[courtIndex]
        if (!matchup) continue

        const scored = applyMatchResult(players, {
          courtIndex,
          teamAIds: matchup.teamA.map((player) => player.id),
          teamBIds: matchup.teamB.map((player) => player.id),
          winningTeam: 'A',
        })
        players = scored.players
        matchHistory = [...matchHistory, scored.historyEntry]
        courtMatchups[courtIndex] = null
      }
    }
  })

  it('shrinks the fairness pool when other courts are occupied', () => {
    const players = Array.from({ length: 20 }, (_, index) =>
      makePlayer(`P${index}`, { gamesPlayed: index + 1, queueOrder: index + 1 })
    )
    const courtMatchups = emptyCourts(2)
    const occupiedCourt = {
      teamA: [players[0], players[1]],
      teamB: [players[2], players[3]],
    }
    courtMatchups[0] = occupiedCourt

    const preview = buildProgressivePlayUpNextPreview(players, {
      courtMatchups,
      numberOfCourts: 2,
      matchHistory: [],
      allowAdjacentSkillMixing: true,
    })

    const previewIds = new Set(preview.queue.map((player) => player.id))
    expect(previewIds.has('P0')).toBe(false)
    expect(previewIds.has('P1')).toBe(false)
    expect(previewIds.has('P2')).toBe(false)
    expect(previewIds.has('P3')).toBe(false)
    expect(previewIds.has('P16')).toBe(false)
    expect(previewIds.has('P17')).toBe(false)
  })

  it('when all courts are full, excludes every on-court player from Up Next', () => {
    const players = makeStaggeredRoster(36)
    const courtMatchups = emptyCourts(4)

    for (let courtIndex = 0; courtIndex < 4; courtIndex += 1) {
      const start = courtIndex * 4
      courtMatchups[courtIndex] = {
        teamA: [players[start], players[start + 1]],
        teamB: [players[start + 2], players[start + 3]],
      }
    }

    const preview = buildProgressivePlayUpNextPreview(players, {
      courtMatchups,
      numberOfCourts: 4,
      matchHistory: [],
      allowAdjacentSkillMixing: true,
    })

    expect(preview.allCourtsFull).toBe(true)
    expect(preview.courtIndex).toBeNull()

    const onCourtIds = new Set(
      courtMatchups.flatMap((court) =>
        [...court.teamA, ...court.teamB].map((player) => player.id)
      )
    )
    const queueIds = preview.queue.map((player) => player.id)
    const onDeckIds = preview.onDeckPlayers.map((player) => player.id)

    queueIds.forEach((id) => expect(onCourtIds.has(id)).toBe(false))
    onDeckIds.forEach((id) => expect(onCourtIds.has(id)).toBe(false))

    // Next four sit-outs after the 16 on court (queue order 17–20)
    expect(onDeckIds).toEqual(['P16', 'P17', 'P18', 'P19'])
    expect(preview.queue.length).toBe(20)
  })

  it('preview matches generate after a court finishes (deterministic, same on-deck four)', () => {
    let players = makeStaggeredRoster(36)
    let matchHistory = []
    const courtMatchups = emptyCourts(4)

    for (let courtIndex = 0; courtIndex < 4; courtIndex += 1) {
      const { court } = refreshProgressivePlayCourt(players, {
        courtIndex,
        courtMatchups,
        numberOfCourts: 4,
        matchHistory,
        allowAdjacentSkillMixing: true,
      })
      courtMatchups[courtIndex] = court
    }

    const finishedCourt = courtMatchups[0]
    const scored = applyMatchResult(players, {
      courtIndex: 0,
      teamAIds: finishedCourt.teamA.map((player) => player.id),
      teamBIds: finishedCourt.teamB.map((player) => player.id),
      winningTeam: 'A',
    })
    players = scored.players
    matchHistory = [scored.historyEntry]
    courtMatchups[0] = null

    const preview = buildProgressivePlayUpNextPreview(players, {
      courtMatchups,
      numberOfCourts: 4,
      matchHistory,
      allowAdjacentSkillMixing: true,
    })
    const generated = refreshProgressivePlayCourt(players, {
      courtIndex: preview.courtIndex,
      courtMatchups,
      numberOfCourts: 4,
      matchHistory,
      allowAdjacentSkillMixing: true,
    })

    expect(preview.onDeckPlayers.length).toBe(4)
    expect(courtPlayerIds(generated.court).sort()).toEqual(
      preview.onDeckPlayers.map((player) => player.id).sort()
    )
    expect(preview.onDeckPlayers.map((player) => player.id)).toEqual(
      preview.queue.slice(0, 4).map((player) => player.id)
    )
  })

  it('calling preview twice returns the same on-deck players', () => {
    let players = makeStaggeredRoster(16)
    const courtMatchups = emptyCourts(2)
    const options = {
      courtMatchups,
      numberOfCourts: 2,
      matchHistory: [],
      allowAdjacentSkillMixing: true,
    }

    const first = buildProgressivePlayUpNextPreview(players, options)
    const second = buildProgressivePlayUpNextPreview(players, options)

    expect(first.onDeckPlayers.map((player) => player.id)).toEqual(
      second.onDeckPlayers.map((player) => player.id)
    )
  })
})

describe('progressivePlayCourtRefresh — Up Next freeze', () => {
  const fillAllCourts = (players, count) => {
    const courtMatchups = emptyCourts(count)
    for (let courtIndex = 0; courtIndex < count; courtIndex += 1) {
      const start = courtIndex * 4
      courtMatchups[courtIndex] = {
        teamA: [players[start], players[start + 1]],
        teamB: [players[start + 2], players[start + 3]],
      }
    }
    return courtMatchups
  }

  it('captures a block sized to numberOfCourts × 4', () => {
    const players = makeStaggeredRoster(36)
    const courtMatchups = fillAllCourts(players, 4)

    const snapshot = captureProgressivePlayFreeze(players, {
      courtMatchups,
      numberOfCourts: 4,
      matchHistory: [],
      allowAdjacentSkillMixing: true,
    })

    expect(snapshot.numberOfCourts).toBe(4)
    expect(snapshot.queueIds).toHaveLength(16)
    // None of the frozen players are currently on a court.
    const onCourtIds = new Set(
      courtMatchups.flatMap((court) =>
        [...court.teamA, ...court.teamB].map((player) => player.id)
      )
    )
    snapshot.queueIds.forEach((id) => expect(onCourtIds.has(id)).toBe(false))
  })

  it('keeps the frozen players unchanged after a score is entered', () => {
    let players = makeStaggeredRoster(36)
    const courtMatchups = fillAllCourts(players, 4)

    const snapshot = captureProgressivePlayFreeze(players, {
      courtMatchups,
      numberOfCourts: 4,
      matchHistory: [],
      allowAdjacentSkillMixing: true,
    })
    const frozenTopBefore = snapshot.queueIds.slice(0, 4)

    const finishedCourt = courtMatchups[0]
    const scored = applyMatchResult(players, {
      courtIndex: 0,
      teamAIds: finishedCourt.teamA.map((player) => player.id),
      teamBIds: finishedCourt.teamB.map((player) => player.id),
      winningTeam: 'A',
    })
    players = scored.players
    courtMatchups[0] = null

    // The freeze is untouched by scoring and is still valid afterwards.
    expect(snapshot.queueIds.slice(0, 4)).toEqual(frozenTopBefore)
    expect(isProgressivePlayFreezeValid(snapshot, players, courtMatchups)).toBe(
      true
    )
  })

  it('invalidates the freeze when a frozen player checks out', () => {
    let players = makeStaggeredRoster(36)
    const courtMatchups = fillAllCourts(players, 4)

    const snapshot = captureProgressivePlayFreeze(players, {
      courtMatchups,
      numberOfCourts: 4,
      matchHistory: [],
      allowAdjacentSkillMixing: true,
    })

    const frozenId = snapshot.queueIds[0]
    players = players.map((player) =>
      player.id === frozenId ? { ...player, checkedIn: false } : player
    )

    expect(isProgressivePlayFreezeValid(snapshot, players, courtMatchups)).toBe(
      false
    )
  })

  it('materializes the frozen court from the highlighted four', () => {
    const players = makeStaggeredRoster(12)
    const courtMatchups = emptyCourts(2)

    const snapshot = captureProgressivePlayFreeze(players, {
      courtMatchups,
      numberOfCourts: 2,
      matchHistory: [],
      allowAdjacentSkillMixing: true,
    })

    const court = materializeFrozenCourt(snapshot, players, {
      matchHistory: [],
      allowAdjacentSkillMixing: true,
    })

    expect(court).not.toBeNull()
    expect(courtPlayerIds(court).sort()).toEqual(
      [...snapshot.queueIds.slice(0, 4)].sort()
    )
  })

  it('on-deck four form an adjacent-skill court even when fairness top four do not', () => {
    const rank = { Beginner: 0, Novice: 1, Intermediate: 2, Advanced: 3 }
    const onCourt = Array.from({ length: 4 }, (_, i) =>
      makePlayer(`C${i}`, {
        skillLevel: 'Novice',
        gamesPlayed: 0,
        queueOrder: i + 1,
      })
    )
    // Lowest-games sit-outs deliberately span non-adjacent skills (Advanced +
    // Beginner). They can never form a valid Progressive Play court, so the
    // on-deck four must come from an adjacent-skill fallback instead of being
    // forced together across skill groups.
    const sitOuts = [
      makePlayer('A1', { skillLevel: 'Advanced', gamesPlayed: 0, queueOrder: 10 }),
      makePlayer('A2', { skillLevel: 'Advanced', gamesPlayed: 0, queueOrder: 11 }),
      makePlayer('B1', { skillLevel: 'Beginner', gamesPlayed: 0, queueOrder: 12 }),
      makePlayer('B2', { skillLevel: 'Beginner', gamesPlayed: 0, queueOrder: 13 }),
      makePlayer('N1', { skillLevel: 'Novice', gamesPlayed: 1, queueOrder: 14 }),
      makePlayer('N2', { skillLevel: 'Novice', gamesPlayed: 1, queueOrder: 15 }),
      makePlayer('G1', { skillLevel: 'Beginner', gamesPlayed: 1, queueOrder: 16 }),
      makePlayer('G2', { skillLevel: 'Beginner', gamesPlayed: 1, queueOrder: 17 }),
    ]
    const players = [...onCourt, ...sitOuts]
    const courtMatchups = [
      { teamA: [onCourt[0], onCourt[1]], teamB: [onCourt[2], onCourt[3]] },
    ]

    const snapshot = captureProgressivePlayFreeze(players, {
      courtMatchups,
      numberOfCourts: 1,
      matchHistory: [],
      allowAdjacentSkillMixing: true,
    })

    const onDeckIds = snapshot.queueIds.slice(0, 4)
    const onDeckRanks = onDeckIds.map(
      (id) => rank[players.find((p) => p.id === id).skillLevel]
    )
    // Highlighted four are a real adjacent-skill court (rank span <= 1).
    expect(Math.max(...onDeckRanks) - Math.min(...onDeckRanks)).toBeLessThanOrEqual(
      1
    )

    // Generate places exactly the highlighted four — no divergence.
    const court = materializeFrozenCourt(snapshot, players, {
      matchHistory: [],
      allowAdjacentSkillMixing: true,
    })
    expect(court).not.toBeNull()
    expect(courtPlayerIds(court).sort()).toEqual([...onDeckIds].sort())
  })

  it('consumes the generated four and backfills to full block size', () => {
    const players = makeStaggeredRoster(16)
    const courtMatchups = emptyCourts(2)

    const snapshot = captureProgressivePlayFreeze(players, {
      courtMatchups,
      numberOfCourts: 2,
      matchHistory: [],
      allowAdjacentSkillMixing: true,
    })
    expect(snapshot.queueIds).toHaveLength(8)

    const generatedIds = snapshot.queueIds.slice(0, 4)
    const remainingFrozen = snapshot.queueIds.slice(4, 8)
    const nextMatchups = [
      {
        teamA: [
          players.find((p) => p.id === generatedIds[0]),
          players.find((p) => p.id === generatedIds[1]),
        ],
        teamB: [
          players.find((p) => p.id === generatedIds[2]),
          players.find((p) => p.id === generatedIds[3]),
        ],
      },
      null,
    ]

    const next = advanceProgressivePlayFreeze(snapshot, generatedIds, players, {
      courtMatchups: nextMatchups,
      numberOfCourts: 2,
      matchHistory: [],
      allowAdjacentSkillMixing: true,
    })

    expect(next.queueIds).toHaveLength(8)
    generatedIds.forEach((id) =>
      expect(next.queueIds.includes(id)).toBe(false)
    )
    // The remaining frozen players keep their order at the front of the block.
    expect(next.queueIds.slice(0, 4)).toEqual(remainingFrozen)
  })
})
