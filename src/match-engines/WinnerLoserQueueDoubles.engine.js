const DEFAULT_COURTS = {
  champions: 'Champions Court',
  battlefield: 'Battlefield Court',
}

const COURT_SIZE = 4

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

// Each player has one of three states based on their last match result.
// "winner"   = won their last match (winStreak > 0)
// "loser"    = played and lost their last match (gamesPlayed > 0, winStreak === 0)
// "unplayed" = checked in but never played (gamesPlayed === 0)
//
// For team-formation and queue-classification purposes, "unplayed" players
// are treated the same as losers (per the rule that mid-session check-ins
// join the back of the Losers queue), so the only meaningful distinction
// at pick-time is winner vs non-winner.
const classifyPlayer = (player) => {
  if ((player.gamesPlayed ?? 0) === 0) return 'unplayed'
  if ((player.winStreak ?? 0) > 0) return 'winner'
  return 'loser'
}

const isWinnerPlayer = (player) => classifyPlayer(player) === 'winner'

const sortByQueueOrder = (a, b) => {
  const orderA = a.queueOrder ?? 0
  const orderB = b.queueOrder ?? 0
  if (orderA !== orderB) return orderA - orderB
  return (a.name ?? '').localeCompare(b.name ?? '')
}

const getGender = (player) => (player?.gender || '').toUpperCase()

// A pair counts as gender-mixed only when both players have a recognized
// gender (M/F) and they differ. Unknown / "other" genders contribute 0 so
// they never falsely improve a partition's score.
const isMixedGenderPair = (a, b) => {
  const ga = getGender(a)
  const gb = getGender(b)
  if (!(ga === 'M' || ga === 'F')) return false
  if (!(gb === 'M' || gb === 'F')) return false
  return ga !== gb
}

// Mirrors the buildPartnerKey helper in App.jsx so engine and app produce
// matching keys for the recentPartners Set passed in by callers.
const buildPartnerKey = (firstId, secondId) => {
  if (!firstId || !secondId) return ''
  return [firstId, secondId].sort((a, b) => a.localeCompare(b)).join('::')
}

// Form two teams from 4 players. We evaluate all three possible 2-vs-2
// partitions of the four and score each by:
//   1. Mixed-gender pairs (more is better) — prioritizes M+F pairings as
//      requested, falling through to same-gender pairs only when no better
//      arrangement exists.
//   2. Fresh pairs — pairs whose two players have not partnered together
//      in the recent-partner memory window. Prevents the same 4 players
//      from being repaired the same way every round.
//   3. Winners-vs-losers separation (W+W vs L+L) — preserves the engine's
//      defining rule whenever gender preference and freshness don't
//      dictate otherwise.
// Ties are broken randomly so repeat generations stay varied.
const splitIntoTeams = (players, recentPartners = new Set()) => {
  const pool = dedupePlayers(players)
  if (pool.length < COURT_SIZE) return []

  const four = shuffle(pool.slice(0, COURT_SIZE))
  const [a, b, c, d] = four
  const partitions = [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ]

  const scoreOf = (partition) => {
    const [teamA, teamB] = partition
    const mixed =
      (isMixedGenderPair(teamA[0], teamA[1]) ? 1 : 0) +
      (isMixedGenderPair(teamB[0], teamB[1]) ? 1 : 0)
    const teamAKey = buildPartnerKey(teamA[0]?.id, teamA[1]?.id)
    const teamBKey = buildPartnerKey(teamB[0]?.id, teamB[1]?.id)
    const fresh =
      (teamAKey && !recentPartners.has(teamAKey) ? 1 : 0) +
      (teamBKey && !recentPartners.has(teamBKey) ? 1 : 0)
    const winnersInA = teamA.filter(isWinnerPlayer).length
    const winnersInB = teamB.filter(isWinnerPlayer).length
    const separation =
      (winnersInA === 2 && winnersInB === 0) ||
      (winnersInA === 0 && winnersInB === 2)
        ? 1
        : 0
    return { mixed, fresh, separation }
  }

  const scored = partitions.map((partition) => ({
    teams: partition,
    ...scoreOf(partition),
  }))

  const maxMixed = Math.max(...scored.map((s) => s.mixed))
  const topMixed = scored.filter((s) => s.mixed === maxMixed)
  const maxFresh = Math.max(...topMixed.map((s) => s.fresh))
  const topFresh = topMixed.filter((s) => s.fresh === maxFresh)
  const maxSeparation = Math.max(...topFresh.map((s) => s.separation))
  const finalists = topFresh.filter((s) => s.separation === maxSeparation)
  return shuffle(finalists)[0].teams
}

// `recentPartners` is an optional Set of partner-keys (see buildPartnerKey)
// that recently played together; the engine prefers partitions whose pairs
// avoid those keys.
const buildRoundFromPlayers = (
  championsPlayers,
  battlefieldPlayers,
  recentPartners = new Set()
) => {
  return {
    champions: splitIntoTeams(championsPlayers ?? [], recentPartners),
    battlefield: splitIntoTeams(battlefieldPlayers ?? [], recentPartners),
  }
}

// Pick `count` players for one court from the W/L queues, alternating
// W, L, W, L. When both queues are empty the court is bootstrapped from
// the check-in queue (shuffled). When one queue runs short, fall through
// to whatever queue still has players (W -> L -> check-in).
const pickCourtPlayers = (
  winnersQueue,
  losersQueue,
  checkInQueue,
  count = COURT_SIZE
) => {
  const w = [...winnersQueue]
  const l = [...losersQueue]
  const c = [...checkInQueue]

  if (w.length === 0 && l.length === 0) {
    const bootstrap = shuffle(c.slice(0, count))
    const remaining = c.slice(bootstrap.length)
    return {
      players: bootstrap,
      winnersQueue: w,
      losersQueue: l,
      checkInQueue: remaining,
    }
  }

  const picked = []
  let pickWinner = true

  while (picked.length < count) {
    let player = null
    if (pickWinner && w.length > 0) {
      player = w.shift()
    } else if (!pickWinner && l.length > 0) {
      player = l.shift()
    } else if (w.length > 0) {
      player = w.shift()
    } else if (l.length > 0) {
      player = l.shift()
    } else if (c.length > 0) {
      player = c.shift()
    } else {
      break
    }
    picked.push(player)
    pickWinner = !pickWinner
  }

  return {
    players: picked,
    winnersQueue: w,
    losersQueue: l,
    checkInQueue: c,
  }
}

const createInitialState = (players, options = {}) => {
  const eligiblePlayers = players.filter((player) => player.checkedIn)
  const seeded = [...eligiblePlayers]
    .sort(sortByQueueOrder)
    .map((player, index) => ({
      ...player,
      gamesPlayed: player.gamesPlayed ?? 0,
      winStreak: player.winStreak ?? 0,
      queueOrder: player.queueOrder ?? index,
    }))

  const checkInQueue = [...seeded]
  const championsPick = pickCourtPlayers([], [], checkInQueue, COURT_SIZE)
  const battlefieldPick = pickCourtPlayers(
    [],
    [],
    championsPick.checkInQueue,
    COURT_SIZE
  )

  return {
    courts: {
      champions: championsPick.players,
      battlefield: battlefieldPick.players,
    },
    checkInQueue: battlefieldPick.checkInQueue,
    winnersQueue: [],
    losersQueue: [],
    nextQueueOrder: seeded.length,
    options: {
      courts: DEFAULT_COURTS,
      ...options,
    },
  }
}

const assignCourtsForRound = (state) => {
  const championsPlayers = (state.courts?.champions ?? []).slice(0, COURT_SIZE)
  const battlefieldPlayers = (state.courts?.battlefield ?? []).slice(
    0,
    COURT_SIZE
  )

  return {
    champions: splitIntoTeams(championsPlayers),
    battlefield: splitIntoTeams(battlefieldPlayers),
  }
}

const applyRoundResults = (state, results) => {
  const updatedPlayers = new Map()
  const winnersQueue = [...(state.winnersQueue ?? [])]
  const losersQueue = [...(state.losersQueue ?? [])]
  let nextQueueOrder = state.nextQueueOrder ?? 0

  const registerPlayer = (player, updates) => {
    updatedPlayers.set(player.id, {
      ...player,
      winStreak: updates.winStreak,
      gamesPlayed: updates.gamesPlayed,
      location: updates.location,
    })
  }

  const handleCourt = (winners, losers) => {
    winners.forEach((player) => {
      const nextGames = (player.gamesPlayed ?? 0) + 1
      const nextStreak = (player.winStreak ?? 0) + 1
      winnersQueue.push({
        ...player,
        winStreak: nextStreak,
        gamesPlayed: nextGames,
        queueOrder: nextQueueOrder,
      })
      nextQueueOrder += 1
      registerPlayer(player, {
        winStreak: nextStreak,
        gamesPlayed: nextGames,
        location: 'queue',
      })
    })

    losers.forEach((player) => {
      const nextGames = (player.gamesPlayed ?? 0) + 1
      losersQueue.push({
        ...player,
        winStreak: 0,
        gamesPlayed: nextGames,
        queueOrder: nextQueueOrder,
      })
      nextQueueOrder += 1
      registerPlayer(player, {
        winStreak: 0,
        gamesPlayed: nextGames,
        location: 'queue',
      })
    })
  }

  handleCourt(results.champions.winners, results.champions.losers)
  handleCourt(results.battlefield.winners, results.battlefield.losers)

  return {
    ...state,
    winnersQueue,
    losersQueue,
    nextQueueOrder,
    updatedPlayers,
  }
}

const buildNextRound = (state, results) => {
  const applied = applyRoundResults(state, results)
  let { winnersQueue, losersQueue, checkInQueue } = applied
  const courts = {}
  const round = {}

  ;['champions', 'battlefield'].forEach((courtName) => {
    const picked = pickCourtPlayers(
      winnersQueue,
      losersQueue,
      checkInQueue,
      COURT_SIZE
    )
    winnersQueue = picked.winnersQueue
    losersQueue = picked.losersQueue
    checkInQueue = picked.checkInQueue
    courts[courtName] = picked.players
    round[courtName] = splitIntoTeams(picked.players)
  })

  return {
    ...applied,
    winnersQueue,
    losersQueue,
    checkInQueue,
    courts,
    round,
  }
}

const formatRoundOutput = (round) => {
  const formatTeam = (team) => team.map((player) => player.name).join(' / ')

  return {
    champions: (round?.champions ?? []).map((team) => formatTeam(team)),
    battlefield: (round?.battlefield ?? []).map((team) => formatTeam(team)),
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
  classifyPlayer,
  pickCourtPlayers,
  createInitialState,
  assignCourtsForRound,
  applyRoundResults,
  buildNextRound,
  formatRoundOutput,
  enforceExclusivePlayers,
}
