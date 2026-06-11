# ProgressivePlayEngine Test Cases

Automated coverage lives in `src/match-engines/v2/__tests__/ProgressivePlay.engine.test.js` (TC1–TC25 plus fairness/session cases below).

Engine specification: `docs/progresive-play.md`

## Test Case 1 - Initial Generation Without Locked Teams

### Input

Players:

```text
A Beginner
B Beginner
C Novice
D Novice
E Intermediate
F Intermediate
G Advanced
H Advanced
```

All players:

```text
wins = 0
losses = 0
```

No partner history.

No opponent history.

### Expected

* Two skill groups are created.
* Beginner/Novice players are grouped together.
* Intermediate/Advanced players are grouped together.
* No cross-skill-group matches.
* Two valid doubles matches are generated.
* Every player appears exactly once.

---

## Test Case 2 - Single Locked Team

### Input

```text
A Novice
B Intermediate
C Intermediate
D Intermediate
E Advanced
F Advanced
```

Locked Team:

```text
A + B
```

### Expected

* A and B remain together.
* Team skill level becomes Intermediate.
* Team is placed in Intermediate/Advanced group.
* A and B are never separated.
* Match generation succeeds.

---

## Test Case 3 - Multiple Locked Teams

### Input

```text
A Beginner
B Novice
C Intermediate
D Advanced
E Intermediate
F Intermediate
G Advanced
H Advanced
```

Locked Teams:

```text
A + B
C + D
```

### Expected

* Both locked teams remain intact.
* A+B skill level becomes Novice.
* C+D skill level becomes Advanced.
* Remaining players are matched around them.
* No locked team is split.

---

## Test Case 4 - Performance Separation

### Input

```text
A wins=5 losses=0
B wins=4 losses=1

C wins=3 losses=2
D wins=3 losses=2

E wins=1 losses=4
F wins=0 losses=5
```

### Expected

Performance scores:

```text
A = 5
B = 3

C = 1
D = 1

E = -3
F = -5
```

* A and B should be grouped together.
* E and F should be grouped together.
* Strong performers should not be matched against lowest performers unless unavoidable.

---

## Test Case 5 - Partner Diversity

### Input

Players:

```text
A
B
C
D
```

Partner history:

```text
A partnered with B
```

### Expected

Preferred matches:

```text
A+C vs B+D
```

or

```text
A+D vs B+C
```

Not:

```text
A+B vs C+D
```

unless no alternative exists.

---

## Test Case 6 - Hard Partner Rotation Rule

### Input

Players:

```text
A
B
C
D
E
```

Partner history:

```text
A partnered with:
B
C
D
```

Never partnered with:

```text
E
```

### Expected

A should be paired with E before repeating B, C, or D.

---

## Test Case 7 - Opponent Diversity

### Input

Previous match:

```text
A+B vs C+D
```

### Expected

Next generation should prefer:

```text
A+C vs B+D
```

or

```text
A+D vs B+C
```

over repeating:

```text
A+B vs C+D
```

---

## Test Case 8 - Exact Match Repeat Penalty

### Input

Previous matches contain:

```text
A+B vs C+D
```

### Expected

Engine should avoid generating:

```text
A+B vs C+D
```

again if any alternative exists.

---

## Test Case 9 - Small Bucket Merge

### Input

Teams:

```text
Score 4
Team A

Score 3
Team B

Score 2
Team C
```

### Expected

* Score 4 bucket merges with Score 3 bucket.
* Team A plays Team B.
* Bucket generation does not fail.

---

## Test Case 10 - Uneven Skill Groups

### Input

```text
Group 1
A
B
C
D

Group 2
E
F
G
H
I
J
```

### Expected

* Engine generates valid matches.
* Skill groups remain separate whenever possible.
* No player is duplicated.
* No player is omitted.

---

## Test Case 11 - Locked Team Overrides Partner Rotation

### Input

Locked Team:

```text
A + B
```

History:

```text
A partnered with B 5 times
```

### Expected

* A and B remain partners.
* Partner rotation rule is ignored.
* Locked team constraint wins.

---

## Test Case 12 - Advanced + Beginner Locked Team

### Input

```text
A Advanced
B Beginner
```

Locked Team:

```text
A + B
```

### Expected

Team skill level:

```text
Advanced
```

Team competes in:

```text
Intermediate/Advanced group
```

Never Beginner/Novice group.

---

## Test Case 13 - Refresh After Results

### Round 1 Results

Winners:

```text
A
B
C
D
```

Losers:

```text
E
F
G
H
```

### Expected

After refresh:

* Winners are more likely to play winners.
* Losers are more likely to play losers.
* Performance scores affect grouping.

---

## Test Case 14 - Court Ranking

### Input

Matches:

```text
Match A
Average performance = 4

Match B
Average performance = 2

Match C
Average performance = -1
```

### Expected

```text
Court 1 = Match A

Court 2 = Match B

Court 3 = Match C
```

---

## Test Case 15 - No Valid Perfect Solution

### Input

Every player has already partnered with every other player.

Every player has already played every opponent.

### Expected

* Engine still generates matches.
* Engine does not throw errors.
* Engine selects the lowest-penalty solution available.

```
```


# ProgressivePlayEngine - Single Court Test Cases

## Test Case 16 - Single Court, 4 Players

### Input

```text
A Novice
B Novice
C Novice
D Novice
```

All players:

```text
wins = 0
losses = 0
```

No history.

### Expected

* One court is generated.
* All 4 players are assigned.
* One valid doubles match is created.
* No duplicate players.

Example:

```text
A+B vs C+D
```

---

## Test Case 17 - Single Court Refresh

### Round 1

```text
A+B beat C+D
```

### Expected After Refresh

The next match should prefer:

```text
A+C vs B+D
```

or

```text
A+D vs B+C
```

instead of repeating:

```text
A+B vs C+D
```

---

## Test Case 18 - Single Court Partner Rotation

### Players

```text
A
B
C
D
```

### Round 1

```text
A+B vs C+D
```

### Round 2

Expected:

```text
A+C vs B+D
```

or

```text
A+D vs B+C
```

### Round 3

Expected:

Remaining unused pairing.

### Goal

All partner combinations should be exhausted before repeating.

---

## Test Case 19 - Single Court Locked Team

### Players

```text
A
B
C
D
```

Locked Team:

```text
A+B
```

### Expected

Every refresh:

```text
A+B
```

remain partners.

Possible matches:

```text
A+B vs C+D
```

Only opponents may change.

---

## Test Case 20 - Single Court 5 Players

### Players

```text
A
B
C
D
E
```

### Expected

Only 4 players are assigned.

1 player sits out.

The sit-out player should be tracked.

Example:

```text
Court 1

A+B vs C+D

Sit Out:
E
```

---

## Test Case 21 - Single Court Rotation Fairness

### Players

```text
A
B
C
D
E
```

### Round 1

E sits.

### Round 2

Expected:

A different player sits.

Example:

```text
A sits
```

### Goal

Sit-outs rotate fairly.

No player should repeatedly sit while others continue playing.

---

## Test Case 22 - Single Court 6 Players

### Players

```text
A
B
C
D
E
F
```

### Expected

4 players play.

2 players sit.

Sit-outs should rotate over time.

---

## Test Case 23 - Single Court Winners vs Winners

### Round 1

```text
A+B beat C+D
```

### Current Scores

```text
A = 1
B = 1
C = -1
D = -1
```

### Expected

Since only one court exists:

* Performance scores are updated.
* Partner diversity remains the primary factor.
* Match generation still avoids repeats.

---

## Test Case 24 - Single Court Exhausted Pairings

### Players

```text
A
B
C
D
```

All possible partnerships already occurred.

### Expected

* Engine still generates a valid match.
* Repeats are allowed.
* Lowest-penalty option is selected.

---

## Test Case 25 - Single Court Locked Team + Extra Player

### Players

```text
A
B
C
D
E
```

Locked Team:

```text
A+B
```

### Expected

A+B remain together.

One of C/D/E sits.

Sit-outs rotate fairly.

Locked team is never broken.

---

## Test Case 26 - Games-Played Fairness (Single Snapshot)

### Input

12 players, all `gamesPlayed >= 1`, homogeneous skill (Intermediate).

1 court configured.

### Expected

* Fairness selects 6 players (4 + buffer 2).
* The 4 highest-`gamesPlayed` players are in `fairnessSitOuts`.
* Exactly 4 players appear on the court.

---

## Test Case 27 - Locked Pair Interleaved by Games

### Input

Locked pair A+B with `gamesPlayed = 10` each.

10 solo players with `gamesPlayed = 1` through `10`.

1 court, all players have played at least once (Phase 2).

### Expected

* A+B sit out together (too many games vs solos).
* Lowest-game solo players fill the pool.

---

## Test Case 28 - Per-Court Refresh Uses Global Fairness

### Input

27 players, 2 courts, 14 rounds.

Workflow mirrors real UX:

1. Generate All for initial court assignments.
2. Score one court, clear it, refresh **only that court**.
3. Repeat; players on the other court are passed via `excludePlayerIds`, not removed from the roster.

### Expected

* After warm-up, every checked-in player has `gamesPlayed >= 1`.
* Final spread `max(gamesPlayed) - min(gamesPlayed) <= 2`.
* Excluded (on-other-court) players never appear in the refreshed court or in sit-outs for that call.

---

## Test Case 29 - Generate All Session Simulation

### Input

Same as TC28 but every round uses Generate All (both courts scored and regenerated together).

### Expected

* After warm-up, every checked-in player has `gamesPlayed >= 1`.
* Final spread `max(gamesPlayed) - min(gamesPlayed) <= 2`.

---

## Test Case 30 - Decomposed Sit-Outs

### Input

Any generation where `sitOuts.length > 0`.

### Expected

* Return value includes `_fairnessSitOuts`, `_teamBuildSitOuts`, `_overflowSitOuts`.
* Sum of the three arrays equals `sitOuts.length`.
