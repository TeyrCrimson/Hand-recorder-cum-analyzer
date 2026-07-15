/* Pure poker functions. No imports, no DOM — testable with plain node. */

export const RANKS = ["A","K","Q","J","T","9","8","7","6","5","4","3","2"]; // idx 0..12
export const rVal = (i) => 14 - i; // rank index -> value 14..2
export const SUITS = ["s","h","d","c"];
export const SUIT_CHAR = { s: "♠", h: "♥", d: "♦", c: "♣" };
export const SUIT_COLOR = { s: "#C9D1CC", h: "#E4574F", d: "#4A9BE0", c: "#55B36A" };

export const cid = (v, si) => v * 4 + si; // card id, v = 2..14
export const cV = (id) => id >> 2;        // value
export const cS = (id) => id & 3;         // suit index

/* --- 5-card evaluator: comparable integer, category = floor(score / 15^5) --- */
export function evalFive(c) {
  const vs = c.map(cV).sort((a, b) => b - a);
  const flush = c.every((x) => cS(x) === cS(c[0]));
  const cnt = {};
  vs.forEach((v) => (cnt[v] = (cnt[v] || 0) + 1));
  const groups = Object.entries(cnt)
    .map(([v, n]) => [+v, n])
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  let straight = 0;
  if (groups.length === 5) {
    if (vs[0] - vs[4] === 4) straight = vs[0];
    else if (vs[0] === 14 && vs[1] === 5) straight = 5; // wheel A-5
  }
  const kick = groups.flatMap(([v, n]) => Array(n).fill(v)); // 5 tiebreak values
  const enc = (cat, tb) => tb.reduce((a, k) => a * 15 + k, cat);
  if (straight && flush) return enc(8, [straight, 0, 0, 0, 0]);
  if (groups[0][1] === 4) return enc(7, kick);
  if (groups[0][1] === 3 && groups[1][1] === 2) return enc(6, kick);
  if (flush) return enc(5, kick);
  if (straight) return enc(4, [straight, 0, 0, 0, 0]);
  if (groups[0][1] === 3) return enc(3, kick);
  if (groups[0][1] === 2 && groups[1][1] === 2) return enc(2, kick);
  if (groups[0][1] === 2) return enc(1, kick);
  return enc(0, kick);
}

/* --- best 5 of N (N = 5, 6, 7) --- */
export function evalBest(cards) {
  const n = cards.length;
  if (n === 5) return evalFive(cards);
  let best = -1;
  if (n === 6) { // drop 1 card: 6 subsets
    for (let a = 0; a < 6; a++)
      best = Math.max(best, evalFive(cards.filter((_, i) => i !== a)));
    return best;
  }
  for (let a = 0; a < 7; a++) // drop 2 cards: 21 subsets
    for (let b = a + 1; b < 7; b++)
      best = Math.max(best, evalFive(cards.filter((_, i) => i !== a && i !== b)));
  return best;
}

/* --- straight rank-outs for a rank set --- */
export function straightOuts(rankSet) {
  const outs = new Set();
  for (let v = 2; v <= 14; v++) {
    if (rankSet.has(v)) continue;
    const s = new Set(rankSet);
    s.add(v);
    if (hasStraightThrough(s, v)) outs.add(v);
  }
  return outs;
}
function hasStraightThrough(set, v) {
  const has = (x) => set.has(x) || (x === 1 && set.has(14)); // wheel ace
  for (let lo = Math.max(1, v - 4); lo <= v && lo + 4 <= 14; lo++) {
    let ok = true;
    for (let k = lo; k <= lo + 4; k++) if (!has(k)) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}

/* --- classification buckets and grid heat tiers --- */
export const MADE_ORDER = ["Straight flush","Quads","Full house","Flush","Straight",
  "Set","Trips","Two pair","Overpair","Top pair","Middle pair","Low pair",
  "Two overcards","Ace high","No made hand"];
export const TIER = {
  "Straight flush":0,"Quads":0,"Full house":0,"Flush":0,"Straight":0,
  "Set":1,"Trips":1,"Two pair":1,
  "Overpair":2,"Top pair":2,"Middle pair":2,"Low pair":2,
  "Two overcards":4,"Ace high":4,"No made hand":4 };
export const TIER_COLOR = ["#E0B34A","#55B36A","#4A9BE0","#9A6AD8","#39443E"];

const highCardBucket = (hv, bmax) =>
  hv[0] > bmax && hv[1] > bmax ? "Two overcards"
  : Math.max(...hv) === 14 ? "Ace high" : "No made hand";

/* --- classify one 2-card combo vs a 3-5 card board --- */
export function classify(hole, board) {
  const all = [...hole, ...board];
  const cat = Math.floor(evalBest(all) / 15 ** 5);
  const hv = hole.map(cV), bvs = board.map(cV);
  const bmax = Math.max(...bvs);
  const bUniq = [...new Set(bvs)].sort((a, b) => b - a);
  const pocket = hv[0] === hv[1];
  let made;

  if (cat >= 4) made = MADE_ORDER[8 - cat]; // SF / Quads / FH / Flush / Straight
  else if (cat === 3) made = pocket ? "Set" : "Trips";
  else if (cat === 2) made = "Two pair";
  else if (cat === 1) {
    const pr = [...new Set(all.map(cV))]
      .find((v) => all.filter((c) => cV(c) === v).length === 2);
    const onBoardOnly = board.filter((c) => cV(c) === pr).length >= 2;
    if (onBoardOnly) made = highCardBucket(hv, bmax); // pair belongs to the board
    else if (pocket && hv[0] > bmax) made = "Overpair";
    else if (pr === bmax) made = "Top pair";
    else if (pr >= (bUniq[1] ?? 0)) made = "Middle pair";
    else made = "Low pair";
  } else made = highCardBucket(hv, bmax);

  const draws = [];
  if (board.length < 5 && cat < 4) {
    const suitCount = [0, 0, 0, 0];
    all.forEach((c) => suitCount[cS(c)]++);
    const fd = [0, 1, 2, 3].some(
      (si) => suitCount[si] === 4 && hole.some((c) => cS(c) === si));
    if (fd) draws.push("Flush draw");
    const mine = straightOuts(new Set(all.map(cV)));
    const boardOnly = straightOuts(new Set(bvs));
    const outs = [...mine].filter((v) => !boardOnly.has(v));
    if (outs.length >= 2) draws.push("OESD / double gutter");
    else if (outs.length === 1) draws.push("Gutshot");
  }
  return { made, draws };
}

/* ---------------- range model ---------------- */

export const cellKey = (i, j) => `${i}-${j}`;
export const cellLabel = (i, j) =>
  i === j ? RANKS[i] + RANKS[j]
  : i < j ? RANKS[i] + RANKS[j] + "s" : RANKS[j] + RANKS[i] + "o";

export function cellCombos(i, j, dead) {
  const out = [];
  const hi = rVal(Math.min(i, j)), lo = rVal(Math.max(i, j));
  const ok = (a, b) => !dead.has(a) && !dead.has(b);
  if (i === j) {
    for (let a = 0; a < 4; a++)
      for (let b = a + 1; b < 4; b++)
        if (ok(cid(hi, a), cid(hi, b))) out.push([cid(hi, a), cid(hi, b)]);
  } else if (i < j) { // suited
    for (let s = 0; s < 4; s++)
      if (ok(cid(hi, s), cid(lo, s))) out.push([cid(hi, s), cid(lo, s)]);
  } else { // offsuit
    for (let a = 0; a < 4; a++)
      for (let b = 0; b < 4; b++)
        if (a !== b && ok(cid(hi, a), cid(lo, b))) out.push([cid(hi, a), cid(lo, b)]);
  }
  return out;
}

/* --- compact range notation: "77+, ATs+, KQo, T9s" --- */
export function parseRange(str) {
  const sel = new Set();
  const idx = (ch) => RANKS.indexOf(ch);
  for (const tokRaw of str.split(",")) {
    const tok = tokRaw.trim();
    const m = tok.match(/^([AKQJT98765432])([AKQJT98765432])([so]?)(\+?)$/);
    if (!m) continue;
    const [, r1, r2, so, plus] = m;
    if (r1 === r2) {
      const lim = idx(r1);
      for (let i = plus ? 0 : lim; i <= lim; i++) sel.add(cellKey(i, i));
    } else {
      const hi = Math.min(idx(r1), idx(r2)), lo = Math.max(idx(r1), idx(r2));
      const add = (a, b) => {
        if (so !== "o") sel.add(cellKey(a, b));
        if (so !== "s") sel.add(cellKey(b, a));
      };
      if (plus) for (let k = hi + 1; k <= lo; k++) add(hi, k);
      else add(hi, lo);
    }
  }
  return sel;
}

export const PRESETS = {
  "UTG ~15%": "66+, ATs+, KTs+, QTs+, JTs, T9s, 98s, AJo+, KQo",
  "CO ~27%": "22+, A2s+, K9s+, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, ATo+, KTo+, QTo+, JTo",
  "BTN ~44%": "22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, A2o+, K8o+, Q9o+, J9o+, T9o",
  "Pairs": "22+",
};

/* ---------------- equity (Monte Carlo) ---------------- */

export function equityMC(heroCombos, villCombos, board, trials) {
  const used0 = new Set(board);
  let win = 0, tie = 0, n = 0;
  const deckBase = [];
  for (let v = 2; v <= 14; v++)
    for (let s = 0; s < 4; s++)
      if (!used0.has(cid(v, s))) deckBase.push(cid(v, s));
  for (let t = 0; t < trials; t++) {
    const h = heroCombos[(Math.random() * heroCombos.length) | 0];
    const v = villCombos[(Math.random() * villCombos.length) | 0];
    if (h.includes(v[0]) || h.includes(v[1])) continue; // card collision: skip
    const used = new Set([...h, ...v]);
    const deck = deckBase.filter((c) => !used.has(c));
    for (let k = 0; k < 5 - board.length; k++) { // partial Fisher-Yates
      const r = k + ((Math.random() * (deck.length - k)) | 0);
      [deck[k], deck[r]] = [deck[r], deck[k]];
    }
    const run = deck.slice(0, 5 - board.length);
    const hs = evalBest([...h, ...board, ...run]);
    const vs = evalBest([...v, ...board, ...run]);
    if (hs > vs) win++;
    else if (hs === vs) tie++;
    n++;
  }
  return { win, tie, n };
}
