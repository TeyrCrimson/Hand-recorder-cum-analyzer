/* Run with: node src/model.test.mjs */
import assert from "node:assert/strict";
import { posNames, nextPos, newSession, newHand, toCall, potEstimate, activeStreet,
  usedCards, fmtAmt, newPlayer, PLAYER_TYPES, playerStats } from "./model.js";

const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

/* position rotation */
assert.deepEqual(posNames(2), ["SB", "BB"]);
assert.equal(posNames(6).length, 6);
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

/* street detection from board */
assert.equal(activeStreet(h), "p");
h.board.f = [23, 30, 41];
assert.equal(activeStreet(h), "f");
h.board.t = [50];
assert.equal(activeStreet(h), "t");

/* dead cards + villain unknown default */
assert.equal(h.villains[0].cards, "unknown");
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
assert.equal(newHand(s).villains[0].playerId, null);

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
