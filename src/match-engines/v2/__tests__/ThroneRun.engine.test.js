import { describe, expect, it } from 'vitest'
import {
  applyMatchResult,
  generateCourtAfterScore,
  generateMatches,
  selectPrimaryThroneWinner,
} from '../ThroneRun.engine'
import { generateMatches as generateProgressiveMatches } from '../ProgressivePlay.engine'

// -----------------------------------------------------------------------------
// Spec Traceability (ThroneRun_Master_QA_Test_Specification.md)
// -----------------------------------------------------------------------------
// SECTION A (Session Configuration)
// - TR-CONF-001: maxWinStreak=0 accepted (TR-CONF-001 / TR-SCORE-001 test)
// - TR-CONF-002: maxWinStreak=5 accepted (TR-CONF-002 test)
// - TR-CONF-003: invalid win streak rejected (covered in setup/UI storage validation tests)
//
// SECTION B (Match Generation)
// - TR-GEN-001: generate first court with 4 unique players
// - TR-GEN-002: no player appears on multiple courts
// - TR-GEN-003: skill grouping respected
// - TR-GEN-004: lower gamesPlayed prioritized
//
// SECTION C (Score Submission)
// - TR-SCORE-001: winner updates
// - TR-SCORE-002: loser updates
// - TR-SCORE-003: court cleared after scoring (AppV2 integration)
// - TR-SCORE-004: history entry created
//
// SECTION D (Streaks & Medals)
// - TR-STREAK-001/002/003/004: streak start/increment/reset/cap behavior
// - TR-MEDAL-001: medal accumulation
//
// SECTION E (Two Winner Throne Rotation)
// - TR-ROT-001/002/003: winners stay, become opponents, losers leave
// - TR-ROT-004: fresh partner assignment
//
// SECTION F (Split Group Throne Holder)
// - TR-SPLIT-001..005: split selection logic + single-winner rotation
//
// SECTION G (Partner Diversity)
// - TR-PARTNER-001/002/003: fresh-first, candidate score, repeat fallback
//
// SECTION H (Cooldown)
// - TR-CD-001/002/003: rested preference, cooldown fallback, all-cooldown validity
//
// SECTION I (Ejection Scenarios)
// - TR-EJECT-001/002/003: covered by ejectedWinnerIds + refresh fallback behavior tests
//
// SECTION J (Multi Court)
// - TR-MULTI-001/002: other-court exclusion + non-mutation
// - TR-MULTI-003: rapid refresh stability (integration/E2E scope)
//
// SECTION K (Edge Cases)
// - TR-EDGE-001/002/003: 4-player, 6-player, repeat-partner fallback
// - TR-EDGE-004: 100+ players (performance/property scope)
//
// SECTION L/M/N (Regression/Property/E2E)
// - Invariant/property/end-to-end scenarios are best covered by higher-level suites.
// -----------------------------------------------------------------------------

const makePlayer = (id, overrides = {}) => ({
  id,
  name: `Player ${id}`,
  skillLevel: 'Intermediate',
  teammateId: null,
  checkedIn: true,
  wins: 0,
  losses: 0,
  medals: 0,
  currentWinStreak: 0,
  gamesPlayed: 0,
  queueOrder: 0,
  partnerCounts: {},
  opponentCounts: {},
  ...overrides,
})

const makeResult = (overrides = {}) => ({
  courtIndex: 0,
  teamAIds: ['A', 'B'],
  teamBIds: ['C', 'D'],
  winningTeam: 'A',
  ...overrides,
})

const byId = (players, id) => players.find((player) => player.id === id)

describe('Throne Run: session setup and result processing', () => {
  it('TR-CONF-001 / TR-SCORE-001: maxWinStreak=0 saves behavior and winner updates apply', () => {
    let players = [
      makePlayer('A'),
      makePlayer('B'),
      makePlayer('C'),
      makePlayer('D'),
    ]
    const result = makeResult()

    for (let index = 0; index < 10; index += 1) {
      const next = applyMatchResult(players, result, { maxWinStreak: 0 })
      players = next.players
      expect(next.ejectedWinnerIds).toHaveLength(1)
    }

    expect(byId(players, 'A').currentWinStreak).toBe(10)
    expect(byId(players, 'B').currentWinStreak).toBe(10)
    expect(byId(players, 'A').medals).toBe(0)
    expect(byId(players, 'B').medals).toBe(0)
  })

  it('TR-STREAK-004 / TR-MEDAL-001: reaching streak cap awards medal and resets streak', () => {
    const players = [
      makePlayer('A', { currentWinStreak: 2, medals: 0 }),
      makePlayer('B', { currentWinStreak: 0, medals: 0 }),
      makePlayer('C'),
      makePlayer('D'),
    ]
    const { players: updated, ejectedWinnerIds } = applyMatchResult(
      players,
      makeResult(),
      { maxWinStreak: 3 }
    )

    expect(ejectedWinnerIds).toEqual(['B'])
    expect(byId(updated, 'A').currentWinStreak).toBe(0)
    expect(byId(updated, 'A').medals).toBe(1)
    expect(byId(updated, 'B').currentWinStreak).toBe(1)
  })

  it('TR-CONF-002: maxWinStreak=5 accepted and cap logic still works', () => {
    const players = [
      makePlayer('A', { currentWinStreak: 4 }),
      makePlayer('B', { currentWinStreak: 0 }),
      makePlayer('C'),
      makePlayer('D'),
    ]
    const { players: updated, ejectedWinnerIds } = applyMatchResult(
      players,
      makeResult(),
      { maxWinStreak: 5 }
    )

    expect(byId(updated, 'A').currentWinStreak).toBe(0)
    expect(byId(updated, 'A').medals).toBe(1)
    expect(ejectedWinnerIds).toHaveLength(1)
  })

  it('TR-STREAK-004: both winners can complete capped streak in same result', () => {
    const players = [
      makePlayer('A', { currentWinStreak: 2 }),
      makePlayer('B', { currentWinStreak: 2 }),
      makePlayer('C'),
      makePlayer('D'),
    ]
    const { players: updated, ejectedWinnerIds } = applyMatchResult(
      players,
      makeResult(),
      { maxWinStreak: 3 }
    )

    expect(ejectedWinnerIds).toEqual(['B'])
    expect(byId(updated, 'A').medals).toBe(1)
    expect(byId(updated, 'B').medals).toBe(1)
    expect(byId(updated, 'A').currentWinStreak).toBe(0)
    expect(byId(updated, 'B').currentWinStreak).toBe(0)
  })

  it('TR-SCORE-001 / TR-SCORE-002 / TR-STREAK-002 / TR-STREAK-003: updates win/loss/streak/skill and tracking stats', () => {
    const players = [
      makePlayer('A', { skillLevel: 'Novice', currentWinStreak: 1 }),
      makePlayer('B', { skillLevel: 'Novice' }),
      makePlayer('C', { skillLevel: 'Intermediate', currentWinStreak: 4 }),
      makePlayer('D', { skillLevel: 'Intermediate', currentWinStreak: 2 }),
    ]
    const { players: updated } = applyMatchResult(players, makeResult(), {
      maxWinStreak: 0,
    })

    expect(byId(updated, 'A').wins).toBe(1)
    expect(byId(updated, 'A').gamesPlayed).toBe(1)
    expect(byId(updated, 'A').skillLevel).toBe('Intermediate')
    expect(byId(updated, 'A').currentWinStreak).toBe(2)

    expect(byId(updated, 'C').losses).toBe(1)
    expect(byId(updated, 'C').gamesPlayed).toBe(1)
    expect(byId(updated, 'C').skillLevel).toBe('Novice')
    expect(byId(updated, 'C').currentWinStreak).toBe(0)

    expect(byId(updated, 'A').partnerCounts.B).toBe(1)
    expect(byId(updated, 'A').opponentCounts.C).toBe(1)
    expect(byId(updated, 'A').opponentCounts.D).toBe(1)
  })

  it('TR-STREAK-003 / TR-MEDAL-001: losses reset streak and never remove medals', () => {
    const players = [
      makePlayer('A', { medals: 2 }),
      makePlayer('B', { medals: 1 }),
      makePlayer('C', { medals: 3 }),
      makePlayer('D', { medals: 4 }),
    ]
    const { players: updated } = applyMatchResult(
      players,
      makeResult({ winningTeam: 'B' }),
      { maxWinStreak: 3 }
    )

    expect(byId(updated, 'A').medals).toBe(2)
    expect(byId(updated, 'B').medals).toBe(1)
  })

  it('medal cooldown: sets medalCooldownCourt and medalCooldownRemaining=2 when medal is earned', () => {
    const players = [
      makePlayer('A', { currentWinStreak: 2 }),
      makePlayer('B', { currentWinStreak: 0 }),
      makePlayer('C'),
      makePlayer('D'),
    ]
    const { players: updated } = applyMatchResult(
      players,
      makeResult({ courtIndex: 1 }),
      { maxWinStreak: 3 }
    )

    expect(byId(updated, 'A').medalCooldownCourt).toBe(1)
    expect(byId(updated, 'A').medalCooldownRemaining).toBe(2)
  })

  it('medal cooldown: NOT set when streak is below cap', () => {
    const players = [
      makePlayer('A', { currentWinStreak: 0 }),
      makePlayer('B', { currentWinStreak: 0 }),
      makePlayer('C'),
      makePlayer('D'),
    ]
    const { players: updated } = applyMatchResult(
      players,
      makeResult(),
      { maxWinStreak: 3 }
    )

    expect(byId(updated, 'A').medalCooldownCourt).toBeUndefined()
    expect(byId(updated, 'A').medalCooldownRemaining).toBeUndefined()
  })

  it('medal cooldown: losers never get medal cooldown', () => {
    const players = [
      makePlayer('A', { currentWinStreak: 2 }),
      makePlayer('B', { currentWinStreak: 0 }),
      makePlayer('C', { medals: 3 }),
      makePlayer('D', { medals: 1 }),
    ]
    const { players: updated } = applyMatchResult(
      players,
      makeResult(),
      { maxWinStreak: 3 }
    )

    expect(byId(updated, 'C').medalCooldownCourt).toBeUndefined()
    expect(byId(updated, 'D').medalCooldownCourt).toBeUndefined()
  })

  it('medal cooldown: both winners get cooldown when both hit cap', () => {
    const players = [
      makePlayer('A', { currentWinStreak: 2 }),
      makePlayer('B', { currentWinStreak: 2 }),
      makePlayer('C'),
      makePlayer('D'),
    ]
    const { players: updated } = applyMatchResult(
      players,
      makeResult({ courtIndex: 0 }),
      { maxWinStreak: 3 }
    )

    expect(byId(updated, 'A').medalCooldownCourt).toBe(0)
    expect(byId(updated, 'A').medalCooldownRemaining).toBe(2)
    expect(byId(updated, 'B').medalCooldownCourt).toBe(0)
    expect(byId(updated, 'B').medalCooldownRemaining).toBe(2)
  })

  it('TR-034: ejected winner is the one with higher gamesPlayed', () => {
    const players = [
      makePlayer('A', { gamesPlayed: 1, skillLevel: 'Novice' }),
      makePlayer('B', { gamesPlayed: 5, skillLevel: 'Novice' }),
      makePlayer('C'),
      makePlayer('D'),
    ]
    const { ejectedWinnerIds } = applyMatchResult(players, makeResult(), {
      maxWinStreak: 0,
    })

    expect(ejectedWinnerIds).toEqual(['B'])
  })

  it('TR-SCORE-004: returns history entry with score metadata', () => {
    const players = [
      makePlayer('A'),
      makePlayer('B'),
      makePlayer('C'),
      makePlayer('D'),
    ]
    const { historyEntry } = applyMatchResult(players, makeResult(), {
      maxWinStreak: 0,
    })

    expect(historyEntry.courtIndex).toBe(0)
    expect(historyEntry.teamAIds).toEqual(['A', 'B'])
    expect(historyEntry.teamBIds).toEqual(['C', 'D'])
    expect(historyEntry.winningTeam).toBe('A')
    expect(historyEntry.signature).toBeTypeOf('string')
    expect(historyEntry.timestamp).toBeTypeOf('number')
  })
})

describe('Throne Run: initial generation uses Progressive Play', () => {
  it('TR-GEN-001 / TR-GEN-002: delegates generation and keeps unique players per court', () => {
    const players = [
      makePlayer('P1', { skillLevel: 'Beginner' }),
      makePlayer('P2', { skillLevel: 'Novice' }),
      makePlayer('P3', { skillLevel: 'Intermediate' }),
      makePlayer('P4', { skillLevel: 'Advanced' }),
      makePlayer('P5', { skillLevel: 'Beginner' }),
      makePlayer('P6', { skillLevel: 'Novice' }),
      makePlayer('P7', { skillLevel: 'Intermediate' }),
      makePlayer('P8', { skillLevel: 'Advanced' }),
    ]
    const options = { courts: 2, matchHistory: [] }

    const throne = generateMatches(players, options)
    const progressive = generateProgressiveMatches(players, options)

    expect(throne).toEqual(progressive)
  })

  it('TR-GEN-003: respects skill grouping boundaries', () => {
    const players = [
      makePlayer('B1', { skillLevel: 'Beginner' }),
      makePlayer('N1', { skillLevel: 'Novice' }),
      makePlayer('I1', { skillLevel: 'Intermediate' }),
      makePlayer('A1', { skillLevel: 'Advanced' }),
      makePlayer('B2', { skillLevel: 'Beginner' }),
      makePlayer('N2', { skillLevel: 'Novice' }),
      makePlayer('I2', { skillLevel: 'Intermediate' }),
      makePlayer('A2', { skillLevel: 'Advanced' }),
    ]

    const result = generateMatches(players, { courts: 2, matchHistory: [] })
    result.courts.forEach((court) => {
      const all = [...court.teamA, ...court.teamB]
      const groups = new Set(
        all.map((p) =>
          ['Beginner', 'Novice'].includes(p.skillLevel) ? 'group1' : 'group2'
        )
      )
      expect(groups.size).toBe(1)
    })
  })

  it('TR-GEN-004: lower gamesPlayed players are prioritized in generation pool', () => {
    const lowGames = Array.from({ length: 8 }, (_, i) =>
      makePlayer(`L${i}`, { skillLevel: 'Novice', gamesPlayed: 0 })
    )
    const highGames = Array.from({ length: 8 }, (_, i) =>
      makePlayer(`H${i}`, { skillLevel: 'Novice', gamesPlayed: 5 })
    )
    const result = generateMatches([...lowGames, ...highGames], {
      courts: 2,
      matchHistory: [],
    })
    const onCourtIds = new Set(
      result.courts.flatMap((court) => [...court.teamA, ...court.teamB].map((p) => p.id))
    )
    const lowOnCourt = lowGames.filter((player) => onCourtIds.has(player.id)).length
    const highOnCourt = highGames.filter((player) => onCourtIds.has(player.id)).length
    expect(lowOnCourt).toBeGreaterThan(highOnCourt)
  })
})

describe('Throne Run: generateCourtAfterScore preconditions', () => {
  it('TR-050: returns null for invalid winner count (0 or 3+)', () => {
    const players = [makePlayer('W1'), makePlayer('W2'), makePlayer('P1'), makePlayer('P2')]
    expect(generateCourtAfterScore(players, { winnerIds: [] })).toBeNull()
    expect(generateCourtAfterScore(players, { winnerIds: ['W1', 'W2', 'P1'] })).toBeNull()
  })

  it('TR-051: returns null when winner id does not resolve to player', () => {
    const players = [makePlayer('W1'), makePlayer('P1'), makePlayer('P2')]
    expect(generateCourtAfterScore(players, { winnerIds: ['W1', 'missing'] })).toBeNull()
  })

  it('TR-052: returns null when a winner is not checked in', () => {
    const players = [
      makePlayer('W1', { checkedIn: false }),
      makePlayer('W2'),
      makePlayer('P1'),
      makePlayer('P2'),
    ]
    expect(generateCourtAfterScore(players, { winnerIds: ['W1', 'W2'] })).toBeNull()
  })

  it('TR-053: returns null when winners are in different skill groups', () => {
    const players = [
      makePlayer('W1', { skillLevel: 'Novice' }),
      makePlayer('W2', { skillLevel: 'Intermediate' }),
      makePlayer('P1', { skillLevel: 'Novice' }),
      makePlayer('P2', { skillLevel: 'Novice' }),
    ]
    expect(generateCourtAfterScore(players, { winnerIds: ['W1', 'W2'] })).toBeNull()
  })

  it('TR-054/TR-055: returns null when fewer than two players are available', () => {
    const players = [
      makePlayer('W1', { skillLevel: 'Novice' }),
      makePlayer('W2', { skillLevel: 'Novice' }),
      makePlayer('P1', { skillLevel: 'Novice', checkedIn: false }),
      makePlayer('P2', { skillLevel: 'Intermediate' }),
    ]
    expect(generateCourtAfterScore(players, { winnerIds: ['W1', 'W2'] })).toBeNull()
  })

  it('TR-056: returns valid court when two partners are available', () => {
    const players = [
      makePlayer('W1', { skillLevel: 'Novice' }),
      makePlayer('W2', { skillLevel: 'Novice' }),
      makePlayer('P1', { skillLevel: 'Novice' }),
      makePlayer('P2', { skillLevel: 'Beginner' }),
    ]
    const nextCourt = generateCourtAfterScore(players, { winnerIds: ['W1', 'W2'] })

    expect(nextCourt).not.toBeNull()
    expect(nextCourt.teamA[0].id).toBe('W1')
    expect(nextCourt.teamB[0].id).toBe('W2')
    const ids = [...nextCourt.teamA, ...nextCourt.teamB].map((player) => player.id)
    expect(new Set(ids).size).toBe(4)
  })
})

describe('Throne Run: rotation and partner selection', () => {
  it('TR-060/TR-061/TR-062: winners stay and split while losers are removed', () => {
    const players = [
      makePlayer('W1', { skillLevel: 'Novice' }),
      makePlayer('W2', { skillLevel: 'Novice' }),
      makePlayer('L1', { skillLevel: 'Novice' }),
      makePlayer('L2', { skillLevel: 'Novice' }),
      makePlayer('N1', { skillLevel: 'Novice' }),
      makePlayer('N2', { skillLevel: 'Novice' }),
    ]
    const courtMatchups = [
      {
        teamA: [byId(players, 'W1'), byId(players, 'W2')],
        teamB: [byId(players, 'L1'), byId(players, 'L2')],
      },
    ]

    const nextCourt = generateCourtAfterScore(players, {
      winnerIds: ['W1', 'W2'],
      courtMatchups,
      courts: 1,
    })
    const ids = [...nextCourt.teamA, ...nextCourt.teamB].map((player) => player.id)

    expect(nextCourt.teamA[0].id).toBe('W1')
    expect(nextCourt.teamB[0].id).toBe('W2')
    expect(ids).not.toContain('L1')
    expect(ids).not.toContain('L2')
  })

  it('TR-PARTNER-001: prefers fresh partners over repeats when available', () => {
    const players = [
      makePlayer('W1', { skillLevel: 'Novice', partnerCounts: { R1: 3 } }),
      makePlayer('W2', { skillLevel: 'Novice', partnerCounts: { R2: 3 } }),
      makePlayer('R1', { skillLevel: 'Novice', partnerCounts: { W1: 3 } }),
      makePlayer('R2', { skillLevel: 'Novice', partnerCounts: { W2: 3 } }),
      makePlayer('F1', { skillLevel: 'Novice' }),
      makePlayer('F2', { skillLevel: 'Novice' }),
    ]

    const nextCourt = generateCourtAfterScore(players, {
      winnerIds: ['W1', 'W2'],
      courts: 1,
    })
    const partnerForW1 = nextCourt.teamA[1]
    const partnerForW2 = nextCourt.teamB[1]

    expect(partnerForW1.id).not.toBe('R1')
    expect(partnerForW2.id).not.toBe('R2')
  })

  it('TR-PARTNER-003: falls back to repeat partners when no fresh assignment exists', () => {
    const players = [
      makePlayer('W1', { skillLevel: 'Novice', partnerCounts: { P1: 1, P2: 1 } }),
      makePlayer('W2', { skillLevel: 'Novice', partnerCounts: { P1: 1, P2: 1 } }),
      makePlayer('P1', { skillLevel: 'Novice' }),
      makePlayer('P2', { skillLevel: 'Novice' }),
    ]
    const nextCourt = generateCourtAfterScore(players, {
      winnerIds: ['W1', 'W2'],
      courts: 1,
    })

    expect(nextCourt).not.toBeNull()
    const ids = [...nextCourt.teamA, ...nextCourt.teamB].map((player) => player.id)
    expect(ids).toEqual(expect.arrayContaining(['W1', 'W2', 'P1', 'P2']))
  })

  it('TR-PARTNER-002: among fresh options, lowest candidate score wins', () => {
    const players = [
      makePlayer('W1', { skillLevel: 'Novice' }),
      makePlayer('W2', { skillLevel: 'Novice' }),
      makePlayer('S1', { skillLevel: 'Novice', gamesPlayed: 0 }),
      makePlayer('S2', { skillLevel: 'Novice', gamesPlayed: 1 }),
      makePlayer('L1', { skillLevel: 'Beginner', gamesPlayed: 0 }),
      makePlayer('H1', { skillLevel: 'Intermediate', gamesPlayed: 0 }),
    ]
    const nextCourt = generateCourtAfterScore(players, {
      winnerIds: ['W1', 'W2'],
      courts: 1,
    })
    const selectedPartners = [nextCourt.teamA[1].id, nextCourt.teamB[1].id]

    expect(selectedPartners).toEqual(expect.arrayContaining(['S1', 'S2']))
    expect(selectedPartners).not.toContain('L1')
    expect(selectedPartners).not.toContain('H1')
  })

  it('TR-PARTNER-004: expands partner pool before accepting a repeat pairing', () => {
    const players = [
      makePlayer('W1', { skillLevel: 'Novice', partnerCounts: { R1: 1 } }),
      makePlayer('W2', { skillLevel: 'Novice', partnerCounts: { R1: 1 } }),
      makePlayer('R1', { skillLevel: 'Novice', partnerCounts: { W1: 1, W2: 1 } }),
      makePlayer('F1', { skillLevel: 'Novice' }),
      makePlayer('F2', { skillLevel: 'Novice' }),
    ]
    const nextCourt = generateCourtAfterScore(players, {
      winnerIds: ['W1', 'W2'],
      courts: 1,
    })

    const partnerForW1 = nextCourt.teamA[1].id
    const partnerForW2 = nextCourt.teamB[1].id

    expect(partnerForW1).not.toBe('R1')
    expect(partnerForW2).not.toBe('R1')
    expect([partnerForW1, partnerForW2].sort()).toEqual(['F1', 'F2'])
  })

  it('TR-PARTNER-005: prefers lowest prior-partner count when repeats are unavoidable', () => {
    const players = [
      makePlayer('W1', {
        skillLevel: 'Novice',
        partnerCounts: { P1: 1, P2: 2 },
      }),
      makePlayer('W2', {
        skillLevel: 'Novice',
        partnerCounts: { P1: 1, P2: 2 },
      }),
      makePlayer('P1', { skillLevel: 'Novice', partnerCounts: { W1: 1, W2: 1 } }),
      makePlayer('P2', { skillLevel: 'Novice', partnerCounts: { W1: 2, W2: 2 } }),
    ]
    const nextCourt = generateCourtAfterScore(players, {
      winnerIds: ['W1', 'W2'],
      courts: 1,
    })

    const partners = [nextCourt.teamA[1].id, nextCourt.teamB[1].id]
    expect(partners).toEqual(expect.arrayContaining(['P1', 'P2']))
    expect(partners.filter((id) => id === 'P2').length).toBe(1)
  })

  it('TR-OPP-001: prefers fresh cross-team opponents when assigning partners', () => {
    const players = [
      makePlayer('W1', {
        skillLevel: 'Novice',
        opponentCounts: { O1: 1, O2: 0, O3: 0 },
      }),
      makePlayer('P1', { skillLevel: 'Novice' }),
      makePlayer('P2', { skillLevel: 'Novice' }),
      makePlayer('O1', {
        skillLevel: 'Novice',
        opponentCounts: { W1: 1 },
      }),
      makePlayer('O2', { skillLevel: 'Novice' }),
      makePlayer('O3', { skillLevel: 'Novice' }),
    ]

    const nextCourt = generateCourtAfterScore(players, {
      winnerIds: ['W1'],
      courts: 1,
    })

    const teamAIds = nextCourt.teamA.map((player) => player.id)
    const teamBIds = nextCourt.teamB.map((player) => player.id)

    expect(teamAIds).toContain('W1')
    expect(teamBIds).not.toContain('O1')
  })

  it('TR-OPP-002: reshuffles teams to minimize opponent repeats when unavoidable', () => {
    const players = [
      makePlayer('W1', {
        skillLevel: 'Novice',
        opponentCounts: { Wyeth: 1, Gregy: 1 },
      }),
      makePlayer('Mon', {
        skillLevel: 'Novice',
        opponentCounts: { Wyeth: 1, Gregy: 1 },
        partnerCounts: { W1: 1 },
      }),
      makePlayer('Wyeth', {
        skillLevel: 'Novice',
        opponentCounts: { W1: 1, Mon: 1 },
        partnerCounts: { Gregy: 1 },
      }),
      makePlayer('Gregy', {
        skillLevel: 'Novice',
        opponentCounts: { W1: 1, Mon: 1 },
        partnerCounts: { Wyeth: 1 },
      }),
    ]

    const nextCourt = generateCourtAfterScore(players, {
      winnerIds: ['W1'],
      courts: 1,
    })

    const teamAIds = nextCourt.teamA.map((player) => player.id)
    const teamBIds = nextCourt.teamB.map((player) => player.id)

    expect(teamAIds).toContain('W1')
    expect(teamAIds).not.toContain('Mon')
    expect(['Gregy', 'Wyeth']).toContain(teamAIds[1])
    expect(teamBIds).toEqual(
      expect.arrayContaining(
        teamAIds[1] === 'Gregy' ? ['Mon', 'Wyeth'] : ['Mon', 'Gregy']
      )
    )
  })

  it('TR-OPP-003: hard-blocks repeat opponents even when partner pairing is fresher', () => {
    const players = [
      makePlayer('W1', {
        skillLevel: 'Novice',
        opponentCounts: { O1: 1 },
      }),
      makePlayer('P1', {
        skillLevel: 'Novice',
        partnerCounts: { W1: 1 },
      }),
      makePlayer('P2', { skillLevel: 'Novice' }),
      makePlayer('O1', {
        skillLevel: 'Novice',
        opponentCounts: { W1: 1 },
      }),
      makePlayer('O2', { skillLevel: 'Novice' }),
      makePlayer('O3', { skillLevel: 'Novice' }),
    ]

    const nextCourt = generateCourtAfterScore(players, {
      winnerIds: ['W1'],
      courts: 1,
    })

    const teamBIds = nextCourt.teamB.map((player) => player.id)
    expect(teamBIds).not.toContain('O1')
    expect(nextCourt.teamA.map((player) => player.id)).toContain('P2')
  })
})

describe('Throne Run: cooldown, fallback, and multi-court guards', () => {
  it('TR-CD-001: prefers rested players when enough rested players exist', () => {
    const players = [
      makePlayer('W1', { skillLevel: 'Novice' }),
      makePlayer('W2', { skillLevel: 'Novice' }),
      makePlayer('R1', { skillLevel: 'Novice' }),
      makePlayer('R2', { skillLevel: 'Novice' }),
      makePlayer('C1', { skillLevel: 'Novice' }),
      makePlayer('C2', { skillLevel: 'Novice' }),
    ]
    const matchHistory = [
      {
        teamAIds: ['C1', 'C2'],
        teamBIds: ['X1', 'X2'],
      },
    ]
    const nextCourt = generateCourtAfterScore(players, {
      winnerIds: ['W1', 'W2'],
      matchHistory,
      courts: 1,
    })

    const partners = [nextCourt.teamA[1].id, nextCourt.teamB[1].id]
    expect(partners).toEqual(expect.arrayContaining(['R1', 'R2']))
  })

  it('TR-CD-002: uses cooldown players when rested players are insufficient', () => {
    const players = [
      makePlayer('W1', { skillLevel: 'Novice' }),
      makePlayer('W2', { skillLevel: 'Novice' }),
      makePlayer('R1', { skillLevel: 'Novice' }),
      makePlayer('C1', { skillLevel: 'Novice' }),
      makePlayer('C2', { skillLevel: 'Novice' }),
    ]
    const matchHistory = [
      {
        teamAIds: ['C1', 'C2'],
        teamBIds: ['X1', 'X2'],
      },
    ]
    const nextCourt = generateCourtAfterScore(players, {
      winnerIds: ['W1', 'W2'],
      matchHistory,
      courts: 1,
    })

    expect(nextCourt).not.toBeNull()
    const partners = [nextCourt.teamA[1].id, nextCourt.teamB[1].id]
    expect(partners).toContain('R1')
    expect(partners.some((id) => id === 'C1' || id === 'C2')).toBe(true)
  })

  it('TR-CD-003: generates a valid match when all available players are on cooldown', () => {
    const players = [
      makePlayer('W1', { skillLevel: 'Novice' }),
      makePlayer('W2', { skillLevel: 'Novice' }),
      makePlayer('C1', { skillLevel: 'Novice' }),
      makePlayer('C2', { skillLevel: 'Novice' }),
    ]
    const matchHistory = [
      {
        teamAIds: ['C1', 'C2'],
        teamBIds: ['X1', 'X2'],
      },
    ]
    const nextCourt = generateCourtAfterScore(players, {
      winnerIds: ['W1', 'W2'],
      matchHistory,
      courts: 1,
    })

    expect(nextCourt).not.toBeNull()
  })

  it('TR-110/TR-111/TR-112: returns null when throne rotation cannot proceed', () => {
    const players = [
      makePlayer('W1', { skillLevel: 'Novice' }),
      makePlayer('W2', { skillLevel: 'Novice' }),
      makePlayer('P1', { skillLevel: 'Intermediate' }),
      makePlayer('P2', { skillLevel: 'Intermediate' }),
    ]
    expect(generateCourtAfterScore(players, { winnerIds: ['W1'] })).toBeNull()
    expect(generateCourtAfterScore(players, { winnerIds: [] })).toBeNull()
    expect(
      generateCourtAfterScore(players, {
        winnerIds: ['W1', 'W2'],
      })
    ).toBeNull()
  })

  it('TR-120/TR-121: excludes players on other courts and does not mutate other courts', () => {
    const players = [
      makePlayer('W1', { skillLevel: 'Novice' }),
      makePlayer('W2', { skillLevel: 'Novice' }),
      makePlayer('P1', { skillLevel: 'Novice' }),
      makePlayer('P2', { skillLevel: 'Novice' }),
      makePlayer('X1', { skillLevel: 'Novice' }),
      makePlayer('X2', { skillLevel: 'Novice' }),
    ]
    const otherCourt = {
      teamA: [byId(players, 'X1'), makePlayer('Y1', { skillLevel: 'Novice' })],
      teamB: [byId(players, 'X2'), makePlayer('Y2', { skillLevel: 'Novice' })],
    }
    const courtMatchups = [null, otherCourt]
    const snapshot = JSON.stringify(otherCourt)

    const nextCourt = generateCourtAfterScore(players, {
      winnerIds: ['W1', 'W2'],
      courtMatchups,
      courts: 2,
    })
    const ids = [...nextCourt.teamA, ...nextCourt.teamB].map((player) => player.id)

    expect(ids).not.toContain('X1')
    expect(ids).not.toContain('X2')
    expect(JSON.stringify(otherCourt)).toBe(snapshot)
  })
})

describe('Throne Run: no skill alignment after promotion', () => {
  it('TR-skill-01: Beginner + Novice winners each get +1 without alignment', () => {
    const players = [
      makePlayer('A', { skillLevel: 'Beginner' }),
      makePlayer('B', { skillLevel: 'Novice' }),
      makePlayer('C', { skillLevel: 'Novice' }),
      makePlayer('D', { skillLevel: 'Beginner' }),
    ]
    const { players: updated } = applyMatchResult(players, makeResult(), {
      maxWinStreak: 0,
    })

    expect(byId(updated, 'A').skillLevel).toBe('Novice')
    expect(byId(updated, 'B').skillLevel).toBe('Intermediate')
  })

  it('TR-skill-02: same-rank winners both get +1 normally', () => {
    const players = [
      makePlayer('A', { skillLevel: 'Novice' }),
      makePlayer('B', { skillLevel: 'Novice' }),
      makePlayer('C', { skillLevel: 'Intermediate' }),
      makePlayer('D', { skillLevel: 'Intermediate' }),
    ]
    const { players: updated } = applyMatchResult(players, makeResult(), {
      maxWinStreak: 0,
    })

    expect(byId(updated, 'A').skillLevel).toBe('Intermediate')
    expect(byId(updated, 'B').skillLevel).toBe('Intermediate')
  })

  it('TR-SPLIT-001: split-group winners feed deterministic throne-holder selection', () => {
    const players = [
      makePlayer('A', { skillLevel: 'Beginner', gamesPlayed: 1 }),
      makePlayer('B', { skillLevel: 'Novice', gamesPlayed: 1 }),
      makePlayer('C', { skillLevel: 'Novice' }),
      makePlayer('D', { skillLevel: 'Beginner' }),
    ]
    const { players: updated } = applyMatchResult(players, makeResult(), {
      maxWinStreak: 0,
    })
    const wA = byId(updated, 'A') // Novice
    const wB = byId(updated, 'B') // Intermediate
    expect(selectPrimaryThroneWinner(wA, wB).id).toBe('B')
  })
})

describe('Throne Run: selectPrimaryThroneWinner', () => {
  it('TR-SPLIT-002: selects winner with fewer gamesPlayed', () => {
    const a = makePlayer('A', { gamesPlayed: 5, skillLevel: 'Novice' })
    const b = makePlayer('B', { gamesPlayed: 3, skillLevel: 'Novice' })
    expect(selectPrimaryThroneWinner(a, b).id).toBe('B')
    expect(selectPrimaryThroneWinner(b, a).id).toBe('B')
  })

  it('TR-SPLIT-003: breaks gamesPlayed tie with higher skill rank', () => {
    const a = makePlayer('A', { gamesPlayed: 4, skillLevel: 'Intermediate' })
    const b = makePlayer('B', { gamesPlayed: 4, skillLevel: 'Advanced' })
    expect(selectPrimaryThroneWinner(a, b).id).toBe('B')
    expect(selectPrimaryThroneWinner(b, a).id).toBe('B')
  })

  it('TR-SPLIT-004: breaks full tie with stable id ordering', () => {
    const a = makePlayer('A', { gamesPlayed: 4, skillLevel: 'Intermediate' })
    const b = makePlayer('B', { gamesPlayed: 4, skillLevel: 'Intermediate' })
    expect(selectPrimaryThroneWinner(a, b).id).toBe('A')
    expect(selectPrimaryThroneWinner(b, a).id).toBe('A')
  })
})

describe('Throne Run: single-winner court rotation', () => {
  it('TR-SPLIT-005: single winner generates valid 4-player court with winner on team A', () => {
    const players = [
      makePlayer('W1', { skillLevel: 'Intermediate' }),
      makePlayer('P1', { skillLevel: 'Intermediate' }),
      makePlayer('P2', { skillLevel: 'Intermediate' }),
      makePlayer('P3', { skillLevel: 'Intermediate' }),
    ]
    const nextCourt = generateCourtAfterScore(players, {
      winnerIds: ['W1'],
      courts: 1,
    })

    expect(nextCourt).not.toBeNull()
    expect(nextCourt.teamA[0].id).toBe('W1')
    expect(nextCourt.teamA).toHaveLength(2)
    expect(nextCourt.teamB).toHaveLength(2)
    const ids = [...nextCourt.teamA, ...nextCourt.teamB].map((p) => p.id)
    expect(new Set(ids).size).toBe(4)
  })

  it('TR-rotate-02: single winner returns null when fewer than 3 partners available', () => {
    const players = [
      makePlayer('W1', { skillLevel: 'Intermediate' }),
      makePlayer('P1', { skillLevel: 'Intermediate' }),
      makePlayer('P2', { skillLevel: 'Intermediate' }),
    ]
    expect(generateCourtAfterScore(players, { winnerIds: ['W1'], courts: 1 })).toBeNull()
  })

  it('TR-rotate-03: single winner prefers fresh partner on team A', () => {
    const players = [
      makePlayer('W1', { skillLevel: 'Novice', partnerCounts: { R1: 3, R2: 3 } }),
      makePlayer('R1', { skillLevel: 'Novice', partnerCounts: { W1: 3 } }),
      makePlayer('R2', { skillLevel: 'Novice', partnerCounts: { W1: 3 } }),
      makePlayer('F1', { skillLevel: 'Novice' }),
      makePlayer('F2', { skillLevel: 'Novice' }),
    ]
    const nextCourt = generateCourtAfterScore(players, {
      winnerIds: ['W1'],
      courts: 1,
    })

    expect(nextCourt.teamA[0].id).toBe('W1')
    expect(['F1', 'F2']).toContain(nextCourt.teamA[1].id)
  })
})

describe('Throne Run: mixed doubles preference', () => {
  const isMixedPair = (a, b) =>
    Boolean(a.gender && b.gender && a.gender !== b.gender)

  it('TR-MIXED-001: two-winner rotation prefers mixed partner pairings', () => {
    const players = [
      makePlayer('W1', { skillLevel: 'Novice', gender: 'Male' }),
      makePlayer('W2', { skillLevel: 'Novice', gender: 'Female' }),
      makePlayer('M1', { skillLevel: 'Novice', gender: 'Male' }),
      makePlayer('M2', { skillLevel: 'Novice', gender: 'Male' }),
      makePlayer('F1', { skillLevel: 'Novice', gender: 'Female' }),
      makePlayer('F2', { skillLevel: 'Novice', gender: 'Female' }),
    ]
    const nextCourt = generateCourtAfterScore(players, {
      winnerIds: ['W1', 'W2'],
      courts: 1,
    })

    expect(isMixedPair(nextCourt.teamA[0], nextCourt.teamA[1])).toBe(true)
    expect(isMixedPair(nextCourt.teamB[0], nextCourt.teamB[1])).toBe(true)
  })

  it('TR-MIXED-002: allows same-gender pairs when gender balance prevents mixed doubles', () => {
    const players = [
      makePlayer('W1', { skillLevel: 'Novice', gender: 'Male' }),
      makePlayer('W2', { skillLevel: 'Novice', gender: 'Male' }),
      makePlayer('M1', { skillLevel: 'Novice', gender: 'Male' }),
      makePlayer('F1', { skillLevel: 'Novice', gender: 'Female' }),
    ]
    const nextCourt = generateCourtAfterScore(players, {
      winnerIds: ['W1', 'W2'],
      courts: 1,
    })

    expect(nextCourt).not.toBeNull()
    const ids = [...nextCourt.teamA, ...nextCourt.teamB].map((player) => player.id)
    expect(new Set(ids).size).toBe(4)
  })

  it('TR-MIXED-003: single winner prefers mixed partner and mixed opponent team', () => {
    const players = [
      makePlayer('W1', { skillLevel: 'Novice', gender: 'Male' }),
      makePlayer('F1', { skillLevel: 'Novice', gender: 'Female' }),
      makePlayer('M1', { skillLevel: 'Novice', gender: 'Male' }),
      makePlayer('F2', { skillLevel: 'Novice', gender: 'Female' }),
      makePlayer('M2', { skillLevel: 'Novice', gender: 'Male' }),
    ]
    const nextCourt = generateCourtAfterScore(players, {
      winnerIds: ['W1'],
      courts: 1,
    })

    expect(isMixedPair(nextCourt.teamA[0], nextCourt.teamA[1])).toBe(true)
    expect(isMixedPair(nextCourt.teamB[0], nextCourt.teamB[1])).toBe(true)
  })
})

describe('Throne Run: edge cases', () => {
  it('TR-EDGE-001: exactly four players checked in produces one valid match', () => {
    const players = [
      makePlayer('P1', { skillLevel: 'Novice' }),
      makePlayer('P2', { skillLevel: 'Novice' }),
      makePlayer('P3', { skillLevel: 'Novice' }),
      makePlayer('P4', { skillLevel: 'Novice' }),
    ]
    const result = generateMatches(players, { courts: 1, matchHistory: [] })
    expect(result.courts).toHaveLength(1)
    const ids = result.courts[0]
      ? [...result.courts[0].teamA, ...result.courts[0].teamB].map((p) => p.id)
      : []
    expect(new Set(ids).size).toBe(4)
  })

  it('TR-EDGE-002: exactly six players still supports valid single-winner rotation', () => {
    const players = [
      makePlayer('W1', { skillLevel: 'Novice' }),
      makePlayer('P1', { skillLevel: 'Novice' }),
      makePlayer('P2', { skillLevel: 'Novice' }),
      makePlayer('P3', { skillLevel: 'Novice' }),
      makePlayer('P4', { skillLevel: 'Novice' }),
      makePlayer('P5', { skillLevel: 'Novice' }),
    ]
    const nextCourt = generateCourtAfterScore(players, {
      winnerIds: ['W1'],
      courts: 1,
    })
    expect(nextCourt).not.toBeNull()
    const ids = nextCourt ? [...nextCourt.teamA, ...nextCourt.teamB].map((p) => p.id) : []
    expect(new Set(ids).size).toBe(4)
  })
})
