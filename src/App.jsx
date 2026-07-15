import { useState, useEffect } from "react";
import { RANKS, SUITS, SUIT_CHAR, SUIT_COLOR, rVal, cid, cV, cS } from "./poker.js";
import { STREET_NAME, ACTIONS, posNames, newSession, newHand, toCall, potEstimate,
  fmtAmt, usedCards, activeStreet, exportSession, newPlayer, PLAYER_TYPES, playerStats }
  from "./model.js";

const C = { bg: "#0E1512", panel: "#18211C", line: "#2A362F", text: "#E8EDE9",
  dim: "#8FA096", gold: "#E0B34A", red: "#E4574F", green: "#55B36A" };
const KEY = "handlog:v1";

/* ---------- tiny shared widgets ---------- */
const chip = (on) => ({ padding: "8px 12px", fontSize: 13, borderRadius: 8,
  border: `1px solid ${on ? C.gold : C.line}`, background: on ? C.gold : C.panel,
  color: on ? "#111" : C.text, fontWeight: on ? 700 : 400 });
const Chip = ({ on, onClick, children, style }) => (
  <button onClick={onClick} style={{ ...chip(on), ...style }}>{children}</button>);
const Sec = ({ children }) => (
  <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
    color: C.dim, fontFamily: "ui-monospace, monospace", margin: "16px 0 8px" }}>
    {children}</div>);
const CardTag = ({ id, onClick }) => (
  <button onClick={onClick} style={{ width: 38, height: 50, borderRadius: 6,
    border: `1px solid ${C.line}`, background: "#F2F4F1", fontWeight: 700,
    fontFamily: "ui-monospace, monospace", fontSize: 16,
    color: cS(id) === 0 ? "#222" : SUIT_COLOR[SUITS[cS(id)]] }}>
    {"AKQJT98765432"[14 - cV(id)]}{SUIT_CHAR[SUITS[cS(id)]]}</button>);
const Slot = ({ onClick }) => (
  <button onClick={onClick} style={{ width: 38, height: 50, borderRadius: 6,
    border: `1px dashed ${C.dim}`, background: "none", color: C.dim, fontSize: 20 }}>
    +</button>);

/* Bottom-sheet card picker: fills `need` cards into onPick, skipping dead. */
function PickerSheet({ dead, onPick, onClose, label }) {
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 10,
      background: C.panel, borderTop: `1px solid ${C.gold}`, padding: 10,
      paddingBottom: "calc(10px + env(safe-area-inset-bottom))" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: C.gold }}>{label}</span>
        <button onClick={onClose} style={{ background: "none", border: "none",
          color: C.dim, fontSize: 13 }}>done</button>
      </div>
      {SUITS.map((s, si) => (
        <div key={s} style={{ display: "grid", gridTemplateColumns: "repeat(13,1fr)",
          gap: 2, marginBottom: 2 }}>
          {RANKS.map((r, ri) => {
            const id = cid(rVal(ri), si), used = dead.has(id);
            return (
              <button key={r} disabled={used} onClick={() => onPick(id)}
                style={{ aspectRatio: "0.8", borderRadius: 3, fontSize: 11,
                  fontFamily: "ui-monospace, monospace", opacity: used ? 0.25 : 1,
                  border: `1px solid ${C.line}`, background: C.bg,
                  color: SUIT_COLOR[s] }}>
                {r}{SUIT_CHAR[s]}</button>);
          })}
        </div>))}
    </div>);
}

/* ---------- App shell + persistence ---------- */
export default function App() {
  const [data, setData] = useState({ sessions: [] });
  const [view, setView] = useState({ screen: "sessions" });

  useEffect(() => { try {
    const r = localStorage.getItem(KEY);
    if (r) { const d = JSON.parse(r);
      setData({ sessions: d.sessions.map((s) => ({ players: [], ...s })) }); }
  } catch {} }, []);
  useEffect(() => { const t = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
  }, 400); return () => clearTimeout(t); }, [data]);

  const session = data.sessions.find((s) => s.id === view.sid);
  const patchSession = (sid, fn) => setData((d) => ({ sessions:
    d.sessions.map((s) => (s.id === sid ? fn(s) : s)) }));

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh", maxWidth: 480,
      margin: "0 auto", fontFamily: "ui-sans-serif, system-ui", userSelect: "none",
      padding: "12px 12px 90px" }}>
      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 18,
        letterSpacing: 3, color: C.gold, marginBottom: 4 }}>HAND·LOG</div>

      {view.screen === "sessions" && (
        <Sessions data={data} setData={setData}
          open={(sid) => setView({ screen: "session", sid })} />)}
      {view.screen === "session" && session && (
        <SessionView session={session} patch={(fn) => patchSession(session.id, fn)}
          back={() => setView({ screen: "sessions" })}
          openHand={(hid) => setView({ screen: "hand", sid: session.id, hid })} />)}
      {view.screen === "hand" && session && (
        <HandEditor session={session}
          hand={session.hands.find((h) => h.id === view.hid)}
          patch={(fn) => patchSession(session.id, (s) => ({ ...s,
            hands: s.hands.map((h) => (h.id === view.hid ? fn(h) : h)) }))}
          back={() => setView({ screen: "session", sid: session.id })} />)}
    </div>);
}

/* ---------- Sessions screen ---------- */
function Sessions({ data, setData, open }) {
  const [confirm, setConfirm] = useState(null); // sid armed for delete
  const last = data.sessions[data.sessions.length - 1];
  const [draft, setDraft] = useState(null);

  const create = () => {
    const s = { ...newSession(last || {}), ...draft,
      sb: +(draft.sb ?? last?.sb ?? 0.5), bb: +(draft.bb ?? last?.bb ?? 1),
      seats: +(draft.seats ?? last?.seats ?? 6) };
    setData((d) => ({ sessions: [...d.sessions, s] }));
    setDraft(null); open(s.id);
  };

  return (
    <div>
      <Sec>Sessions</Sec>
      {data.sessions.slice().reverse().map((s) => (
        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8,
          background: C.panel, borderRadius: 10, padding: 12, marginBottom: 8 }}>
          <button onClick={() => open(s.id)} style={{ flex: 1, textAlign: "left",
            background: "none", border: "none", color: C.text }}>
            <div style={{ fontSize: 15 }}>{s.name}</div>
            <div style={{ fontSize: 11, color: C.dim }}>
              {s.unit === "bb" ? `${s.sb}/${s.bb} (bb units)` : `${s.cur}${s.sb}/${s.cur}${s.bb}`}
              {" · "}{s.seats}-max · {s.hands.length} hands</div>
          </button>
          <button onClick={() => confirm === s.id
              ? (setData((d) => ({ sessions: d.sessions.filter((x) => x.id !== s.id) })), setConfirm(null))
              : setConfirm(s.id)}
            style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 8,
              color: C.red, fontSize: 12, padding: "6px 10px" }}>
            {confirm === s.id ? "sure?" : "✕"}</button>
        </div>))}
      {data.sessions.length === 0 && !draft &&
        <p style={{ color: C.dim, fontSize: 13 }}>No sessions yet.</p>}

      {!draft ? (
        <Chip on onClick={() => setDraft({})} style={{ width: "100%", padding: 14 }}>
          ＋ New session</Chip>
      ) : (
        <div style={{ background: C.panel, borderRadius: 10, padding: 12 }}>
          <Field label="Name" value={draft.name ?? newSession(last || {}).name}
            onChange={(v) => setDraft({ ...draft, name: v })} />
          <div style={{ display: "flex", gap: 8 }}>
            <Field label="SB" value={draft.sb ?? last?.sb ?? 0.5} num
              onChange={(v) => setDraft({ ...draft, sb: v })} />
            <Field label="BB" value={draft.bb ?? last?.bb ?? 1} num
              onChange={(v) => setDraft({ ...draft, bb: v })} />
            <Field label="Seats" value={draft.seats ?? last?.seats ?? 6} num
              onChange={(v) => setDraft({ ...draft, seats: v })} />
          </div>
          <div style={{ display: "flex", gap: 6, margin: "10px 0" }}>
            <Chip on={(draft.unit ?? last?.unit ?? "bb") === "bb"}
              onClick={() => setDraft({ ...draft, unit: "bb" })}>Big blinds</Chip>
            <Chip on={(draft.unit ?? last?.unit ?? "bb") === "cur"}
              onClick={() => setDraft({ ...draft, unit: "cur" })}>Currency</Chip>
            {(draft.unit ?? last?.unit) === "cur" && (
              <Field label="Symbol" value={draft.cur ?? last?.cur ?? "$"}
                onChange={(v) => setDraft({ ...draft, cur: v })} small />)}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Chip on onClick={create} style={{ flex: 1 }}>Start</Chip>
            <Chip onClick={() => setDraft(null)}>Cancel</Chip>
          </div>
        </div>)}
    </div>);
}

function Field({ label, value, onChange, num, small }) {
  return (
    <label style={{ flex: small ? "0 0 70px" : 1, fontSize: 11, color: C.dim,
      display: "block", marginBottom: 8 }}>
      {label}
      <input type={num ? "number" : "text"} inputMode={num ? "decimal" : "text"}
        value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", marginTop: 4, padding: 8,
          borderRadius: 6, border: `1px solid ${C.line}`, background: C.bg,
          color: C.text, fontSize: 15 }} />
    </label>);
}

/* ---------- Session screen ---------- */
function SessionView({ session, patch, back, openHand }) {
  const [confirm, setConfirm] = useState(null);
  const record = () => {
    const h = newHand(session);
    patch((s) => ({ ...s, hands: [...s.hands, h] }));
    openHand(h.id);
  };
  const download = () => {
    const blob = new Blob([exportSession(session)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"),
      { href: URL.createObjectURL(blob), download: `${session.name.replace(/\s+/g, "_")}.json` });
    a.click(); URL.revokeObjectURL(a.href);
  };
  const net = session.hands.reduce((a, h) => a + (h.net ?? 0), 0);

  return (
    <div>
      <button onClick={back} style={linkBtn}>‹ sessions</button>
      <Sec>{session.name} · {session.hands.length} hands ·
        net {fmtAmt(net, session)}</Sec>
      <Roster session={session} patch={patch} />
      <Sec>Hands</Sec>
      {session.hands.slice().reverse().map((h) => (
        <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8,
          background: C.panel, borderRadius: 10, padding: 10, marginBottom: 6 }}>
          <button onClick={() => openHand(h.id)} style={{ flex: 1, textAlign: "left",
            background: "none", border: "none", color: C.text }}>
            <span style={{ fontFamily: "ui-monospace, monospace", color: C.gold }}>
              {h.pos}</span>
            {" "}{h.hole.map((c) => (
              <span key={c} style={{ color: SUIT_COLOR[SUITS[cS(c)]],
                fontFamily: "ui-monospace, monospace" }}>
                {"AKQJT98765432"[14 - cV(c)]}{SUIT_CHAR[SUITS[cS(c)]]} </span>))}
            <span style={{ fontSize: 11, color: h.result === "won" ? C.green :
              h.result === "lost" ? C.red : C.dim }}>
              {h.result ?? "unfinished"}{h.net != null && ` ${fmtAmt(h.net, session)}`}
            </span>
          </button>
          <button onClick={() => confirm === h.id
              ? (patch((s) => ({ ...s, hands: s.hands.filter((x) => x.id !== h.id) })), setConfirm(null))
              : setConfirm(h.id)}
            style={{ background: "none", border: "none", color: C.red, fontSize: 12 }}>
            {confirm === h.id ? "sure?" : "✕"}</button>
        </div>))}
      <Chip on onClick={record} style={{ width: "100%", padding: 14, marginTop: 8 }}>
        ＋ Record hand</Chip>
      <Chip onClick={download} style={{ width: "100%", marginTop: 8 }}>
        Export session (JSON)</Chip>
    </div>);
}
const linkBtn = { background: "none", border: "none", color: C.dim, fontSize: 13,
  padding: "4px 0" };

/* ---------- Session player roster ---------- */
function Roster({ session, patch }) {
  const [openId, setOpenId] = useState(null);   // player expanded for editing
  const [confirm, setConfirm] = useState(null);
  const players = session.players ?? [];
  const upd = (id, fn) => patch((s) => ({ ...s,
    players: s.players.map((p) => (p.id === id ? fn(p) : p)) }));

  return (
    <div>
      <Sec>Players</Sec>
      {players.map((p) => {
        const st = playerStats(session, p.id);
        return (
        <div key={p.id} style={{ background: C.panel, borderRadius: 10,
          padding: 10, marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setOpenId(openId === p.id ? null : p.id)}
              style={{ flex: 1, textAlign: "left", background: "none",
                border: "none", color: C.text, fontSize: 14 }}>
              {p.name || "(unnamed)"}
              <span style={{ color: C.gold, fontFamily: "ui-monospace, monospace",
                marginLeft: 8, fontSize: 12 }}>{p.type}</span>
              <span style={{ color: C.dim, fontSize: 11, marginLeft: 8 }}>
                {st.tracked} hand{st.tracked === 1 ? "" : "s"}</span>
              {p.note && openId !== p.id &&
                <div style={{ fontSize: 11, color: C.dim }}>{p.note}</div>}
            </button>
            <button onClick={() => confirm === p.id
                ? (patch((s) => ({ ...s, players: s.players.filter((x) => x.id !== p.id) })),
                   setConfirm(null))
                : setConfirm(p.id)}
              style={{ background: "none", border: "none", color: C.red, fontSize: 12 }}>
              {confirm === p.id ? "sure?" : "✕"}</button>
          </div>
          {openId === p.id && (
            <div style={{ marginTop: 8 }}>
              <Field label="Name / seat" value={p.name}
                onChange={(v) => upd(p.id, (x) => ({ ...x, name: v }))} />
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                {PLAYER_TYPES.map((t) => (
                  <Chip key={t} on={p.type === t}
                    onClick={() => upd(p.id, (x) => ({ ...x, type: t }))}>{t}</Chip>))}
              </div>
              <Field label="Notes (tendencies, tells, sizing habits...)" value={p.note}
                onChange={(v) => upd(p.id, (x) => ({ ...x, note: v }))} />
              <StatLine st={st} />
            </div>)}
        </div>); })}
      <Chip onClick={() => { const p = newPlayer();
          patch((s) => ({ ...s, players: [...(s.players ?? []), p] }));
          setOpenId(p.id); }}
        style={{ width: "100%" }}>＋ Add player</Chip>
    </div>);
}

/* Stats over tracked hands only — a biased sample, and labeled as such. */
function StatLine({ st }) {
  if (!st.tracked) return (
    <div style={{ fontSize: 11, color: C.dim }}>
      No linked hands yet — use the "who?" selector when recording.</div>);
  const pc = (n, d) => (d ? Math.round((100 * n) / d) + "%" : "—");
  return (
    <div style={{ fontSize: 12, fontFamily: "ui-monospace, monospace",
      color: C.text, lineHeight: 1.9 }}>
      <span style={{ color: C.dim }}>of {st.tracked} tracked: </span>
      VPIP {pc(st.vpip, st.tracked)} · PFR {pc(st.pfr, st.tracked)} ·
      AggF {pc(st.agg, st.agg + st.passive)}
      {st.shown.length > 0 && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: C.dim }}>shown:</span>
          {st.shown.map((s, i) => (
            <span key={i} style={{ background: "#F2F4F1", borderRadius: 4,
              padding: "1px 5px", fontWeight: 700 }}>
              {s.cards.map((c) => (
                <span key={c} style={{ color: cS(c) === 0 ? "#222"
                    : SUIT_COLOR[SUITS[cS(c)]] }}>
                  {"AKQJT98765432"[14 - cV(c)]}{SUIT_CHAR[SUITS[cS(c)]]}</span>))}
            </span>))}
        </div>)}
    </div>);
}

/* ---------- Hand editor (the fewest-taps core) ---------- */
function HandEditor({ session, hand, patch, back }) {
  const [actor, setActor] = useState("H");
  const [pending, setPending] = useState(null);  // "B"|"R"|"A" awaiting amount
  const [custom, setCustom] = useState("");
  const [picker, setPicker] = useState(null);    // {target, need, label}
  const [armed, setArmed] = useState(null);      // event index armed for delete
  if (!hand) return null;

  const names = posNames(session.seats);
  const dead = usedCards(hand);
  const bb = session.unit === "bb" ? 1 : session.bb;
  const pot = potEstimate(hand, session);
  const street = activeStreet(hand);

  const villains = hand.villains;
  const actors = ["H", ...villains.map((v) => v.label)];
  const flip = (a) => (a === "H" ? villains[0]?.label ?? "H" : "H");

  const addEvent = (a, amt) => {
    patch((h) => ({ ...h, events: [...h.events, { st: street, actor, a,
      ...(amt != null ? { amt: +amt } : {}) }] }));
    setActor(flip(actor)); setPending(null); setCustom("");
  };
  const act = (a) => "BRA".includes(a) ? setPending(a) : addEvent(a);
  const delEvent = (i) => {
    patch((h) => ({ ...h, events: h.events.filter((_, k) => k !== i) }));
    setArmed(null);
  };

  /* amount quick-chips: preflop = bb multiples; postflop = pot fractions */
  const quick = street === "p"
    ? [2, 2.5, 3, 3.5].map((m) => m * bb)
    : [1 / 3, 1 / 2, 2 / 3, 1].map((f) => +(f * pot).toFixed(1));

  const setCards = (target, id) => patch((h) => {
    if (target === "hole") return { ...h, hole: [...h.hole, id].slice(0, 2) };
    if (target.startsWith("v")) {
      const vi = +target.slice(1);
      const vs = h.villains.map((v, k) => k !== vi ? v :
        { ...v, cards: [...(Array.isArray(v.cards) ? v.cards : []), id].slice(0, 2) });
      return { ...h, villains: vs };
    }
    const need = target === "f" ? 3 : 1;
    return { ...h, board: { ...h.board,
      [target]: [...h.board[target], id].slice(0, need) } };
  });
  const clearCards = (target) => patch((h) => {
    if (target === "hole") return { ...h, hole: [] };
    if (target.startsWith("v")) return { ...h, villains: h.villains.map((v, k) =>
      k === +target.slice(1) ? { ...v, cards: [] } : v) };
    return { ...h, board: { ...h.board, [target]: [] } };
  });

  const CardRow = ({ target, cards, need, label }) => (
    <span style={{ display: "inline-flex", gap: 4, marginRight: 10 }}>
      {cards.map((c) => <CardTag key={c} id={c} onClick={() => clearCards(target)} />)}
      {cards.length < need &&
        <Slot onClick={() => setPicker({ target, need: need - cards.length, label })} />}
    </span>);

  return (
    <div>
      <button onClick={back} style={linkBtn}>‹ save & back</button>

      <Sec>Position</Sec>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {names.map((p) => (
          <Chip key={p} on={hand.pos === p}
            onClick={() => patch((h) => ({ ...h, pos: p }))}>{p}</Chip>))}
      </div>

      <Sec>Cards · ~pot {fmtAmt(pot, session)}</Sec>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={lbl}>Hole</span>
        <CardRow target="hole" cards={hand.hole} need={2} label="Hero hole cards" />
        <span style={lbl}>Flop</span>
        <CardRow target="f" cards={hand.board.f} need={3} label="Flop" />
        <span style={lbl}>Turn</span>
        <CardRow target="t" cards={hand.board.t} need={1} label="Turn" />
        <span style={lbl}>River</span>
        <CardRow target="r" cards={hand.board.r} need={1} label="River" />
      </div>

      <Sec>{STREET_NAME[street]} action · to call {fmtAmt(toCall(hand, street, bb), session)}</Sec>
      <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
        {actors.map((a) => (
          <Chip key={a} on={actor === a} onClick={() => setActor(a)}>{a}</Chip>))}
        {villains.length < 3 && (
          <Chip onClick={() => patch((h) => ({ ...h, villains: [...h.villains,
            { label: `V${h.villains.length + 1}`, cards: "unknown" }] }))}>＋V</Chip>)}
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {Object.entries(ACTIONS).map(([k, name]) => (
          <Chip key={k} on={pending === k} onClick={() => act(k)}>{name}</Chip>))}
      </div>
      {pending && (
        <div style={{ display: "flex", gap: 5, marginTop: 8, alignItems: "center",
          flexWrap: "wrap" }}>
          {quick.map((q) => (
            <Chip key={q} on onClick={() => addEvent(pending, q)}>
              {fmtAmt(q, session)}</Chip>))}
          <input type="number" inputMode="decimal" placeholder="custom" value={custom}
            onChange={(e) => setCustom(e.target.value)}
            style={{ width: 80, padding: 8, borderRadius: 6, background: C.bg,
              border: `1px solid ${C.line}`, color: C.text }} />
          {custom && <Chip on onClick={() => addEvent(pending, custom)}>set</Chip>}
        </div>)}

      {hand.events.length > 0 && <>
        <Sec>Timeline — tap an entry twice to remove it</Sec>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {hand.events.map((e, i) => (
            <Chip key={i} on={armed === i}
              onClick={() => (armed === i ? delEvent(i) : setArmed(i))}
              style={armed === i ? { background: C.red, borderColor: C.red } : {}}>
              {STREET_NAME[e.st][0]}· {e.actor} {ACTIONS[e.a]}
              {e.amt != null && ` ${fmtAmt(e.amt, session)}`}
              {armed === i && " ✕"}</Chip>))}
        </div>
      </>}

      <Sec>Villain cards (set any time — even next week)</Sec>
      {villains.map((v, vi) => (
        <div key={v.label} style={{ display: "flex", gap: 8, alignItems: "center",
          flexWrap: "wrap", marginBottom: 6 }}>
          <span style={lbl}>{v.label}</span>
          <Chip on={v.cards === "unknown"}
            onClick={() => patch((h) => ({ ...h, villains: h.villains.map((x, k) =>
              k === vi ? { ...x, cards: x.cards === "unknown" ? [] : "unknown" } : x) }))}>
            Unknown</Chip>
          {Array.isArray(v.cards) &&
            <CardRow target={`v${vi}`} cards={v.cards} need={2}
              label={`${v.label} hole cards`} />}
          {(session.players ?? []).length > 0 && (
            <select value={v.playerId ?? ""}
              onChange={(e) => patch((h) => ({ ...h, villains: h.villains.map((x, k) =>
                k === vi ? { ...x, playerId: e.target.value || null } : x) }))}
              style={{ marginLeft: "auto", maxWidth: 130, padding: 8, borderRadius: 6,
                background: C.bg, border: `1px solid ${C.line}`, color: C.text,
                fontSize: 12 }}>
              <option value="">who?</option>
              {session.players.map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.name || "(unnamed)") + " · " + p.type}</option>))}
            </select>)}
        </div>))}

      <Sec>Result</Sec>
      <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
        {["won", "lost", "chop"].map((r) => (
          <Chip key={r} on={hand.result === r}
            onClick={() => patch((h) => ({ ...h, result: r }))}>{r}</Chip>))}
        <input type="number" inputMode="decimal" placeholder={`net ± (${session.unit === "bb" ? "bb" : session.cur})`}
          value={hand.net ?? ""}
          onChange={(e) => patch((h) => ({ ...h,
            net: e.target.value === "" ? null : +e.target.value }))}
          style={{ width: 110, padding: 8, borderRadius: 6, background: C.bg,
            border: `1px solid ${C.line}`, color: C.text }} />
      </div>

      {picker && (
        <PickerSheet dead={dead} label={picker.label}
          onClose={() => setPicker(null)}
          onPick={(id) => {
            setCards(picker.target, id);
            if (picker.need <= 1) setPicker(null);
            else setPicker({ ...picker, need: picker.need - 1 });
          }} />)}
    </div>);
}
const lbl = { fontSize: 12, color: C.dim, minWidth: 36 };
