import { describe, expect, it } from 'vitest'
import {
  applyResults,
  createInitialState,
  generateRound,
} from '../OpenRotationSkillWeighted.engine'

const buildPlayers = (count) =>
  Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    duprRating: 4.5 - index * 0.1,
    checkedIn: true,
  }))

const getPartnerKeys = (roundPlan) =>
  roundPlan.courts.flatMap((court) => {
    const teamA = [...court.teamAIds].sort()
    const teamB = [...court.teamBIds].sort()
    return [`${teamA[0]}::${teamA[1]}`, `${teamB[0]}::${teamB[1]}`]
  })

const playRound = (state, players, courts = 1) => {
  const generated = generateRound(state, { players, courts })
  const { roundPlan } = generated
  let nextState = generated.state
  roundPlan.courts.forEach((court) => {
    nextState = applyResults(nextState, {
      round: roundPlan.round,
      courtIndex: court.courtIndex,
      teamA: court.teamAIds,
      teamB: court.teamBIds,
      scoreA: 11,
      scoreB: 7,
    })
  })
  return { state: nextState, roundPlan }
}

describe('OpenRotationSkillWeighted engine', () => {
  it('builds complete non-overlapping courts for 8 players', () => {
    const players = buildPlayers(8)
    const state = createInitialState(players, { courts: 2 })
    const { roundPlan } = generateRound(state, { players, courts: 2 })

    expect(roundPlan.courts).toHaveLength(2)
    expect(roundPlan.sitOuts).toHaveLength(0)

    const assigned = roundPlan.courts.flatMap((court) => [
      ...court.teamAIds,
      ...court.teamBIds,
    ])
    expect(assigned).toHaveLength(8)
    expect(new Set(assigned).size).toBe(8)
  })

  it('avoids repeating exact partner pairs in the next round', () => {
    const players = buildPlayers(4)
    let state = createInitialState(players, { courts: 1 })

    const firstRound = playRound(state, players, 1)
    state = firstRound.state

    const secondRound = generateRound(state, { players, courts: 1 }).roundPlan
    const firstPartners = new Set(getPartnerKeys(firstRound.roundPlan))
    const secondPartners = getPartnerKeys(secondRound)

    secondPartners.forEach((pair) => {
      expect(firstPartners.has(pair)).toBe(false)
    })
  })

  it('rotates sit-outs before repeating for 5 players on 1 court', () => {
    const players = buildPlayers(5)
    let state = createInitialState(players, { courts: 1 })
    const firstCycleSitOuts = []

    for (let i = 0; i < 5; i += 1) {
      const played = playRound(state, players, 1)
      state = played.state
      expect(played.roundPlan.sitOuts).toHaveLength(1)
      firstCycleSitOuts.push(played.roundPlan.sitOuts[0])
    }

    expect(new Set(firstCycleSitOuts).size).toBe(5)
  })

  it('prefers sitting out players with higher games played', () => {
    const players = buildPlayers(5)
    const state = createInitialState(players, { courts: 1 })
    const boosted = {
      ...state,
      playerState: {
        ...state.playerState,
        p1: { ...state.playerState.p1, gamesPlayed: 6 },
        p2: { ...state.playerState.p2, gamesPlayed: 1 },
        p3: { ...state.playerState.p3, gamesPlayed: 1 },
        p4: { ...state.playerState.p4, gamesPlayed: 1 },
        p5: { ...state.playerState.p5, gamesPlayed: 1 },
      },
    }

    const { roundPlan } = generateRound(boosted, { players, courts: 1 })
    expect(roundPlan.sitOuts).toEqual(['p1'])
  })
})
