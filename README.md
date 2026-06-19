# GymRats GodMode

A deep-dive analysis tool for [GymRats](https://gymrats.app) challenge data. Load a challenge export JSON and get a full suite of views for tracking performance, investigating fraud, and managing Battle Royale scoring.

**Live app:** [gohanshaireverywhere.github.io/GymRats_GodMode](https://gohanshaireverywhere.github.io/GymRats_GodMode/)

## How to use

1. Export your challenge data from GymRats
2. Open the app and drag the JSON file onto the upload screen
3. All data is processed locally in your browser — nothing is uploaded anywhere

## Features

| Tab | What it does |
|-----|-------------|
| ⚔️ Battle Royale | Rotation-by-rotation team matchups, victory counts, and bonus point grant workflow |
| 📊 Dashboard | Challenge overview — top scorers, streaks, activity breakdown |
| 📰 Feed | Chronological activity stream with filters |
| 🏆 Leaderboard | Full rankings with points, check-ins, calories, distance |
| 👥 Teams | Team standings and member breakdown |
| 🧩 Team Builder | Simulate team balance before announcing assignments |
| 📈 Timeline | Cumulative and daily charts — includes **Fraud Radar** for spotting over-scorers per activity type |
| 👤 Player | Per-player deep dive with activity history |
| 🎯 Goals | Track progress toward a configurable points/workout/distance target |
| 🔍 Audit | Flags suspicious check-ins (zero duration, anomalous points) |
| 🏷️ Activity Types | Breakdown of every activity type logged |
| 🧪 Simulator | What-if scoring: see how leaderboard changes under a different rule |
| 🎁 Gap Finder | Finds the best check-ins to apply bonus points without wasting daily cap space |

## Fraud Radar

Inside the Timeline tab, **Fraud Radar** plots each player's points per day or week for a single activity type on a shared chart. Players whose score in any period is ≥ 2.5× MAD above the median are flagged with a red dashed line. Click any data point on the chart to open a detail panel; click an activity row to inspect the raw check-in.

Toggle **⚔️ Exclude BR bonuses** to strip Battle Royale bonus inflation from the analysis so legitimate rewards don't trigger false positives.

## Settings

Accessible from the ⚙️ Settings tab:

- **Distance unit** — miles or kilometres (matches how your challenge is configured)
- **Daily points cap** — default 30 pts/day (Battle Royale 2026). Disable for non-capped challenges.
- **Goal** — configurable target shown on the Goals tab

Settings are saved to `localStorage`.

## Battle Royale bonus grants

The bonus grant system modifies the `points` field of an existing real workout check-in rather than creating a new one. Grants are stored in `localStorage` and can be exported/imported as JSON from the Battle Royale tab. Before any rotation scoring, `restoreOriginalPoints` strips bonus inflation so results reflect actual workout output.

## Development

```bash
npm install
npm run dev      # http://localhost:5173/
npm run build    # production build → dist/
```

Deployments to GitHub Pages are automatic on every push to `main`.
