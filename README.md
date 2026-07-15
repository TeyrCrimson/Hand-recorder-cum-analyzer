# Hand Log — 1-tap poker hand recorder (PWA)

Record live hands from your phone with minimal taps; correct any entry
later; set villain cards retroactively (default: Unknown).

## Setup
```
npm install
npm run dev        # local
npm run build      # dist/
```
Deploy: hosted at https://github.com/TeyrCrimson/Hand-recorder-cum-analyzer
(`base` in vite.config.js matches the repo name), Pages -> "GitHub Actions".
App URL: https://teyrcrimson.github.io/Hand-recorder-cum-analyzer/ — install
on phone via browser menu -> Add to Home Screen. Fully offline after first load.

## Structure
```
src/model.js        # data model: sessions/hands/event log (pure functions)
src/model.test.mjs  # tests: node src/model.test.mjs (gates deploy)
src/App.jsx         # UI: sessions -> session -> hand editor
src/poker.js        # shared card helpers (from the analyzer project)
docs/hand-recorder-plan.md  # original design doc
```

## Design notes
- Fewest-taps: position auto-rotates per hand; actor auto-alternates after
  each action; Fold/Check/Call are 1 tap; Bet/Raise are 2 (action + amount
  chip). Amount chips: bb multiples preflop, pot fractions postflop.
- Corrections: every recorded action is a chip in the timeline — tap twice
  to delete it. Reopen any saved hand to edit anything (cards, actions,
  result, villains) — a hand is never "locked".
- Units: per-session choice of big blinds or currency; all amounts entered
  and displayed in that unit.
- Pot is an estimate (~) — blind overlap isn't reconstructed; see model.js.
- Player profiles: per-session roster (name/seat, TAG/LAG/Nit/Station/Maniac
  type, free-text notes); each villain in a hand can be linked to a roster
  player via the "who?" selector. Old saved sessions migrate automatically.
- Player stats: each roster card shows VPIP / PFR / postflop aggression
  frequency computed from that player's linked hands, plus every hand
  they've shown down. Rates are over *tracked* hands only (you record
  selectively), so treat them as a biased sample, not a true HUD.
- Storage: localStorage (thousands of hands fit); Export = JSON download
  per session.
