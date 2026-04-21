# Match Engine Documentation

This document describes the match engine logic implemented in `src/matchEngine.js`
and how it is used by the app to build courts and teams.

## Player model (engine fields)

The match engine expects player objects with the following fields:

- `id` (string): Unique player identifier.
- `name` (string): Display name for roster and team labels.
- `duprRating` (string or number): Primary rating used for seeding.
- `clubRating` (string or number): Secondary rating used if no DUPR.
- `gamesPlayed` (number): Total games played.
- `queueOrder` (number): Stable queue order for tie breaks.
- `winStreak` (number): Current consecutive wins (used for rotation logic).

The UI extends these objects with additional fields like `wins`, `losses`,
`pointsFor`, and `pointsAgainst`, but those are used for standings rather
than court assignment.

## Courts and pools

The engine models two courts:

- `champions` (Champions Court)
- `battlefield` (Battlefield Court)

Each court is filled with 4 active players per round (2 teams of 2). The
engine also maintains a queue for players who are waiting to rotate in.

## Core algorithms

### Sorting players by skill

`sortPlayersBySkill(players)` sorts players in descending order by:

1. `duprRating` (if present), otherwise
2. `clubRating` (if present), otherwise
3. `name` (alphabetical)

This is used to seed the initial court pools and to break ties in queue
selection.

### Initial state

`createInitialState(players, options)` sorts the full roster, then:

- First 8 players go to `champions`
- Next 8 players go to `battlefield`
- Remaining players go to the `queue`

The function also initializes `partnerHistory` and stores optional court
labels (`DEFAULT_COURTS`) in `state.options.courts`.

### Building teams for a round

`buildRoundFromPlayers(championsPlayers, battlefieldPlayers, partnerHistory)`
shuffles each pool and forms teams of two. Pairing attempts to avoid repeat
partners by checking `partnerHistory`.

`assignCourtsForRound(state)` does the same pairing, but reads the current
players already assigned to each court.

### Applying results

`applyRoundResults(state, results)` updates players based on winners/losers:

- All players get `gamesPlayed + 1`.
- Winners get `winStreak + 1`.
- Losers reset `winStreak` to `0` and go to the queue.
- Winners who reach `winStreak >= 2` also reset their streak and go to the queue.
- Everyone who moves to the queue is appended (preserving order).

This creates the "two wins then rotate out" rule.

### Building the next round

`buildNextRound(state, results)`:

1. Calls `applyRoundResults`.
2. Prioritizes the queue with `prioritizeQueue`.
3. Keeps eligible winners (those with `winStreak < 2`) on court.
4. Fills remaining court spots from the queue.
5. Rebuilds teams using `splitIntoTeamsWithConstraints`, which avoids:
   - Repeat partners (via `partnerHistory`)
   - Pairing two winners together on the same team

### Queue prioritization

`prioritizeQueue(queue)` keeps play balanced by:

- Finding the minimum `gamesPlayed` in the queue.
- Prioritizing players whose `gamesPlayed` is within 2 games of that minimum.
- Sorting by `gamesPlayed`, then `queueOrder`.

Players who are far ahead in games played are moved to the end.

### Refilling courts

`refillCourts(state, promotedPlayers)` is a helper that:

- Starts `champions` with any promoted players.
- Fills the rest of `champions` up to 8 from the queue.
- Fills `battlefield` up to 8 from the remaining queue.

### Formatting output

`formatRoundOutput(round)` converts each team into a string in the form:

```
Player A / Player B
```

This is used for display purposes when needed.

## App integration

The app uses two exported helpers directly:

- `sortPlayersBySkill` for seeding rotation pools.
- `buildRoundFromPlayers` for creating the court matchups shown on the UI.

The rest of the engine is available for future expansion, such as persisting
state across rounds or running automated round generation.
