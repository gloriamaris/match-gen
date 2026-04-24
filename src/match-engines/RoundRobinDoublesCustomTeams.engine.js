const DEFAULT_COURTS = {
  champions: 'Champions Court',
  battlefield: 'Battlefield Court',
}

const toNumber = (value) => {
  const parsed = Number.parseFloat(value)
  return Number.isNaN(parsed) ? null : parsed
}

const getPrimaryRating = (player) => toNumber(player.duprRating)
const getSecondaryRating = (player) => toNumber(player.clubRating)

const sortPlayersBySkill = (players) => {
  return [...players].sort((a, b) => {
    const aPrimary = getPrimaryRating(a)
    const bPrimary = getPrimaryRating(b)

    if (aPrimary !== null || bPrimary !== null) {
      if (aPrimary === null) return 1
      if (bPrimary === null) return -1
      if (bPrimary !== aPrimary) return bPrimary - aPrimary
    }

    const aSecondary = getSecondaryRating(a) ?? -Infinity
    const bSecondary = getSecondaryRating(b) ?? -Infinity

    if (bSecondary !== aSecondary) {
      return bSecondary - aSecondary
    }

    return a.name.localeCompare(b.name)
  })
}

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

const splitIntoTeamsWithConstraints = (
  players,
  winnersSet,
  partnerHistory
) => {
  const { teams, ungrouped } = buildCustomTeams(players, partnerHistory)
  const pool = shuffle(ungrouped)

  while (pool.length >= 2) {
    const player = pool.shift()
    const isWinner = winnersSet.has(player.id)

    const partnerIndex = pool.findIndex((candidate) => {
      if (partnerHistory.has(`${player.id}:${candidate.id}`)) return false
      if (isWinner && winnersSet.has(candidate.id)) {
        return false
      }
      return true
    })

    const partner =
      partnerIndex === -1 ? pool.shift() : pool.splice(partnerIndex, 1)[0]

    teams.push([player, partner])
    registerPartnerHistory(partnerHistory, player, partner)
  }

  return teams
}

const buildRoundFromPlayers = (
  championsPlayers,
  battlefieldPlayers,
  partnerHistory = new Set()
) => {
  return {
    champions: splitIntoTeams(championsPlayers, partnerHistory),
    battlefield: splitIntoTeams(battlefieldPlayers, partnerHistory),
  }
}

const createInitialState = (players, options = {}) => {
  const sorted = sortPlayersBySkill(players).map((player, index) => ({
    ...player,
    gamesPlayed: player.gamesPlayed ?? 0,
    queueOrder: player.queueOrder ?? index,
    championsLosses: player.championsLosses ?? 0,
    battlefieldWins: player.battlefieldWins ?? 0,
  }))
  const championsPool = sorted.slice(0, 8)
  const battlefieldPool = sorted.slice(8, 16)
  const queue = sorted.slice(16)

  const partnerHistory = new Set()

  return {
    courts: {
      champions: championsPool,
      battlefield: battlefieldPool,
    },
    queue,
    partnerHistory,
    options: {
      courts: DEFAULT_COURTS,
      ...options,
    },
  }
}

const assignCourtsForRound = (state) => {
  const { courts, partnerHistory } = state

  const championsPlayers = courts.champions.slice(0, 4)
  const battlefieldPlayers = courts.battlefield.slice(0, 4)

  const championsTeams = splitIntoTeams(championsPlayers, partnerHistory)
  const battlefieldTeams = splitIntoTeams(battlefieldPlayers, partnerHistory)

  return {
    champions: championsTeams,
    battlefield: battlefieldTeams,
  }
}

const applyRoundResults = (state, results) => {
  const updatedPlayers = new Map()
  const queue = [...state.queue]
  const demotedChampions = []
  const promotedBattlefield = []

  const registerPlayer = (player, updates) => {
    updatedPlayers.set(player.id, {
      ...player,
      winStreak: updates.winStreak,
      gamesPlayed: updates.gamesPlayed,
      location: updates.location,
      championsLosses: updates.championsLosses,
      battlefieldWins: updates.battlefieldWins,
    })
  }

  const handleCourt = (courtName, winners, losers) => {
    winners.forEach((player) => {
      const nextStreak = (player.winStreak ?? 0) + 1
      const nextGames = (player.gamesPlayed ?? 0) + 1
      const championsLosses = player.championsLosses ?? 0
      const nextBattlefieldWins =
        courtName === 'battlefield'
          ? (player.battlefieldWins ?? 0) + 1
          : player.battlefieldWins ?? 0
      const isPromoted =
        courtName === 'battlefield' && nextBattlefieldWins >= 4
      if (nextStreak >= 2) {
        registerPlayer(player, {
          winStreak: 0,
          gamesPlayed: nextGames,
          location: isPromoted ? 'champions' : 'queue',
          championsLosses,
          battlefieldWins: isPromoted ? 0 : nextBattlefieldWins,
        })
        if (isPromoted) {
          promotedBattlefield.push({
            ...player,
            winStreak: 0,
            gamesPlayed: nextGames,
            championsLosses,
            battlefieldWins: 0,
          })
        } else {
          queue.push({
            ...player,
            winStreak: 0,
            gamesPlayed: nextGames,
            championsLosses,
            battlefieldWins: nextBattlefieldWins,
          })
        }
      } else {
        registerPlayer(player, {
          winStreak: isPromoted ? 0 : nextStreak,
          gamesPlayed: nextGames,
          location: isPromoted ? 'champions' : courtName,
          championsLosses,
          battlefieldWins: isPromoted ? 0 : nextBattlefieldWins,
        })
        if (isPromoted) {
          promotedBattlefield.push({
            ...player,
            winStreak: 0,
            gamesPlayed: nextGames,
            championsLosses,
            battlefieldWins: 0,
          })
        }
      }
    })

    losers.forEach((player) => {
      const nextGames = (player.gamesPlayed ?? 0) + 1
      const nextChampionsLosses =
        courtName === 'champions'
          ? (player.championsLosses ?? 0) + 1
          : player.championsLosses ?? 0
      const isDemoted =
        courtName === 'champions' && nextChampionsLosses >= 4

      registerPlayer(player, {
        winStreak: 0,
        gamesPlayed: nextGames,
        location: isDemoted ? 'battlefield' : 'queue',
        championsLosses: isDemoted ? 0 : nextChampionsLosses,
        battlefieldWins: player.battlefieldWins ?? 0,
      })

      if (isDemoted) {
        demotedChampions.push({
          ...player,
          winStreak: 0,
          gamesPlayed: nextGames,
          championsLosses: 0,
          battlefieldWins: player.battlefieldWins ?? 0,
        })
      } else {
        queue.push({
          ...player,
          winStreak: 0,
          gamesPlayed: nextGames,
          championsLosses: nextChampionsLosses,
          battlefieldWins: player.battlefieldWins ?? 0,
        })
      }
    })
  }

  handleCourt('champions', results.champions.winners, results.champions.losers)
  handleCourt('battlefield', results.battlefield.winners, results.battlefield.losers)

  return {
    ...state,
    queue,
    updatedPlayers,
    demotedChampions,
    promotedBattlefield,
  }
}

const buildNextRound = (state, results) => {
  const applied = applyRoundResults(state, results)
  const demotedChampions = applied.demotedChampions ?? []
  const promotedBattlefield = applied.promotedBattlefield ?? []
  const overflowDemotions = demotedChampions.slice(4)
  const overflowPromotions = promotedBattlefield.slice(4)
  const queue = prioritizeQueue([
    ...applied.queue,
    ...overflowDemotions,
    ...overflowPromotions,
  ])
  const partnerHistory = state.partnerHistory ?? new Set()

  const eligibleChampionsWinners = results.champions.winners.filter(
    (player) => (player.winStreak ?? 0) < 2
  )
  const eligibleBattlefieldWinners = results.battlefield.winners.filter(
    (player) => (player.winStreak ?? 0) < 2
  )

  const championsPool = promotedBattlefield.slice(0, 4)
  const battlefieldPool = demotedChampions.slice(0, 4)

  eligibleChampionsWinners.forEach((player) => championsPool.push(player))
  eligibleBattlefieldWinners.forEach((player) => {
    if (championsPool.length < 4) {
      championsPool.push(player)
    } else {
      battlefieldPool.push(player)
    }
  })

  while (championsPool.length < 4 && queue.length > 0) {
    championsPool.push(queue.shift())
  }

  while (battlefieldPool.length < 4 && queue.length > 0) {
    battlefieldPool.push(queue.shift())
  }

  const winnersSet = new Set([
    ...eligibleChampionsWinners.map((player) => player.id),
    ...eligibleBattlefieldWinners.map((player) => player.id),
  ])

  return {
    ...applied,
    queue,
    courts: {
      champions: championsPool,
      battlefield: battlefieldPool,
    },
    round: {
      champions: splitIntoTeamsWithConstraints(
        championsPool,
        winnersSet,
        partnerHistory
      ),
      battlefield: splitIntoTeamsWithConstraints(
        battlefieldPool,
        winnersSet,
        partnerHistory
      ),
    },
  }
}

const prioritizeQueue = (queue) => {
  const list = [...queue]
  const minGames = list.reduce((min, player) => {
    const games = player.gamesPlayed ?? 0
    return games < min ? games : min
  }, Number.POSITIVE_INFINITY)

  const withinWindow = list.filter(
    (player) => (player.gamesPlayed ?? 0) <= minGames + 2
  )
  const overflow = list.filter(
    (player) => (player.gamesPlayed ?? 0) > minGames + 2
  )

  const sortByPriority = (a, b) => {
    const gamesA = a.gamesPlayed ?? 0
    const gamesB = b.gamesPlayed ?? 0
    if (gamesA !== gamesB) return gamesA - gamesB
    return (a.queueOrder ?? 0) - (b.queueOrder ?? 0)
  }

  return [...withinWindow.sort(sortByPriority), ...overflow.sort(sortByPriority)]
}

const refillCourts = (state, promotedPlayers = []) => {
  const queue = prioritizeQueue(state.queue)
  const nextChampions = [...promotedPlayers]

  while (nextChampions.length < 8 && queue.length > 0) {
    nextChampions.push(queue.shift())
  }

  const nextBattlefield = []
  while (nextBattlefield.length < 8 && queue.length > 0) {
    nextBattlefield.push(queue.shift())
  }

  return {
    ...state,
    courts: {
      champions: nextChampions,
      battlefield: nextBattlefield,
    },
    queue,
  }
}

const formatRoundOutput = (round) => {
  const formatTeam = (team) => team.map((player) => player.name).join(' / ')

  return {
    champions: round.champions.map((team) => formatTeam(team)),
    battlefield: round.battlefield.map((team) => formatTeam(team)),
  }
}

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

export {
  buildRoundFromPlayers,
  sortPlayersBySkill,
  createInitialState,
  assignCourtsForRound,
  applyRoundResults,
  buildNextRound,
  refillCourts,
  formatRoundOutput,
  enforceExclusivePlayers,
}
