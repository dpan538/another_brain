import { useEffect, useMemo, useRef } from "react";
import { U } from "./Hand.jsx";
import { wavyRectPath } from "./wavy.js";
import { K, ACTS, MORPH, REVEAL, VANISH, buildScene, phaseAt, presence, morphPoints, pathOf, clamp01, lerp, ease, backOut, span } from "./scene.js";

// The drawing layer of the one pinned page. Scroll position is turned into a
// progress p in [0, 1]; p alone decides where every line is and which letters of
// the rebus are showing, so the story can be scrubbed forwards and backwards.
// The chat window lives in the same stage and is simply the last frame: this
// component fades it in through a CSS variable once the loop has become its border.
// The logo is one element for the whole product: large over the first drawing,
// docked top-left as soon as the page moves.

const FACE_K = { abril: 1.04, yellow: 1.26, courier: 0.98, fraktur: 1.14, playfair: 1.06, rubik: 0.8, sans: 1, han: 1, italic: 1 };
const CAPTIONS = ["是人。", "是记忆。锁在这台设备里，三十天。", "是鳄鱼。家在湖边。", "是对话框。", "可以打字。"];
// only the shape of the text is needed to render; positions arrive with the first measure
const SHAPE = buildScene({ W: 375, H: 812, top: 76, bottom: 684, card: { x: 8, y: 74, w: 359, h: 474 } }).text.map((t) => ({ glyphs: t.glyphs.map((g) => ({ ch: g.ch, face: g.face, dot: g.dot, paper: g.paper, bare: g.bare })), arcs: t.arcs.length }));

export default function Scene({ deckRef, stageRef, onEnter, onChat }) {
  const strokes = useRef([]); const nodes = useRef([]); const stickers = useRef([]); const neon = useRef([]); const fills = useRef([]);
  const glyphEls = useRef(SHAPE.map(() => [])); const arcEls = useRef(SHAPE.map(() => [])); const actEls = useRef([]);
  const tone = useRef(null); const world = useRef(null); const lines = useRef(null); const frame = useRef(null); const frameAt = useRef(null); const loopDot = useRef(null); const fig = useRef(null);
  const sentence = useRef(null); const hint = useRef(null); const caps = useRef([]);
  const chatCb = useRef(onChat); chatCb.current = onChat;
  const shape = useMemo(() => SHAPE, []);

  useEffect(() => {
    const deck = deckRef.current; const stage = stageRef.current; if (!deck || !stage) return undefined;
    const app = stage.closest(".app"); const track = stage.parentElement;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let scene = null; let hero = null; let raf = 0; let chatOn = null; let lastP = -1; let inLast = false;
    let intro = still ? 1 : 0; const born = performance.now();

    const measure = () => {
      const sr = stage.getBoundingClientRect(); if (!sr.width || !sr.height) return;
      const rel = (r) => ({ x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height });
      const bar = parseFloat(getComputedStyle(stage).getPropertyValue("--bar-px")) || 72;
      const cardEl = stage.querySelector(".chat-card"); const keyEl = stage.querySelector(".cap-eyu");
      const card = cardEl ? rel(cardEl.getBoundingClientRect()) : { x: 8, y: bar + 2, w: sr.width - 16, h: sr.height * 0.56 };
      const k = keyEl ? rel(keyEl.getBoundingClientRect()) : null;
      if (k) k.y -= (1 - (parseFloat(stage.style.getPropertyValue("--chat")) || 0)) * 26;      // the keyboard is still on its way up
      // where the placeholder "type." is set, letter by letter
      let ghost = null; let ghostSize = 18;
      const gEl = stage.querySelector(".pg-draft .ghost"); const node = gEl?.firstChild;
      if (node && node.nodeType === 3 && node.length >= 4) {
        ghostSize = parseFloat(getComputedStyle(gEl).fontSize) || 18; const range = document.createRange();
        const at = [0, 1, 2, 3].map((i) => { range.setStart(node, i); range.setEnd(node, i + 1); const r = rel(range.getBoundingClientRect()); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; });
        if (at.every((q) => q.y > card.y && q.y < card.y + card.h)) ghost = at;
      }
      const ruleEl = stage.querySelector(".draft-rule"); const rr = ruleEl ? rel(ruleEl.getBoundingClientRect()) : null;
      const rule = rr && rr.w > 20 ? { x: rr.x, y: rr.y + rr.h / 2, len: rr.w } : null;
      scene = buildScene({ W: sr.width, H: sr.height, top: bar + 4, bottom: sr.height - 122, card, key: k ? { x: k.x + k.w / 2, y: k.y + k.h / 2, r: k.w / 2 } : null, ghost, ghostSize, rule });

      // the logo over the first drawing
      const logo = app?.querySelector(".topbar .logo");
      if (logo) {
        // The logo is typeset at the size it is shown (font-size), not scaled up from its small
        // size: a transform-scaled layer is rasterised small and looks soft on a phone.
        const word = logo.querySelector(".logo-word"); const BASE = 27;
        const live = parseFloat(getComputedStyle(word || logo).fontSize) || BASE;
        const w0 = (logo.offsetWidth * BASE) / live; const h0 = (logo.offsetHeight * BASE) / live;
        const S = Math.min(3.1, (sr.width - 72) / Math.max(1, w0)); const top = bar + 6;
        const lineTop = top + h0 * S + 8; const bottom = lineTop + 50;
        hero = { S, base: BASE, x: (sr.width - w0 * S) / 2 - logo.offsetLeft, y: top - logo.offsetTop, lineTop, bottom };
        const room = sr.height - 122 - bottom; const k0 = Math.min(1, room / scene.box.height);
        hero.k0 = k0; hero.y0 = (bottom + sr.height - 122) / 2; hero.yc = scene.box.top + scene.box.height / 2; hero.W = sr.width;
        if (sentence.current) sentence.current.style.top = `${lineTop.toFixed(0)}px`;
      }
      scene.neon.forEach((d, i) => neon.current[i]?.setAttribute("d", d));
      scene.text.forEach((t, i) => t.arcs.forEach((d, j) => arcEls.current[i][j]?.setAttribute("d", d)));
      scene.stickers.forEach((q, i) => { stickers.current[i]?.setAttribute("cx", q[0].toFixed(1)); stickers.current[i]?.setAttribute("cy", q[1].toFixed(1)); });
      scene.nodes.forEach((q, i) => { nodes.current[i]?.setAttribute("cx", q[0].toFixed(1)); nodes.current[i]?.setAttribute("cy", q[1].toFixed(1)); });
      loopDot.current?.setAttribute("cx", scene.dot.at[0].toFixed(1)); loopDot.current?.setAttribute("cy", scene.dot.at[1].toFixed(1));
      frameAt.current?.setAttribute("transform", `translate(${scene.card.x.toFixed(1)} ${scene.card.y.toFixed(1)})`);
      lastP = -1;
    };

    const draw = (p) => {
      if (!scene) return;
      const { from, to, t } = phaseAt(p); const moving = from !== to; const drawn = intro >= 1;

      // the logo docks, and the drawing takes the room it leaves
      const dock = ease(span(p, 0, 0.055));
      if (hero && app) {
        // size and vertical travel come from here; the horizontal centring is done in CSS against the
        // logo's own live width, because its letters keep changing face (and width) while it rests
        app.style.setProperty("--logo-live", `${lerp(hero.base * hero.S, hero.base, dock).toFixed(2)}px`); app.style.setProperty("--dock", dock.toFixed(4));
        app.style.setProperty("--stage-w", `${hero.W}px`); app.style.setProperty("--hero-dy", `${hero.y.toFixed(1)}px`);
        world.current?.setAttribute("transform", `translate(${(hero.W / 2).toFixed(1)} ${lerp(hero.y0, hero.yc, dock).toFixed(1)}) scale(${lerp(hero.k0, 1, dock).toFixed(4)}) translate(${(-hero.W / 2).toFixed(1)} ${(-hero.yc).toFixed(1)})`);
      }
      if (sentence.current) sentence.current.style.opacity = String(clamp01(intro * 3) * (1 - span(p, 0.008, 0.04)));

      // the 25 strokes
      const pts = new Array(K);
      for (let k = 0; k < K; k += 1) {
        const el = strokes.current[k]; if (!el) continue;
        // the last move is plain on purpose: the pieces land left to right, like a line being typed
        pts[k] = moving ? (to === ACTS ? morphPoints(scene.pairs[from][k], k, t, 0, 0.62) : morphPoints(scene.pairs[from][k], k, t, scene.s)) : scene.rest[from][k];
        el.setAttribute("d", pathOf(pts[k]));
        if (drawn) { el.style.strokeDasharray = "none"; el.style.opacity = "1"; } else {
          const v = ease(clamp01((intro - 0.012 * k) / 0.42)); el.style.strokeDasharray = "1 1"; el.style.strokeDashoffset = String(1 - v); el.style.opacity = v > 0.001 ? "1" : "0";
        }
      }
      // pen weight: a poster line on the way, the card's fine border at the end
      const thin = from === ACTS - 1 && to === ACTS ? ease(t) : from === ACTS ? 1 : 0;
      if (lines.current) lines.current.style.strokeWidth = `${lerp(Math.max(2.4, 3.4 * scene.s), 1.25, thin).toFixed(2)}px`;

      // the doors are filled once they stand: water on the left, land on the right
      const doors = presence(2, p);
      scene.fills.forEach((f, i) => { const el = fills.current[i]; if (!el) return; el.style.opacity = String(doors); if (doors > 0 && pts[f.stroke]) { const d = pathOf(pts[f.stroke], true); el.setAttribute("d", d); if (i === 0) tone.current?.setAttribute("d", d); } });
      if (tone.current) tone.current.style.opacity = String(doors);

      // nodes and stickers belong to the tree
      const tree = presence(0, p);
      nodes.current.forEach((el, n) => el?.setAttribute("r", Math.max(0, scene.nodeR * tree * backOut(clamp01((intro - 0.2 - n * 0.012) / 0.25))).toFixed(2)));
      stickers.current.forEach((el, n) => el?.setAttribute("r", Math.max(0, scene.stickerR * backOut(clamp01((intro - 0.42 - n * 0.05) / 0.25)) * (1 - span(p, 0.03 + n * 0.006, 0.07 + n * 0.006))).toFixed(2)));
      loopDot.current?.setAttribute("r", (scene.dot.r * presence(3, p)).toFixed(2));

      // the rebus: a letter, the half-circle that leaves it, the next letter …
      for (let i = 0; i < ACTS; i += 1) {
        const g = actEls.current[i]; if (!g) continue;
        const r = i === 0 ? clamp01((intro - 0.4) / 0.6) : span(p, REVEAL[i][0], REVEAL[i][1]); const v = span(p, VANISH[i][0], VANISH[i][1]);
        const flying = i === ACTS - 1;                                  // "type" does not vanish, it lands
        if (r <= 0 || (v >= 1 && !flying) || (flying && p > 0.995)) { g.style.display = "none"; continue; }
        g.style.display = "";
        const T = scene.text[i]; const n = T.order.length; const width = 0.32 + 0.9 / n;
        T.order.forEach(([kind, idx], j) => {
          const a = clamp01((r - (j / n) * (1 - width)) / width); const gone = clamp01((v - (j / n) * 0.5) / 0.5);
          if (kind === "a") { const el = arcEls.current[i][idx]; if (!el) return; el.style.strokeDashoffset = String(1 - ease(a)); el.style.opacity = a > 0.001 ? String(1 - gone) : "0"; return; }
          const el = glyphEls.current[i][idx]; const G = T.glyphs[idx]; if (!el) return;
          let { x, y, size } = G; let kf = FACE_K[G.face] || 1; let out = gone;
          if (flying && idx < 4) {
            // the word travels as a word, straight to the input line
            const e = from === ACTS - 1 && to === ACTS ? ease(clamp01(t / 0.85)) : from === ACTS ? 1 : 0; const L = scene.landing[idx];
            x = lerp(x, L.x, e); y = lerp(y, L.y, e); size = lerp(size, L.size, e); kf = lerp(kf, 1, e); out = span(p, 0.955, 0.985);
          }
          el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(G.rot * (1 - out)).toFixed(1)}) scale(${Math.max(0.0001, (size * kf * backOut(a) * (flying && idx < 4 ? 1 : 1 - 0.35 * out)) / 40).toFixed(4)})`);
          el.style.opacity = a > 0.001 ? String(1 - out) : "0";
        });
      }

      // marker strokes: one per act, drawn when the act has settled, gone before it leaves
      neon.current.forEach((el, i) => {
        if (!el) return;
        const v = (i === 0 ? clamp01((intro - 0.75) / 0.25) : span(p, REVEAL[i][0] + 0.04, REVEAL[i][1])) * (1 - span(p, VANISH[i][0], VANISH[i][0] + 0.03));
        el.style.strokeDashoffset = String(1 - v); el.style.opacity = v > 0.001 ? "1" : "0";
      });

      // the loop has become the card: its edge starts to ripple, then the real window takes over
      const wave = span(p, 0.94, 0.965);
      if (frame.current) {
        if (from === ACTS) { frame.current.setAttribute("d", wavyRectPath(scene.card.w, scene.card.h, { amp: 3 * ease(wave) })); frame.current.style.opacity = "1"; if (strokes.current[0]) strokes.current[0].style.opacity = "0"; } else frame.current.style.opacity = "0";
      }
      stage.style.setProperty("--chat", span(p, 0.955, 0.99).toFixed(3));
      if (fig.current) fig.current.style.opacity = String(1 - span(p, 0.97, 0.998));

      // half a line of text under the drawing
      caps.current.forEach((el, i) => {
        if (!el) return;
        const o = i === ACTS ? span(p, 0.865, 0.895) * (1 - span(p, 0.95, 0.98))
          : (i === 0 ? clamp01((intro - 0.8) / 0.2) : span(p, REVEAL[i][0], REVEAL[i][0] + 0.04)) * (1 - span(p, VANISH[i][0], VANISH[i][1]));
        el.style.opacity = String(o); el.style.transform = `translateY(${((1 - o) * 8).toFixed(1)}px)`;
      });
      // "scroll" is said once; after that a quiet arrow stays, so a tap always moves the story on
      if (hint.current) {
        const o = clamp01(intro * 3 - 2) * (1 - span(p, 0.82, 0.86)); hint.current.style.opacity = String(o * lerp(1, 0.5, span(p, 0, 0.03))); hint.current.style.pointerEvents = o > 0.5 ? "auto" : "none";
        const label = hint.current.firstElementChild; if (label) label.style.opacity = String(1 - span(p, 0, 0.03));
      }

      const on = p > 0.985; if (on !== chatOn) { chatOn = on; chatCb.current?.(on); }
    };

    const progress = () => {
      return clamp01(deck.scrollTop / Math.max(1, track.offsetHeight - deck.clientHeight));
    };
    const tick = (now) => {
      raf = 0; const p = progress();
      const last = p >= MORPH[ACTS - 1][0] - 0.02; if (last && !inLast) measure(); inLast = last;       // the placeholder may have moved
      if (intro < 1) { intro = p > 0.015 ? 1 : clamp01((now - born) / 3400); raf = requestAnimationFrame(tick); }
      if (p !== lastP || intro < 1 || raf) { lastP = p; draw(p); }
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const remeasure = () => { measure(); kick(); };

    measure(); kick();
    deck.addEventListener("scroll", kick, { passive: true });
    const ro = new ResizeObserver(remeasure); ro.observe(stage); const cardEl = stage.querySelector(".chat-card"); if (cardEl) ro.observe(cardEl);
    document.fonts?.ready?.then(remeasure);
    return () => { deck.removeEventListener("scroll", kick); ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [deckRef, stageRef]);

  return (
    <div className="scene" ref={fig}>
      <svg className="fig" width="100%" height="100%" role="img" aria-label="A rebus in four drawings made of the same lines: a tree spelling person, a lock marked thirty spelling memory, a cloud over two doors marked 湖 and 沪, and a loop from type to write to chat that becomes the dialog box.">
        <defs>
          <pattern id="halftone" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><circle cx="2.5" cy="2.5" r="1.05" fill="#4f93b1" opacity=".55" /></pattern>
        </defs>
        <g ref={world}>
          <path ref={(el) => { fills.current[0] = el; }} className="fig-water" style={{ opacity: 0 }} />
          <path ref={tone} fill="url(#halftone)" style={{ opacity: 0 }} />
          <path ref={(el) => { fills.current[1] = el; }} className="fig-land" style={{ opacity: 0 }} />
          {[0, 1, 2, 3].map((i) => <circle key={i} ref={(el) => { stickers.current[i] = el; }} className="fig-sticker" r="0" />)}
          <g ref={lines} className="fig-lines">
            {Array.from({ length: K }, (_, k) => <path key={k} ref={(el) => { strokes.current[k] = el; }} pathLength="1" style={{ opacity: 0 }} />)}
          </g>
          {Array.from({ length: 22 }, (_, n) => <circle key={n} ref={(el) => { nodes.current[n] = el; }} className="fig-dot" r="0" />)}
          <circle ref={loopDot} className="fig-dot" r="0" />
          {shape.map((act, i) => (
            <g key={i} ref={(el) => { actEls.current[i] = el; }} style={{ display: "none" }}>
              <g className="fig-arcs">{Array.from({ length: act.arcs }, (_, j) => <path key={j} ref={(el) => { arcEls.current[i][j] = el; }} pathLength="1" style={{ opacity: 0 }} />)}</g>
              {act.glyphs.map((g, j) => (
                <g key={j} ref={(el) => { glyphEls.current[i][j] = el; }} className={`fig-glyph ${g.paper ? "is-paper" : ""} ${g.bare ? "is-bare" : ""}`} style={{ opacity: 0 }}>
                  {g.dot ? <circle r="6.5" className="fig-dot" /> : <text className={`g-${g.face}`} textAnchor="middle" dy=".34em" fontSize="40">{g.ch}</text>}
                </g>
              ))}
            </g>
          ))}
          {[0, 1, 2, 3].map((i) => <path key={i} ref={(el) => { neon.current[i] = el; }} className="fig-neon" pathLength="1" style={{ opacity: 0 }} />)}
        </g>
        <g className="fig-lines fig-frame" ref={frameAt}><path ref={frame} style={{ opacity: 0 }} /></g>
      </svg>

      <p className="scene-line" ref={sentence} style={{ opacity: 0 }}>this is efish other,<br />an other.</p>
      <div className="scene-text">
        {CAPTIONS.map((c, i) => <p key={i} className="scene-cap" ref={(el) => { caps.current[i] = el; }} style={{ opacity: 0 }}>{c}</p>)}
      </div>

      <button type="button" className="scroll-hint" ref={hint} onClick={onEnter} aria-label="next" style={{ opacity: 0 }}>
        <U v={2}>scroll</U>
        <svg width="14" height="22" viewBox="0 0 14 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M7 1 C 6.4 8, 7.6 13, 7 20 M1.5 14 C 3.5 16, 5.5 18.4, 7 20 C 8.6 18.2, 10.6 16, 12.6 14.2" /></svg>
      </button>
    </div>
  );
}
