/* Data model for the hand recorder. Pure functions only — UI derives
   everything from an append-only event log so any event can be deleted
   ("typo correction") without corrupting state.

   session: { id, ts, name, unit: "bb"|"cur", cur: "$", sb, bb, seats,
              players: [ { id, name, type, note } ], hands: [hand] }
   hand:    { id, ts, pos, hole: [cardId] (0-2),
              board: { f: [3], t: [1], r: [1] },
              events: [ { st, actor, a, amt? } ],   // st: p|f|t|r
              villains: [ { label, cards: [cardId] | "unknown", playerId } ],
              result: "won"|"lost"|"chop"|null, net: number|null }
   actor: "H" | position name ("UTG", "CO", ...) | legacy "V1".."V3"
   villain: new hands are position-keyed ({ label: "CO", pos: "CO", ... });
            legacy hands keep label "V1".. with no pos (manual actor mode).
   a: "F" fold | "X" check | "C" call | "B" bet | "R" raise-to | "A" all-in
   amt: total committed on that street by that action ("raise to" semantics),
        in the session's unit. */

export const STREETS = ["p", "f", "t", "r"];
export const STREET_NAME = { p: "Preflop", f: "Flop", t: "Turn", r: "River" };
/* Loose/tight x passive/aggressive taxonomy + catch-alls. */
export const PLAYER_TYPES = ["TAG", "LAG", "Nit", "Station", "Maniac", "Unknown"];
export const newPlayer = () => ({ id: crypto.randomUUID(), name: "",
  type: "Unknown", note: "" });

export const ACTIONS = { F: "Fold", X: "Check", C: "Call", B: "Bet", R: "Raise", A: "All-in" };

export function posNames(seats) {
  seats = Math.min(Math.max(+seats || 2, 2), 12);
  if (seats === 2) return ["SB", "BB"]; // HU: SB is the button
  const order = { 3: ["BTN","SB","BB"], 4: ["BTN","SB","BB","UTG"],
    5: ["BTN","SB","BB","UTG","CO"], 6: ["BTN","SB","BB","UTG","HJ","CO"],
    7: ["BTN","SB","BB","UTG","MP","HJ","CO"],
    8: ["BTN","SB","BB","UTG","UTG1","MP","HJ","CO"],
    9: ["BTN","SB","BB","UTG","UTG1","MP","LJ","HJ","CO"],
    10: ["BTN","SB","BB","UTG","UTG1","UTG2","MP","LJ","HJ","CO"],
    11: ["BTN","SB","BB","UTG","UTG1","UTG2","UTG3","MP","LJ","HJ","CO"],
    12: ["BTN","SB","BB","UTG","UTG1","UTG2","UTG3","MP","MP1","LJ","HJ","CO"] };
  return order[seats];
}

/** Auto-rotate: hero's position advances one seat per hand.
    First hand starts from the position picked at table setup. */
export function nextPos(session) {
  const names = posNames(session.seats);
  const last = session.hands[session.hands.length - 1];
  if (!last) return names.includes(session.heroPos) ? session.heroPos : names[0];
  const i = names.indexOf(last.pos);
  return names[(i + 1 + names.length) % names.length];
}

/** Seat map: playerIds clockwise from hero, one per non-hero seat (null =
    stranger/empty). Read-side padding/truncation absorbs table resizes and
    old sessions (which fall back to roster order). */
export function seatOrderOf(session) {
  const n = posNames(session.seats).length - 1;
  const o = (session.seatOrder ?? (session.players ?? []).map((p) => p.id)).slice(0, n);
  return [...o, ...Array(Math.max(0, n - o.length)).fill(null)];
}

/** Player seated at position p for this hand: the seat k clockwise from
    hero holds position names[(heroIdx + k) % n]. Falls back to rotation
    inference for sessions recorded before seat maps existed. */
export function playerAt(session, hand, p) {
  if (!session.seatOrder) return guessPlayerAt(session, hand, p);
  const names = posNames(session.seats);
  const hi = names.indexOf(hand.pos), pi = names.indexOf(p);
  if (hi < 0 || pi < 0) return null;
  const off = (pi - hi + names.length) % names.length;
  return off > 0 ? seatOrderOf(session)[off - 1] ?? null : null;
}

export const newHand = (session) => ({
  id: crypto.randomUUID(), ts: Date.now(), pos: nextPos(session),
  hole: [], board: { f: [], t: [], r: [] }, events: [],
  villains: [], result: null, net: null,
});

export const newSession = (prev = {}) => ({
  id: crypto.randomUUID(), ts: Date.now(),
  name: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " session",
  unit: prev.unit ?? "bb", cur: prev.cur ?? "$",
  sb: prev.sb ?? 0.5, bb: prev.bb ?? 1, seats: prev.seats ?? 6,
  buyIn: prev.buyIn ?? 100, setup: false, heroPos: null,
  seatOrder: Array((prev.seats ?? 6) - 1).fill(null),
  players: [], hands: [], ledger: { H: { buyIns: [prev.buyIn ?? 100], stack: null } },
});

/** Resolve an event actor to a position name; null = legacy "Vn" actor
    with no pos (falls back to manual actor mode in the UI). */
function actorPos(hand, actor) {
  if (actor === "H") return hand.pos;
  const v = hand.villains.find((x) => x.label === actor);
  if (v) return v.pos ?? null;
  return /^V\d$/.test(actor) ? null : actor; // bare position = folded seat
}

/** Order of action on a street. */
export function actionOrder(seats, st) {
  const n = posNames(seats);
  if (seats === 2) return st === "p" ? ["SB", "BB"] : ["BB", "SB"];
  return st === "p" ? [...n.slice(3), n[0], n[1], n[2]]   // UTG..CO, BTN, SB, BB
                    : [n[1], n[2], ...n.slice(3), n[0]];  // SB, BB, UTG..CO, BTN
}

/** Positions with no fold event (a fold on any street kills the seat). */
export function livePositions(hand, seats) {
  const dead = new Set();
  for (const e of hand.events)
    if (e.a === "F") { const p = actorPos(hand, e.actor); if (p) dead.add(p); }
  return posNames(seats).filter((p) => !dead.has(p));
}

/** Next position to act on street st; null = action closed / hand over /
    legacy hand (unresolvable actor). Replays the street's events against a
    pending queue: X/C removes the actor, F kills the seat, B/R/A re-opens
    (pending = everyone live after the aggressor, cyclically). Recomputed from
    the event log each render, so deletions and overrides self-correct.
    ponytail: a short all-in is treated as a full raise (re-opens action);
    tracking bet sizes to get the real rule isn't worth it. */
export function actionOn(hand, seats, st) {
  const before = STREETS.indexOf(st);
  const dead = new Set();
  for (const e of hand.events)
    if (STREETS.indexOf(e.st) < before && e.a === "F") {
      const p = actorPos(hand, e.actor);
      if (!p) return null;
      dead.add(p);
    }
  let live = actionOrder(seats, st).filter((p) => !dead.has(p));
  let pending = [...live];
  for (const e of hand.events.filter((e) => e.st === st)) {
    const p = actorPos(hand, e.actor);
    if (!p) return null;
    if (e.a === "F") {
      live = live.filter((x) => x !== p);
      pending = pending.filter((x) => x !== p);
    } else if ("BRA".includes(e.a)) {
      const i = live.indexOf(p);
      pending = [...live.slice(i + 1), ...live.slice(0, i)];
    } else pending = pending.filter((x) => x !== p);
  }
  return live.length > 1 ? pending[0] ?? null : null;
}

export const handOver = (hand, seats) => livePositions(hand, seats).length <= 1;

/** Session P/L rows from the buy-in ledger: net = stack − sum(buyIns);
    stack null = still playing (net null). Hero row always first. */
export function ledgerNet(session) {
  const ledger = session.ledger ?? {};
  const rows = [];
  for (const key of Object.keys(ledger)) {
    const { buyIns = [], stack = null } = ledger[key];
    const invested = buyIns.reduce((a, b) => a + b, 0);
    const name = key === "H" ? "Hero"
      : session.players.find((p) => p.id === key)?.name || "?";
    rows.push({ key, name, invested, stack, net: stack == null ? null : stack - invested });
  }
  rows.sort((a, b) => (a.key === "H" ? -1 : b.key === "H" ? 1 : 0));
  return rows;
}

/** Last aggressive amount on a street (what a Call matches). */
export function toCall(hand, st, bbAmt = 1) {
  let amt = st === "p" ? bbAmt : 0; // preflop opens facing the blind
  for (const e of hand.events)
    if (e.st === st && "BRA".includes(e.a) && e.amt != null) amt = e.amt;
  return amt;
}

/** Approximate pot: blinds + each actor's largest commitment per street.
    Approximate because blind overlap and exact call amounts depend on
    unrecorded stack detail — labeled "~" in the UI. */
export function potEstimate(hand, session) {
  const bbAmt = session.unit === "bb" ? 1 : session.bb;
  const sbAmt = session.unit === "bb" ? session.sb / session.bb : session.sb;
  let pot = sbAmt + bbAmt;
  for (const st of STREETS) {
    const commit = {};
    let aggro = st === "p" ? bbAmt : 0;
    for (const e of hand.events.filter((e) => e.st === st)) {
      if ("BRA".includes(e.a) && e.amt != null) {
        commit[e.actor] = Math.max(commit[e.actor] || 0, e.amt);
        aggro = Math.max(aggro, e.amt);
      } else if (e.a === "C") commit[e.actor] = Math.max(commit[e.actor] || 0, aggro);
    }
    pot += Object.values(commit).reduce((a, b) => a + b, 0);
  }
  // hero/BB blind already counted once in preflop commitments if they raised;
  // accept the small double-count as part of the "~" estimate.
  return pot;
}

/** Hero's total committed, same "~" approximation as potEstimate:
    per street, hero's largest commitment ("raise-to" semantics); preflop
    at least the blind if hero posted one (a call/raise already contains it). */
export function heroCommit(hand, session) {
  const bbAmt = session.unit === "bb" ? 1 : session.bb;
  const sbAmt = session.unit === "bb" ? session.sb / session.bb : session.sb;
  const blind = hand.pos === "SB" ? sbAmt : hand.pos === "BB" ? bbAmt : 0;
  let total = 0;
  for (const st of STREETS) {
    let aggro = st === "p" ? bbAmt : 0, mine = 0;
    for (const e of hand.events.filter((e) => e.st === st)) {
      if ("BRA".includes(e.a) && e.amt != null) {
        aggro = Math.max(aggro, e.amt);
        if (e.actor === "H") mine = Math.max(mine, e.amt);
      } else if (e.a === "C" && e.actor === "H") mine = Math.max(mine, aggro);
    }
    total += st === "p" ? Math.max(blind, mine) : mine;
  }
  return total;
}

/** Estimated hero net for a result: won = pot minus own money, lost = own
    money. Prefills the net field — editable, and chop stays manual. */
export function netEstimate(hand, session, result) {
  const mine = heroCommit(hand, session);
  const x = result === "won" ? potEstimate(hand, session) - mine
    : result === "lost" ? -mine : null;
  return x == null ? null : Math.round(x * 10) / 10;
}

/** Guess which roster player sits at position p in `hand`, from earlier
    hands: positions rotate with the button, so a prior hand's links are
    shifted by the hero-position delta between the two hands.
    ponytail: assumes nobody changed seats; the "who?" selector overrides. */
export function guessPlayerAt(session, hand, p) {
  const names = posNames(session.seats);
  const n = names.length, target = names.indexOf(p), cur = names.indexOf(hand.pos);
  if (target < 0 || cur < 0) return null;
  const i = session.hands.findIndex((h) => h.id === hand.id);
  const prior = (i < 0 ? session.hands : session.hands.slice(0, i));
  for (let k = prior.length - 1; k >= 0; k--) {
    const ph = prior[k], pi = names.indexOf(ph.pos);
    if (pi < 0) continue;
    const prevPos = names[(target - (cur - pi) % n + 2 * n) % n];
    const v = ph.villains.find((x) => x.pos === prevPos && x.playerId);
    if (v) return v.playerId;
  }
  return null;
}

/** Current street = last street with board cards fully set that has begun. */
export function activeStreet(hand) {
  if (hand.board.r.length === 1) return "r";
  if (hand.board.t.length === 1) return "t";
  if (hand.board.f.length === 3) return "f";
  return "p";
}

export const fmtAmt = (x, session) =>
  session.unit === "bb" ? `${+(+x).toFixed(1)}bb` : `${session.cur}${(+x).toFixed(2)}`;

/** All card ids already used anywhere in the hand (for picker dead-cards). */
export function usedCards(hand) {
  const v = hand.villains.flatMap((x) => (Array.isArray(x.cards) ? x.cards : []));
  return new Set([...hand.hole, ...hand.board.f, ...hand.board.t, ...hand.board.r, ...v]);
}

/* Per-player stats from that player's linked hands. All rates are over
   *tracked* hands only — hero records selectively, so these are biased
   samples, not true HUD stats. Labeled accordingly in the UI. */
export function playerStats(session, playerId) {
  let tracked = 0, vpip = 0, pfr = 0, agg = 0, passive = 0;
  const shown = [];
  for (const h of session.hands) {
    const v = h.villains.find((x) => x.playerId === playerId);
    if (!v) continue;
    tracked++;
    const evs = h.events.filter((e) => e.actor === v.label);
    const pre = evs.filter((e) => e.st === "p");
    if (pre.some((e) => "CBRA".includes(e.a))) vpip++;
    if (pre.some((e) => "BRA".includes(e.a))) pfr++;
    for (const e of evs) {
      if (e.st === "p") continue;
      if ("BRA".includes(e.a)) agg++;
      else if ("CX".includes(e.a)) passive++;
    }
    if (Array.isArray(v.cards) && v.cards.length === 2)
      shown.push({ handId: h.id, cards: v.cards });
  }
  return { tracked, vpip, pfr, agg, passive, shown };
}

export const exportSession = (s) => JSON.stringify(s, null, 1);
