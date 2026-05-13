// Round Robin (custom teams / DUPR Nights) engine.
//
// This engine has been intentionally trimmed to a single-court primitive.
// The host app drives the dynamic-court flow (team rotation, played-matchup
// tracking, fairness, completion detection) and only needs `buildCourtTeams`
// for ad-hoc 4-player team formation that respects pre-defined `teamName`
// pairings and partner history.

const shuffle = (items) => {
  const list = [...items]
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[list[index], list[swapIndex]] = [list[swapIndex], list[index]]
  }
  return list
}

const registerPartnerHistory = (partnerHistory, player, partner) => {
  if (!partnerHistory) return
  partnerHistory.add(`${player.id}:${partner.id}`)
  partnerHistory.add(`${partner.id}:${player.id}`)
}

const buildCustomTeams = (players, partnerHistory) => {
  const teams = []
  const ungrouped = []
  const teamMap = new Map()

  players.forEach((player) => {
    const teamName = player.teamName?.trim()
    if (!teamName) {
      ungrouped.push(player)
      return
    }
    const group = teamMap.get(teamName)
    if (group) {
      group.push(player)
    } else {
      teamMap.set(teamName, [player])
    }
  })

  teamMap.forEach((group) => {
    if (group.length >= 2) {
      const team = group.slice(0, 2)
      teams.push(team)
      registerPartnerHistory(partnerHistory, team[0], team[1])
      if (group.length > 2) {
        ungrouped.push(...group.slice(2))
      }
    } else {
      ungrouped.push(...group)
    }
  })

  return { teams, ungrouped }
}

const splitIntoTeams = (players, partnerHistory) => {
  const { teams, ungrouped } = buildCustomTeams(players, partnerHistory)
  const pool = shuffle(ungrouped)

  while (pool.length >= 2) {
    const player = pool.shift()
    const partnerIndex = pool.findIndex(
      (candidate) => !partnerHistory.has(`${player.id}:${candidate.id}`)
    )
    const partner =
      partnerIndex === -1 ? pool.shift() : pool.splice(partnerIndex, 1)[0]

    teams.push([player, partner])
    registerPartnerHistory(partnerHistory, player, partner)
  }

  return teams
}

// Court-agnostic primitive: forms two doubles teams from the given player
// pool, honoring any pre-defined `teamName` pairings first and then filling
// the rest while avoiding partners already in `partnerHistory`.
const buildCourtTeams = (players, partnerHistory = new Set()) =>
  splitIntoTeams(players ?? [], partnerHistory)

const enforceExclusivePlayers = (players, exclusiveIds) => {
  const selected = []
  let exclusivePicked = false

  players.forEach((player) => {
    if (exclusiveIds.has(player.id)) {
      if (exclusivePicked) return
      exclusivePicked = true
    }
    selected.push(player)
  })

  return selected
}

export { buildCourtTeams, enforceExclusivePlayers }
