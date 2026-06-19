# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start local dev server at http://localhost:5173/
npm run build    # production build → dist/
npm run preview  # serve the production build locally
```

There are no tests or linters configured.

Deployment is automatic: any push to `main` triggers the GitHub Actions workflow (`.github/workflows/deploy.yml`), which builds and deploys to GitHub Pages at `https://gohanshaireverywhere.github.io/GymRats_GodMode/`.

## Architecture

**Fully client-side React + Vite SPA.** No backend, no API calls. All data comes from a JSON file the user drags in via `UploadScreen`. Once loaded, the raw challenge object lives in `App.jsx` state for the lifetime of the session.

### Data flow

1. User drops a GymRats challenge export JSON onto `UploadScreen`.
2. `App.jsx` stores it as `rawData` and runs two memos:
   - `processChallenge(rawData, { dailyCap })` → `{ memberMap, leaderboard, memberStats }` — builds per-player aggregates and applies the daily points cap.
   - `getTeamStandings(rawData, memberStats)` → `teamStandings`.
3. These derived objects are passed as props to whichever tab component is active.

### Routing

There is no router. `App.jsx` holds `activeView` (a string key from the `VIEWS` array) and renders the matching component with conditional JSX. The `Activity` detail view is a special overlay: when `selectedActivityId` is set, it renders on top of whatever tab is active and the tab navigation is hidden.

### Tab components (`src/components/`)

Each tab is a self-contained component that receives `data` (raw) plus pre-processed props:

| Tab | Key component | Notes |
|-----|---------------|-------|
| Battle Royale | `BattleRoyale.jsx` | Most complex — rotation scoring, bonus grant workflow, HTML export. Reads `ROTATIONS` from `src/data/rotations.js`. Uses `BonusGrantsContext` to persist bonus edits. |
| Timeline | `Timeline.jsx` | Five modes: Overview, Daily, Players, Teams, Fraud Radar. Fraud Radar is the fraud-detection sub-system. |
| Simulator | `Simulator.jsx` | What-if for scoring rules. Uses `inferCurrentRule` + `simulateChallenge` from `dataProcessor`. |
| Audit | `Audit.jsx` | Flags suspicious check-ins (zero-duration, high points, etc.). |
| Gap Finder | `GapFinder.jsx` + `BonusGapFinder.jsx` | Finds days where a player could absorb bonus points under the daily cap. |
| Player | `PlayerTab.jsx` → `PlayerProfile.jsx` | Deep-dive for one player. |

### Core utilities (`src/utils/`)

**`dataProcessor.js`** is the central computation module. Key exports:

- `processChallenge(data, opts)` — builds `memberMap`, `memberStats`, `leaderboard`. Call once at the App level.
- `sumPointsWithCap(checkIns, dailyCap)` — always use this instead of raw `sum(ci.points)` to stay consistent with what GymRats shows.
- `getLocalDay(isoStr, timezone)` — converts UTC ISO string to local YYYY-MM-DD. GymRats caps per *local* day, not UTC.
- `restoreOriginalPoints(checkIns, grants)` — strips bonus-grant inflation before rotation scoring. Always call this before computing Battle Royale rotation results; the leaderboard intentionally skips it to show modified totals.
- `getSubActivities(ci)` — returns sub-activity array, or a synthetic single-element array from the check-in's own fields when none are recorded. Use this rather than reading `check_in_activities` directly.
- `inferCurrentRule(checkIns)` / `simulateChallenge(...)` — used by the Simulator to reverse-engineer and hypothetically change the scoring rule.
- `getActivityTypeSummary(data)` / `getActivityTypePlayerData(...)` — Fraud Radar helpers.

**`computeRotationBonus.js`** — Battle Royale rotation logic. `computeRotationResults` scores one rotation window (always calls `restoreOriginalPoints` internally). `findGaps` runs the greedy algorithm for allocating bonus points across a player's existing check-ins.

### Contexts (`src/context/`)

- **`SettingsContext`** — persisted to `localStorage` under `gymrats-settings`. Contains `distanceUnit`, `dailyPointsCap` (`{ enabled, value }`), and `goal`. The `dailyPointsCap` default (30 pts/day) matches Battle Royale 2026; disable it for non-capped challenges via Settings.
- **`BonusGrantsContext`** — persisted to `localStorage` under `gymrats-bonus-grants`. Tracks which existing check-ins have had their `points` field inflated with a BR bonus grant, storing both the new value (`newActivityPts`) and the original (`original.points`). A bonus grant is not a separate check-in — it modifies the `points` field of a real workout check-in. The only way to identify a bonus-modified check-in is to look it up by `checkInId` in the grants array.

### Hardcoded data (`src/data/`)

- `rotations.js` — Battle Royale rotation schedule (dates + featured team per rotation). **Update this file whenever a new BR challenge is set up.**
- `announcedTeams.json` — pre-announced team assignments used by Team Builder.

### Navigation patterns

Components signal navigation via callbacks rather than touching router state:
- `onPlayerClick(id)` → sets `selectedPlayerId` + switches to `player` view
- `onActivityClick(id)` → sets `selectedActivityId` (overlay, does not change `activeView`)
- `onActivityTypeClick(type)` → navigates to Feed with a pre-applied activity-type filter

The `Timeline` component is the only tab that also needs both `onPlayerClick` and `onActivityClick` (wired up for the Fraud Radar popup flow).

### Styling

Tailwind CSS with a dark theme (`bg-gray-950` base). The 15-colour player palette is defined in `Timeline.jsx` as `PALETTE` and should be reused for any new charts that assign colours per-player.
