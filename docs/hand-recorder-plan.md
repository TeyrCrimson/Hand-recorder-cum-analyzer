# Phase 3 plan: quick hand recorder

Goal: capture a live hand with near-zero friction, one thumb, and enrich it
later. Design doc — each step ships independently.

## The real constraint

Most cardrooms restrict phone use *while in a hand*, and even where allowed,
live tapping splits attention. So the primary flow to optimize is not
live logging but **15-second retro-entry**: reconstruct the hand you just
played, from memory, immediately after it ends. A live action pad is the
secondary flow for home games / online. This reframing drives every choice
below.

## UX design

### Zero-tap defaults (the "1-tap" trick)
A hand record starts prefilled, so tap #1 is already an action, not setup:
- **Timestamp / session**: automatic. First hand of a session prompts once
  for stakes + table size; stored as session context.
- **Position**: auto-rotates one seat per hand from the last record
  (poker's dealer button does this for free). One tap only to correct it.
- **Stacks**: default = last hand's stack ± last result.

### Retro-entry flow (primary): one screen, thumb zone
Bottom-anchored pad, streets stacked top to bottom, filled left to right:

```
[Fold] [Call] [Raise 2.5x] [Raise pot] [All-in] [•size]
hole:  [card picker]        <- reuse existing BoardTab picker
flop/turn/river: [card picker + action row per street]
result: [Won] [Lost] [Chopped]  [+showdown cards]
                                   [UNDO]  [SAVE]
```
- Every action is one tap; sizes default to common fractions (chips reused
  from the GTO tab) with a numeric override.
- **Undo is a first-class button** — mis-taps are the norm one-handed.
- Partial saves are legal: a hand with only "hole cards + result" is still
  a valid record. Enrichment happens in review mode (5.below).

### Live pad (secondary)
Same component, but actions append in real time and villain actions get
their own row (seat-labeled). No extra code beyond a mode flag.

## Data model: append-only event log

One hand = header + ordered events. Short, verifiable reducer functions
derive state (pot, current street) from events — never stored redundantly.

```js
// src/recorder/model.js (sketch)
// hand: { id, ts, session: {stakes, seats}, pos, hole: [ids], events: [] }
// event: { st: "p"|"f"|"t"|"r", actor: "h"|seat, a: "F"|"C"|"R"|"X"|"B", amt? }
//        or { st, board: [cardIds] }
export const pot = (hand) => hand.events.reduce(addToPot, blinds(hand));
export const street = (hand) => lastBoardEvent(hand)?.st ?? "p";
```

Export format: [Open Hand History (OHH)](https://hh-specs.handhistory.org/)
— a JSON standard readable by PokerTracker/Hand2Note — via a pure
`toOHH(hand)` function with round-trip tests. Raw JSON export as fallback.

## Storage & export

- v1: `localStorage` under `rangelab:hands` (a hand is <1KB; ~5MB budget
  holds thousands). Same debounced-save pattern already in App.jsx.
- If/when it outgrows that: [idb-keyval](https://github.com/jakearchibald/idb-keyval)
  (IndexedDB, ~600B, drop-in async get/set).
- Export: [Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)
  to share a `.json`/`.ohh` file from the phone; download-blob fallback on
  desktop.
- Optional at-table nicety: [Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)
  during live-pad mode so the screen doesn't sleep mid-hand.

## The payoff: replay into the analyzer

A "Analyze" button on any saved hand prefills the existing tabs:
board -> Board tab, hero hole cell -> Range tab, pot/bet at any decision
point -> GTO tab. This is glue code only — every target already exists.
Later (post-Phase-2): feed the spot into the WASM solver.

## Steps

- 3.1 `src/recorder/model.js` + tests: event log, reducers, `toOHH`.
      Pure functions, no UI. (~1 evening)
- 3.2 Record tab: retro-entry pad reusing card picker + size chips,
      undo, localStorage persistence. (~1–2 evenings)
- 3.3 Hands list + review/enrich mode + export. (~1 evening)
- 3.4 Replay-into-analyzer glue. (~half evening)
- 3.5 Live-pad mode flag + wake lock. (optional)

## Non-goals (v1)

- Voice entry: Web Speech API is online-only on most mobile browsers and
  a privacy problem at a live table.
- Multi-villain full reconstruction: model supports seats, UI targets
  heads-up-relevant detail first; extra villains recorded as bare actions.
- Cloud sync: local-first; export covers backup.
