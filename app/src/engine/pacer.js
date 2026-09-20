// The rhythm of an answer: a pause to think, then the words written out.
//
// An answer can arrive all at once (a 鳄-board reply, an easter egg) or token by
// token (the model). Either way the person should see the same thing: their
// question lands, efish takes a moment, and then writes — never a block of text
// appearing in the same instant as the question. The pacer sits between whatever
// produces text and whatever shows it, and it never changes the text itself.

const SENTENCE_END = /[。！？!?…]/u;
const CLAUSE_END = /[，、；：,;:]/u;

// How long efish waits before answering at all. It has to be long enough to read as
// someone taking the question in; an answer that starts within a second feels like a lookup.
export const NOTICE_MS = 520;       // the question sits alone before efish visibly starts to think
export function thinkTime(text) {
  // a longer answer is thought about a little longer, within reason
  return 1900 + Math.min(1100, Array.from(String(text || "")).length * 16);
}

export function createPacer({ onShow, charMs = 48, minThinkMs = 1700, instant = false, now = () => performance.now(), schedule = setTimeout, cancel = clearTimeout } = {}) {
  const t0 = now();
  let target = []; let shown = 0; let ended = false; let thinkUntil = t0 + minThinkMs; let timer = null; let first = true;
  let finish; const finished = new Promise((resolve) => { finish = resolve; });

  const tick = () => {
    timer = null;
    const t = now();
    if (t < thinkUntil) { timer = schedule(tick, thinkUntil - t); return; }
    if (shown < target.length) {
      if (instant) shown = target.length;
      else { const behind = target.length - shown; shown += behind > 28 ? 2 : 1; }     // a fast stream is followed, not queued for ever
      onShow(target.slice(0, shown).join(""));
      const last = target[shown - 1];
      const rest = instant ? 0 : SENTENCE_END.test(last) ? charMs * 10 : CLAUSE_END.test(last) ? charMs * 5 : charMs;
      timer = schedule(tick, rest); return;
    }
    if (ended) finish();
  };

  return {
    /** the full text so far (not a delta) */
    push(text) {
      target = Array.from(String(text || ""));
      // text that is already complete when it first arrives was not "streamed": think in proportion to it
      if (first) { first = false; if (now() - t0 < 120) thinkUntil = Math.max(thinkUntil, t0 + thinkTime(text)); }
      if (shown > target.length) shown = target.length;
      if (!timer) tick();
    },
    /** no more text; resolves once everything has been written out */
    end(finalText) { if (finalText != null) this.push(finalText); ended = true; if (!timer) tick(); return finished; },
    stop() { if (timer) cancel(timer); timer = null; finish(); }
  };
}
