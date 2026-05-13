// Split & Stay (random pairings) engine.
//
// This engine has been intentionally trimmed to a single-court primitive.
// The host app drives the dynamic-court flow (winner pool, queue, cooldown,
// fairness, partner memory) and calls `buildCourtTeams` per court when it
// needs to materialize two doubles teams from the four players it has
// already selected.

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

// Court-agnostic primitive: produces a single court's two teams from the
// given player pool, biasing toward mixed-gender partners and against the
// supplied `lastPartners` (Map of playerId -> recent partner id).
const buildCourtTeams = (players, lastPartners = new Map()) =>
  splitIntoTeams(players ?? [], lastPartners)

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
