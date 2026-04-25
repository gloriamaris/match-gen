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

const getSortRating = (player) => {
  const primary = getPrimaryRating(player)
  if (primary !== null) return primary
  const secondary = getSecondaryRating(player)
  return secondary ?? -Infinity
}

const sortPlayersBySkill = (players) => {
  return [...players].sort((a, b) => {
    const ratingA = getSortRating(a)
    const ratingB = getSortRating(b)

    if (ratingB !== ratingA) {
      return ratingB - ratingA
    }

    const gamesA = a.gamesPlayed ?? 0
    const gamesB = b.gamesPlayed ?? 0
    if (gamesA !== gamesB) {
      return gamesA - gamesB
    }

    return a.name.localeCompare(b.name)
  })
}

const sortQueue = (queue) => {
  return [...queue].sort((a, b) => {
    const gamesA = a.gamesPlayed ?? 0
    const gamesB = b.gamesPlayed ?? 0
    if (gamesA !== gamesB) return gamesA - gamesB

    const orderA = a.queueOrder ?? 0
    const orderB = b.queueOrder ?? 0
    if (orderA !== orderB) return orderA - orderB

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

const dedupePlayers = (players) => {
  const seen = new Set()
  const unique = []
  players.forEach((player) => {
    if (!player || seen.has(player.id)) return
    seen.add(player.id)
    unique.push(player)
  })
  return unique
}

const getGender = (player) => (player?.gender || '').toUpperCase()

const findPreferredPartner = (pool, player, canPair) => {
  const playerGender = getGender(player)
  const wantsOpposite = playerGender === 'M' || playerGender === 'F'
  if (!wantsOpposite) {
    return pool.findIndex((candidate) => canPair(candidate))
  }
  const opposite = playerGender === 'M' ? 'F' : 'M'
  const oppositeIndex = pool.findIndex(
    (candidate) => getGender(candidate) === opposite && canPair(candidate)
  )
  if (oppositeIndex !== -1) return oppositeIndex
  return pool.findIndex((candidate) => canPair(candidate))
}

const registerLastPartner = (lastPartners, player, partner) => {
  if (!lastPartners) return
  lastPartners.set(player.id, partner.id)
  lastPartners.set(partner.id, player.id)
}

const canPairImmediately = (lastPartners, player, partner) => {
  if (!lastPartners) return true
  return lastPartners.get(player.id) !== partner.id
}

const splitIntoTeams = (players, lastPartners) => {
  const pool = shuffle(dedupePlayers(players))
  const teams = []

  while (pool.length >= 2) {
    const player = pool.shift()
    const partnerIndex = findPreferredPartner(pool, player, (candidate) =>
      candidate.id !== player.id &&
      canPairImmediately(lastPartners, player, candidate)
    )
    const partner =
      partnerIndex === -1 ? pool.shift() : pool.splice(partnerIndex, 1)[0]

    if (!partner || partner.id === player.id) continue
    teams.push([player, partner])
    registerLastPartner(lastPartners, player, partner)
  }

  return teams
}

const splitIntoTeamsWithConstraints = (
  players,
  winnersSet,
  lastPartners
) => {
  const pool = shuffle(dedupePlayers(players))
  const teams = []

  while (pool.length >= 2) {
    const player = pool.shift()
    const isWinner = winnersSet.has(player.id)
    const partnerIndex = findPreferredPartner(pool, player, (candidate) => {
      if (candidate.id === player.id) return false
      if (!canPairImmediately(lastPartners, player, candidate)) return false
      if (isWinner && winnersSet.has(candidate.id)) return false
      return true
    })
    const partner =
      partnerIndex === -1 ? pool.shift() : pool.splice(partnerIndex, 1)[0]

    if (!partner || partner.id === player.id) continue
    teams.push([player, partner])
    registerLastPartner(lastPartners, player, partner)
  }

  return teams
}

const takeFromQueue = (queue, count) => {
  const ordered = sortQueue(queue)
  const selected = ordered.slice(0, count)
  const selectedIds = new Set(selected.map((player) => player.id))
  const remaining = ordered.filter((player) => !selectedIds.has(player.id))
  return { selected, remaining }
}

const buildRoundFromPlayers = (
  championsPlayers,
  battlefieldPlayers,
  lastPartners = new Map()
) => {
  return {
    champions: splitIntoTeams(championsPlayers, lastPartners),
    battlefield: splitIntoTeams(battlefieldPlayers, lastPartners),
  }
}

const createInitialState = (players, options = {}) => {
  const eligiblePlayers = players.filter((player) => player.checkedIn)
  const sorted = sortPlayersBySkill(eligiblePlayers).map((player, index) => ({
    ...player,
    gamesPlayed: player.gamesPlayed ?? 0,
    winStreak: player.winStreak ?? 0,
    queueOrder: player.queueOrder ?? index,
  }))
  const champions = sorted.slice(0, 4)
  const battlefield = sorted.slice(4, 8)
  const queue = sorted.slice(8)

  return {
    courts: {
      champions,
      battlefield,
    },
    queue,
    lastPartners: new Map(),
    nextQueueOrder: sorted.length,
    options: {
      courts: DEFAULT_COURTS,
      ...options,
    },
  }
}

const assignCourtsForRound = (state) => {
  const { courts, lastPartners } = state
  const championsPlayers = courts.champions.slice(0, 4)
  const battlefieldPlayers = courts.battlefield.slice(0, 4)

  return {
    champions: splitIntoTeams(championsPlayers, lastPartners),
    battlefield: splitIntoTeams(battlefieldPlayers, lastPartners),
  }
}

const applyRoundResults = (state, results) => {
  const updatedPlayers = new Map()
  const queue = [...state.queue]
  let nextQueueOrder = state.nextQueueOrder ?? queue.length
  const stayingWinners = { champions: [], battlefield: [] }

  const pushToQueue = (player) => {
    queue.push({
      ...player,
      queueOrder: nextQueueOrder,
    })
    nextQueueOrder += 1
  }

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
      const nextGames = (player.gamesPlayed ?? 0) + 1
      const nextStreak = (player.winStreak ?? 0) + 1

      if (nextStreak >= 2) {
        pushToQueue({
          ...player,
          winStreak: 0,
          gamesPlayed: nextGames,
        })
        registerPlayer(player, {
          winStreak: 0,
          gamesPlayed: nextGames,
          location: 'queue',
        })
      } else {
        const stayingPlayer = {
          ...player,
          winStreak: nextStreak,
          gamesPlayed: nextGames,
        }
        stayingWinners[courtName].push(stayingPlayer)
        registerPlayer(player, {
          winStreak: nextStreak,
          gamesPlayed: nextGames,
          location: courtName,
        })
      }
    })

    losers.forEach((player) => {
      const nextGames = (player.gamesPlayed ?? 0) + 1
      pushToQueue({
        ...player,
        winStreak: 0,
        gamesPlayed: nextGames,
      })
      registerPlayer(player, {
        winStreak: 0,
        gamesPlayed: nextGames,
        location: 'queue',
      })
    })
  }

  handleCourt('champions', results.champions.winners, results.champions.losers)
  handleCourt('battlefield', results.battlefield.winners, results.battlefield.losers)

  return {
    ...state,
    queue,
    updatedPlayers,
    stayingWinners,
    nextQueueOrder,
  }
}

const buildNextRound = (state, results) => {
  const applied = applyRoundResults(state, results)
  let queue = sortQueue(applied.queue)
  const lastPartners = applied.lastPartners ?? state.lastPartners ?? new Map()
  const courts = {}
  const round = {}

  ;['champions', 'battlefield'].forEach((courtName) => {
    const winners = applied.stayingWinners[courtName] ?? []
    const neededPlayers = Math.max(0, 4 - winners.length)
    const { selected, remaining } = takeFromQueue(queue, neededPlayers)
    queue = remaining

    const courtPlayers = [...winners, ...selected]
    courts[courtName] = courtPlayers

    const winnersSet = new Set(winners.map((player) => player.id))
    round[courtName] = splitIntoTeamsWithConstraints(
      courtPlayers,
      winnersSet,
      lastPartners
    )
  })

  return {
    ...applied,
    queue,
    courts,
    round,
    lastPartners,
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
  formatRoundOutput,
  enforceExclusivePlayers,
}
