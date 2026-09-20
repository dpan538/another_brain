import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Logo from "./ui/Logo.jsx";
import Scene from "./ui/Scene.jsx";
import { STOPS } from "./ui/scene.js";
import About from "./ui/About.jsx";
import KeySheet from "./ui/KeySheet.jsx";
import MemorySheet from "./ui/MemorySheet.jsx";
import WavyCard from "./ui/WavyCard.jsx";
import Keyboard from "./ui/Keyboard.jsx";
import { createAnswerPath, systemNote } from "./engine/answer_path.js";
import { createMemoryStore, groupConversations } from "./engine/memory_store.js";
import { clearKey } from "./engine/key_store.js";
import { U } from "./ui/Hand.jsx";

// the owner's key lives behind this endpoint; "" switches to a key stored on the device
const PROXY_URL = import.meta.env.VITE_EFISH_PROXY_URL ?? "/api/chat";

export default function App() {
  const deck = useRef(null);
  const stage = useRef(null);
  const pagesEl = useRef(null);
  const glideRef = useRef(null);
  const memory = useMemo(() => createMemoryStore(), []);
  const path = useMemo(() => createAnswerPath({ proxyUrl: PROXY_URL }), []);

  const [turns, setTurns] = useState([]);          // { role: "user" | "efish" | "note", text }
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversation, setConversation] = useState(() => Date.now());   // id of the conversation on screen
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [onChat, setOnChat] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const turnsRef = useRef(turns); turnsRef.current = turns;
  const draftRef = useRef(draft); draftRef.current = draft;
  const conversationRef = useRef(conversation); conversationRef.current = conversation;

  // memory survives leaving the chat, reloading, and thirty days
  // pick up the most recent conversation; the others wait in 本地记忆
  const show = useCallback((c) => { setConversation(c.id); setTurns(c.turns.map((t) => ({ role: t.role, text: t.text }))); }, []);
  useEffect(() => { memory.load().then((saved) => { const [latest] = groupConversations(saved); if (latest) show(latest); }); }, [memory, show]);
  // "new" only turns the page: what was said stays on this device until it expires
  const startNew = useCallback(() => { if (busy) return; setConversation(Date.now()); setTurns([]); setDraft(""); }, [busy]);

  // The page never scrolls freely. A wheel turn, a swipe or an arrow key is read as
  // one intent, and the drawing then plays by itself to the next act and rests there;
  // the opposite gesture plays it back. Scroll position stays the drawing's only clock.
  const stopAt = useRef(0);
    const glideTo = useCallback((index) => {
    const el = deck.current; if (!el) return;
    const i = Math.max(0, Math.min(STOPS.length - 1, index)); stopAt.current = i;
    const running = Boolean(glideRef.current); glideRef.current?.();
    const max = () => Math.max(1, el.scrollHeight - el.clientHeight);        // read every frame: a resize must not strand the page between acts
    const from = el.scrollTop / max(); const dist = Math.abs(STOPS[i] - from);
    if (dist < 0.0005) { glideRef.current = null; el.scrollTop = STOPS[i] * max(); return; }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { glideRef.current = null; el.scrollTop = STOPS[i] * max(); return; }
    // one act takes a little over three seconds, slow enough to read; several in a row are hurried, not multiplied
    const ms = dist <= 0.28 ? Math.max(900, 12000 * dist) : 3300 + (dist - 0.28) * 4200; const t0 = performance.now(); let raf = 0;
    // a gesture that arrives mid-flight must not make the drawing stop and start again
    const curve = running ? (u) => 1 - Math.pow(1 - u, 3) : (u) => 0.5 - Math.cos(Math.PI * u) / 2;
    const step = (now) => {
      const u = Math.min(1, (now - t0) / ms);
      el.scrollTop = (from + (STOPS[i] - from) * curve(u)) * max();
      if (u < 1) raf = requestAnimationFrame(step); else glideRef.current = null;
    };
    glideRef.current = () => cancelAnimationFrame(raf);
    raf = requestAnimationFrame(step);
  }, []);
  // Going straight somewhere (the logo, "chat" on the about page, Home / End)
  // does not replay the story: the stage cross-fades and the logo slides to its place.
  const jumpTo = useCallback((index) => {
    const el = deck.current; const st = stage.current; if (!el || !st) return;
    const i = Math.max(0, Math.min(STOPS.length - 1, index)); glideRef.current?.(); glideRef.current = null; stopAt.current = i;
    const place = () => { el.scrollTop = STOPS[i] * Math.max(1, el.scrollHeight - el.clientHeight); };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { place(); return; }
    const root = st.closest(".app"); root?.classList.add("is-jumping"); st.style.opacity = "0";
    setTimeout(() => { place(); requestAnimationFrame(() => { st.style.opacity = "1"; }); }, 200);
    setTimeout(() => root?.classList.remove("is-jumping"), 700);
  }, []);
  const goHome = useCallback(() => { setAboutOpen(false); jumpTo(0); }, [jumpTo]);
  const goChat = useCallback(() => { jumpTo(STOPS.length - 1); }, [jumpTo]);
  const goNext = useCallback(() => { glideTo(stopAt.current + 1); }, [glideTo]);

  const onChatRef = useRef(false); onChatRef.current = onChat;
  const overlayRef = useRef(false); overlayRef.current = aboutOpen || keyOpen || memoryOpen;
  useEffect(() => {
    const el = deck.current; if (!el) return undefined;
    const max = () => Math.max(1, el.scrollHeight - el.clientHeight);
    const nearest = () => { const v = el.scrollTop / max(); let n = 0; STOPS.forEach((w, i) => { if (Math.abs(w - v) < Math.abs(STOPS[n] - v)) n = i; }); return n; };
    // start from the act nearest to wherever the browser restored the page
    stopAt.current = nearest(); el.scrollTop = STOPS[stopAt.current] * max();

    const typing = (t) => onChatRef.current && t?.closest?.(".pages, .kb");
    // while a glide is running the next gesture counts from its target; at rest, from where the page really is
    const turn = (dir) => glideTo((glideRef.current ? stopAt.current : nearest()) + dir);
    // a resize changes the scroll length, not the act: stay on the act
    const pin = new ResizeObserver(() => { if (!glideRef.current) el.scrollTop = STOPS[stopAt.current] * max(); });
    pin.observe(el);

    // Wheel: a mouse sends separate notches, a trackpad sends one push and then a long
    // coast of shrinking deltas. A step is taken on the first event after a pause, or
    // when the deltas jump back up mid-coast (a new push) — never on the coast itself.
    let lastAt = 0; let lastSize = 0; let lockUntil = 0;
    const onWheel = (e) => {
      if (onChatRef.current && e.target?.closest?.(".pages")) return;               // the thread scrolls by itself
      e.preventDefault(); if (typing(e.target)) return;
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : 0; const size = Math.abs(delta) * (e.deltaMode === 1 ? 16 : 1);
      const now = performance.now(); const paused = now - lastAt > 140; const pushed = size > 14 && size > lastSize * 1.7 + 4;
      lastAt = now; lastSize = paused ? size : lastSize * 0.6 + size * 0.4;
      if (size < 3 || now < lockUntil || !(paused || pushed)) return;
      lockUntil = now + 380; turn(delta > 0 ? 1 : -1);
    };
    let touchY = null; let used = false;
    const onTouchStart = (e) => { touchY = e.touches[0].clientY; used = false; };
    const onTouchMove = (e) => {
      if (typing(e.target)) return; if (e.cancelable) e.preventDefault(); if (used || touchY == null) return;
      const dy = touchY - e.touches[0].clientY; if (Math.abs(dy) > 18) { used = true; turn(dy > 0 ? 1 : -1); }
    };
    const onKey = (e) => {
      if (onChatRef.current || overlayRef.current || e.metaKey || e.ctrlKey || e.altKey) return;
      if (["ArrowDown", "ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) { e.preventDefault(); turn(1); }
      else if (["ArrowUp", "ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); turn(-1); }
      else if (e.key === "End") { e.preventDefault(); jumpTo(STOPS.length - 1); } else if (e.key === "Home") { e.preventDefault(); jumpTo(0); }
    };
    el.addEventListener("wheel", onWheel, { passive: false }); el.addEventListener("touchstart", onTouchStart, { passive: true }); el.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => { pin.disconnect(); el.removeEventListener("wheel", onWheel); el.removeEventListener("touchstart", onTouchStart); el.removeEventListener("touchmove", onTouchMove); window.removeEventListener("keydown", onKey); };
  }, [glideTo, jumpTo]);

  // The conversation reads like any chat: what you said on the right, what efish
  // wrote on the left, newest at the bottom. The line you type on is not part of the
  // scroll; it stays at the foot of the card, where the home drawing sets "type" down.
  useEffect(() => {
    const el = pagesEl.current; if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: onChat ? "smooth" : "auto" });
  }, [turns, busy, onChat]);
  const send = useCallback(async (preset) => {
    const typed = preset?.ask ?? draftRef.current;
    if (busy || typed.length === 0) return;
    const command = typed.trim().toLowerCase();
    setDraft("");
    if (command === "/key") { setKeyOpen(true); return; }
    if (command === "/nokey") { clearKey(); setTurns((t) => [...t, { role: "note", text: "key removed." }]); return; }
    if (command === "/forget") { await memory.clear(); setConversation(Date.now()); setTurns([{ role: "note", text: "memory cleared." }]); return; }
    if (command === "/memory") { setMemoryOpen(true); return; }

    const history = turnsRef.current.filter((t) => t.role !== "note").map((t) => ({ role: t.role === "efish" ? "assistant" : "user", content: t.text }));
    setTurns((t) => [...t, { role: "user", text: typed }, { role: "efish", text: "", pending: true }]);
    setBusy(true);
    const c = conversationRef.current;
    if (typed.trim()) memory.append("user", typed, { c });

    const result = await path.answer({
      userText: typed, conversation: history, preset: preset?.id,
      onText: (text) => setTurns((t) => { const next = t.slice(); next[next.length - 1] = { role: "efish", text, pending: true }; return next; })
    });

    setTurns((t) => {
      const next = t.slice(0, -1);
      if (result.ok) next.push({ role: "efish", text: result.text });
      else next.push({ role: "note", text: systemNote(result.category) });
      return next;
    });
    if (result.ok) memory.append("efish", result.text, { c });
    setBusy(false);
  }, [busy, memory, path]);

  const insert = useCallback((text) => setDraft((d) => (d + text).slice(0, 400)), []);
  const backspace = useCallback(() => setDraft((d) => Array.from(d).slice(0, -1).join("")), []);

  const keyboardActive = onChat && !aboutOpen && !keyOpen && !memoryOpen;

  return (
    <div className="app">
      <header className={`topbar ${onChat ? "is-chat" : ""}`}>
        <Logo size="sm" tone="dark" onClick={goHome} lively={!onChat} />
        <button type="button" className="about-link" onClick={() => setAboutOpen(true)}><U v={0}>about</U></button>
      </header>

      {/* one pinned stage: the drawing, and the chat window it turns into */}
      <div className="deck" ref={deck}>
        <div className="track">
          <div className={`stage ${onChat ? "is-chat" : ""}`} ref={stage}>
            <Scene deckRef={deck} stageRef={stage} onEnter={goNext} onChat={setOnChat} />

            <section className="chat-layer" aria-label="chat" inert={!onChat}>
              <WavyCard className="chat-card">
                <button type="button" className="card-new" onClick={startNew} disabled={busy || turns.length === 0} aria-label="start a new conversation"><U v={3}>new</U></button>
                <div className="pages" ref={pagesEl} aria-live="polite">
                  {turns.map((t, i) => (
                    <p className={`msg msg-${t.role}`} key={i}>{t.text}{t.pending && !t.text ? <span className="caret caret-write" /> : null}</p>
                  ))}
                </div>
                <div className="pg-draft">
                  <p>{draft ? draft : <span className="ghost">type.</span>}<span className="caret" /></p>
                  <svg className="draft-rule" viewBox="0 0 132 6" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M0 3 C 12 4.6, 26 4.4, 37 3 S 62 1.4, 74 3 S 99 4.6, 111 3 S 126 1.8, 132 2.6" /></svg>
                </div>
              </WavyCard>

              <Keyboard active={keyboardActive} onInsert={insert} onBackspace={backspace} onEnter={() => send()} onAsk={(q) => send(q)} onMemory={() => setMemoryOpen(true)} onFirstTouch={() => path.prime()} />
            </section>
          </div>
        </div>
      </div>

      {aboutOpen ? <About onClose={() => setAboutOpen(false)} onHome={goHome} onChat={() => { setAboutOpen(false); goChat(); }} /> : null}
      {keyOpen ? <KeySheet onClose={() => setKeyOpen(false)} /> : null}
      {memoryOpen ? <MemorySheet memory={memory} currentId={conversation} onClose={() => setMemoryOpen(false)} onOpen={(c) => { show(c); setMemoryOpen(false); }} /> : null}
    </div>
  );
}
