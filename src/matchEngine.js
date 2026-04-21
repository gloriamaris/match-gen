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

const splitIntoTeams = (players, partnerHistory) => {
  const pool = shuffle(players)
  const teams = []

  while (pool.length >= 2) {
    const player = pool.shift()
    const partnerIndex = pool.findIndex(
      (candidate) => !partnerHistory.has(`${player.id}:${candidate.id}`)
    )
    const partner =
      partnerIndex === -1 ? pool.shift() : pool.splice(partnerIndex, 1)[0]

    teams.push([player, partner])
    partnerHistory.add(`${player.id}:${partner.id}`)
    partnerHistory.add(`${partner.id}:${player.id}`)
  }

  return teams
}

const splitIntoTeamsWithConstraints = (
  players,
  winnersSet,
  partnerHistory
) => {
  const pool = shuffle(players)
  const teams = []

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
    partnerHistory.add(`${player.id}:${partner.id}`)
    partnerHistory.add(`${partner.id}:${player.id}`)
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

  const registerPlayer = (player, updates) => {
    updatedPlayers.set(player.id, {
      ...player,
      winStreak: updates.winStreak,
      gamesPlayed: updates.gamesPlayed,
      location: updates.location,
    })
  }

  const handleCourt = (courtName, winners, losers) => {
    winners.forEach((player) => {
      const nextStreak = (player.winStreak ?? 0) + 1
      const nextGames = (player.gamesPlayed ?? 0) + 1
      if (nextStreak >= 2) {
        registerPlayer(player, {
          winStreak: 0,
          gamesPlayed: nextGames,
          location: 'queue',
        })
        queue.push({ ...player, winStreak: 0, gamesPlayed: nextGames })
      } else {
        registerPlayer(player, {
          winStreak: nextStreak,
          gamesPlayed: nextGames,
          location: courtName,
        })
      }
    })

    losers.forEach((player) => {
      const nextGames = (player.gamesPlayed ?? 0) + 1
      registerPlayer(player, {
        winStreak: 0,
        gamesPlayed: nextGames,
        location: 'queue',
      })
      queue.push({ ...player, winStreak: 0, gamesPlayed: nextGames })
    })
  }

  handleCourt('champions', results.champions.winners, results.champions.losers)
  handleCourt('battlefield', results.battlefield.winners, results.battlefield.losers)

  return {
    ...state,
    queue,
    updatedPlayers,
  }
}

const buildNextRound = (state, results) => {
  const applied = applyRoundResults(state, results)
  const queue = prioritizeQueue(applied.queue)
  const partnerHistory = state.partnerHistory ?? new Set()

  const eligibleChampionsWinners = results.champions.winners.filter(
    (player) => (player.winStreak ?? 0) < 2
  )
  const eligibleBattlefieldWinners = results.battlefield.winners.filter(
    (player) => (player.winStreak ?? 0) < 2
  )

  const championsPool = []
  const battlefieldPool = []

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
