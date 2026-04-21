# Official Standings Documentation

This document describes how standings are calculated and displayed in the app.
Standings are derived from recorded match scores in `src/App.jsx`.

## Data tracked per player

Each player carries the following stats used for standings:

- `wins`: Incremented when the player is on the winning team.
- `losses`: Incremented when the player is on the losing team.
- `gamesPlayed`: Incremented for every recorded match.
- `pointsFor`: Total points scored by the player across all matches.
- `pointsAgainst`: Total points allowed by the player across all matches.
- `pointDifferential`: `pointsFor - pointsAgainst`.

These values are stored in local state and persisted to
`localStorage` under the key `matchGen.players`.

## Recording a match score

Scores are entered from the court view using the score modal:

- Two scores are required (Team A and Team B).
- A verifier must be selected.
- A signature is required.

When a valid score is saved:

1. Each player on the winning team gets `wins + 1`.
2. Each player on the losing team gets `losses + 1`.
3. All participating players get `gamesPlayed + 1`.
4. `pointsFor` and `pointsAgainst` are updated based on the team score.
5. `pointDifferential` is recalculated (`pointsFor - pointsAgainst`).

The match is also logged into the match history, including:

- Court label (`Court 1` or `Court 2`)
- Team names
- Final score
- Verifier name
- Signature image data (if provided)

## Sorting rules (official order)

Standings are sorted with the following tie-break rules:

1. **Wins** (descending)
2. **Point Differential** (descending)
3. No additional tie-breaker (ties remain in their current order)

The app renders this sort live, every time standings are viewed.

## Display rules

- All players are included (checked-in status does not filter standings).
- The top 4 players with recorded stats are highlighted.
- Standings columns:
  - Rank
  - Player
  - Wins
  - Losses
  - PD (Point Differential)
  - Games

## Reset behavior

Using the reset action clears player stats and match history, returning the
standings to their initial state.
