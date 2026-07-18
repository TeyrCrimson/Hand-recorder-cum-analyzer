/* Run with: node src/model.test.mjs */
import assert from "node:assert/strict";
import { posNames, nextPos, newSession, newHand, toCall, potEstimate, activeStreet,
  usedCards, fmtAmt, newPlayer, PLAYER_TYPES, playerStats,
  actionOrder, livePositions, actionOn, handOver, ledgerNet,
  heroCommit, netEstimate, guessPlayerAt, seatOrderOf, playerAt } from "./model.js";

const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

/* position rotation */
assert.deepEqual(posNames(2), ["SB", "BB"]);
assert.equal(posNames(6).length, 6);
for (let n = 2; n <= 12; n++) assert.equal(posNames(n).length, n); // full ring up to 12-max
assert.deepEqual(actionOrder(10, "p"),
  ["UTG", "UTG1", "UTG2", "MP", "LJ", "HJ", "CO", "BTN", "SB", "BB"]);
assert.deepEqual(actionOrder(12, "p"), ["UTG", "UTG1", "UTG2", "UTG3", "MP",
  "MP1", "LJ", "HJ", "CO", "BTN", "SB", "BB"]);
assert.equal(posNames(13).length, 12);  // clamped: 12-handed is the max
assert.equal(posNames(0).length, 2);    // clamped low
const s = newSession(); // 0.5/1, 6-max, bb units
const h1 = newHand(s);
assert.equal(h1.pos, "BTN");
s.hands.push(h1);
assert.equal(newHand(s).pos, "SB");

/* to-call & pot: HU-style line — H raises to 3bb, V calls; flop V bets 4, H calls */
const h = newHand(s);
h.events = [
  { st: "p", actor: "H", a: "R", amt: 3 },
  { st: "p", actor: "V1", a: "C" },
  { st: "f", actor: "V1", a: "B", amt: 4 },
  { st: "f", actor: "H", a: "C" },
];
assert.equal(toCall(h, "p"), 3);
assert.equal(toCall(h, "f"), 4);
assert.equal(toCall(newHand(s), "p", 2), 2); // currency session, $1/$2: facing $2
/* ~pot = sb+bb (1.5) + 3+3 preflop + 4+4 flop = 15.5. True pot is 14.5 if
   the caller was the BB (blind overlaps the call) — the model documents this
   ≤1bb overestimate; the UI labels pot with "~". */
close(potEstimate(h, s), 15.5);

/* hero commitment + net estimate (h: hero SB, raised to 3 pre, called 4 flop) */
close(heroCommit(h, s), 7);                       // max(0.5, 3) + 4
close(netEstimate(h, s, "won"), 8.5);             // ~pot 15.5 − own 7
close(netEstimate(h, s, "lost"), -7);
assert.equal(netEstimate(h, s, "chop"), null);    // chop stays manual
close(heroCommit({ ...h, events: [], pos: "BB" }, s), 1); // walk: blind only

/* street detection from board */
assert.equal(activeStreet(h), "p");
h.board.f = [23, 30, 41];
assert.equal(activeStreet(h), "f");
h.board.t = [50];
assert.equal(activeStreet(h), "t");

/* dead cards; new hands start with no villains (created per action) */
assert.deepEqual(newHand(s).villains, []);
h.villains = [{ label: "V1", cards: "unknown", playerId: null }];
h.hole = [8, 9];
h.villains[0].cards = [12, 13];
assert.deepEqual([...usedCards(h)].sort((a, b) => a - b), [8, 9, 12, 13, 23, 30, 41, 50]);

/* formatting per unit */
assert.equal(fmtAmt(2.5, s), "2.5bb");
assert.equal(fmtAmt(2.5, { ...s, unit: "cur" }), "$2.50");

/* player roster */
assert.deepEqual(newSession().players, []);
const p = newPlayer();
assert.equal(p.type, "Unknown");
assert.ok(PLAYER_TYPES.includes(p.type));
/* turn order */
assert.deepEqual(actionOrder(6, "p"), ["UTG", "HJ", "CO", "BTN", "SB", "BB"]);
assert.deepEqual(actionOrder(6, "f"), ["SB", "BB", "UTG", "HJ", "CO", "BTN"]);
assert.deepEqual(actionOrder(2, "p"), ["SB", "BB"]);
assert.deepEqual(actionOrder(2, "f"), ["BB", "SB"]);

/* whose turn: 6-max, hero on the button */
const ht = { ...newHand(s), pos: "BTN", villains: [], events: [] };
assert.equal(actionOn(ht, 6, "p"), "UTG");
ht.events.push({ st: "p", actor: "UTG", a: "F" }, { st: "p", actor: "HJ", a: "C" },
  { st: "p", actor: "CO", a: "F" });
assert.equal(actionOn(ht, 6, "p"), "BTN");
ht.events.push({ st: "p", actor: "H", a: "R", amt: 3 });     // raise re-opens
assert.equal(actionOn(ht, 6, "p"), "SB");
ht.events.push({ st: "p", actor: "SB", a: "F" }, { st: "p", actor: "BB", a: "C" },
  { st: "p", actor: "HJ", a: "C" });
assert.equal(actionOn(ht, 6, "p"), null);                    // preflop closed
assert.deepEqual(livePositions(ht, 6).sort(), ["BB", "BTN", "HJ"]);
assert.equal(actionOn(ht, 6, "f"), "BB");                    // first live postflop
ht.events.push({ st: "f", actor: "BB", a: "X" }, { st: "f", actor: "HJ", a: "B", amt: 4 });
assert.equal(actionOn(ht, 6, "f"), "BTN");                   // bet re-opens, hero next
ht.events.push({ st: "f", actor: "H", a: "F" }, { st: "f", actor: "BB", a: "F" });
assert.ok(handOver(ht, 6));
assert.equal(actionOn(ht, 6, "f"), null);

/* limped pot: BB gets the option */
const ho = { ...newHand(s), pos: "UTG", villains: [], events: [
  { st: "p", actor: "H", a: "C" }, { st: "p", actor: "HJ", a: "F" },
  { st: "p", actor: "CO", a: "F" }, { st: "p", actor: "BTN", a: "C" },
  { st: "p", actor: "SB", a: "C" }] };
assert.equal(actionOn(ho, 6, "p"), "BB");

/* legacy hands (Vn actors, no pos) fall back to manual mode */
const hl = { ...newHand(s), villains: [{ label: "V1", cards: "unknown", playerId: null }],
  events: [{ st: "p", actor: "V1", a: "C" }] };
assert.equal(actionOn(hl, 6, "p"), null);

/* hero position picked at setup drives the first hand only */
const sh = { ...newSession(), heroPos: "CO" };
assert.equal(newHand(sh).pos, "CO");
sh.hands.push({ ...newHand(sh) });                 // CO recorded
assert.equal(newHand(sh).pos, "BTN");              // then rotation takes over
assert.equal(newHand({ ...newSession(), heroPos: "XX" }).pos, "BTN"); // stale -> default

/* seat map: players clockwise from hero decide positions each hand */
const sm = { ...newSession(), seats: 6, seatOrder: ["a", null, "b", null, null] };
assert.equal(seatOrderOf(sm).length, 5);
assert.equal(seatOrderOf({ ...sm, seats: 4 }).length, 3);   // resize absorbed on read
const hBTN = { ...newHand(sm), pos: "BTN" };
assert.equal(playerAt(sm, hBTN, "SB"), "a");   // 1 seat clockwise from hero
assert.equal(playerAt(sm, hBTN, "UTG"), "b");  // 3 seats clockwise
assert.equal(playerAt(sm, hBTN, "BB"), null);  // empty seat
assert.equal(playerAt(sm, hBTN, "BTN"), null); // hero's own seat
const hSB = { ...newHand(sm), pos: "SB" };     // button moved: same seats, new names
assert.equal(playerAt(sm, hSB, "BB"), "a");
assert.equal(playerAt(sm, hSB, "HJ"), "b");
/* sessions without a seat map fall back to rotation inference */
assert.equal(playerAt({ ...sm, seatOrder: undefined, players: [], hands: [] },
  hBTN, "SB"), null);

/* villain link carried forward with the button rotation */
const sp = { ...newSession(), players: [] };
const g1 = { ...newHand(sp), pos: "BTN",
  villains: [{ label: "CO", pos: "CO", cards: "unknown", playerId: "alice" }] };
sp.hands = [g1];
const g2 = { ...newHand(sp), pos: "SB", villains: [] }; // button moved one seat
sp.hands.push(g2);
assert.equal(guessPlayerAt(sp, g2, "BTN"), "alice"); // last hand's CO is now BTN
assert.equal(guessPlayerAt(sp, g2, "UTG"), null);    // nobody linked there
assert.equal(guessPlayerAt(sp, g1, "CO"), null);     // first hand: no prior info

/* ledger */
const sl = newSession();
assert.deepEqual(ledgerNet(sl)[0], { key: "H", name: "Hero", invested: 100, stack: null, net: null });
sl.ledger.H = { buyIns: [100, 50], stack: 0 };
assert.equal(ledgerNet(sl)[0].net, -150);
assert.deepEqual(ledgerNet({ ...sl, ledger: undefined }), []); // old sessions

/* player stats over linked hands */
const P = newPlayer();
const sess = { ...newSession(), players: [P] };
const hA = newHand(sess);                    // linked: calls pre, bets flop, shows
hA.villains = [{ label: "V1", cards: [16, 21], playerId: P.id }];
hA.events = [
  { st: "p", actor: "H", a: "R", amt: 3 }, { st: "p", actor: "V1", a: "C" },
  { st: "f", actor: "V1", a: "B", amt: 4 }, { st: "f", actor: "H", a: "C" },
];
const hB = newHand(sess);                    // linked: folds pre, unknown cards
hB.villains = [{ label: "V1", cards: "unknown", playerId: P.id }];
hB.events = [{ st: "p", actor: "V1", a: "F" }];
const hC = newHand(sess);                    // NOT linked -> must be ignored
hC.events = [{ st: "p", actor: "V1", a: "R", amt: 3 }];
sess.hands = [hA, hB, hC];

const st = playerStats(sess, P.id);
assert.equal(st.tracked, 2);
assert.equal(st.vpip, 1);      // hA call counts, hB fold doesn't
assert.equal(st.pfr, 0);       // no preflop raise by the player
assert.equal(st.agg, 1);       // flop bet
assert.equal(st.passive, 0);
assert.equal(st.shown.length, 1);
assert.deepEqual(st.shown[0].cards, [16, 21]);
assert.equal(playerStats(sess, "nobody").tracked, 0);

console.log("all model.js tests passed");
