# Match Engine Documentation

This app no longer uses a single monolithic `src/matchEngine.js`.
Match generation is orchestrated in `src/App.jsx` and delegated to small,
game-type-specific helpers in `src/match-engines/`.

## Current architecture

### Core app responsibilities (`src/App.jsx`)

- Maintains player/session state and score history.
- Manages dynamic court count (`numberOfCourts`, 1 to 10).
- Renders only fillable courts:
  `visibleCourtCount = min(numberOfCourts, floor(checkedInCount / 4))`.
- Selects generation branch by game type and format.
- Applies fairness rules, holds, and cooldown where relevant.

### Engine responsibilities (`src/match-engines/*`)

Engines are now intentionally small, court-agnostic primitives. The app selects
players for a court, then asks the engine to split them into teams.

Current exports used by the app:

- `buildCourtTeams(players, partnerHistoryOrMap)`
- `enforceExclusivePlayers(players, exclusiveIds)`

## Game-type behavior

## Format availability matrix

- `Split & Stay (DUPR)` (`gameType='claim'`): random teams only
- `Round Robin (Bagging Nights)` (`gameType='round-robin'`): custom teams only
- `Open Rotation (Non-DUPR)` (`gameType='open-rotation'`): random teams only

`GameSetupView` enforces these combinations by disabling unsupported format
buttons for each game type.

## 1) Split & Stay (DUPR) (`gameType='claim'`, random teams)

Files:

- `src/App.jsx`
- `src/match-engines/SplitStayDoublesRandom.engine.js`

Behavior:

- Per-court hold logic is handled in `App.jsx`.
- Winners can stay for one additional match (`winStreak < 2`).
- When two winners stay on a court, they are forced onto opposing teams in the
  next generated matchup for that same court.
- New players are pulled from queue-style ordering with fairness/cooldown rules.
- The engine only forms teams from the selected 4 players.

## 2) Round Robin (Bagging Nights) (`gameType='round-robin'`, custom teams)

Files:

- `src/App.jsx`
- `src/match-engines/RoundRobinDoublesCustomTeams.engine.js`

Behavior:

- Teams are built from player `teamName` pairs.
- The app avoids previously played team-vs-team combinations using
  `playedMatchups`.
- Pair selection prefers fairness (lowest combined/max games among available
  non-repeated pairings).
- In multi-court sessions, "no pair available right now" is treated as a
  temporary scheduling condition (toast), not automatic completion.
- Round-robin completion is driven by global remaining pairs
  (`roundRobinRemainingPairs === 0`).

## 3) Open Rotation (Non-DUPR) (`gameType='open-rotation'`, random teams)

Files:

- `src/App.jsx`
- `src/match-engines/WinnerLoserQueueDoubles.engine.js`

Behavior:

- Queue/fairness-first player picking with rolling cooldown.
- Prioritizes zero-game players before general queue order where possible.
- Uses global partner-memory windows to reduce immediate repeat pairings.
- No per-court winner holds.

## Player fields used by generation

Commonly used fields include:

- `id`, `name`, `checkedIn`
- `gamesPlayed`, `queueOrder`, `winStreak`
- `gender` (used by some team-balancing heuristics)
- `teamName` (round robin custom teams)

Standing fields (`wins`, `losses`, `pointsFor`, `pointsAgainst`,
`pointDifferential`) are updated from score submission and are used for ranking,
not direct court eligibility.

## Dynamic court labels

Court labels are generated as:

- `Court 1`, `Court 2`, ..., `Court N`

There are no longer hardcoded "Champions Court" or "Battlefield Court" labels
in active app logic.
