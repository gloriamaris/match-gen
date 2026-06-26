export const formatStoredMatchDate = (timestamp) => {
  const value = Number(timestamp)
  if (!Number.isFinite(value) || value <= 0) return '—'

  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const getMatchTimestamp = (match) => {
  const value = Number(match?.timestamp)
  return Number.isFinite(value) && value > 0 ? value : null
}

export const sortMatchHistoryChronologically = (matchHistory) =>
  [...(matchHistory ?? [])]
    .map((match, index) => ({ match, index }))
    .sort((a, b) => {
      const timeA = getMatchTimestamp(a.match)
      const timeB = getMatchTimestamp(b.match)

      if (timeA !== null && timeB !== null) return timeA - timeB
      if (timeA !== null) return -1
      if (timeB !== null) return 1
      return a.index - b.index
    })
    .map(({ match }) => match)
