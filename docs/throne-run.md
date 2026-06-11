# Throne Run Engine

Implementation: `src/match-engines/v2/ThroneRun.engine.js`

Base engine: `src/match-engines/v2/ProgressivePlay.engine.js` (see [Progressive Play](progresive-play.md) for shared match-generation rules)

UI integration: `src/components/v2/AppV2.jsx`, `src/components/v2/V2CourtsView.jsx`, `src/components/v2/V2GameSetupPage.jsx`

---

# Overview

Throne Run is a doubles pickleball format built on top of Progressive Play.

The core difference is **court continuity**: after a match is scored, one winner (the throne holder) stays on the same court on refresh, receives new partners from the queue, and may leave after hitting the win streak limit. The other winner and all losers leave the court.

Progressive Play clears the court after scoring and waits for a manual refresh. Throne Run also clears the court after scoring; the organizer refreshes a court to run throne rotation and assign new partners.

Primary goals:

1. Reward winners by keeping one player on court (after refresh).
2. Rotate partners each round so winners do not keep the same teammate.
3. Pull new partners from the fairness queue with skill-level matching.
4. Avoid repeat partners when possible (same fresh-first rule as Progressive Play).
5. Optionally cap how long a player can remain on court via a **win streak** limit.
6. Reuse Progressive Play for initial court generation, fairness, cooldown, and stat tracking.

The engine runs when the organizer refreshes a single court or submits a score (stats only; court generation happens on refresh).

---

# Relationship to Progressive Play

Throne Run is a thin extension of Progressive Play.

| Concern | Progressive Play | Throne Run |
|---------|------------------|------------|
| Initial / manual court generation | `generateMatches` | Same — re-exported from PP; AppV2 imports PP directly |
| Match result stats | `applyMatchResult` | Custom `applyMatchResult` with win-streak and medal tracking |
| After scoring | Court cleared (`null`) | Court cleared (`null`); refresh runs throne rotation |
| Extra player fields | — | `currentWinStreak`, `medals` |

Everything documented in [Progressive Play](progresive-play.md) — skill groups, locked partners, games-played fairness, cooldown, partner/opponent diversity, performance scoring — still applies to Throne Run **except** the post-score court behavior described below.

---

# Game Flow

## Session setup

On the Game Setup page, the organizer selects:

* **Game Type:** Throne Run
* **Win Streak:** `0`–`5` (stored in local storage as `matchGen.v2.winStreak`)

`Win Streak` is the maximum consecutive wins a player may hold before being **ejected** from the court. A value of `0` disables ejection (streaks are still tracked for display).

## Generate courts

Court generation is per-court only (there is no **Generate All Courts** button in V2):

* **Refresh one court** — generates a single court. For Throne Run, if that court has a recent scored match with **two** non-ejected winners, `generateCourtAfterScore` runs throne rotation (2-winner path, or 1-winner path after `selectPrimaryThroneWinner` when promotion split them across skill groups). If fewer than two winners stay (ejection) or there is no scored match on that court, Progressive Play's `generateMatches` fills the slot (using global fairness with `excludePlayerIds` for players on other courts).

## Score a match

When a score is submitted in Throne Run mode:

1. `applyMatchResult` updates player stats and returns `ejectedWinnerIds`.
2. The scored court is cleared (`null`).
3. Match history stores `ejectedWinnerIds` on the entry for use on the next refresh.

The organizer refreshes the court to build the next matchup.

```text
Match ends → applyMatchResult
           → court cleared
           → history saved (includes ejectedWinnerIds)

Refresh court → last match on this court?
                    yes + 2 staying winners → generateCourtAfterScore (2 winners)
                         └ same skill group → throne rotation
                         └ diff skill groups (returns null) → selectPrimaryThroneWinner
                                                              → generateCourtAfterScore (1 winner)
                    yes + 0 or 1 staying winner (ejection)  → generateMatches (PP)
                    no scored match / generation fails      → generateMatches (PP)
                    still null after PP                     → generateFallbackCourtByPriority
                    still null after fallback               → error modal
```

## Throne rotation rule

After each scored match on a court:

* Both **non-ejected** winners remain on that court (if in the same skill group).
* They are placed on **opposing teams** (they were partners; they become opponents).
* Each winner receives one **new partner** drawn from the available queue.
* If the two winners are in **different skill groups** after promotion, refresh runs `selectPrimaryThroneWinner` to pick one sole throne holder (lowest `gamesPlayed`, tie-break: higher skill). The other returns to the queue.
* Losers leave the court and re-enter the fairness pool for future assignments.

---

# Win Streak and Ejection

Each player tracks `currentWinStreak` — consecutive wins without a loss.

## On a win

```javascript
player.wins += 1
player.skillLevel = shift up one rank
player.currentWinStreak += 1
player.gamesPlayed += 1
```

Scoring only applies the +1 skill shift. If that leaves the two winners in different skill groups (e.g. Beginner→Novice and Novice→Intermediate), **refresh** (not scoring) resolves it: `generateCourtAfterScore` with two IDs returns `null`, then `selectPrimaryThroneWinner` picks one throne holder and single-winner rotation runs (1 winner + 3 new partners from the holder's group). The other winner returns to the queue.

```javascript
// Example: Beginner winner → Novice (Group A), Novice winner → Intermediate (Group B)
// On refresh: selectPrimaryThroneWinner picks one; generateCourtAfterScore runs with 1 winner ID
```

## On a loss

```javascript
player.losses += 1
player.skillLevel = shift down one rank
player.currentWinStreak = 0
player.gamesPlayed += 1
```

## Ejection (when `maxWinStreak > 0`)

When a winner's new streak reaches `maxWinStreak`:

```javascript
player.currentWinStreak = 0   // streak resets after completing the run
player.medals += 1            // one medal per completed streak
// player ID added to ejectedWinnerIds
```

Ejected winners **do not** stay on court, even though they won the match. The UI treats them like any other departing player.

### Ejection outcomes

| Winners after match | Ejected | Court result |
|---------------------|---------|--------------|
| 2 | 0 | Refresh runs throne rotation (`generateCourtAfterScore`) |
| 2 | 1 | Refresh uses PP `generateMatches` (only 1 staying winner — throne rotation requires 2) |
| 2 | 2 | Refresh uses PP `generateMatches` (both ejected) |

The engine's 1-winner `generateCourtAfterScore` path exists for **split-group** fallback only. AppV2 does not invoke it when ejection leaves a single winner; it always falls back to Progressive Play in that case.

Partner and opponent counts are updated the same way as Progressive Play for all four players in the match.

## Medal Cooldown (per-court sit-out)

When a player earns a medal (streak hits `maxWinStreak`), they must sit out the next **2 matches scored on that court** before they are eligible to play on it again.

```javascript
player.medalCooldownCourt = courtIndex   // court where the medal was earned
player.medalCooldownRemaining = 2        // matches to sit out on that court
```

**Per-court behavior:** The cooldown only affects the court where the medal was earned. The player remains eligible for other courts.

**Decrement:** Each time a match is scored on Court X, all players whose `medalCooldownCourt === X` have their `medalCooldownRemaining` decremented by 1. When it reaches 0, both fields are cleared (`medalCooldownCourt = null`, `medalCooldownRemaining = 0`).

**Exclusion during generation:** When refreshing Court X, any player with an active medal cooldown on Court X is silently excluded from all generation paths (Throne rotation, Progressive Play, and Fallback). No UI indicator is shown.

**Timing:** The decrement applies only to players who had a pre-existing cooldown before the current match. A player who earns a medal in the current match starts with `medalCooldownRemaining = 2` and does not have it immediately decremented by that same match.

---

# Player Statistics

Throne Run uses all Progressive Play player fields plus:

```javascript
{
    // ... standard PP fields (id, name, skillLevel, wins, losses, gamesPlayed, etc.)

    currentWinStreak,        // consecutive wins; reset on loss or ejection
    medals,                  // count of completed win-streak runs (ejection events)
    medalCooldownCourt,      // court index with active sit-out, or null
    medalCooldownRemaining,  // matches left to sit out on that court (0 when inactive)
}
```

New players start with `currentWinStreak: 0`, `medals: 0`, `medalCooldownCourt: null`, and `medalCooldownRemaining: 0`.

---

# generateCourtAfterScore

Builds the next matchup on a court when the organizer clicks **Refresh** after a scored match (or falls back to Progressive Play for first-time / non-throne fills).

## Inputs

```javascript
generateCourtAfterScore(allPlayers, {
  winnerIds,        // 1 or 2 IDs — non-ejected winners only
  courtMatchups,    // other courts only; scored court should be null
  matchHistory,     // includes the match just scored
  courts,           // session court count (for cooldown window)
})
```

## Preconditions (returns `null` if any fail)

**2 winners:**

1. `winnerIds.length === 2`
2. Both winner IDs resolve to checked-in players
3. Both winners are in the **same skill group** (Beginner/Novice vs Intermediate/Advanced)
4. At least **two** additional checked-in players are available in that skill group
5. A valid partner pair can be selected from the pool

**1 winner (split-group fallback in engine; AppV2 only calls this path after `selectPrimaryThroneWinner`, not after ejection):**

1. `winnerIds.length === 1` (also rejects `0` or `3+` IDs)
2. The winner ID resolves to a checked-in player
3. At least **three** additional checked-in players are available in the winner's skill group
4. A valid partner + 2 opponents can be selected from the pool

When `null` is returned, the caller clears the court.

## Available pool

Candidates must be:

* `checkedIn === true`
* Not on any court (other courts from `courtMatchups` plus the winner(s))
* In the same skill group as the winner(s)

Cooldown is applied the same way as Progressive Play: players from the most recent `courts` history entries are on cooldown. Rested players are preferred over cooldown players.

## Partner assignment

**2 winners** — fixed on opposite sides:

```text
Team A: winner1 + partner1
Team B: winner2 + partner2
```

**1 winner** (split-group fallback) — winner on team A:

```text
Team A: winner + partner
Team B: opponent1 + opponent2
```

The partner is selected fresh-first (prefer players who haven't teamed with the winner). Opponents are sorted by rested > cooldown, then lowest `gamesPlayed`.

Partner selection follows Progressive Play's **fresh-first** rule via `hasPartneredBefore` (checks `partnerCounts` on both players):

```javascript
hasPartneredBefore(a, b) =
  (a.partnerCounts[b.id] || 0) > 0 ||
  (b.partnerCounts[a.id] || 0) > 0
```

### Tiered pool (skill level before cooldown)

When not enough partners exist at the winners' skill level, the engine expands the pool in this order — trying a valid assignment at each step before moving on:

| Step | Source | Skill level vs winner |
|------|--------|------------------------|
| 1 | Rested | Same |
| 2 | Rested | Below (within group) |
| 3 | Rested | Above (within group) |
| 4 | Cooldown | Below |
| 5 | Cooldown | Above |
| 6 | Cooldown | Same (recent losers — last resort) |

This avoids pulling a player who just finished (e.g. a same-level loser on cooldown) when a rested player at a lower or higher level is available.

Within each expanded pool, assignments use the fresh-first rule below, then `findBestPartnerPair` for the lowest combined score.

### Fresh-first (same as Progressive Play)

1. **Try a fully fresh assignment** — evaluate ordered pairs `(partner1, partner2)` from the pool where neither candidate has partnered with their assigned winner before.
2. **Fallback only when necessary** — if no fully fresh assignment exists, search the full pool and allow repeat partners.

Within each pass, `findBestPartnerPair` picks the assignment with the lowest combined `candidateScore`.

### Partner priority (`partnerPriority`)

For each winner–candidate pair, skill rank is compared (Beginner < Novice < Intermediate < Advanced):

| Priority | Condition | Meaning |
|----------|-----------|---------|
| 0 | Same rank as winner | Best — level-matched partner |
| 1 | Lower rank than winner | Acceptable within the group |
| 2 | Higher rank than winner | Last resort |

### Candidate score

```javascript
candidateScore(winner, candidate) =
    partnerPriority(winner, candidate) * 10000
  + (candidate.gamesPlayed || 0)
```

Lower score is better. Within the same priority tier, players with fewer `gamesPlayed` are preferred (fairness).

The winning assignment minimizes:

```javascript
candidateScore(winner1, partner1) + candidateScore(winner2, partner2)
```

Repeat partners are never chosen when a fresh assignment is available — matching Progressive Play's pairing constraint, not a soft penalty score.

## Output

```javascript
{
  teamA: [winner1, bestPartner1],   // player objects
  teamB: [winner2, bestPartner2],
}
```

---

# Public API

## `generateMatches(players, options)`

Re-exported from Progressive Play. See [Progressive Play — Public API](progresive-play.md#public-api).

Throne Run does not customize initial generation.

## `applyMatchResult(players, result, options)`

```javascript
applyMatchResult(players, {
  courtIndex: 0,
  teamAIds: ['a', 'b'],
  teamBIds: ['c', 'd'],
  winningTeam: 'A',
}, {
  maxWinStreak: 3,   // from session setup; 0 disables ejection
})
```

Returns:

```javascript
{
  players,            // updated roster
  historyEntry,     // { courtIndex, teamAIds, teamBIds, winningTeam, signature, timestamp }
  ejectedWinnerIds, // IDs of winners ejected by the streak limit
}
```

Implements the same win/loss/skill/partner/opponent updates as Progressive Play, plus win-streak and medal logic.

## `generateCourtAfterScore(allPlayers, options)`

```javascript
generateCourtAfterScore(allPlayers, {
  winnerIds: ['w1', 'w2'],  // or ['w1'] for single-winner rotation
  courtMatchups: [null, { teamA, teamB }],  // scored court nulled out
  matchHistory: [...],
  courts: 2,
})
```

Returns a `{ teamA, teamB }` matchup or `null`. Accepts 1 or 2 winner IDs.

## `generateFallbackCourtByPriority(allPlayers, options)`

```javascript
generateFallbackCourtByPriority(allPlayers, {
  courtIndex: 0,
  courtMatchups: [null, { teamA, teamB }],
  matchHistory: [...],
  courts: 2,
})
```

Returns a `{ teamA, teamB }` matchup or `null`. Activates only when both Throne rotation and PP `generateMatches` fail. See the [Final fallback fill](#final-fallback-fill-generatefallbackcourtbypriority) section above for fill priority.

## `selectPrimaryThroneWinner(winnerA, winnerB)`

Called on **refresh** when two staying winners are in different skill groups after promotion. Returns the player object that should hold the throne.

Selection order:

1. Lowest `gamesPlayed`
2. Tie-break: higher skill rank
3. Tie-break: stable id ordering (`localeCompare`)

---

# UI Integration (V2)

| Action | Handler | Engine call |
|--------|---------|-------------|
| Refresh one court | `handleGenerateCourt` | Throne Run: `generateCourtAfterScore` with 2 winners (same group) or 1 winner via `selectPrimaryThroneWinner` (split groups); else `generateMatches` (PP) with `excludePlayerIds` |
| Submit score | `handleSubmitScore` | `trApplyMatchResult` only; court cleared |
| Up Next display | `V2CourtsView` | `selectFairnessPool` (Progressive Play), grouped by skill level, ordered by pick priority |
| Winners panel | `V2CourtsView` | Two subsections: **Medals** (`medals > 0`) and **Win Streaks** (`currentWinStreak > 0`) |

### Score submission (Throne Run branch)

```javascript
const result = trApplyMatchResult(players, matchResult, { maxWinStreak: winStreak })
// AppV2 merges ejectedWinnerIds onto the saved history entry (not in engine historyEntry)
const nextMatchups = courtMatchups.map((m, i) =>
  i === courtIndex ? null : m
)
```

### Court refresh (Throne Run branch)

```javascript
const lastMatchOnCourt = [...matchHistory].reverse().find((e) => e.courtIndex === courtIndex)
const stayingWinnerIds = winnerIds.filter((id) => !ejectedSet.has(id))

let nextCourt = null
if (stayingWinnerIds.length === 2) {
  // Try 2-winner rotation (same skill group)
  nextCourt = generateCourtAfterScore(updatedPlayers, {
    winnerIds: stayingWinnerIds,
    courtMatchups,
    matchHistory,
    courts: numberOfCourts,
  })

  // Split groups after promotion → pick one throne holder
  if (!nextCourt) {
    const primary = selectPrimaryThroneWinner(w1, w2)
    nextCourt = generateCourtAfterScore(updatedPlayers, {
      winnerIds: [primary.id],
      courtMatchups,
      matchHistory,
      courts: numberOfCourts,
    })
  }
}
// if nextCourt is still null, fall back to generateMatches (Progressive Play)
// if PP also returns null, fall back to generateFallbackCourtByPriority
```

The court slot is set to the generated matchup or left empty if generation fails.

### Final fallback fill (`generateFallbackCourtByPriority`)

When both Throne rotation and Progressive Play `generateMatches` fail to produce a court (e.g. a 4-player session where skill promotion puts players into different groups that PP cannot reconcile), a last-resort fallback runs:

```javascript
generateFallbackCourtByPriority(allPlayers, {
  courtIndex,
  courtMatchups,
  matchHistory,
  courts: numberOfCourts,
})
```

**Activation:** Only after Throne + PP both return `null`. Never runs on its own.

**Starter selection:** The checked-in player with the lowest `gamesPlayed` (not on another court) is always the first player selected. Ties are broken by stable id ordering.

**Fill order for the remaining 3 slots:**

| Priority | Source | Description |
|----------|--------|-------------|
| 1 | Rested | Same skill level as starter |
| 2 | Rested | Adjacent skill levels (±1 rank from starter) |
| 3 | Rested | Any other skill level (sitting out queue) |
| 4 | Cooldown | Any skill level (last resort) |

Within each tier, players with lower `gamesPlayed` are preferred (stable id tie-break).

**Key differences from normal generation:**
- Ignores skill group boundaries — will mix Beginner/Novice with Intermediate/Advanced if necessary.
- The starter may be on cooldown (fairness by `gamesPlayed` takes priority in this fallback).
- No partner diversity or fresh-first filtering — the goal is simply to fill the court.

**Returns:** `{ teamA: [starter, fill1], teamB: [fill2, fill3] }` or `null` if fewer than 4 eligible players exist.

### Courts View — Winners panel

The panel header shows a combined count of players with medals or an active streak. It has two subsections:

**Medals** — checked-in players with `medals > 0`, sorted by medal count descending:

* Name
* 🥇 medal count (with `×N` when more than one)

**Win Streaks** — checked-in players with `currentWinStreak > 0`, sorted by streak descending:

* Name
* 🔥 `currentWinStreak`

A player can appear in both subsections (e.g. after ejection: medal earned, streak reset to 0 — they appear under Medals only until they win again).

---

# Example Scenarios

## Normal throne rotation

```text
Before:  Court 1 — A+B vs C+D
Score:   A+B win → court cleared
Refresh: Court 1 — A+E vs B+F   (A and B stay; C and D leave; E and F from queue)
```

## Repeat partner avoidance

```text
A won with partner C earlier in the session (partnerCounts updated).
On refresh, A needs a new partner.
Engine tries fresh-first: skips any candidate where hasPartneredBefore(A, candidate).
Only pairs A with someone A has not partnered with before, unless no fresh option exists.
```

## Win streak ejection (max = 3)

```text
Player A wins 3 in a row on Court 1 (streak reaches 3).
On the 3rd win: A earns a medal, streak resets to 0, A is ejected; court cleared on score.
On refresh: if B also won and was not ejected, only 1 staying winner → throne rotation skipped; PP generateMatches fills the court.
If both A and B hit the limit on the same match → both ejected; refresh uses PP generateMatches.
```

## Skill promotion split (different groups after +1)

```text
Court 2: Crystal (Beginner) and Vince (Novice) win.
After +1 each: Crystal → Novice (Group A), Vince → Intermediate (Group B).
selectPrimaryThroneWinner picks one (lowest gamesPlayed, tie-break: higher skill).
If Vince is selected: single-winner rotation runs with Vince + 3 Group B partners.
Crystal returns to the queue.
```

## Insufficient queue

```text
Only 1 rested player available in the winners' skill group.
generateCourtAfterScore returns null → court cleared.
```

---

# Desired Outcomes

Throne Run should produce:

* Winners rewarded with court time and partner rotation instead of leaving immediately.
* Fresh partners for throne holders each round, with no repeat teammates when alternatives exist (Progressive Play fresh-first rule).
* Fair access to the court for players waiting in the queue (`gamesPlayed` tie-break).
* Optional competitive tension via win-streak limits and visible medals.
* Consistent initial match quality from Progressive Play's fairness and diversity rules.
* Graceful fallback: when two winners split groups, one keeps the throne via `selectPrimaryThroneWinner`; if that still fails, Progressive Play fills the court; if PP also fails, `generateFallbackCourtByPriority` ignores group boundaries to build a valid court. The court shows an error modal only when fewer than 4 eligible players exist.

---

# Implementation Notes

* `ThroneRun.engine.js` imports `generateMatches`, `skillRankOf`, `skillGroupOf`, `shiftSkillLevel`, `matchSignature`, `getCooldownIds`, and `hasPartneredBefore` from Progressive Play.
* `generateCourtAfterScore` uses `hasPartneredBefore` for fresh-first partner selection (hard filter, then fallback), matching Progressive Play's partner rotation rule.
* `applyMatchResult` in Throne Run duplicates PP's stat-update logic rather than delegating to `ppApplyMatchResult`, because it must interleave streak and ejection handling on wins. The imported `ppApplyMatchResult` alias is unused in the current file.
* `selectPrimaryThroneWinner` picks one throne holder when winners split groups: lowest `gamesPlayed`, tie-break higher skill rank, then stable id ordering.
* `generateCourtAfterScore` supports both 2-winner (split onto opposing teams) and 1-winner (winner on team A with 3 partners from queue) rotation. AppV2 uses the 1-winner path only after `selectPrimaryThroneWinner` on split groups, not when ejection leaves a single staying winner.
* `generateFallbackCourtByPriority` is the last-resort court generator. It ignores skill group boundaries and partner diversity, prioritizing `gamesPlayed` fairness above all else. It runs only after Throne + PP both fail.
