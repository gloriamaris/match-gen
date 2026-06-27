const parseCsvRow = (row) => {
  const values = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index]
    if (char === '"') {
      if (inQuotes && row[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  values.push(current.trim())
  return values
}

export const parseCsv = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCsvRow)

const findHeaderIndex = (headers, candidates) =>
  headers.findIndex((header) => candidates.includes(header))

export const parseMatchDate = (value) => {
  const parsed = Date.parse(String(value ?? '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

export const parseMatchScore = (value) => {
  const parts = String(value ?? '')
    .split('-')
    .map((part) => part.trim())

  if (parts.length !== 2) return null

  const scoreA = Number.parseInt(parts[0], 10)
  const scoreB = Number.parseInt(parts[1], 10)

  if (Number.isNaN(scoreA) || Number.isNaN(scoreB)) return null

  return { scoreA, scoreB }
}

const resolveTeamIds = (teamLabel, players) => {
  const names = String(teamLabel ?? '')
    .split('/')
    .map((name) => name.trim())
    .filter(Boolean)

  if (names.length === 0 || names.length > 2) {
    return {
      error: `expected 1 or 2 players per team but got "${teamLabel}"`,
    }
  }

  const ids = []
  const missingNames = []

  names.forEach((name) => {
    const player = players.find((entry) => entry.name === name)
    if (!player) {
      missingNames.push(name)
      return
    }
    ids.push(player.id)
  })

  if (missingNames.length > 0) {
    return { error: `unknown player${missingNames.length === 1 ? '' : 's'}: ${missingNames.join(', ')}` }
  }

  if (new Set(ids).size !== ids.length) {
    return { error: `duplicate players in team "${teamLabel}"` }
  }

  return { ids }
}

export const parseMatchHistoryCsv = (text, { players = [] } = {}) => {
  const rows = parseCsv(text)
  if (rows.length < 2) {
    return { error: 'No match rows found in that file', matches: [] }
  }

  const headers = rows[0].map((header) => header.trim().toLowerCase())
  const courtIndex = findHeaderIndex(headers, ['court'])
  const teamAIndex = findHeaderIndex(headers, ['team a'])
  const teamBIndex = findHeaderIndex(headers, ['team b'])
  const scoreIndex = findHeaderIndex(headers, ['score'])
  const verifiedIndex = findHeaderIndex(headers, ['verified by', 'verified'])
  const dateIndex = findHeaderIndex(headers, [
    'date & time',
    'date and time',
    'date',
  ])

  if (
    courtIndex === -1 ||
    teamAIndex === -1 ||
    teamBIndex === -1 ||
    scoreIndex === -1
  ) {
    return {
      error: 'CSV must include Court, Team A, Team B, and Score columns',
      matches: [],
    }
  }

  const matches = []
  const errors = []

  rows.slice(1).forEach((row, rowOffset) => {
    const rowNumber = rowOffset + 2
    const court = row[courtIndex]?.trim()
    const teamA = row[teamAIndex]?.trim()
    const teamB = row[teamBIndex]?.trim()
    const scoreValue = row[scoreIndex]?.trim()
    const enteredBy = verifiedIndex !== -1 ? row[verifiedIndex]?.trim() ?? '' : ''
    const dateValue = dateIndex !== -1 ? row[dateIndex]?.trim() ?? '' : ''

    if (!court && !teamA && !teamB && !scoreValue) return

    if (!court || !teamA || !teamB || !scoreValue) {
      errors.push(`row ${rowNumber}: missing court, teams, or score`)
      return
    }

    const score = parseMatchScore(scoreValue)
    if (!score) {
      errors.push(`row ${rowNumber}: invalid score "${scoreValue}"`)
      return
    }

    const teamAResult = resolveTeamIds(teamA, players)
    if (teamAResult.error) {
      errors.push(`row ${rowNumber}: ${teamAResult.error}`)
      return
    }

    const teamBResult = resolveTeamIds(teamB, players)
    if (teamBResult.error) {
      errors.push(`row ${rowNumber}: ${teamBResult.error}`)
      return
    }

    const allIds = [...teamAResult.ids, ...teamBResult.ids]
    if (new Set(allIds).size !== allIds.length) {
      errors.push(`row ${rowNumber}: players can only appear once per match`)
      return
    }

    const timestamp = dateValue ? parseMatchDate(dateValue) : null
    if (dateValue && timestamp === null) {
      errors.push(`row ${rowNumber}: invalid date "${dateValue}"`)
      return
    }

    matches.push({
      court,
      teamA,
      teamB,
      teamAIds: teamAResult.ids,
      teamBIds: teamBResult.ids,
      scoreA: score.scoreA,
      scoreB: score.scoreB,
      enteredBy,
      timestamp,
    })
  })

  if (errors.length > 0) {
    const preview = errors.slice(0, 3).join('; ')
    const more = errors.length > 3 ? `; and ${errors.length - 3} more` : ''
    return {
      error: `Import cancelled — ${preview}${more}`,
      matches: [],
    }
  }

  if (matches.length === 0) {
    return { error: 'No valid matches found in that file', matches: [] }
  }

  matches.sort((a, b) => {
    if (a.timestamp !== null && b.timestamp !== null) {
      return a.timestamp - b.timestamp
    }
    if (a.timestamp !== null) return -1
    if (b.timestamp !== null) return 1
    return 0
  })

  return { matches, error: null }
}
