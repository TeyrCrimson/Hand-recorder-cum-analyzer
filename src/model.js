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
   actor: "H" | "V1" | "V2" | "V3"
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
  const all = ["BTN", "SB", "BB", "UTG", "UTG1", "MP", "LJ", "HJ", "CO"];
  if (seats === 2) return ["SB", "BB"]; // HU: SB is the button
  const order = { 3: ["BTN","SB","BB"], 4: ["BTN","SB","BB","UTG"],
    5: ["BTN","SB","BB","UTG","CO"], 6: ["BTN","SB","BB","UTG","HJ","CO"],
    7: ["BTN","SB","BB","UTG","MP","HJ","CO"],
    8: ["BTN","SB","BB","UTG","UTG1","MP","HJ","CO"],
    9: ["BTN","SB","BB","UTG","UTG1","MP","LJ","HJ","CO"] };
  return order[seats] || all.slice(0, seats);
}

/** Auto-rotate: hero's position advances one seat per hand. */
export function nextPos(session) {
  const names = posNames(session.seats);
  const last = session.hands[session.hands.length - 1];
  if (!last) return names[0];
  const i = names.indexOf(last.pos);
  return names[(i + 1 + names.length) % names.length];
}

export const newHand = (session) => ({
  id: crypto.randomUUID(), ts: Date.now(), pos: nextPos(session),
  hole: [], board: { f: [], t: [], r: [] }, events: [],
  villains: [{ label: "V1", cards: "unknown", playerId: null }], result: null, net: null,
});

export const newSession = (prev = {}) => ({
  id: crypto.randomUUID(), ts: Date.now(),
  name: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " session",
  unit: prev.unit ?? "bb", cur: prev.cur ?? "$",
  sb: prev.sb ?? 0.5, bb: prev.bb ?? 1, seats: prev.seats ?? 6,
  players: [], hands: [],
});

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
