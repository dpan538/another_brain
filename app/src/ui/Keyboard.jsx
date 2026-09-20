import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { candidatesFor, createComposer, loadPinyinDict } from "../engine/pinyin_ime.js";
import { U } from "./Hand.jsx";
import { GUIDE, EGG_KEYS } from "../engine/croc_keys.js";

// The only keyboard this product accepts. Keys are drawn as thin outlined
// shapes — square, circle, rounded — in a fixed rhythm, so the board looks
// hand-assembled but every hit area stays the same size. A hardware keyboard
// drives the very same keys, which light up as they are struck.

const SHAPES = ["sq", "ci", "ro"];
const ROWS = {
  letters: [
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["z", "x", "c", "v", "b", "n", "m"]
  ],
  zh: [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["，", "。", "？", "！", "、", "：", "；", "（", "）"],
    ["…", "～", "□", "“", "”", "《", "》"]
  ],
  en: [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    [",", ".", "?", "!", "'", ":", ";", "(", ")"],
    ["…", "~", "□", "\"", "-", "/", "@"]
  ]
};

// Key outlines are pen strokes, not CSS borders: each shape has a couple of drawings
// that do not quite close, and every key sits at a slightly different angle, so the
// board looks drawn by hand while every hit area stays a full, regular cell.
const OUTLINES = {
  sq: ["M3.2 4.6 C 13 3.2, 27 4.4, 36.8 3.4 C 37.6 15, 36.4 33, 37.2 44.4 C 26 45.6, 13 44.2, 3 45.2 C 2.4 31, 3.8 17, 3 2.6",
    "M2.6 3.8 C 14 4.8, 26 2.8, 37.4 4.2 C 36.6 17, 38 31, 36.8 45 C 25 44, 14 45.8, 3.4 44.4 C 4 30, 2.6 16, 3.8 2.4"],
  ci: ["M27 3.6 C 14 0.8, 2.6 10, 3 24.5 C 3.4 39, 12.5 46.5, 22 45.6 C 32.5 44.6, 38 34, 37.2 22.5 C 36.6 11.5, 30.5 3.2, 19.5 3.6",
    "M12 5.5 C 24 -0.5, 38.5 9, 37.4 25 C 36.4 39.5, 26.5 47, 17 45 C 6.5 42.6, 1.6 31, 3 19.5 C 4 11.5, 9 5.6, 17.5 3"],
  ro: ["M11 3.8 C 19 2.8, 25 4.2, 30 3.6 C 35.5 3.4, 37.4 7, 37 12 C 36.4 22, 37.6 30, 37 37 C 36.6 42.6, 33.5 45, 28.5 44.6 C 22 44, 16 45.4, 10.5 44.8 C 5 44.6, 2.8 41.5, 3.2 36 C 3.8 28, 2.6 19, 3.2 11.5 C 3.4 6.4, 6.2 3.2, 13.5 3.2",
    "M29 4.2 C 21 3, 15 4.6, 10 3.8 C 4.6 3.6, 2.6 7.4, 3 12.5 C 3.6 22, 2.4 30, 3 36.5 C 3.4 42.4, 6.5 45, 11.5 44.4 C 18 43.8, 24 45.2, 29.5 44.8 C 35 44.6, 37.2 41, 36.8 35.5 C 36.2 27, 37.4 19, 36.8 12 C 36.6 6.6, 33.8 3.4, 26.5 3.6"]
};
const TILTS = [-1.3, 0.9, -0.4, 1.4, 0, -1, 0.6, -0.7, 1.1, -0.2, 0.4];

function Cap({ shape = "sq", n = 0, className = "", children }) {
  const drawn = OUTLINES[shape] || OUTLINES.sq;
  return (
    <span className={`cap ${className}`} style={{ "--tilt": `${TILTS[n % TILTS.length]}deg` }}>
      <svg className="cap-line" viewBox="0 0 40 48" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d={drawn[n % drawn.length]} /></svg>
      <span className="cap-label">{children}</span>
    </span>
  );
}

function Glyph({ name }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "square", "aria-hidden": true, focusable: false };
  if (name === "delete") return <svg {...common}><path d="M5 5 L19 19 M19 5 L5 19" /></svg>;
  if (name === "shift") return <svg {...common}><path d="M12 20 V5 M6 11 L12 5 L18 11" /></svg>;
  if (name === "return") return <svg {...common} width={22}><path d="M20 5 V14 H5 M10 9 L5 14 L10 19" /></svg>;
  return null;
}

export default function Keyboard({ active, onInsert, onBackspace, onEnter, onAsk, onMemory, onFirstTouch }) {
  const [mode, setMode] = useState("zh");          // zh = pinyin, en = direct letters
  const [layer, setLayer] = useState("letters");   // letters | symbols | croc (a board of ready-made questions)
  const [shift, setShift] = useState(false);
  const [buffer, setBuffer] = useState("");
  const [dict, setDict] = useState(null);
  const [lit, setLit] = useState("");
  const composer = useRef(createComposer()).current;
  const touched = useRef(false);

  useEffect(() => { loadPinyinDict().then(setDict).catch(() => setDict(null)); }, []);
  // arriving in the chat always means the ordinary keyboard; the 鳄 board is something you open
  useEffect(() => { if (active) { setLayer("letters"); setShift(false); } }, [active]);

  const ime = useMemo(() => (mode === "zh" ? candidatesFor(buffer, dict) : { list: [], segments: [], effective: buffer, corrected: false }), [buffer, dict, mode]);
  const candidates = ime.list;

  const flash = useCallback((id) => {
    setLit(id);
    try { navigator.vibrate?.(6); } catch { /* optional */ }
    setTimeout(() => setLit((cur) => (cur === id ? "" : cur)), 160);
  }, []);

  const firstTouch = useCallback(() => {
    if (!touched.current) { touched.current = true; onFirstTouch?.(); }
  }, [onFirstTouch]);

  const pick = useCallback((cand) => {
    // after a slip was repaired, what remains is the rest of the repaired buffer
    const text = composer.pick(cand, ime.effective);
    setBuffer(composer.buffer);
    onInsert(text);
  }, [composer, ime.effective, onInsert]);

  const press = useCallback((key) => {
    firstTouch();
    flash(key);
    if (key === "DELETE") {
      if (composer.composing) { composer.backspace(); setBuffer(composer.buffer); } else onBackspace();
      return;
    }
    if (key === "RETURN") {
      if (composer.composing) { onInsert(composer.flushRaw()); setBuffer(""); } else onEnter();
      return;
    }
    if (key === "SPACE") {
      if (composer.composing && candidates.length) pick(candidates[0]);
      else if (composer.composing) { onInsert(composer.flushRaw()); setBuffer(""); }
      else onInsert(" ");
      return;
    }
    if (key === "SHIFT") { setShift((s) => !s); return; }
    if (key === "LAYER") { setLayer((l) => (l === "letters" ? "symbols" : "letters")); return; }
    // 鳄 works like 中/En: it swaps the whole board, and swaps it back
    if (key === "EYU") { if (composer.composing) { onInsert(composer.flushRaw()); setBuffer(""); } setLayer((l) => (l === "croc" ? "letters" : "croc")); return; }
    if (key.startsWith("ASK:")) { const q = GUIDE.find((g) => g.id === key.slice(4)); if (q) onAsk?.(q); return; }
    if (key.startsWith("EGG:")) { onAsk?.({ ask: key.slice(4) }); return; }
    if (key === "MEMORY") { onMemory?.(); return; }
    if (key === "MODE") {
      if (composer.composing) { onInsert(composer.flushRaw()); setBuffer(""); }
      setMode((m) => (m === "zh" ? "en" : "zh"));
      return;
    }

    if (/^[a-z]$/.test(key) && layer === "letters") {
      if (mode === "zh" && !shift) { composer.type(key); setBuffer(composer.buffer); }
      else { onInsert(shift ? key.toUpperCase() : key); if (shift) setShift(false); }
      return;
    }
    // digits 1-9 choose a candidate while composing, like any pinyin keyboard
    if (composer.composing && /^[1-9]$/.test(key) && candidates[Number(key) - 1]) { pick(candidates[Number(key) - 1]); return; }
    if (composer.composing) { onInsert(composer.flushRaw()); setBuffer(""); }
    onInsert(key);
  }, [candidates, composer, firstTouch, flash, layer, mode, onAsk, onBackspace, onEnter, onInsert, onMemory, pick, shift]);

  // A hardware keyboard goes through the same path, so desktop typing uses this
  // product's input method as well, and the drawn keys respond.
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      let key = null;
      if (e.key === "Backspace") key = "DELETE";
      else if (e.key === "Enter") key = "RETURN";
      else if (e.key === " ") key = "SPACE";
      else if (/^[a-zA-Z]$/.test(e.key)) key = e.key.toLowerCase();
      else if (e.key.length === 1) key = e.key;
      if (!key) return;
      e.preventDefault();
      if (/^[a-z]$/.test(key) && e.shiftKey) { firstTouch(); flash(key); if (composer.composing) { onInsert(composer.flushRaw()); setBuffer(""); } onInsert(key.toUpperCase()); return; }
      if (/^[a-z]$/.test(key) && layer !== "letters") setLayer("letters");
      if (layer === "croc" && key.length === 1 && !/^[a-z]$/.test(key)) setLayer("letters");
      press(key);
    };
    const onPaste = (e) => {
      const text = e.clipboardData?.getData("text");
      if (text) { e.preventDefault(); firstTouch(); onInsert(text.replace(/\s+/g, " ").slice(0, 400)); }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("paste", onPaste); };
  }, [active, composer, firstTouch, flash, layer, onInsert, press]);

  const rows = layer === "croc" ? [] : layer === "letters" ? ROWS.letters : ROWS[mode];
  const keyProps = (id) => ({
    type: "button",
    "data-lit": lit === id ? "1" : undefined,
    onPointerDown: (e) => { e.preventDefault(); press(id); }
  });
  let n = 0;
  const cap = (k) => (layer === "letters" && shift ? k.toUpperCase() : k);

  return (
    <div className="kb" role="group" aria-label="efish keyboard">
      <div className="kb-bar" aria-live="polite">
        {buffer
          ? <U v={1} className={`kb-buffer ${ime.corrected ? "is-fixed" : ""}`}>{mode === "zh" && ime.segments.length ? ime.segments.join("\u2009'\u2009") : buffer}</U>
          : <span className="kb-mode">{mode === "zh" ? "拼音" : "latin"}</span>}
        <div className="kb-cands">
          {candidates.map((c, i) => (
            <button key={`${c.text}-${i}`} type="button" className="kb-cand" onPointerDown={(e) => { e.preventDefault(); firstTouch(); pick(c); }}>
              {i < 9 ? <sup>{i + 1}</sup> : null}{c.text}
            </button>
          ))}
        </div>
      </div>

      {layer === "croc" ? (
        <div className="kb-croc" role="group" aria-label="ready-made questions">
          {GUIDE.map((g, i) => <button key={g.id} className="ask" {...keyProps(`ASK:${g.id}`)}><Cap shape={["ro", "sq", "sq", "ci", "ro", "sq"][i % 6]} n={i + 3} className="cap-ask">{g.ask}</Cap></button>)}
        </div>
      ) : null}

      {rows.map((row, ri) => (
        <div className={`kb-row kb-row-${ri}`} key={ri}>
          {ri === 2 ? (
            <button className="key key-wide" aria-label="shift" aria-pressed={shift} {...keyProps("SHIFT")}><Cap shape="sq" n={7}><Glyph name="shift" /></Cap></button>
          ) : null}
          {row.map((k) => {
            const at = n++; const shape = SHAPES[at % SHAPES.length];
            return (
              <button className="key" key={k} aria-label={k} {...keyProps(k)}>
                <Cap shape={shape} n={at}>{cap(k)}</Cap>
                {lit === k ? <span className="key-pop" aria-hidden="true">{cap(k)}</span> : null}
              </button>
            );
          })}
          {ri === 2 ? (
            <button className="key key-wide" aria-label="delete" {...keyProps("DELETE")}><Cap shape="sq" n={4}><Glyph name="delete" /></Cap></button>
          ) : null}
        </div>
      ))}

      {layer === "croc" ? (
        <div className="kb-row kb-row-3">
          <button className="key key-memory" aria-label="本地记忆 — conversations kept on this device" {...keyProps("MEMORY")}><Cap shape="ro" n={1} className="cap-memory">本地记忆</Cap></button>
          {EGG_KEYS.map((k, i) => <button key={k} className="key key-egg" aria-label={k} {...keyProps(`EGG:${k}`)}><Cap shape={SHAPES[(i + 1) % SHAPES.length]} n={i + 5}>{k}</Cap></button>)}
          <button className="key key-wide" aria-label="back to letters" aria-pressed="true" {...keyProps("EYU")}><Cap shape="ci" n={1} className="cap-eyu">鳄</Cap></button>
          <button className="key key-return" aria-label="send" {...keyProps("RETURN")}><Cap shape="ro" n={0} className="cap-return"><Glyph name="return" /></Cap></button>
        </div>
      ) : (
        <div className="kb-row kb-row-3">
          <button className="key key-wide" aria-label={layer === "letters" ? "numbers and symbols" : "letters"} {...keyProps("LAYER")}><Cap shape="ro" n={1}>{layer === "symbols" ? "ab" : "12"}</Cap></button>
          <button className="key key-wide" aria-label={mode === "zh" ? "switch to latin" : "切换到拼音"} {...keyProps("MODE")}><Cap shape="ci" n={0}>{mode === "zh" ? "中" : "En"}</Cap></button>
          <button className="key key-space" aria-label="space" {...keyProps("SPACE")}><span className="unit"><b>SPACE</b></span></button>
          <button className="key key-wide" aria-label="鳄 — ready-made questions" {...keyProps("EYU")}><Cap shape="ci" n={1} className="cap-eyu">鳄</Cap></button>
          <button className="key key-return" aria-label="send" {...keyProps("RETURN")}><Cap shape="ro" n={0} className="cap-return"><Glyph name="return" /></Cap></button>
        </div>
      )}
    </div>
  );
}
