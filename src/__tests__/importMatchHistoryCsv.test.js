import { describe, expect, it } from 'vitest'
import {
  parseMatchDate,
  parseMatchHistoryCsv,
  parseMatchScore,
} from '../importMatchHistoryCsv'

const players = [
  { id: '1', name: 'Khoi' },
  { id: '2', name: 'Kenneth Jake Bonane' },
  { id: '3', name: 'Alice Example' },
  { id: '4', name: 'Bob Example' },
]

describe('parseMatchScore', () => {
  it('parses scores with spaces around the dash', () => {
    expect(parseMatchScore('10 - 15')).toEqual({ scoreA: 10, scoreB: 15 })
  })
})

describe('parseMatchDate', () => {
  it('parses exported locale date strings', () => {
    expect(parseMatchDate('Jun 26, 2026, 8:34 PM')).toBeTypeOf('number')
  })
})

describe('parseMatchHistoryCsv', () => {
  it('parses exported match history rows for singles', () => {
    const csv = `Court,Team A,Team B,Score,Verified By,Date & Time
Court 1,Khoi,Kenneth Jake Bonane,10 - 15,Admin - John,"Jun 26, 2026, 8:34 PM"`

    const { matches, error } = parseMatchHistoryCsv(csv, {
      players,
    })

    expect(error).toBeNull()
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      court: 'Court 1',
      teamAIds: ['1'],
      teamBIds: ['2'],
      scoreA: 10,
      scoreB: 15,
      enteredBy: 'Admin - John',
    })
    expect(matches[0].timestamp).toBeTypeOf('number')
  })

  it('parses doubles teams separated by slash', () => {
    const csv = `Court,Team A,Team B,Score,Verified By,Date & Time
Court 1,Alice Example / Bob Example,Khoi / Kenneth Jake Bonane,11 - 9,Admin,"Jun 26, 2026, 8:34 PM"`

    const { matches, error } = parseMatchHistoryCsv(csv, {
      players,
    })

    expect(error).toBeNull()
    expect(matches[0].teamAIds).toEqual(['3', '4'])
    expect(matches[0].teamBIds).toEqual(['1', '2'])
  })

  it('returns an error when a player is missing', () => {
    const csv = `Court,Team A,Team B,Score
Court 1,Unknown,Kenneth Jake Bonane,10 - 15`

    const { error, matches } = parseMatchHistoryCsv(csv, {
      players,
    })

    expect(matches).toEqual([])
    expect(error).toContain('unknown player')
  })
})
