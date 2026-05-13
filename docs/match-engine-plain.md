# Match generation (plain-English)

This page explains how matchups are created in each game format, in simple terms.

## The big idea

- You choose a game format in Game Setup.
- You choose the number of courts (1 to 10).
- A court is only shown if there are enough checked-in players to fill it.
- Every match is doubles (2 players vs 2 players).

Visible courts are calculated as:

- `visible courts = min(number of courts selected, floor(checked-in players / 4))`

## Game formats

## 1) Split & Stay (DUPR)

- Uses random team generation.
- Winners stay on the same court for one more game (max 2 wins in a row).
- If two winners stay, they are placed on opposite teams next game.
- Two new players are pulled in from the queue/fairness order.
- After a player reaches the stay cap, they rotate out.

## 2) Round Robin (Bagging Nights)

- Uses custom teams (`teamName` pairs).
- The app avoids repeating the same team-vs-team matchup.
- It prefers fair pairings (teams with fewer games first).
- In multi-court sessions, if no valid pair is available right now, the app
  shows a "no team pair available right now" message.
- Round Robin is only complete when all possible team matchups have been played.

## 3) Open Rotation (Non-DUPR)

- Uses random team generation.
- Players with zero games are prioritized first.
- Then the app uses queue order and fairness rules to choose who plays next.
- A rolling cooldown helps avoid immediate back-to-back repeats.
- Partner-memory checks reduce immediate repeat partner pairings.

## What updates after each score

- Players in the match get `gamesPlayed + 1`.
- Winners and losers update standings stats (wins/losses/points).
- The match is saved to history.
- The next matchup is generated using the rules of the selected format.
