# Progressive Play Engine

Implementation: `src/match-engines/v2/ProgressivePlay.engine.js`

Tests: `src/match-engines/v2/__tests__/ProgressivePlay.engine.test.js`

UI integration: `src/components/v2/AppV2.jsx`, `src/components/v2/V2CourtsView.jsx`

---

# Overview

Progressive Play is a doubles pickleball format where players are grouped by skill level and recent performance.

The primary goals are:

1. Honor requested partner pairings.
2. Distribute games fairly across the roster (`gamesPlayed`).
3. Match players against opponents of similar skill level.
4. Match players against opponents with similar performance.
5. Maximize partner diversity.
6. Minimize repeated opponents.
7. Keep matches competitive.

The engine runs when the organizer clicks **Generate All Courts** or refreshes a single court after scoring.

---

# Priority Order

The engine must prioritize constraints in the following order:

1. Requested Partner Pairings
2. Games-Played Fairness (who enters the generation pool)
3. Skill Group Integrity
4. Similar Performance Scores
5. Partner Diversity
6. Opponent Diversity
7. Competitive Balance
8. Cooldown (rest recently finished players when alternatives exist)

Higher-priority constraints should always override lower-priority constraints.

Fairness runs **before** team building and match generation. Diversity and performance rules apply only to players already selected for the round.

---

# Skill Levels

Players have one of the following skill levels:

* Beginner
* Novice
* Intermediate
* Advanced

Create two skill groups.

## Group 1

* Beginner
* Novice

## Group 2

* Intermediate
* Advanced

Players should remain within their skill group whenever possible.

---

# Requested Partner Support

Some players may request to play together.

Example:

Player A = Novice

Player B = Intermediate

These players become a locked team.

---

## Locked Team Rules

Locked teams:

* Must never be separated.
* Must always play on the same side.
* Must always be assigned to the same court.
* Override partner rotation rules.
* Override partner diversity rules.

Treat locked teams as a single unit throughout match generation.

---

## Locked Team Skill Level

The team's skill level is determined by the highest skill level among its members.

Examples:

Beginner + Novice = Novice

Novice + Intermediate = Intermediate

Intermediate + Advanced = Advanced

Advanced + Beginner = Advanced

Example:

Novice + Intermediate

becomes

Intermediate

and should compete within the Intermediate/Advanced group.

---

## Locked Team Performance Score

Each player has:

```javascript
performanceScore = wins - losses
```

Team performance score:

```javascript
teamPerformanceScore =
    (player1.performanceScore +
     player2.performanceScore) / 2
```

Example:

Player A score = 2

Player B score = 0

Team score = 1

---

# Player Statistics

Each player should maintain:

```javascript
{
    id,
    name,
    skillLevel,
    teammateId,      // mutual lock with another player, or null
    checkedIn,
    queueOrder,      // check-in order (used on first round only)

    wins,
    losses,
    gamesPlayed,     // incremented after every completed match

    partnerCounts,   // { [partnerId]: count }
    opponentCounts,  // { [opponentId]: count }
}
```

---

# Performance Score

Calculate:

```javascript
performanceScore = wins - losses
```

Examples:

```text
5-1 = 4
4-2 = 2
3-3 = 0
2-4 = -2
1-5 = -4
```

This score determines future match groupings.

---

# Games-Played Fairness

When more players are checked in than can fit on courts, the engine pre-selects a pool of players before building teams.

## Pool size

```javascript
neededPlayers = courtSlots * 4 + bufferSize
```

| Mode | `courtSlots` | Buffer | Example (2 courts) |
|------|--------------|--------|--------------------|
| Generate All | session court count | +4 | 2 × 4 + 4 = **12** players enter the engine |
| Single-court refresh | session court count for fairness ranking | +2 when assigning 1 court | fairness ranked for 2 courts; 1 court assigned |

The buffer gives the engine spare players to absorb skill-group splits. Single-court refresh uses a smaller buffer because selecting 8 players when only 4 can play guarantees unnecessary overflow sit-outs.

## Phase 1 — not everyone has played yet

While any checked-in player still has `gamesPlayed === 0`:

* Sort by fewest games first (0-game players first).
* Apply cooldown when enough rested players exist.
* Take the first `neededPlayers` from that sorted pool.

## Phase 2 — everyone has at least one game

Once every checked-in player has `gamesPlayed >= 1`:

* Locked pairs are treated as **2-slot units** (never split).
* Locked pairs and solo players are **interleaved** into one list sorted by average / individual `gamesPlayed` ascending.
* Cooldown players sort after rested players at the same game count.
* Fill slots from that list until `neededPlayers` is reached.

Previously, all locked pairs consumed slots before any solo player. That could widen the games gap when a high-game locked pair played while low-game solos sat out. Interleaving fixes that.

## Cooldown

Players who appeared in the most recent `courtSlots` match-history entries are on cooldown.

* Cooldown applies in both Phase 1 and Phase 2.
* Rested players are preferred when enough exist to fill courts.
* Cooldown players are pulled in only when the rested pool is too small.

For per-court refresh, cooldown uses the **session** court count (`cooldownCourts`), not the single court being generated.

## Global fairness on per-court refresh

When only one court is refreshed after a score:

1. Run fairness on **all** checked-in players using the session court count.
2. Exclude players already assigned to **other** courts via `excludePlayerIds`.
3. Generate a match for the empty court from the remaining eligible pool.

This matches the **Up Next** display in Courts View, which already ranks the full eligible roster. Players on other courts still participate in fairness ranking even though they are not reassigned.

---

# Sit-Out Types

Not every sit-out means the same thing. `generateMatches` combines three buckets:

| Type | Cause | Counts toward `gamesPlayed`? |
|------|-------|------------------------------|
| `fairnessSitOuts` | Never entered the pre-selection pool (too many players, too many games) | No |
| `teamBuildSitOuts` | Selected by fairness but odd leftover within a skill group after pairing | No |
| `overflowSitOuts` | Valid match formed but no court slot, or unmatched lone team | No |

Only players who finish a match get `gamesPlayed += 1` via `applyMatchResult`.

Diagnostic fields on the return value (for tests and debugging):

```javascript
{
  courts,
  sitOuts,              // all three buckets combined
  _fairnessSitOuts,
  _teamBuildSitOuts,
  _overflowSitOuts,
}
```

`teamBuildSitOuts` are the main reason a tight `gamesPlayed` spread of exactly ±0 cannot always be guaranteed: a player can be fairness-selected every round but still fail to play because their skill group has an odd count after wins/losses shift levels.

---

# Check-In Order (First Round Only)

When **all** checked-in players have `gamesPlayed === 0`, there is no match history, and there is no partner/opponent history, the engine seats players by `queueOrder` instead of random pairing.

Check-in order applies separately within each skill group. It is disabled once any player has history.

---

# Match Generation Flow

## Step 1

Identify all locked teams.

Example:

```text
A + B
E + F
```

---

## Step 2

Remove locked players from the available player pool.

Example:

```text
All Players

A B C D E F G H I J
```

After removing locked players:

```text
C D G H I J
```

---

## Step 3

Create Team Units

Every match-generation unit should become either:

### Locked Team

```javascript
{
    players: [A, B],
    locked: true
}
```

### Generated Team

```javascript
{
    players: [C, D],
    locked: false
}
```

After this step, all units should be treated equally.

---

## Step 4

Generate Teams for Remaining Players

For players not in locked teams:

Generate teams while maximizing partner diversity.

Do not simply pair players randomly.

Partner history should be considered.

---

## Partner Rotation Rule

A player should not receive the same partner again until they have partnered with every other eligible player in their current skill group.

Example:

Players:

```text
A B C D E
```

If A has already partnered with:

```text
B
C
D
```

then A should partner with:

```text
E
```

before repeating B, C, or D.

---

## Partner Priority

When evaluating possible pairings:

1. Never partnered before
2. Least frequently partnered
3. Lowest opponent repetition

Partner diversity is extremely important.

---

## Step 5

Determine Team Skill Level

For every team:

```javascript
teamSkillLevel =
    highestSkillLevel(team.players)
```

Examples:

```text
Beginner + Novice = Novice

Novice + Intermediate = Intermediate

Intermediate + Advanced = Advanced
```

---

## Step 6

Determine Team Performance Score

For every team:

```javascript
teamPerformanceScore =
    average(player.performanceScore)
```

---

## Step 7

Group Teams by Skill Group

Group 1:

```text
Beginner
Novice
```

Group 2:

```text
Intermediate
Advanced
```

Teams should only be matched against teams in the same skill group whenever possible.

---

## Step 8

Sort Teams by Performance

Within each skill group:

```text
Highest performance score first
Lowest performance score last
```

Example:

```text
Score 4
Team A

Score 3
Team B

Score 2
Team C

Score 1
Team D
```

---

## Step 9

Create Performance Buckets

Group teams with similar performance scores together.

Teams with similar scores should play each other whenever possible.

---

## Step 10

Merge Small Buckets

A doubles match requires:

```text
2 teams
4 players
```

If a bucket contains fewer than 2 teams:

Merge it with the nearest bucket.

Example:

```text
Score 4
Team A

Score 3
Team B
```

Becomes:

```text
Team A vs Team B
```

Continue merging until valid matches can be formed.

---

## Step 11

Generate Matches

Within each merged bucket:

Create matches between teams.

Prefer:

* Similar performance scores
* New opponents
* Minimal opponent repetition

---

# Opponent Rotation

Track:

```javascript
opponentCounts
```

Prefer:

```text
New opponents
```

over:

```text
Repeated opponents
```

whenever possible.

---

# Penalty System

When evaluating possible teams and matches:

## Partner Penalty

```text
Never partnered = 0

Partnered once = +100

Partnered twice = +200

Partnered three times = +300
```

---

## Opponent Penalty

```text
Never opposed = 0

Opposed once = +25

Opposed twice = +50

Opposed three times = +75
```

---

## Exact Match Repeat

If the exact same match occurred previously:

```text
A+B vs C+D
```

apply:

```text
+500
```

---

# Court Assignment

After matches are generated:

1. Valid matches are split by skill group (Group 1 vs Group 1, Group 2 vs Group 2).
2. Within each group, matches sort by combined team performance descending.
3. Courts alternate skill groups when both groups have matches: Court 1 → Group 1, Court 2 → Group 2, Court 3 → Group 1, …
4. The top `courts` matches are assigned; remaining valid matches become `overflowSitOuts`.

Higher-performing matches within a group receive lower court indices first.

Example with 2 courts and both groups active:

```text
Court 1 — highest Group 1 match
Court 2 — highest Group 2 match
```

Cross-group matches are never assigned, even if generated incorrectly upstream.

---

# Match Result Processing

After a match completes, call `applyMatchResult(players, result)`.

## Winners

```javascript
player.wins += 1
player.skillLevel = shift up one rank (Advanced stays Advanced)
player.gamesPlayed += 1
```

## Losers

```javascript
player.losses += 1
player.skillLevel = shift down one rank (Beginner stays Beginner)
player.gamesPlayed += 1
```

Skill shifts move players between Beginner ↔ Novice ↔ Intermediate ↔ Advanced. That changes skill-group sizes over time and can produce structural `teamBuildSitOuts` in later rounds.

---

## Update Partner History

```javascript
partnerCounts[partnerId] += 1
```

for both partners.

---

## Update Opponent History

```javascript
opponentCounts[opponentId] += 1
```

for all opposing players.

Persist this information for future rounds.

---

# Public API

## `generateMatches(players, options)`

```javascript
generateMatches(players, {
  courts: 2,                    // courts to assign this call (default 2)
  cooldownCourts: 2,            // optional; session court count for cooldown window
  matchHistory: [],             // prior match entries with teamAIds / teamBIds
  excludePlayerIds: ['p1'],     // optional; on other courts during per-court refresh
})
```

Returns:

```javascript
{
  courts: [{ courtIndex, teamA, teamB }],
  sitOuts: [...],
  matchHistory,
  _fairnessSitOuts: [...],
  _teamBuildSitOuts: [...],
  _overflowSitOuts: [...],
}
```

## `applyMatchResult(players, result)`

```javascript
applyMatchResult(players, {
  courtIndex: 0,
  teamAIds: ['a', 'b'],
  teamBIds: ['c', 'd'],
  winningTeam: 'A',
})
```

Returns `{ players, historyEntry }`.

---

# UI Integration (V2)

| Action | Handler | Engine call |
|--------|---------|-------------|
| Generate All Courts | `handleRefreshAll` | `generateMatches(allPlayers, { courts: numberOfCourts, matchHistory })` |
| Refresh one court | `handleGenerateCourt` | `generateMatches(allPlayers, { courts: 1, cooldownCourts: numberOfCourts, matchHistory, excludePlayerIds })` |
| Up Next display | `V2CourtsView` | `selectFairnessPool(eligiblePlayers, numberOfCourts, matchHistory)` on players not currently on a court |

After scoring, the cleared court is set to `null` until the organizer refreshes it or runs Generate All.

---

# Games Spread Expectations

For large rosters (e.g. 27 players, 2 courts, ~14 rounds):

* **Target:** keep `max(gamesPlayed) - min(gamesPlayed)` as small as possible after warm-up (everyone ≥ 1 game).
* **Typical after fixes:** spread of **1–2** (most players within one game of each other).
* **Not guaranteed:** spread of exactly **0** (everyone identical). Skill-group parity, cooldown, and overflow sit-outs can leave a few players one game behind or ahead.

The pre-fix per-court refresh workflow (fairness computed on a subset of players) could produce spreads of 3+ over a session. Global fairness with `excludePlayerIds` aligns refresh behavior with Generate All.

---

# Desired Outcomes

The system should naturally create the following behavior:

* Requested partners always stay together.
* Games are distributed fairly across the roster.
* Teams compete against similar skill levels.
* Teams compete against similar performance levels.
* Strong performers gradually face stronger competition.
* Lower performers gradually face opponents with similar results.
* Partnerships remain fresh.
* Opponent repetition is minimized.
* Recently finished players rest when enough alternatives exist.
* Match quality improves throughout the session.
* Refresh generates a new set of courts using the latest results and player history.

The engine must always generate valid matches, even if some constraints must be relaxed.
