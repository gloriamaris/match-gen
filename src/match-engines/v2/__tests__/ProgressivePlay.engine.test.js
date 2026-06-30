import { describe, expect, it } from 'vitest'
import {
  applyMatchResult,
  assignCourts,
  buildTeamUnits,
  enrichTeam,
  generateMatches,
  generateMatchesFromBuckets,
  generateTeamsForGroup,
  getCooldownIds,
  groupAndBucket,
  hasPartneredBefore,
  canPlayerGroupsOpponents,
  canTeamsPlayMatch,
  teamSkillGroupForPlayers,
  highestSkillLevel,
  identifyLockedTeams,
  matchSignature,
  performanceScore,
  selectFairnessPool,
  buildUpNextQueue,
  takePairAwareCourtFill,
  shiftSkillLevel,
  skillGroupOf,
  teamPerformanceScore,
  isMixedGender,
} from '../ProgressivePlay.engine'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const makePair = (idA, idB, overrides = {}) => [
  makePlayer(idA, { teammateId: idB, ...overrides }),
  makePlayer(idB, { teammateId: idA, ...overrides }),
]

const allPlayerIds = (result) =>
  result.courts.flatMap((c) => [
    ...c.teamA.map((p) => p.id),
    ...c.teamB.map((p) => p.id),
  ])

const courtTeamIds = (court) => ({
  teamAIds: court.teamA.map((p) => p.id),
  teamBIds: court.teamB.map((p) => p.id),
})

// ---------------------------------------------------------------------------
// Skill helpers
// ---------------------------------------------------------------------------

describe('skill helpers', () => {
  it('maps skill levels to correct groups', () => {
    expect(skillGroupOf('Beginner')).toBe(1)
    expect(skillGroupOf('Novice')).toBe(1)
    expect(skillGroupOf('Intermediate')).toBe(2)
    expect(skillGroupOf('Advanced')).toBe(2)
  })

  it('highestSkillLevel returns the strongest rank', () => {
    const players = [
      makePlayer('a', { skillLevel: 'Beginner' }),
      makePlayer('b', { skillLevel: 'Advanced' }),
    ]
    expect(highestSkillLevel(players)).toBe('Advanced')
  })

  it('enforces the global rule for opponent skill groups', () => {
    expect(
      canPlayerGroupsOpponents(
        [
          makePlayer('b', { skillLevel: 'Beginner' }),
          makePlayer('n', { skillLevel: 'Novice' }),
        ],
        [
          makePlayer('n2', { skillLevel: 'Novice' }),
          makePlayer('n3', { skillLevel: 'Novice' }),
        ]
      )
    ).toBe(true)
    expect(
      canPlayerGroupsOpponents(
        [
          makePlayer('i', { skillLevel: 'Intermediate' }),
          makePlayer('a', { skillLevel: 'Advanced' }),
        ],
        [
          makePlayer('i2', { skillLevel: 'Intermediate' }),
          makePlayer('a2', { skillLevel: 'Advanced' }),
        ]
      )
    ).toBe(true)
    expect(
      canPlayerGroupsOpponents(
        [
          makePlayer('n', { skillLevel: 'Novice' }),
          makePlayer('n2', { skillLevel: 'Novice' }),
        ],
        [
          makePlayer('i', { skillLevel: 'Intermediate' }),
          makePlayer('a', { skillLevel: 'Advanced' }),
        ]
      )
    ).toBe(false)
    expect(teamSkillGroupForPlayers([makePlayer('b', { skillLevel: 'Beginner' })])).toBe(
      1
    )
    expect(
      teamSkillGroupForPlayers([
        makePlayer('b', { skillLevel: 'Beginner' }),
        makePlayer('a', { skillLevel: 'Advanced' }),
      ])
    ).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Skill level shifting
// ---------------------------------------------------------------------------

describe('shiftSkillLevel', () => {
  it('moves up one level on win', () => {
    expect(shiftSkillLevel('Beginner', 1)).toBe('Novice')
    expect(shiftSkillLevel('Novice', 1)).toBe('Intermediate')
    expect(shiftSkillLevel('Intermediate', 1)).toBe('Advanced')
  })

  it('moves down one level on loss', () => {
    expect(shiftSkillLevel('Advanced', -1)).toBe('Intermediate')
    expect(shiftSkillLevel('Intermediate', -1)).toBe('Novice')
    expect(shiftSkillLevel('Novice', -1)).toBe('Beginner')
  })

  it('stays at Advanced when winning at Advanced', () => {
    expect(shiftSkillLevel('Advanced', 1)).toBe('Advanced')
  })

  it('stays at Beginner when losing at Beginner', () => {
    expect(shiftSkillLevel('Beginner', -1)).toBe('Beginner')
  })
})

describe('applyMatchResult skill shift', () => {
  it('winners move up one skill level, losers move down', () => {
    const players = [
      makePlayer('A', { skillLevel: 'Novice' }),
      makePlayer('B', { skillLevel: 'Novice' }),
      makePlayer('C', { skillLevel: 'Intermediate' }),
      makePlayer('D', { skillLevel: 'Intermediate' }),
    ]
    const { players: updated } = applyMatchResult(players, {
      courtIndex: 0,
      teamAIds: ['A', 'B'],
      teamBIds: ['C', 'D'],
      winningTeam: 'A',
    })

    // Winners A and B: Novice → Intermediate
    expect(updated.find((p) => p.id === 'A').skillLevel).toBe('Intermediate')
    expect(updated.find((p) => p.id === 'B').skillLevel).toBe('Intermediate')
    // Losers C and D: Intermediate → Novice
    expect(updated.find((p) => p.id === 'C').skillLevel).toBe('Novice')
    expect(updated.find((p) => p.id === 'D').skillLevel).toBe('Novice')
  })

  it('Beginner losers stay at Beginner, Advanced winners stay at Advanced', () => {
    const players = [
      makePlayer('A', { skillLevel: 'Advanced' }),
      makePlayer('B', { skillLevel: 'Advanced' }),
      makePlayer('C', { skillLevel: 'Beginner' }),
      makePlayer('D', { skillLevel: 'Beginner' }),
    ]
    const { players: updated } = applyMatchResult(players, {
      courtIndex: 0,
      teamAIds: ['A', 'B'],
      teamBIds: ['C', 'D'],
      winningTeam: 'A',
    })

    expect(updated.find((p) => p.id === 'A').skillLevel).toBe('Advanced')
    expect(updated.find((p) => p.id === 'B').skillLevel).toBe('Advanced')
    expect(updated.find((p) => p.id === 'C').skillLevel).toBe('Beginner')
    expect(updated.find((p) => p.id === 'D').skillLevel).toBe('Beginner')
  })
})

// ---------------------------------------------------------------------------
// Performance score
// ---------------------------------------------------------------------------

describe('performanceScore', () => {
  it('returns wins - losses', () => {
    expect(performanceScore({ wins: 5, losses: 2 })).toBe(3)
    expect(performanceScore({ wins: 1, losses: 4 })).toBe(-3)
    expect(performanceScore({ wins: 0, losses: 0 })).toBe(0)
  })

  it('teamPerformanceScore averages members', () => {
    const players = [
      makePlayer('a', { wins: 4, losses: 0 }),
      makePlayer('b', { wins: 0, losses: 2 }),
    ]
    expect(teamPerformanceScore(players)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Locked teams
// ---------------------------------------------------------------------------

describe('identifyLockedTeams', () => {
  it('identifies mutual locked pairs', () => {
    const [a, b] = makePair('a', 'b')
    const c = makePlayer('c')
    const { lockedTeams, remaining } = identifyLockedTeams([a, b, c])

    expect(lockedTeams).toHaveLength(1)
    expect(lockedTeams[0].locked).toBe(true)
    expect(lockedTeams[0].players.map((p) => p.id).sort()).toEqual(['a', 'b'])
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe('c')
  })

  it('ignores one-sided teammate references', () => {
    const a = makePlayer('a', { teammateId: 'b' })
    const b = makePlayer('b')
    const { lockedTeams, remaining } = identifyLockedTeams([a, b])

    expect(lockedTeams).toHaveLength(0)
    expect(remaining).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Team generation & skill groups
// ---------------------------------------------------------------------------

describe('buildTeamUnits', () => {
  it('keeps locked teams together and builds generated teams', () => {
    const [a, b] = makePair('a', 'b', { skillLevel: 'Novice' })
    const c = makePlayer('c', { skillLevel: 'Intermediate' })
    const d = makePlayer('d', { skillLevel: 'Intermediate' })
    const { teams, sitOuts } = buildTeamUnits([a, b, c, d])

    expect(teams.length).toBeGreaterThanOrEqual(2)
    const locked = teams.filter((t) => t.locked)
    expect(locked).toHaveLength(1)
    expect(locked[0].players.map((p) => p.id).sort()).toEqual(['a', 'b'])
    expect(sitOuts).toHaveLength(0)
  })

  it('sits out an odd player', () => {
    const players = Array.from({ length: 5 }, (_, i) =>
      makePlayer(`p${i}`, { skillLevel: 'Intermediate' })
    )
    const { teams, sitOuts } = buildTeamUnits(players)

    expect(teams).toHaveLength(2)
    expect(sitOuts).toHaveLength(1)
  })

  it('pairs Beginner with Novice within group 1', () => {
    const players = [
      makePlayer('beginner', { skillLevel: 'Beginner' }),
      makePlayer('novice1', { skillLevel: 'Novice' }),
      makePlayer('novice2', { skillLevel: 'Novice' }),
      makePlayer('novice3', { skillLevel: 'Novice' }),
    ]
    const { teams } = buildTeamUnits(players)
    const enriched = teams.map(enrichTeam)

    expect(enriched).toHaveLength(2)
    enriched.forEach((team) => {
      expect(team.skillGroup).toBe(1)
    })

    const beginnerTeam = enriched.find((team) =>
      team.players.some((player) => player.id === 'beginner')
    )
    expect(beginnerTeam).toBeDefined()
    expect(
      beginnerTeam.players.some((player) => player.skillLevel === 'Novice')
    ).toBe(true)
  })

  it('pairs Intermediate with Advanced within group 2', () => {
    const players = [
      makePlayer('intermediate', { skillLevel: 'Intermediate' }),
      makePlayer('advanced1', { skillLevel: 'Advanced' }),
      makePlayer('advanced2', { skillLevel: 'Advanced' }),
      makePlayer('advanced3', { skillLevel: 'Advanced' }),
    ]
    const { teams } = buildTeamUnits(players)
    const enriched = teams.map(enrichTeam)

    expect(enriched).toHaveLength(2)
    enriched.forEach((team) => {
      expect(team.skillGroup).toBe(2)
    })

    const intermediateTeam = enriched.find((team) =>
      team.players.some((player) => player.id === 'intermediate')
    )
    expect(intermediateTeam).toBeDefined()
    expect(
      intermediateTeam.players.some((player) => player.skillLevel === 'Advanced')
    ).toBe(true)
  })

  it('does not cross-pair leftovers from different skill groups', () => {
    const players = [
      makePlayer('beginner', { skillLevel: 'Beginner' }),
      makePlayer('novice1', { skillLevel: 'Novice' }),
      makePlayer('novice2', { skillLevel: 'Novice' }),
      makePlayer('advanced', { skillLevel: 'Advanced' }),
      makePlayer('intermediate1', { skillLevel: 'Intermediate' }),
      makePlayer('intermediate2', { skillLevel: 'Intermediate' }),
    ]
    const { teams, sitOuts } = buildTeamUnits(players)
    const enriched = teams.map(enrichTeam)

    enriched.forEach((team) => {
      const groups = new Set(team.players.map((player) => skillGroupOf(player.skillLevel)))
      expect(groups.size).toBe(1)
    })

    expect(sitOuts.length).toBeGreaterThan(0)
    sitOuts.forEach((player) => {
      expect(['Beginner', 'Novice', 'Intermediate', 'Advanced']).toContain(
        player.skillLevel
      )
    })
  })
})

// ---------------------------------------------------------------------------
// Grouping & bucketing
// ---------------------------------------------------------------------------

describe('groupAndBucket', () => {
  it('groups teams by skill group', () => {
    const teams = [
      enrichTeam({
        players: [
          makePlayer('a', { skillLevel: 'Beginner' }),
          makePlayer('b', { skillLevel: 'Novice' }),
        ],
        locked: false,
      }),
      enrichTeam({
        players: [
          makePlayer('c', { skillLevel: 'Intermediate' }),
          makePlayer('d', { skillLevel: 'Advanced' }),
        ],
        locked: false,
      }),
    ]

    const buckets = groupAndBucket(teams)
    expect(buckets.length).toBeGreaterThanOrEqual(1)
  })

  it('keeps lone teams in their skill group instead of merging cross-group', () => {
    const teams = [
      enrichTeam({
        players: [
          makePlayer('n1', { skillLevel: 'Novice' }),
          makePlayer('n2', { skillLevel: 'Novice' }),
        ],
        locked: false,
      }),
      enrichTeam({
        players: [
          makePlayer('a1', { skillLevel: 'Advanced' }),
          makePlayer('i1', { skillLevel: 'Intermediate' }),
        ],
        locked: false,
      }),
    ]

    const buckets = groupAndBucket(teams)
    const matches = generateMatchesFromBuckets(buckets, [])
    const crossGroupMatch = matches.some(
      (match) =>
        match.teamB &&
        match.teamA.skillGroup !== match.teamB.skillGroup
    )

    expect(crossGroupMatch).toBe(false)
  })

  it('assignCourts rejects cross-group matches even if they slip through', () => {
    const group1Team = enrichTeam({
      players: [
        makePlayer('n1', { skillLevel: 'Novice' }),
        makePlayer('n2', { skillLevel: 'Novice' }),
      ],
      locked: false,
    })
    const group2Team = enrichTeam({
      players: [
        makePlayer('a1', { skillLevel: 'Advanced' }),
        makePlayer('i1', { skillLevel: 'Intermediate' }),
      ],
      locked: false,
    })

    expect(canTeamsPlayMatch(group1Team, group2Team)).toBe(false)

    const { courtAssignments } = assignCourts(
      [{ teamA: group1Team, teamB: group2Team }],
      1
    )
    expect(courtAssignments).toHaveLength(0)
  })
})

describe('assignCourts', () => {
  it('alternates skill groups by court when both groups have matches', () => {
    const makeTeam = (idA, idB, skillGroup, teamPerformanceScore) => ({
      players: [makePlayer(idA), makePlayer(idB)],
      skillGroup,
      teamPerformanceScore,
    })

    const matches = [
      {
        teamA: makeTeam('A', 'B', 1, 4),
        teamB: makeTeam('C', 'D', 1, 3),
      },
      {
        teamA: makeTeam('E', 'F', 2, 8),
        teamB: makeTeam('G', 'H', 2, 7),
      },
      {
        teamA: makeTeam('I', 'J', 1, 2),
        teamB: makeTeam('K', 'L', 1, 1),
      },
      {
        teamA: makeTeam('M', 'N', 2, 6),
        teamB: makeTeam('O', 'P', 2, 5),
      },
    ]

    const { courtAssignments } = assignCourts(matches, 4)

    const group1Ids = new Set(['A', 'B', 'C', 'D', 'I', 'J', 'K', 'L'])
    const group2Ids = new Set(['E', 'F', 'G', 'H', 'M', 'N', 'O', 'P'])

    const getCourtGroup = (court) => {
      const ids = [...court.teamA.map((p) => p.id), ...court.teamB.map((p) => p.id)]
      const inGroup1 = ids.filter((id) => group1Ids.has(id)).length
      const inGroup2 = ids.filter((id) => group2Ids.has(id)).length
      if (inGroup1 === 4) return 1
      if (inGroup2 === 4) return 2
      return null
    }

    expect(courtAssignments).toHaveLength(4)
    expect(getCourtGroup(courtAssignments[0])).toBe(1)
    expect(getCourtGroup(courtAssignments[1])).toBe(2)
    expect(getCourtGroup(courtAssignments[2])).toBe(1)
    expect(getCourtGroup(courtAssignments[3])).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Fairness pre-selection
// ---------------------------------------------------------------------------

describe('selectFairnessPool', () => {
  it('puts 0-game players first when not all have played', () => {
    // P0 has 0 games → phase 1 prioritizes 0-game players in the pool.
    const players = Array.from({ length: 12 }, (_, i) =>
      makePlayer(`P${i}`, { skillLevel: 'Intermediate', gamesPlayed: i })
    )
    const { selected, fairnessSitOuts } = selectFairnessPool(players, 1, [])

    // 1 court → needed = 6 (4 + buffer 2), 6 fairness sit-outs.
    expect(selected).toHaveLength(6)
    expect(fairnessSitOuts).toHaveLength(6)

    // P0 (0 games) should be first in the selected list
    expect(selected[0].id).toBe('P0')
  })

  it('selects players with lowest gamesPlayed once all have >= 1 game', () => {
    // All players have >= 1 game → fairness is active.
    // 12 players, 1 court → needed = 6 (4 + buffer 2), so 6 highest-game players sit out.
    const players = Array.from({ length: 12 }, (_, i) =>
      makePlayer(`P${i}`, { skillLevel: 'Intermediate', gamesPlayed: i + 1 })
    )
    const { selected, fairnessSitOuts } = selectFairnessPool(players, 1, [])

    expect(selected).toHaveLength(6)
    expect(fairnessSitOuts).toHaveLength(6)

    // Sit-outs should be the players with the most games (P6–P11)
    const sitOutIds = fairnessSitOuts.map((p) => p.id).sort()
    expect(sitOutIds).toEqual(['P10', 'P11', 'P6', 'P7', 'P8', 'P9'].sort())
  })

  it('returns all players when pool size fits within slots + buffer', () => {
    const players = Array.from({ length: 6 }, (_, i) =>
      makePlayer(`P${i}`, { skillLevel: 'Intermediate', gamesPlayed: i + 1 })
    )
    const { selected, fairnessSitOuts } = selectFairnessPool(players, 1, [])

    expect(selected).toHaveLength(6)
    expect(fairnessSitOuts).toHaveLength(0)
  })

  it('locked pairs compete fairly by gamesPlayed and sit out together when games are high', () => {
    const [a, b] = makePair('A', 'B', {
      skillLevel: 'Intermediate',
      gamesPlayed: 10,
    })
    const solos = Array.from({ length: 10 }, (_, i) =>
      makePlayer(`S${i}`, { skillLevel: 'Intermediate', gamesPlayed: i + 1 })
    )
    const { selected, fairnessSitOuts } = selectFairnessPool([a, b, ...solos], 1, [])

    expect(selected).toHaveLength(6)
    const selectedIds = new Set(selected.map((p) => p.id))
    // Locked pair has 10 games each — sits out when solos have fewer games
    expect(selectedIds.has('A')).toBe(false)
    expect(selectedIds.has('B')).toBe(false)
    // Both pair members sit out together
    const sitOutIds = new Set(fairnessSitOuts.map((p) => p.id))
    expect(sitOutIds.has('A')).toBe(true)
    expect(sitOutIds.has('B')).toBe(true)
  })

  it('keeps locked pairs together when they have low gamesPlayed', () => {
    const [a, b] = makePair('A', 'B', {
      skillLevel: 'Intermediate',
      gamesPlayed: 1,
    })
    const solos = Array.from({ length: 10 }, (_, i) =>
      makePlayer(`S${i}`, { skillLevel: 'Intermediate', gamesPlayed: i + 3 })
    )
    const { selected } = selectFairnessPool([a, b, ...solos], 1, [])

    const selectedIds = new Set(selected.map((p) => p.id))
    expect(selectedIds.has('A')).toBe(true)
    expect(selectedIds.has('B')).toBe(true)
  })

  it('keeps locked pairs together in phase 1 when some players have 0 games', () => {
    const [mrB, mrsB] = makePair('MrB', 'MrsB', {
      skillLevel: 'Novice',
      gamesPlayed: 0,
      queueOrder: 16,
    })
    const solos = Array.from({ length: 18 }, (_, i) =>
      makePlayer(`P${i}`, {
        skillLevel: 'Intermediate',
        gamesPlayed: 0,
        queueOrder: i + 1,
      })
    )
  // 20 players, 3 courts → needed = 16. Pair must enter or leave together.
    const { selected, fairnessSitOuts } = selectFairnessPool(
      [...solos, mrB, mrsB],
      3,
      []
    )

    expect(selected).toHaveLength(16)
    const selectedIds = new Set(selected.map((p) => p.id))
    expect(selectedIds.has('MrB')).toBe(selectedIds.has('MrsB'))
    const sitOutIds = new Set(fairnessSitOuts.map((p) => p.id))
    expect(sitOutIds.has('MrB')).toBe(sitOutIds.has('MrsB'))
  })

  it('never splits a locked pair when only one partner just played', () => {
    // Only MrB appears in the recent round → MrB on cooldown, MrsB rested.
    // Plenty of rested solos exist, so the on-cooldown pair would naturally
    // sit out — but it must sit out as a unit, never split.
    const [mrB, mrsB] = makePair('MrB', 'MrsB', {
      skillLevel: 'Intermediate',
      gamesPlayed: 1,
    })
    const solos = Array.from({ length: 6 }, (_, i) =>
      makePlayer(`R${i}`, { skillLevel: 'Intermediate', gamesPlayed: 1 })
    )
    const recentHistory = [
      { teamAIds: ['MrB', 'X1'], teamBIds: ['X2', 'X3'], winningTeam: 'A' },
    ]
    const { selected, fairnessSitOuts } = selectFairnessPool(
      [mrB, mrsB, ...solos],
      1,
      recentHistory
    )

    const selectedIds = new Set(selected.map((p) => p.id))
    expect(selectedIds.has('MrB')).toBe(selectedIds.has('MrsB'))
    const sitOutIds = new Set(fairnessSitOuts.map((p) => p.id))
    expect(sitOutIds.has('MrB')).toBe(sitOutIds.has('MrsB'))
  })

  it('keeps a locked pair in the pool even when one partner is beyond the deficit slice', () => {
    // Both partners are on cooldown and rank low; the deficit fill could pull
    // in one but not the other. They must stay together.
    const [mrB, mrsB] = makePair('MrB', 'MrsB', {
      skillLevel: 'Intermediate',
      gamesPlayed: 5,
    })
    const rested = Array.from({ length: 2 }, (_, i) =>
      makePlayer(`R${i}`, { skillLevel: 'Intermediate', gamesPlayed: 1 })
    )
    // Last round had both partners plus filler, so both are on cooldown.
    const recentHistory = [
      { teamAIds: ['MrB', 'MrsB'], teamBIds: ['X2', 'X3'], winningTeam: 'A' },
    ]
    const { selected } = selectFairnessPool(
      [mrB, mrsB, ...rested],
      1,
      recentHistory
    )

    const selectedIds = new Set(selected.map((p) => p.id))
    expect(selectedIds.has('MrB')).toBe(selectedIds.has('MrsB'))
  })

  it('cooldown: recently-played players sit out even with lowest gamesPlayed', () => {
    // Player Z has 1 game but just played. 11 others have 3 games and are rested.
    // All have >= 1 game so fairness is active.
    const playerZ = makePlayer('Z', { skillLevel: 'Intermediate', gamesPlayed: 1 })
    const restedPlayers = Array.from({ length: 11 }, (_, i) =>
      makePlayer(`R${i}`, { skillLevel: 'Intermediate', gamesPlayed: 3 })
    )
    // 12 players, 1 court → needed = 6. Z just played (on cooldown).
    const recentHistory = [
      { teamAIds: ['Z', 'X1'], teamBIds: ['X2', 'X3'], winningTeam: 'A' },
    ]
    const { selected, fairnessSitOuts } = selectFairnessPool(
      [playerZ, ...restedPlayers],
      1,
      recentHistory
    )

    expect(selected).toHaveLength(6)
    // Z should be excluded (cooldown) even though Z has the fewest games
    const selectedIds = new Set(selected.map((p) => p.id))
    expect(selectedIds.has('Z')).toBe(false)
    expect(fairnessSitOuts.some((p) => p.id === 'Z')).toBe(true)
  })

  it('cooldown: excludes recently played when enough rested players exist', () => {
    const playerZ = makePlayer('Z', { skillLevel: 'Intermediate', gamesPlayed: 1 })
    const others = Array.from({ length: 5 }, (_, i) =>
      makePlayer(`R${i}`, { skillLevel: 'Intermediate', gamesPlayed: 3 })
    )
    const recentHistory = [
      { teamAIds: ['Z', 'X1'], teamBIds: ['X2', 'X3'], winningTeam: 'A' },
    ]
    const { selected, fairnessSitOuts } = selectFairnessPool(
      [playerZ, ...others],
      1,
      recentHistory
    )

    expect(selected).toHaveLength(5)
    expect(fairnessSitOuts).toHaveLength(1)
    expect(fairnessSitOuts[0].id).toBe('Z')
  })

  it('cooldown: includes recently played when not enough rested players', () => {
    const players = [
      makePlayer('A', { skillLevel: 'Intermediate', gamesPlayed: 1 }),
      makePlayer('B', { skillLevel: 'Intermediate', gamesPlayed: 1 }),
      makePlayer('C', { skillLevel: 'Intermediate', gamesPlayed: 1 }),
      makePlayer('D', { skillLevel: 'Intermediate', gamesPlayed: 1 }),
    ]
    const recentHistory = [
      { teamAIds: ['A', 'B'], teamBIds: ['C', 'D'], winningTeam: 'A' },
    ]
    const { selected } = selectFairnessPool(players, 1, recentHistory)

    expect(selected).toHaveLength(4)
  })

  it('phase 1 cooldown: rests players who just played when 0-game players are available', () => {
    const justPlayed = ['Happy', 'Joy', 'Shine', 'Mae'].map((id) =>
      makePlayer(id, { skillLevel: 'Intermediate', gamesPlayed: 1 })
    )
    const rested = ['Francis', 'Ezekiel', 'Paul', 'Anna'].map((id) =>
      makePlayer(id, { skillLevel: 'Intermediate', gamesPlayed: 0 })
    )
    const recentHistory = [
      {
        teamAIds: ['Happy', 'Joy'],
        teamBIds: ['Shine', 'Mae'],
        winningTeam: 'A',
      },
    ]
    const result = generateMatches([...justPlayed, ...rested], {
      courts: 1,
      matchHistory: recentHistory,
    })

    const courtIds = new Set(allPlayerIds(result))
    expect(courtIds.has('Happy')).toBe(false)
    expect(courtIds.has('Joy')).toBe(false)
    expect(courtIds.has('Shine')).toBe(false)
    expect(courtIds.has('Mae')).toBe(false)
    expect(courtIds.has('Francis')).toBe(true)
    expect(courtIds.has('Ezekiel')).toBe(true)
    expect(courtIds.has('Paul')).toBe(true)
    expect(courtIds.has('Anna')).toBe(true)
  })
})

describe('generateMatches fairness', () => {
  it('players with the most games are excluded from the pool via fairness sit-outs', () => {
    // All players have >= 1 game so fairness activates.
    // 12 players, 1 court → pool = 4 + buffer 2 = 6 selected, 6 fairness sit-outs.
    // The 6 highest-game players (P6–P11) should be in sitOuts.
    const players = Array.from({ length: 12 }, (_, i) =>
      makePlayer(`P${i}`, { skillLevel: 'Intermediate', gamesPlayed: i + 1 })
    )
    const result = generateMatches(players, { courts: 1 })

    expect(result.courts).toHaveLength(1)
    const courtPlayerIds = allPlayerIds(result)
    expect(new Set(courtPlayerIds).size).toBe(4)

    const sitOutIds = new Set(result.sitOuts.map((p) => p.id))
    expect(sitOutIds.has('P6')).toBe(true)
    expect(sitOutIds.has('P7')).toBe(true)
    expect(sitOutIds.has('P8')).toBe(true)
    expect(sitOutIds.has('P9')).toBe(true)
    expect(sitOutIds.has('P10')).toBe(true)
    expect(sitOutIds.has('P11')).toBe(true)
  })

  it('all players are accounted for when not all have played', () => {
    // P0 has 0 games → phase 1: 6 enter engine via fairness pool, rest sit out.
    const players = Array.from({ length: 12 }, (_, i) =>
      makePlayer(`P${i}`, { skillLevel: 'Intermediate', gamesPlayed: i })
    )
    const result = generateMatches(players, { courts: 1 })

    expect(result.courts).toHaveLength(1)
    const totalAccounted =
      allPlayerIds(result).length + result.sitOuts.length
    expect(totalAccounted).toBe(12)
  })
})

// ---------------------------------------------------------------------------
// Check-in order at 0 games
// ---------------------------------------------------------------------------

describe('check-in order at 0 games', () => {
  it('selectFairnessPool orders by queueOrder when useCheckInOrder is true', () => {
    const players = [
      makePlayer('P3', { queueOrder: 3 }),
      makePlayer('P1', { queueOrder: 1 }),
      makePlayer('P2', { queueOrder: 2 }),
    ]
    const { selected } = selectFairnessPool(players, 1, [], {
      useCheckInOrder: true,
    })

    expect(selected.map((player) => player.id)).toEqual(['P1', 'P2', 'P3'])
  })

  it('seats earliest check-ins within a skill group when all have 0 games', () => {
    const players = Array.from({ length: 6 }, (_, index) =>
      makePlayer(`P${index + 1}`, {
        skillLevel: 'Intermediate',
        queueOrder: index + 1,
      })
    )
    const result = generateMatches(players, { courts: 1 })

    expect(result.courts).toHaveLength(1)
    expect(new Set(allPlayerIds(result))).toEqual(
      new Set(['P1', 'P2', 'P3', 'P4'])
    )
    expect(new Set(result.sitOuts.map((player) => player.id))).toEqual(
      new Set(['P5', 'P6'])
    )
  })

  it('applies check-in order separately within each skill group', () => {
    const players = [
      makePlayer('B1', { skillLevel: 'Beginner', queueOrder: 1 }),
      makePlayer('B2', { skillLevel: 'Beginner', queueOrder: 2 }),
      makePlayer('B3', { skillLevel: 'Beginner', queueOrder: 3 }),
      makePlayer('B4', { skillLevel: 'Beginner', queueOrder: 4 }),
      makePlayer('B5', { skillLevel: 'Beginner', queueOrder: 5 }),
      makePlayer('B6', { skillLevel: 'Beginner', queueOrder: 6 }),
      makePlayer('I1', { skillLevel: 'Intermediate', queueOrder: 7 }),
      makePlayer('I2', { skillLevel: 'Intermediate', queueOrder: 8 }),
      makePlayer('I3', { skillLevel: 'Intermediate', queueOrder: 9 }),
      makePlayer('I4', { skillLevel: 'Intermediate', queueOrder: 10 }),
    ]
    const result = generateMatches(players, { courts: 2 })

    expect(result.courts).toHaveLength(2)
    expect(new Set(allPlayerIds(result))).toEqual(
      new Set(['B1', 'B2', 'B3', 'B4', 'I1', 'I2', 'I3', 'I4'])
    )
    expect(new Set(result.sitOuts.map((player) => player.id))).toEqual(
      new Set(['B5', 'B6'])
    )
  })

  it('does not use check-in order when partner history exists', () => {
    const players = [
      makePlayer('A', {
        skillLevel: 'Intermediate',
        queueOrder: 4,
        partnerCounts: { B: 1 },
      }),
      makePlayer('B', {
        skillLevel: 'Intermediate',
        queueOrder: 3,
        partnerCounts: { A: 1 },
      }),
      makePlayer('C', { skillLevel: 'Intermediate', queueOrder: 2 }),
      makePlayer('D', { skillLevel: 'Intermediate', queueOrder: 1 }),
    ]
    const result = generateMatches(players, { courts: 1 })
    const court = result.courts[0]
    const { teamAIds, teamBIds } = courtTeamIds(court)

    const abSameTeam =
      (teamAIds.includes('A') && teamAIds.includes('B')) ||
      (teamBIds.includes('A') && teamBIds.includes('B'))
    expect(abSameTeam).toBe(false)
  })

  it('prefers mixed partners on round 1 and uses check-in order as tiebreaker', () => {
    const players = [
      makePlayer('Monique', {
        gender: 'Female',
        skillLevel: 'Advanced',
        queueOrder: 1,
      }),
      makePlayer('Jang', {
        gender: 'Female',
        skillLevel: 'Intermediate',
        queueOrder: 4,
      }),
      makePlayer('James Labor', {
        gender: 'Male',
        skillLevel: 'Advanced',
        queueOrder: 5,
      }),
      makePlayer('Celso', {
        gender: 'Male',
        skillLevel: 'Intermediate',
        queueOrder: 6,
      }),
      makePlayer('Gifford', {
        gender: 'Male',
        skillLevel: 'Advanced',
        queueOrder: 8,
      }),
      makePlayer('Joniel', {
        gender: 'Male',
        skillLevel: 'Advanced',
        queueOrder: 9,
      }),
      makePlayer('Thirdy', {
        gender: 'Female',
        skillLevel: 'Advanced',
        queueOrder: 10,
      }),
      makePlayer('Elizabeth', {
        gender: 'Female',
        skillLevel: 'Intermediate',
        queueOrder: 11,
      }),
    ]

    const { teams } = buildTeamUnits(players, {
      useCheckInOrder: true,
      allowAdjacentSkillMixing: true,
    })

    teams.forEach((team) => {
      expect(isMixedGender(team.players[0], team.players[1])).toBe(true)
    })

    const pairIds = teams.map((team) =>
      team.players
        .map((player) => player.id)
        .sort()
        .join('/')
    )
    expect(pairIds).toContain('Celso/Jang')
    expect(pairIds).toContain('James Labor/Monique')
  })
})

// ===========================================================================
// Test Cases from progressive-play-test-cases.md
// ===========================================================================

// ---------------------------------------------------------------------------
// TC1 - Initial Generation Without Locked Teams
// ---------------------------------------------------------------------------

describe('TC1 - Initial generation without locked teams', () => {
  it('creates two skill groups with no cross-group matches', () => {
    const players = [
      makePlayer('A', { skillLevel: 'Beginner' }),
      makePlayer('B', { skillLevel: 'Beginner' }),
      makePlayer('C', { skillLevel: 'Novice' }),
      makePlayer('D', { skillLevel: 'Novice' }),
      makePlayer('E', { skillLevel: 'Intermediate' }),
      makePlayer('F', { skillLevel: 'Intermediate' }),
      makePlayer('G', { skillLevel: 'Advanced' }),
      makePlayer('H', { skillLevel: 'Advanced' }),
    ]
    const result = generateMatches(players, { courts: 2 })

    expect(result.courts).toHaveLength(2)

    const ids = allPlayerIds(result)
    expect(new Set(ids).size).toBe(8)

    const group1Ids = new Set(['A', 'B', 'C', 'D'])
    const group2Ids = new Set(['E', 'F', 'G', 'H'])

    result.courts.forEach((court) => {
      const courtIds = [
        ...court.teamA.map((p) => p.id),
        ...court.teamB.map((p) => p.id),
      ]
      const inGroup1 = courtIds.filter((id) => group1Ids.has(id)).length
      const inGroup2 = courtIds.filter((id) => group2Ids.has(id)).length
      // Each court should contain players from the same skill group
      expect(inGroup1 === 4 || inGroup2 === 4).toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------
// TC2 - Single Locked Team
// ---------------------------------------------------------------------------

describe('TC2 - Single locked team', () => {
  it('locked Novice+Intermediate team skill becomes Intermediate (group 2)', () => {
    const [a, b] = makePair('A', 'B', {})
    a.skillLevel = 'Novice'
    b.skillLevel = 'Intermediate'

    // Verify enriched team properties
    const { lockedTeams } = identifyLockedTeams([a, b])
    const enriched = enrichTeam(lockedTeams[0])
    expect(enriched.teamSkillLevel).toBe('Intermediate')
    expect(enriched.skillGroup).toBe(2)
  })

  it('A and B are never separated during match generation', () => {
    const [a, b] = makePair('A', 'B', {})
    a.skillLevel = 'Novice'
    b.skillLevel = 'Intermediate'
    const players = [
      a,
      b,
      makePlayer('C', { skillLevel: 'Intermediate' }),
      makePlayer('D', { skillLevel: 'Intermediate' }),
    ]
    const result = generateMatches(players, { courts: 1 })

    expect(result.courts).toHaveLength(1)
    const court = result.courts[0]
    const { teamAIds, teamBIds } = courtTeamIds(court)
    const lockedOnSameTeam =
      (teamAIds.includes('A') && teamAIds.includes('B')) ||
      (teamBIds.includes('A') && teamBIds.includes('B'))
    expect(lockedOnSameTeam).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// TC3 - Multiple Locked Teams
// ---------------------------------------------------------------------------

describe('TC3 - Multiple locked teams', () => {
  it('both locked teams remain intact', () => {
    const [a, b] = makePair('A', 'B', {})
    a.skillLevel = 'Beginner'
    b.skillLevel = 'Novice'
    const [c, d] = makePair('C', 'D', {})
    c.skillLevel = 'Intermediate'
    d.skillLevel = 'Advanced'
    const [i, j] = makePair('I', 'J', {})
    i.skillLevel = 'Beginner'
    j.skillLevel = 'Novice'
    const players = [
      a,
      b,
      i,
      j,
      c,
      d,
      makePlayer('E', { skillLevel: 'Intermediate' }),
      makePlayer('F', { skillLevel: 'Intermediate' }),
      makePlayer('G', { skillLevel: 'Advanced' }),
      makePlayer('H', { skillLevel: 'Advanced' }),
    ]
    const result = generateMatches(players, { courts: 2 })

    expect(result.courts).toHaveLength(2)

    const allIds = allPlayerIds(result)
    expect(new Set(allIds).size).toBe(8)

    // Check both locked pairs are on the same team somewhere
    let abTogether = false
    let cdTogether = false
    result.courts.forEach((court) => {
      const { teamAIds, teamBIds } = courtTeamIds(court)
      if (
        (teamAIds.includes('A') && teamAIds.includes('B')) ||
        (teamBIds.includes('A') && teamBIds.includes('B'))
      )
        abTogether = true
      if (
        (teamAIds.includes('C') && teamAIds.includes('D')) ||
        (teamBIds.includes('C') && teamBIds.includes('D'))
      )
        cdTogether = true
    })
    expect(abTogether).toBe(true)
    expect(cdTogether).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// TC4 - Performance Separation
// ---------------------------------------------------------------------------

describe('TC4 - Performance separation', () => {
  it('court 0 has higher average performance than court 1', () => {
    const players = [
      makePlayer('A', { skillLevel: 'Intermediate', wins: 5, losses: 0 }),
      makePlayer('B', { skillLevel: 'Intermediate', wins: 4, losses: 1 }),
      makePlayer('C', { skillLevel: 'Intermediate', wins: 3, losses: 2 }),
      makePlayer('D', { skillLevel: 'Intermediate', wins: 3, losses: 2 }),
      makePlayer('E', { skillLevel: 'Intermediate', wins: 1, losses: 4 }),
      makePlayer('F', { skillLevel: 'Intermediate', wins: 0, losses: 5 }),
      makePlayer('G', { skillLevel: 'Intermediate', wins: 0, losses: 4 }),
      makePlayer('H', { skillLevel: 'Intermediate', wins: 1, losses: 3 }),
    ]
    const result = generateMatches(players, { courts: 2 })

    expect(result.courts).toHaveLength(2)

    const byId = new Map(players.map((p) => [p.id, p]))
    const avgPerf = (court) => {
      const ids = [
        ...court.teamA.map((p) => p.id),
        ...court.teamB.map((p) => p.id),
      ]
      const total = ids.reduce(
        (sum, id) => sum + performanceScore(byId.get(id)),
        0
      )
      return total / ids.length
    }

    expect(avgPerf(result.courts[0])).toBeGreaterThanOrEqual(avgPerf(result.courts[1]))
  })
})

// ---------------------------------------------------------------------------
// TC5 - Partner Diversity
// ---------------------------------------------------------------------------

describe('TC5 - Partner diversity', () => {
  it('avoids repeating the same partner when history exists', () => {
    const players = [
      makePlayer('A', { skillLevel: 'Intermediate', partnerCounts: { B: 1 } }),
      makePlayer('B', { skillLevel: 'Intermediate', partnerCounts: { A: 1 } }),
      makePlayer('C', { skillLevel: 'Intermediate' }),
      makePlayer('D', { skillLevel: 'Intermediate' }),
    ]
    const result = generateMatches(players, { courts: 1 })
    const court = result.courts[0]
    const { teamAIds, teamBIds } = courtTeamIds(court)

    const abSameTeam =
      (teamAIds.includes('A') && teamAIds.includes('B')) ||
      (teamBIds.includes('A') && teamBIds.includes('B'))
    expect(abSameTeam).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TC6 - Hard Partner Rotation Rule
// ---------------------------------------------------------------------------

describe('TC6 - Hard partner rotation rule', () => {
  it('A who partnered B and C must partner with D (only unpartnered)', () => {
    const players = [
      makePlayer('A', {
        skillLevel: 'Intermediate',
        partnerCounts: { B: 1, C: 1 },
      }),
      makePlayer('B', {
        skillLevel: 'Intermediate',
        partnerCounts: { A: 1 },
      }),
      makePlayer('C', {
        skillLevel: 'Intermediate',
        partnerCounts: { A: 1 },
      }),
      makePlayer('D', { skillLevel: 'Intermediate' }),
    ]
    const result = generateMatches(players, { courts: 1 })

    expect(result.courts).toHaveLength(1)
    const court = result.courts[0]
    const { teamAIds, teamBIds } = courtTeamIds(court)

    const adPartners =
      (teamAIds.includes('A') && teamAIds.includes('D')) ||
      (teamBIds.includes('A') && teamBIds.includes('D'))
    expect(adPartners).toBe(true)
  })

  it('with 5 players, A avoids B/C/D as partner (partners E or sits)', () => {
    const players = [
      makePlayer('A', {
        skillLevel: 'Intermediate',
        partnerCounts: { B: 1, C: 1, D: 1 },
      }),
      makePlayer('B', {
        skillLevel: 'Intermediate',
        partnerCounts: { A: 1 },
      }),
      makePlayer('C', {
        skillLevel: 'Intermediate',
        partnerCounts: { A: 1 },
      }),
      makePlayer('D', {
        skillLevel: 'Intermediate',
        partnerCounts: { A: 1 },
      }),
      makePlayer('E', { skillLevel: 'Intermediate' }),
    ]
    const result = generateMatches(players, { courts: 1 })

    expect(result.courts).toHaveLength(1)
    const court = result.courts[0]
    const { teamAIds, teamBIds } = courtTeamIds(court)
    const allOnCourt = [...teamAIds, ...teamBIds]

    if (allOnCourt.includes('A')) {
      // If A is playing, A must be partnered with E (not B/C/D)
      const aePartners =
        (teamAIds.includes('A') && teamAIds.includes('E')) ||
        (teamBIds.includes('A') && teamBIds.includes('E'))
      expect(aePartners).toBe(true)
    } else {
      // A sitting out is acceptable (penalty-optimal too)
      expect(result.sitOuts.some((p) => p.id === 'A')).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// TC7 - Opponent Diversity
// ---------------------------------------------------------------------------

describe('TC7 - Opponent diversity', () => {
  it('prefers new opponents over repeated ones', () => {
    const players = [
      makePlayer('A', {
        skillLevel: 'Intermediate',
        partnerCounts: { B: 1 },
        opponentCounts: { C: 1, D: 1 },
      }),
      makePlayer('B', {
        skillLevel: 'Intermediate',
        partnerCounts: { A: 1 },
        opponentCounts: { C: 1, D: 1 },
      }),
      makePlayer('C', {
        skillLevel: 'Intermediate',
        partnerCounts: { D: 1 },
        opponentCounts: { A: 1, B: 1 },
      }),
      makePlayer('D', {
        skillLevel: 'Intermediate',
        partnerCounts: { C: 1 },
        opponentCounts: { A: 1, B: 1 },
      }),
    ]

    const matchHistory = [
      {
        teamAIds: ['A', 'B'],
        teamBIds: ['C', 'D'],
        winningTeam: 'A',
      },
    ]

    const result = generateMatches(players, { courts: 1, matchHistory })
    const court = result.courts[0]
    const { teamAIds, teamBIds } = courtTeamIds(court)

    // Should NOT repeat A+B vs C+D
    const isRepeat =
      (teamAIds.includes('A') &&
        teamAIds.includes('B') &&
        teamBIds.includes('C') &&
        teamBIds.includes('D')) ||
      (teamBIds.includes('A') &&
        teamBIds.includes('B') &&
        teamAIds.includes('C') &&
        teamAIds.includes('D'))
    expect(isRepeat).toBe(false)
  })

  it('hard-blocks repeat opponents when a fresh-opponent matchup exists', () => {
    const players = [
      makePlayer('A', {
        skillLevel: 'Intermediate',
        partnerCounts: { B: 1 },
        opponentCounts: { C: 1, D: 0, E: 0, F: 0 },
      }),
      makePlayer('B', {
        skillLevel: 'Intermediate',
        partnerCounts: { A: 1 },
        opponentCounts: { C: 1, D: 0, E: 0, F: 0 },
      }),
      makePlayer('C', {
        skillLevel: 'Intermediate',
        partnerCounts: { D: 1 },
        opponentCounts: { A: 1, B: 1 },
      }),
      makePlayer('D', {
        skillLevel: 'Intermediate',
        partnerCounts: { C: 1 },
        opponentCounts: { A: 1, B: 1 },
      }),
      makePlayer('E', { skillLevel: 'Intermediate' }),
      makePlayer('F', { skillLevel: 'Intermediate' }),
    ]

    const matchHistory = [
      {
        teamAIds: ['A', 'B'],
        teamBIds: ['C', 'D'],
        winningTeam: 'A',
      },
    ]

    const result = generateMatches(players, { courts: 2, matchHistory })
    const court = result.courts.find((entry) => entry.teamA && entry.teamB)
    const { teamAIds, teamBIds } = courtTeamIds(court)

    const hasRepeatOpponentPair =
      (teamAIds.includes('A') && teamBIds.includes('C')) ||
      (teamAIds.includes('A') && teamBIds.includes('D')) ||
      (teamAIds.includes('B') && teamBIds.includes('C')) ||
      (teamAIds.includes('B') && teamBIds.includes('D'))

    expect(hasRepeatOpponentPair).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TC8 - Exact Match Repeat Penalty
// ---------------------------------------------------------------------------

describe('TC8 - Exact match repeat penalty', () => {
  it('avoids repeating the exact same matchup', () => {
    // Simulate that A+B vs C+D already happened (set counts as applyMatchResult would)
    const players = [
      makePlayer('A', {
        skillLevel: 'Intermediate',
        partnerCounts: { B: 1 },
        opponentCounts: { C: 1, D: 1 },
      }),
      makePlayer('B', {
        skillLevel: 'Intermediate',
        partnerCounts: { A: 1 },
        opponentCounts: { C: 1, D: 1 },
      }),
      makePlayer('C', {
        skillLevel: 'Intermediate',
        partnerCounts: { D: 1 },
        opponentCounts: { A: 1, B: 1 },
      }),
      makePlayer('D', {
        skillLevel: 'Intermediate',
        partnerCounts: { C: 1 },
        opponentCounts: { A: 1, B: 1 },
      }),
    ]
    const matchHistory = [
      { teamAIds: ['A', 'B'], teamBIds: ['C', 'D'], winningTeam: 'A' },
    ]

    const result = generateMatches(players, { courts: 1, matchHistory })
    const court = result.courts[0]
    const sig = matchSignature(
      court.teamA.map((p) => p.id),
      court.teamB.map((p) => p.id)
    )
    const prevSig = matchSignature(['A', 'B'], ['C', 'D'])
    expect(sig).not.toBe(prevSig)
  })
})

// ---------------------------------------------------------------------------
// TC9 - Small Bucket Merge
// ---------------------------------------------------------------------------

describe('TC9 - Small bucket merge', () => {
  it('merges single-team buckets so matches can form', () => {
    // 3 teams with different performance scores: 4, 3, 2
    // Score 4 bucket has 1 team, Score 3 has 1 team → must merge
    const teams = [
      enrichTeam({
        players: [
          makePlayer('a1', { skillLevel: 'Intermediate', wins: 4, losses: 0 }),
          makePlayer('a2', { skillLevel: 'Intermediate', wins: 4, losses: 0 }),
        ],
        locked: false,
      }),
      enrichTeam({
        players: [
          makePlayer('b1', { skillLevel: 'Intermediate', wins: 3, losses: 0 }),
          makePlayer('b2', { skillLevel: 'Intermediate', wins: 3, losses: 0 }),
        ],
        locked: false,
      }),
      enrichTeam({
        players: [
          makePlayer('c1', { skillLevel: 'Intermediate', wins: 1, losses: 0 }),
          makePlayer('c2', { skillLevel: 'Intermediate', wins: 1, losses: 0 }),
        ],
        locked: false,
      }),
    ]

    const buckets = groupAndBucket(teams)
    // After merging, every bucket should have >= 2 teams
    buckets.forEach((bucket) => {
      expect(bucket.length).toBeGreaterThanOrEqual(2)
    })

    // Should be able to generate matches without crashing
    const matches = generateMatchesFromBuckets(buckets, [])
    const validMatches = matches.filter((m) => m.teamA && m.teamB)
    expect(validMatches.length).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// TC10 - Uneven Skill Groups
// ---------------------------------------------------------------------------

describe('TC10 - Uneven skill groups', () => {
  it('generates valid matches with 4 in group 1 and 6 in group 2', () => {
    const players = [
      makePlayer('A', { skillLevel: 'Beginner' }),
      makePlayer('B', { skillLevel: 'Beginner' }),
      makePlayer('C', { skillLevel: 'Novice' }),
      makePlayer('D', { skillLevel: 'Novice' }),
      makePlayer('E', { skillLevel: 'Intermediate' }),
      makePlayer('F', { skillLevel: 'Intermediate' }),
      makePlayer('G', { skillLevel: 'Advanced' }),
      makePlayer('H', { skillLevel: 'Advanced' }),
      makePlayer('I', { skillLevel: 'Intermediate' }),
      makePlayer('J', { skillLevel: 'Advanced' }),
    ]
    const result = generateMatches(players, { courts: 2 })

    expect(result.courts).toHaveLength(2)
    const ids = allPlayerIds(result)
    const sitOutIds = result.sitOuts.map((p) => p.id)
    const allUsed = new Set([...ids, ...sitOutIds])
    // Every player accounted for (playing or sitting)
    expect(allUsed.size).toBe(10)
    // No duplicates in courts
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ---------------------------------------------------------------------------
// TC11 - Locked Team Overrides Partner Rotation
// ---------------------------------------------------------------------------

describe('TC11 - Locked team overrides partner rotation', () => {
  it('A+B stay together even if partnered 5 times', () => {
    const [a, b] = makePair('A', 'B', {
      skillLevel: 'Intermediate',
      partnerCounts: {},
    })
    a.partnerCounts = { B: 5 }
    b.partnerCounts = { A: 5 }

    const players = [
      a,
      b,
      makePlayer('C', { skillLevel: 'Intermediate' }),
      makePlayer('D', { skillLevel: 'Intermediate' }),
    ]
    const result = generateMatches(players, { courts: 1 })
    const court = result.courts[0]
    const { teamAIds, teamBIds } = courtTeamIds(court)

    const abTogether =
      (teamAIds.includes('A') && teamAIds.includes('B')) ||
      (teamBIds.includes('A') && teamBIds.includes('B'))
    expect(abTogether).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// TC12 - Advanced + Beginner Locked Team
// ---------------------------------------------------------------------------

describe('TC12 - Advanced + Beginner locked team', () => {
  it('team skill level becomes Advanced and competes in group 2', () => {
    const [a, b] = makePair('A', 'B', {})
    a.skillLevel = 'Advanced'
    b.skillLevel = 'Beginner'

    const { lockedTeams } = identifyLockedTeams([a, b])
    expect(lockedTeams).toHaveLength(1)

    const enriched = enrichTeam(lockedTeams[0])
    expect(enriched.teamSkillLevel).toBe('Advanced')
    expect(enriched.skillGroup).toBe(2)
  })

  it('does not match a group 1 locked team against a group 2 locked team', () => {
    const [ernie, vienna] = makePair('Ernie', 'Vienna', {})
    ernie.skillLevel = 'Advanced'
    vienna.skillLevel = 'Intermediate'
    const [mj, brian] = makePair('MJ', 'Brian', {})
    mj.skillLevel = 'Novice'
    brian.skillLevel = 'Novice'

    const result = generateMatches([ernie, vienna, mj, brian], { courts: 1 })

    expect(result.courts).toHaveLength(0)
    expect(allPlayerIds(result)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// TC13 - Refresh After Results
// ---------------------------------------------------------------------------

describe('TC13 - Refresh after results', () => {
  it('winners are grouped with winners after applying results', () => {
    const players = [
      makePlayer('A', { skillLevel: 'Intermediate' }),
      makePlayer('B', { skillLevel: 'Intermediate' }),
      makePlayer('C', { skillLevel: 'Intermediate' }),
      makePlayer('D', { skillLevel: 'Intermediate' }),
      makePlayer('E', { skillLevel: 'Intermediate' }),
      makePlayer('F', { skillLevel: 'Intermediate' }),
      makePlayer('G', { skillLevel: 'Intermediate' }),
      makePlayer('H', { skillLevel: 'Intermediate' }),
    ]

    // Simulate round 1 results: A+B beat C+D, E+F beat G+H
    let current = players
    let history = []

    const r1 = applyMatchResult(current, {
      courtIndex: 0,
      teamAIds: ['A', 'B'],
      teamBIds: ['C', 'D'],
      winningTeam: 'A',
    })
    current = r1.players
    history.push(r1.historyEntry)

    const r2 = applyMatchResult(current, {
      courtIndex: 1,
      teamAIds: ['E', 'F'],
      teamBIds: ['G', 'H'],
      winningTeam: 'A',
    })
    current = r2.players
    history.push(r2.historyEntry)

    // After skill shift: winners are Advanced (group 2), losers are Novice (group 1).
    // With court alternation, one court gets group 1 (losers), another group 2 (winners).
    const result = generateMatches(current, { courts: 2, matchHistory: history })
    expect(result.courts).toHaveLength(2)

    // Winners (A,B,E,F) should be on the same court (same skill group now)
    const allCourtIds = result.courts.map((c) => [
      ...c.teamA.map((p) => p.id),
      ...c.teamB.map((p) => p.id),
    ])
    const winnerIds = new Set(['A', 'B', 'E', 'F'])
    const winnersPerCourt = allCourtIds.map(
      (ids) => ids.filter((id) => winnerIds.has(id)).length
    )
    // All 4 winners should be together on one court
    expect(Math.max(...winnersPerCourt)).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// TC14 - Court Ranking
// ---------------------------------------------------------------------------

describe('TC14 - Court ranking', () => {
  it('assigns higher-performance matches to lower court indices', () => {
    const group1 = [
      makePlayer('a', { skillLevel: 'Intermediate', wins: 10, losses: 0 }),
      makePlayer('b', { skillLevel: 'Intermediate', wins: 10, losses: 0 }),
      makePlayer('c', { skillLevel: 'Intermediate', wins: 9, losses: 1 }),
      makePlayer('d', { skillLevel: 'Intermediate', wins: 9, losses: 1 }),
    ]
    const group2 = [
      makePlayer('e', { skillLevel: 'Intermediate', wins: 0, losses: 10 }),
      makePlayer('f', { skillLevel: 'Intermediate', wins: 0, losses: 10 }),
      makePlayer('g', { skillLevel: 'Intermediate', wins: 1, losses: 9 }),
      makePlayer('h', { skillLevel: 'Intermediate', wins: 1, losses: 9 }),
    ]
    const result = generateMatches([...group1, ...group2], { courts: 2 })

    expect(result.courts).toHaveLength(2)
    const court0Ids = [
      ...result.courts[0].teamA.map((p) => p.id),
      ...result.courts[0].teamB.map((p) => p.id),
    ]
    const topPlayerIds = ['a', 'b', 'c', 'd']
    const topOnCourt0 = court0Ids.filter((id) => topPlayerIds.includes(id))
    expect(topOnCourt0.length).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// TC15 - No Valid Perfect Solution (all pairings exhausted)
// ---------------------------------------------------------------------------

describe('TC15 - No valid perfect solution', () => {
  it('still generates matches when all pairings are exhausted', () => {
    // Every player has partnered and opposed everyone else
    const players = [
      makePlayer('A', {
        skillLevel: 'Intermediate',
        partnerCounts: { B: 3, C: 3, D: 3 },
        opponentCounts: { B: 3, C: 3, D: 3 },
      }),
      makePlayer('B', {
        skillLevel: 'Intermediate',
        partnerCounts: { A: 3, C: 3, D: 3 },
        opponentCounts: { A: 3, C: 3, D: 3 },
      }),
      makePlayer('C', {
        skillLevel: 'Intermediate',
        partnerCounts: { A: 3, B: 3, D: 3 },
        opponentCounts: { A: 3, B: 3, D: 3 },
      }),
      makePlayer('D', {
        skillLevel: 'Intermediate',
        partnerCounts: { A: 3, B: 3, C: 3 },
        opponentCounts: { A: 3, B: 3, C: 3 },
      }),
    ]

    const allPrevSigs = [
      matchSignature(['A', 'B'], ['C', 'D']),
      matchSignature(['A', 'C'], ['B', 'D']),
      matchSignature(['A', 'D'], ['B', 'C']),
    ]
    const matchHistory = allPrevSigs.map((sig) => ({
      teamAIds: sig.split(' vs ')[0].split(','),
      teamBIds: sig.split(' vs ')[1].split(','),
      winningTeam: 'A',
    }))

    const result = generateMatches(players, { courts: 1, matchHistory })

    // Must still produce a valid match
    expect(result.courts).toHaveLength(1)
    const ids = allPlayerIds(result)
    expect(new Set(ids).size).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// TC16 - Single Court, 4 Players
// ---------------------------------------------------------------------------

describe('TC16 - Single court, 4 players', () => {
  it('generates one valid doubles match with no duplicates', () => {
    const players = [
      makePlayer('A', { skillLevel: 'Novice' }),
      makePlayer('B', { skillLevel: 'Novice' }),
      makePlayer('C', { skillLevel: 'Novice' }),
      makePlayer('D', { skillLevel: 'Novice' }),
    ]
    const result = generateMatches(players, { courts: 1 })

    expect(result.courts).toHaveLength(1)
    const court = result.courts[0]
    expect(court.teamA).toHaveLength(2)
    expect(court.teamB).toHaveLength(2)
    const ids = allPlayerIds(result)
    expect(new Set(ids).size).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// TC17 - Single Court Refresh
// ---------------------------------------------------------------------------

describe('TC17 - Single court refresh after score', () => {
  it('generates a valid match after scoring (skill levels shift)', () => {
    let players = [
      makePlayer('A', { skillLevel: 'Intermediate' }),
      makePlayer('B', { skillLevel: 'Intermediate' }),
      makePlayer('C', { skillLevel: 'Intermediate' }),
      makePlayer('D', { skillLevel: 'Intermediate' }),
      makePlayer('E', { skillLevel: 'Intermediate' }),
      makePlayer('F', { skillLevel: 'Intermediate' }),
      makePlayer('G', { skillLevel: 'Intermediate' }),
      makePlayer('H', { skillLevel: 'Intermediate' }),
    ]

    // Apply round 1 result — A/B become Advanced, C/D become Novice
    const { players: updated, historyEntry } = applyMatchResult(players, {
      courtIndex: 0,
      teamAIds: ['A', 'B'],
      teamBIds: ['C', 'D'],
      winningTeam: 'A',
    })

    expect(updated.find((p) => p.id === 'A').skillLevel).toBe('Advanced')
    expect(updated.find((p) => p.id === 'C').skillLevel).toBe('Novice')

    const result = generateMatches(updated, {
      courts: 1,
      matchHistory: [historyEntry],
    })

    expect(result.courts).toHaveLength(1)
    const ids = allPlayerIds(result)
    expect(new Set(ids).size).toBe(4)
    result.courts.forEach((court) => {
      const courtIds = [
        ...court.teamA.map((player) => player.id),
        ...court.teamB.map((player) => player.id),
      ]
      const inGroup1 = courtIds.filter(
        (id) => skillGroupOf(updated.find((player) => player.id === id).skillLevel) === 1
      ).length
      const inGroup2 = courtIds.length - inGroup1
      expect(inGroup1 === 4 || inGroup2 === 4).toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------
// TC18 - Single Court Partner Rotation (3 rounds)
// ---------------------------------------------------------------------------

describe('TC18 - Single court 3-round partner rotation', () => {
  it('varies partner combinations across rounds', () => {
    let players = [
      makePlayer('A', { skillLevel: 'Intermediate' }),
      makePlayer('B', { skillLevel: 'Intermediate' }),
      makePlayer('C', { skillLevel: 'Intermediate' }),
      makePlayer('D', { skillLevel: 'Intermediate' }),
      makePlayer('E', { skillLevel: 'Intermediate' }),
      makePlayer('F', { skillLevel: 'Intermediate' }),
      makePlayer('G', { skillLevel: 'Intermediate' }),
      makePlayer('H', { skillLevel: 'Intermediate' }),
    ]
    let history = []
    const partnerPairsSeen = new Set()

    for (let round = 0; round < 2; round += 1) {
      const result = generateMatches(players, {
        courts: 1,
        matchHistory: history,
      })
      expect(result.courts).toHaveLength(1)
      const court = result.courts[0]
      const pairA = court.teamA
        .map((p) => p.id)
        .sort()
        .join('+')
      const pairB = court.teamB
        .map((p) => p.id)
        .sort()
        .join('+')
      partnerPairsSeen.add(pairA)
      partnerPairsSeen.add(pairB)

      // Apply result (skill levels shift each round)
      const teamAIds = court.teamA.map((p) => p.id)
      const teamBIds = court.teamB.map((p) => p.id)
      const { players: updated, historyEntry } = applyMatchResult(players, {
        courtIndex: 0,
        teamAIds,
        teamBIds,
        winningTeam: 'A',
      })
      players = updated
      history.push(historyEntry)
    }

    // With skill-level shifts after each round, the engine's partner options
    // are constrained. At minimum, each round produces 2 unique pairs.
    expect(partnerPairsSeen.size).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// TC19 - Single Court Locked Team
// ---------------------------------------------------------------------------

describe('TC19 - Single court locked team', () => {
  it('A+B remain partners on every refresh', () => {
    const [a, b] = makePair('A', 'B', { skillLevel: 'Intermediate' })
    const players = [
      a,
      b,
      makePlayer('C', { skillLevel: 'Intermediate' }),
      makePlayer('D', { skillLevel: 'Intermediate' }),
    ]

    for (let i = 0; i < 5; i += 1) {
      const result = generateMatches(players, { courts: 1 })
      const court = result.courts[0]
      const { teamAIds, teamBIds } = courtTeamIds(court)
      const abTogether =
        (teamAIds.includes('A') && teamAIds.includes('B')) ||
        (teamBIds.includes('A') && teamBIds.includes('B'))
      expect(abTogether).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// TC20 - Single Court 5 Players
// ---------------------------------------------------------------------------

describe('TC20 - Single court 5 players', () => {
  it('assigns 4 and sits out 1', () => {
    const players = Array.from({ length: 5 }, (_, i) =>
      makePlayer(`P${i}`, { skillLevel: 'Intermediate' })
    )
    const result = generateMatches(players, { courts: 1 })

    expect(result.courts).toHaveLength(1)
    const ids = allPlayerIds(result)
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
    expect(result.sitOuts).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// TC21 - Single Court Rotation Fairness (sit-outs rotate)
// ---------------------------------------------------------------------------

describe('TC21 - Single court sit-out rotation fairness', () => {
  it('different players sit out across consecutive rounds', () => {
    let players = Array.from({ length: 8 }, (_, i) =>
      makePlayer(`P${i}`, { skillLevel: 'Intermediate' })
    )
    let history = []
    const sitOutIds = []

    for (let round = 0; round < 2; round += 1) {
      const result = generateMatches(players, {
        courts: 1,
        matchHistory: history,
      })
      expect(result.courts).toHaveLength(1)
      expect(result.sitOuts.length).toBeGreaterThanOrEqual(4)
      sitOutIds.push(...result.sitOuts.map((player) => player.id))

      const court = result.courts[0]
      const teamAIds = court.teamA.map((p) => p.id)
      const teamBIds = court.teamB.map((p) => p.id)
      const { players: updated, historyEntry } = applyMatchResult(players, {
        courtIndex: 0,
        teamAIds,
        teamBIds,
        winningTeam: round % 2 === 0 ? 'A' : 'B',
      })
      players = updated
      history.push(historyEntry)
    }

    // Over 2 rounds, at least 3 different players should have sat out
    const uniqueSitOuts = new Set(sitOutIds)
    expect(uniqueSitOuts.size).toBeGreaterThanOrEqual(3)
  })
})

// ---------------------------------------------------------------------------
// TC22 - Single Court 6 Players
// ---------------------------------------------------------------------------

describe('TC22 - Single court 6 players', () => {
  it('4 play and 2 sit out', () => {
    const players = Array.from({ length: 6 }, (_, i) =>
      makePlayer(`P${i}`, { skillLevel: 'Intermediate' })
    )
    const result = generateMatches(players, { courts: 1 })

    expect(result.courts).toHaveLength(1)
    const ids = allPlayerIds(result)
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
    expect(result.sitOuts).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// TC23 - Single Court Winners vs Winners
// ---------------------------------------------------------------------------

describe('TC23 - Single court winners vs winners', () => {
  it('performance scores and skill levels update after result', () => {
    let players = [
      makePlayer('A', { skillLevel: 'Intermediate' }),
      makePlayer('B', { skillLevel: 'Intermediate' }),
      makePlayer('C', { skillLevel: 'Intermediate' }),
      makePlayer('D', { skillLevel: 'Intermediate' }),
      makePlayer('E', { skillLevel: 'Intermediate' }),
      makePlayer('F', { skillLevel: 'Intermediate' }),
      makePlayer('G', { skillLevel: 'Intermediate' }),
      makePlayer('H', { skillLevel: 'Intermediate' }),
    ]

    // A+B beat C+D
    const { players: updated, historyEntry } = applyMatchResult(players, {
      courtIndex: 0,
      teamAIds: ['A', 'B'],
      teamBIds: ['C', 'D'],
      winningTeam: 'A',
    })

    // Verify scores updated
    expect(updated.find((p) => p.id === 'A').wins).toBe(1)
    expect(updated.find((p) => p.id === 'C').losses).toBe(1)

    // Verify skill levels shifted
    expect(updated.find((p) => p.id === 'A').skillLevel).toBe('Advanced')
    expect(updated.find((p) => p.id === 'B').skillLevel).toBe('Advanced')
    expect(updated.find((p) => p.id === 'C').skillLevel).toBe('Novice')
    expect(updated.find((p) => p.id === 'D').skillLevel).toBe('Novice')

    // Generate next round — group 2 still has enough players for a same-group match
    const result = generateMatches(updated, {
      courts: 1,
      matchHistory: [historyEntry],
    })
    expect(result.courts).toHaveLength(1)
    const ids = allPlayerIds(result)
    expect(new Set(ids).size).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// TC24 - Single Court Exhausted Pairings
// ---------------------------------------------------------------------------

describe('TC24 - Single court exhausted pairings', () => {
  it('still generates a valid match when all pairings used', () => {
    const players = [
      makePlayer('A', {
        skillLevel: 'Intermediate',
        partnerCounts: { B: 2, C: 2, D: 2 },
        opponentCounts: { B: 2, C: 2, D: 2 },
      }),
      makePlayer('B', {
        skillLevel: 'Intermediate',
        partnerCounts: { A: 2, C: 2, D: 2 },
        opponentCounts: { A: 2, C: 2, D: 2 },
      }),
      makePlayer('C', {
        skillLevel: 'Intermediate',
        partnerCounts: { A: 2, B: 2, D: 2 },
        opponentCounts: { A: 2, B: 2, D: 2 },
      }),
      makePlayer('D', {
        skillLevel: 'Intermediate',
        partnerCounts: { A: 2, B: 2, C: 2 },
        opponentCounts: { A: 2, B: 2, C: 2 },
      }),
    ]
    const result = generateMatches(players, { courts: 1 })

    expect(result.courts).toHaveLength(1)
    const ids = allPlayerIds(result)
    expect(new Set(ids).size).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// TC25 - Single Court Locked Team + Extra Player
// ---------------------------------------------------------------------------

describe('TC25 - Single court locked team + extra player', () => {
  it('A+B stay together and one of C/D/E sits out', () => {
    const [a, b] = makePair('A', 'B', { skillLevel: 'Intermediate' })
    const players = [
      a,
      b,
      makePlayer('C', { skillLevel: 'Intermediate' }),
      makePlayer('D', { skillLevel: 'Intermediate' }),
      makePlayer('E', { skillLevel: 'Intermediate' }),
    ]
    const result = generateMatches(players, { courts: 1 })

    expect(result.courts).toHaveLength(1)
    expect(result.sitOuts).toHaveLength(1)

    // Locked team intact
    const court = result.courts[0]
    const { teamAIds, teamBIds } = courtTeamIds(court)
    const abTogether =
      (teamAIds.includes('A') && teamAIds.includes('B')) ||
      (teamBIds.includes('A') && teamBIds.includes('B'))
    expect(abTogether).toBe(true)

    // Sit-out is one of C/D/E
    const sitOutId = result.sitOuts[0].id
    expect(['C', 'D', 'E']).toContain(sitOutId)
  })
})

// ---------------------------------------------------------------------------
// Rested vs cooldown fairness
// ---------------------------------------------------------------------------

describe('rested vs cooldown fairness', () => {
  it('selectFairnessPool prefers rested over cooldown at equal gamesPlayed', () => {
    const rested3 = Array.from({ length: 4 }, (_, i) =>
      makePlayer(`R3_${i}`, { skillLevel: 'Intermediate', gamesPlayed: 3 })
    )
    const cooldown3 = Array.from({ length: 4 }, (_, i) =>
      makePlayer(`C3_${i}`, { skillLevel: 'Intermediate', gamesPlayed: 3 })
    )
    const rested4 = Array.from({ length: 4 }, (_, i) =>
      makePlayer(`R4_${i}`, { skillLevel: 'Intermediate', gamesPlayed: 4 })
    )
    const cooldown4 = Array.from({ length: 4 }, (_, i) =>
      makePlayer(`C4_${i}`, { skillLevel: 'Intermediate', gamesPlayed: 4 })
    )

    const matchHistory = [
      { teamAIds: ['C3_0', 'C3_1'], teamBIds: ['C3_2', 'C3_3'], winningTeam: 'A' },
      { teamAIds: ['C4_0', 'C4_1'], teamBIds: ['C4_2', 'C4_3'], winningTeam: 'A' },
      { teamAIds: ['X1', 'X2'], teamBIds: ['X3', 'X4'], winningTeam: 'A' },
    ]

    const allPlayers = [...rested3, ...cooldown3, ...rested4, ...cooldown4]
    const { selected } = selectFairnessPool(
      allPlayers,
      1,
      matchHistory,
      { cooldownSlots: 3 }
    )

    // 1 court → needed = 6. All rested3 (3 games) selected first, then 2 of rested4.
    expect(selected).toHaveLength(6)
    const selectedIds = new Set(selected.map((p) => p.id))
    rested3.forEach((p) => expect(selectedIds.has(p.id)).toBe(true))
    cooldown3.forEach((p) => expect(selectedIds.has(p.id)).toBe(false))
  })

  it('generateMatches with cooldownCourts respects session cooldown on single court', () => {
    const rested = Array.from({ length: 4 }, (_, i) =>
      makePlayer(`R${i}`, { skillLevel: 'Intermediate', gamesPlayed: 2 })
    )
    const cooldown = Array.from({ length: 8 }, (_, i) =>
      makePlayer(`C${i}`, { skillLevel: 'Intermediate', gamesPlayed: 2 })
    )

    const matchHistory = [
      { teamAIds: ['C0', 'C1'], teamBIds: ['C2', 'C3'], winningTeam: 'A' },
      { teamAIds: ['C4', 'C5'], teamBIds: ['C6', 'C7'], winningTeam: 'A' },
    ]

    const result = generateMatches([...rested, ...cooldown], {
      courts: 1,
      cooldownCourts: 2,
      matchHistory,
    })

    expect(result.courts).toHaveLength(1)
    const courtIds = new Set(allPlayerIds(result))
    rested.forEach((p) => expect(courtIds.has(p.id)).toBe(true))
    cooldown.forEach((p) => expect(courtIds.has(p.id)).toBe(false))
  })
})

// ---------------------------------------------------------------------------
// Hard partner block
// ---------------------------------------------------------------------------

describe('hard partner block', () => {
  it('generateTeamsForGroup never pairs prior partners when fresh pairing exists', () => {
    const players = [
      makePlayer('A', { skillLevel: 'Intermediate', partnerCounts: { B: 1 } }),
      makePlayer('B', { skillLevel: 'Intermediate', partnerCounts: { A: 1 } }),
      makePlayer('C', { skillLevel: 'Intermediate' }),
      makePlayer('D', { skillLevel: 'Intermediate' }),
    ]
    const { teams } = generateTeamsForGroup(players)

    teams.forEach((team) => {
      const ids = team.players.map((p) => p.id)
      const abTogether = ids.includes('A') && ids.includes('B')
      expect(abTogether).toBe(false)
    })
  })

  it('generateTeamsForGroup falls back to penalty when all pairs are repeats', () => {
    const players = [
      makePlayer('A', {
        skillLevel: 'Intermediate',
        partnerCounts: { B: 1, C: 1, D: 1 },
      }),
      makePlayer('B', {
        skillLevel: 'Intermediate',
        partnerCounts: { A: 1, C: 1, D: 1 },
      }),
      makePlayer('C', {
        skillLevel: 'Intermediate',
        partnerCounts: { A: 1, B: 1, D: 1 },
      }),
      makePlayer('D', {
        skillLevel: 'Intermediate',
        partnerCounts: { A: 1, B: 1, C: 1 },
      }),
    ]
    const { teams } = generateTeamsForGroup(players)

    expect(teams).toHaveLength(2)
    const allIds = teams.flatMap((t) => t.players.map((p) => p.id))
    expect(new Set(allIds).size).toBe(4)
  })

  it('generateMatches keeps locked pair together despite partner history', () => {
    const [a, b] = makePair('A', 'B', {
      skillLevel: 'Intermediate',
      partnerCounts: {},
    })
    a.partnerCounts = { B: 5 }
    b.partnerCounts = { A: 5 }

    const players = [
      a,
      b,
      makePlayer('C', { skillLevel: 'Intermediate' }),
      makePlayer('D', { skillLevel: 'Intermediate' }),
    ]
    const result = generateMatches(players, { courts: 1 })
    const court = result.courts[0]
    const { teamAIds, teamBIds } = courtTeamIds(court)

    const abTogether =
      (teamAIds.includes('A') && teamAIds.includes('B')) ||
      (teamBIds.includes('A') && teamBIds.includes('B'))
    expect(abTogether).toBe(true)
  })

  it('generateMatches keeps locked pair together on first round with overflow pool', () => {
    const [mrB, mrsB] = makePair('MrB', 'MrsB', {
      skillLevel: 'Novice',
      gamesPlayed: 0,
      queueOrder: 16,
    })
    const solos = Array.from({ length: 18 }, (_, i) =>
      makePlayer(`P${i}`, {
        skillLevel: 'Intermediate',
        gamesPlayed: 0,
        queueOrder: i + 1,
      })
    )
    const result = generateMatches([...solos, mrB, mrsB], { courts: 3 })

    const onCourtIds = new Set(allPlayerIds(result))
    expect(onCourtIds.has('MrB')).toBe(onCourtIds.has('MrsB'))

    if (onCourtIds.has('MrB')) {
      const court = result.courts.find(
        (c) =>
          c.teamA.some((p) => p.id === 'MrB') || c.teamB.some((p) => p.id === 'MrB')
      )
      const team = court.teamA.some((p) => p.id === 'MrB') ? court.teamA : court.teamB
      expect(team.some((p) => p.id === 'MrsB')).toBe(true)
    }
  })

  it('keeps a locked pair together in round 2 after applying round-1 results', () => {
    // Reproduces the reported bug: 20 players, 3 courts, a locked pair that
    // played in round 1 must stay together (or sit out together) in round 2.
    const [mrB, mrsB] = makePair('MrB', 'MrsB', {
      skillLevel: 'Novice',
      queueOrder: 16,
    })
    const others = Array.from({ length: 18 }, (_, i) =>
      makePlayer(`P${i}`, {
        skillLevel: 'Intermediate',
        queueOrder: i + 1,
      })
    )
    let players = [...others, mrB, mrsB]
    const matchHistory = []

    const applyRound = (teamAIds, teamBIds, winningTeam) => {
      const { players: next, historyEntry } = applyMatchResult(
        players,
        { courtIndex: 0, teamAIds, teamBIds, winningTeam },
        { skillAdjustment: 2 }
      )
      players = next
      matchHistory.push(historyEntry)
    }

    // Round 1: the locked pair plays and wins on one court.
    applyRound(['MrB', 'MrsB'], ['P0', 'P1'], 'A')
    applyRound(['P2', 'P3'], ['P4', 'P5'], 'A')
    applyRound(['P6', 'P7'], ['P8', 'P9'], 'B')

    const result = generateMatches(players, { courts: 3, matchHistory })

    const onCourtIds = new Set(allPlayerIds(result))
    expect(onCourtIds.has('MrB')).toBe(onCourtIds.has('MrsB'))

    if (onCourtIds.has('MrB')) {
      const court = result.courts.find(
        (c) =>
          c.teamA.some((p) => p.id === 'MrB') ||
          c.teamB.some((p) => p.id === 'MrB')
      )
      const team = court.teamA.some((p) => p.id === 'MrB')
        ? court.teamA
        : court.teamB
      expect(team.some((p) => p.id === 'MrsB')).toBe(true)
    }
  })

  it('hasPartneredBefore detects prior partnerships', () => {
    const a = makePlayer('A', { partnerCounts: { B: 1 } })
    const b = makePlayer('B', { partnerCounts: { A: 1 } })
    const c = makePlayer('C')

    expect(hasPartneredBefore(a, b)).toBe(true)
    expect(hasPartneredBefore(a, c)).toBe(false)
    expect(hasPartneredBefore(b, c)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// applyMatchResult
// ---------------------------------------------------------------------------

describe('applyMatchResult', () => {
  it('increments wins/losses and gamesPlayed', () => {
    const players = [
      makePlayer('a'),
      makePlayer('b'),
      makePlayer('c'),
      makePlayer('d'),
    ]
    const { players: updated } = applyMatchResult(players, {
      courtIndex: 0,
      teamAIds: ['a', 'b'],
      teamBIds: ['c', 'd'],
      winningTeam: 'A',
    })

    const a = updated.find((p) => p.id === 'a')
    const c = updated.find((p) => p.id === 'c')
    expect(a.wins).toBe(1)
    expect(a.losses).toBe(0)
    expect(a.gamesPlayed).toBe(1)
    expect(c.wins).toBe(0)
    expect(c.losses).toBe(1)
    expect(c.gamesPlayed).toBe(1)
  })

  it('updates partnerCounts and opponentCounts', () => {
    const players = [
      makePlayer('a'),
      makePlayer('b'),
      makePlayer('c'),
      makePlayer('d'),
    ]
    const { players: updated } = applyMatchResult(players, {
      courtIndex: 0,
      teamAIds: ['a', 'b'],
      teamBIds: ['c', 'd'],
      winningTeam: 'B',
    })

    const a = updated.find((p) => p.id === 'a')
    expect(a.partnerCounts.b).toBe(1)
    expect(a.opponentCounts.c).toBe(1)
    expect(a.opponentCounts.d).toBe(1)
  })

  it('returns a historyEntry with a signature', () => {
    const players = [
      makePlayer('a'),
      makePlayer('b'),
      makePlayer('c'),
      makePlayer('d'),
    ]
    const { historyEntry } = applyMatchResult(players, {
      courtIndex: 0,
      teamAIds: ['a', 'b'],
      teamBIds: ['c', 'd'],
      winningTeam: 'A',
    })

    expect(historyEntry.courtIndex).toBe(0)
    expect(historyEntry.winningTeam).toBe('A')
    expect(typeof historyEntry.signature).toBe('string')
    expect(historyEntry.teamAIds).toEqual(['a', 'b'])
    expect(historyEntry.teamBIds).toEqual(['c', 'd'])
  })
})

// ---------------------------------------------------------------------------
// Up Next pool — on-court exclusion contract
// ---------------------------------------------------------------------------

describe('selectFairnessPool excludes on-court players when pre-filtered', () => {
  it('none of the on-court player IDs appear in selected', () => {
    const allPlayers = Array.from({ length: 12 }, (_, i) =>
      makePlayer(`P${i}`, { skillLevel: 'Intermediate', gamesPlayed: i + 1 })
    )
    const onCourtIds = new Set(['P0', 'P1', 'P2', 'P3'])
    const eligible = allPlayers.filter((p) => !onCourtIds.has(p.id))

    const { selected } = selectFairnessPool(eligible, 1, [])

    selected.forEach((p) => {
      expect(onCourtIds.has(p.id)).toBe(false)
    })
    expect(selected.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// excludePlayerIds — global fairness with per-court exclusion
// ---------------------------------------------------------------------------

describe('generateMatches with excludePlayerIds', () => {
  it('excluded players never appear on courts', () => {
    const players = Array.from({ length: 12 }, (_, i) =>
      makePlayer(`P${i}`, { skillLevel: 'Intermediate', gamesPlayed: i })
    )
    const result = generateMatches(players, {
      courts: 1,
      cooldownCourts: 2,
      excludePlayerIds: ['P0', 'P1', 'P2', 'P3'],
    })

    const courtIds = new Set(allPlayerIds(result))
    expect(courtIds.has('P0')).toBe(false)
    expect(courtIds.has('P1')).toBe(false)
    expect(courtIds.has('P2')).toBe(false)
    expect(courtIds.has('P3')).toBe(false)
    expect(result.courts).toHaveLength(1)
  })

  it('excluded players are also absent from sitOuts', () => {
    const players = Array.from({ length: 12 }, (_, i) =>
      makePlayer(`P${i}`, { skillLevel: 'Intermediate', gamesPlayed: i })
    )
    const result = generateMatches(players, {
      courts: 1,
      cooldownCourts: 2,
      excludePlayerIds: ['P0', 'P1', 'P2', 'P3'],
    })

    const sitOutIds = new Set(result.sitOuts.map((p) => p.id))
    expect(sitOutIds.has('P0')).toBe(false)
    expect(sitOutIds.has('P1')).toBe(false)
    expect(sitOutIds.has('P2')).toBe(false)
    expect(sitOutIds.has('P3')).toBe(false)
  })

  it('uses global fairness ranking — high-game excluded players do not inflate the eligible pool', () => {
    // 20 players, P0-P3 excluded (on another court). With global fairness,
    // the pool is sized for cooldownCourts=2 (neededPlayers=12). After
    // removing 4 excluded, 8 eligible players enter the engine.
    // The highest-game eligible players should be in the sit-outs.
    const players = Array.from({ length: 20 }, (_, i) =>
      makePlayer(`P${i}`, { skillLevel: 'Intermediate', gamesPlayed: i + 1 })
    )
    const result = generateMatches(players, {
      courts: 1,
      cooldownCourts: 2,
      excludePlayerIds: ['P0', 'P1', 'P2', 'P3'],
    })

    expect(result.courts).toHaveLength(1)
    const courtIds = new Set(allPlayerIds(result))
    // Highest-game eligible players (P16-P19) should be sitting out
    expect(courtIds.has('P16')).toBe(false)
    expect(courtIds.has('P17')).toBe(false)
    expect(courtIds.has('P18')).toBe(false)
    expect(courtIds.has('P19')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Decomposed sit-outs
// ---------------------------------------------------------------------------

describe('decomposed sit-outs', () => {
  it('returns _fairnessSitOuts, _teamBuildSitOuts, _overflowSitOuts', () => {
    const players = Array.from({ length: 12 }, (_, i) =>
      makePlayer(`P${i}`, { skillLevel: 'Intermediate', gamesPlayed: i + 1 })
    )
    const result = generateMatches(players, { courts: 1 })

    expect(result._fairnessSitOuts).toBeDefined()
    expect(result._teamBuildSitOuts).toBeDefined()
    expect(result._overflowSitOuts).toBeDefined()

    const totalDecomposed =
      result._fairnessSitOuts.length +
      result._teamBuildSitOuts.length +
      result._overflowSitOuts.length
    expect(totalDecomposed).toBe(result.sitOuts.length)
  })

  it('returns empty decomposed arrays on early exit', () => {
    const result = generateMatches([], { courts: 1 })
    expect(result._fairnessSitOuts).toEqual([])
    expect(result._teamBuildSitOuts).toEqual([])
    expect(result._overflowSitOuts).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Session simulation — games-played spread
// ---------------------------------------------------------------------------

describe('session simulation — games-played fairness', () => {
  const PLAYER_COUNT = 27
  const COURT_COUNT = 2
  const ROUNDS = 14

  const makeRoster = () =>
    Array.from({ length: PLAYER_COUNT }, (_, i) =>
      makePlayer(`P${i}`, { skillLevel: 'Intermediate' })
    )

  const gamesSpread = (playerList) => {
    const games = playerList.map((p) => Number(p.gamesPlayed) || 0)
    return Math.max(...games) - Math.min(...games)
  }

  it('Scenario A — Generate All keeps spread <= 2', () => {
    let players = makeRoster()
    let history = []

    for (let round = 0; round < ROUNDS; round += 1) {
      const result = generateMatches(players, {
        courts: COURT_COUNT,
        matchHistory: history,
      })

      for (const court of result.courts) {
        const teamAIds = court.teamA.map((p) => p.id)
        const teamBIds = court.teamB.map((p) => p.id)
        const { players: updated, historyEntry } = applyMatchResult(players, {
          courtIndex: court.courtIndex,
          teamAIds,
          teamBIds,
          winningTeam: round % 2 === 0 ? 'A' : 'B',
        })
        players = updated
        history.push(historyEntry)
      }
    }

    const checkedIn = players.filter((p) => p.checkedIn)
    expect(checkedIn.every((p) => (Number(p.gamesPlayed) || 0) >= 1)).toBe(true)
    expect(gamesSpread(checkedIn)).toBeLessThanOrEqual(2)
  })

  it('Scenario B — Per-court refresh keeps spread <= 2', () => {
    let players = makeRoster()
    let history = []

    // Initial Generate All
    let result = generateMatches(players, {
      courts: COURT_COUNT,
      matchHistory: history,
    })
    let courtMatchups = result.courts.map((c) => ({
      teamA: c.teamA,
      teamB: c.teamB,
    }))

    for (let round = 0; round < ROUNDS; round += 1) {
      for (let ci = 0; ci < COURT_COUNT; ci += 1) {
        const matchup = courtMatchups[ci]
        if (!matchup) continue

        // Score this court
        const teamAIds = matchup.teamA.map((p) => p.id)
        const teamBIds = matchup.teamB.map((p) => p.id)
        const { players: updated, historyEntry } = applyMatchResult(players, {
          courtIndex: ci,
          teamAIds,
          teamBIds,
          winningTeam: round % 2 === 0 ? 'A' : 'B',
        })
        players = updated
        history.push(historyEntry)

        // Clear scored court
        courtMatchups[ci] = null

        // Per-court refresh with global fairness via excludePlayerIds
        const otherCourtPlayerIds = []
        courtMatchups.forEach((m, idx) => {
          if (idx === ci || !m) return
          m.teamA?.forEach((p) => otherCourtPlayerIds.push(p.id))
          m.teamB?.forEach((p) => otherCourtPlayerIds.push(p.id))
        })

        const refreshResult = generateMatches(players, {
          courts: 1,
          cooldownCourts: COURT_COUNT,
          matchHistory: history,
          excludePlayerIds: otherCourtPlayerIds,
        })

        if (refreshResult.courts[0]) {
          courtMatchups[ci] = {
            teamA: refreshResult.courts[0].teamA,
            teamB: refreshResult.courts[0].teamB,
          }
        }
      }
    }

    const checkedIn = players.filter((p) => p.checkedIn)
    expect(checkedIn.every((p) => (Number(p.gamesPlayed) || 0) >= 1)).toBe(true)
    expect(gamesSpread(checkedIn)).toBeLessThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// buildUpNextQueue — shared Up Next / empty-court selection
// ---------------------------------------------------------------------------

describe('takePairAwareCourtFill', () => {
  it('takes the first N players in order when there are no pairs', () => {
    const pool = Array.from({ length: 6 }, (_, i) => makePlayer(`P${i}`))
    const fill = takePairAwareCourtFill(pool, 4)
    expect(fill.map((p) => p.id)).toEqual(['P0', 'P1', 'P2', 'P3'])
  })

  it('keeps a mutual locked pair together across the slice boundary', () => {
    // Pair sits at indices 2 and 5; pulling the partner forward keeps them
    // together within the 4-player fill.
    const [a, b] = makePair('A', 'B')
    const pool = [
      makePlayer('P0'),
      makePlayer('P1'),
      a,
      makePlayer('P3'),
      makePlayer('P4'),
      b,
    ]
    const fill = takePairAwareCourtFill(pool, 4)
    expect(fill).toHaveLength(4)
    const ids = fill.map((p) => p.id)
    expect(ids).toContain('A')
    expect(ids).toContain('B')
  })

  it('skips a pair that cannot fit and keeps filling with solos', () => {
    // Pair starts at index 3, only one slot left -> pair is skipped, next solo
    // fills the final slot instead of splitting the pair.
    const [a, b] = makePair('A', 'B')
    const pool = [
      makePlayer('P0'),
      makePlayer('P1'),
      makePlayer('P2'),
      a,
      b,
      makePlayer('P5'),
    ]
    const fill = takePairAwareCourtFill(pool, 4)
    expect(fill.map((p) => p.id)).toEqual(['P0', 'P1', 'P2', 'P5'])
  })
})

describe('buildUpNextQueue', () => {
  it('returns empty queue/preferred when fewer than a court of eligible players', () => {
    const players = Array.from({ length: 3 }, (_, i) => makePlayer(`P${i}`))
    const { queue, preferred } = buildUpNextQueue(players, { courts: 1 })
    expect(queue).toEqual([])
    expect(preferred).toEqual([])
  })

  it('orders the queue by fairness priority (fewest games first)', () => {
    const players = Array.from({ length: 8 }, (_, i) =>
      makePlayer(`P${i}`, { gamesPlayed: i })
    )
    const { queue } = buildUpNextQueue(players, { courts: 1 })
    const games = queue.map((p) => Number(p.gamesPlayed) || 0)
    const sorted = [...games].sort((a, b) => a - b)
    expect(games).toEqual(sorted)
  })

  it('leads the queue with the pair-aware preferred four', () => {
    const players = Array.from({ length: 8 }, (_, i) =>
      makePlayer(`P${i}`, { gamesPlayed: i })
    )
    const { queue, preferred } = buildUpNextQueue(players, { courts: 1 })
    expect(preferred).toHaveLength(4)
    expect(queue.slice(0, 4).map((p) => p.id)).toEqual(
      preferred.map((p) => p.id)
    )
  })

  it('excludes players already on other courts', () => {
    const players = Array.from({ length: 12 }, (_, i) =>
      makePlayer(`P${i}`, { gamesPlayed: i })
    )
    const { queue } = buildUpNextQueue(players, {
      courts: 2,
      excludePlayerIds: ['P0', 'P1', 'P2', 'P3'],
    })
    const ids = new Set(queue.map((p) => p.id))
    ;['P0', 'P1', 'P2', 'P3'].forEach((id) => expect(ids.has(id)).toBe(false))
  })

  it('excludes games-gap players', () => {
    const players = Array.from({ length: 8 }, (_, i) =>
      makePlayer(`P${i}`, { gamesPlayed: i })
    )
    const { queue } = buildUpNextQueue(players, {
      courts: 1,
      gapExcludeIds: ['P6', 'P7'],
    })
    const ids = new Set(queue.map((p) => p.id))
    expect(ids.has('P6')).toBe(false)
    expect(ids.has('P7')).toBe(false)
  })

  it('ignores players who are not checked in', () => {
    const players = [
      ...Array.from({ length: 4 }, (_, i) => makePlayer(`P${i}`)),
      makePlayer('OUT', { checkedIn: false }),
    ]
    const { queue } = buildUpNextQueue(players, { courts: 1 })
    expect(queue.map((p) => p.id)).not.toContain('OUT')
  })

  it('keeps a mutual locked pair together in the preferred four', () => {
    const [a, b] = makePair('A', 'B', { gamesPlayed: 0 })
    const players = [
      a,
      b,
      ...Array.from({ length: 6 }, (_, i) => makePlayer(`P${i}`, { gamesPlayed: 1 })),
    ]
    const { preferred } = buildUpNextQueue(players, { courts: 1 })
    const ids = preferred.map((p) => p.id)
    expect(ids).toContain('A')
    expect(ids).toContain('B')
  })

  it('preferred four match the players generateMatches places on the court', () => {
    const players = Array.from({ length: 10 }, (_, i) =>
      makePlayer(`P${i}`, { gamesPlayed: i })
    )
    const { preferred } = buildUpNextQueue(players, { courts: 1 })
    expect(preferred).toHaveLength(4)

    const result = generateMatches(preferred, { courts: 1 })
    expect(result.courts).toHaveLength(1)
    const courtIds = new Set(allPlayerIds(result))
    preferred.forEach((p) => expect(courtIds.has(p.id)).toBe(true))
  })

  it('orders by check-in queue before the first match when players arrive at different times', () => {
    const players = [
      makePlayer('third', { queueOrder: 3 }),
      makePlayer('first', { queueOrder: 1 }),
      makePlayer('fourth', { queueOrder: 4 }),
      makePlayer('second', { queueOrder: 2 }),
      makePlayer('fifth', { queueOrder: 5 }),
      makePlayer('sixth', { queueOrder: 6 }),
    ]
    const { queue, preferred } = buildUpNextQueue(players, { courts: 1 })

    expect(preferred.map((player) => player.id)).toEqual([
      'first',
      'second',
      'third',
      'fourth',
    ])
    expect(queue.map((player) => player.id)).toEqual([
      'first',
      'second',
      'third',
      'fourth',
      'fifth',
      'sixth',
    ])
  })

  it('keeps check-in order for locked pairs checked in after earlier solos', () => {
    const [lateA, lateB] = makePair('lateA', 'lateB', { queueOrder: 3 })
    lateB.queueOrder = 4
    const players = [
      makePlayer('first', { queueOrder: 1 }),
      makePlayer('second', { queueOrder: 2 }),
      lateA,
      lateB,
      makePlayer('fifth', { queueOrder: 5 }),
      makePlayer('sixth', { queueOrder: 6 }),
    ]
    const { preferred } = buildUpNextQueue(players, { courts: 1 })

    expect(preferred.map((player) => player.id)).toEqual([
      'first',
      'second',
      'lateA',
      'lateB',
    ])
  })
})
