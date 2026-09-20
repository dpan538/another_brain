// Pinyin input method for the on-screen keyboard.
//
// The product never raises the system keyboard, so it carries its own way of
// writing Chinese, and the keys are as narrow as any phone keyboard's. Three
// things make that usable:
//
//   1. Whole-sentence composition. "nishishei" is not a dictionary word, so it is
//      cut into syllables and the best path through the word lattice is offered
//      first: 你是谁.
//   2. Slip correction. When a buffer cannot be cut into syllables, the letters
//      around the break are retried with their neighbours on the keyboard, a
//      swap, or a dropped letter. "nisgishei" becomes "nishishei".
//   3. Fuzzy initials and finals (z/zh, c/ch, s/sh, n/ng) as a last addition.

let dictPromise = null;

export function loadPinyinDict(url = `${import.meta.env?.BASE_URL ?? "/"}ime/pinyin_dict.json`, fetchImpl = globalThis.fetch) {
  dictPromise ??= fetchImpl(url).then((r) => {
    if (!r.ok) throw new Error(`pinyin_dict_http_${r.status}`);
    return r.json();
  }).then(prepareDict).catch((e) => { dictPromise = null; throw e; });
  return dictPromise;
}

export function prepareDict(json) {
  const d = json?.d || {};
  const syllables = new Set(json?.s || []);
  const prefixes = new Set();
  for (const s of syllables) for (let i = 1; i <= s.length; i += 1) prefixes.add(s.slice(0, i));
  return { d, syllables, prefixes };
}

const NEIGHBOURS = {
  q: "wa", w: "qeas", e: "wrsd", r: "etdf", t: "ryfg", y: "tugh", u: "yihj", i: "uojk", o: "ipkl", p: "ol",
  a: "qwsz", s: "awedzx", d: "serfxc", f: "drtgcv", g: "ftyhvb", h: "gyujbn", j: "huiknm", k: "jiolm", l: "kop",
  z: "asx", x: "zsdc", c: "xdfv", v: "cfgb", b: "vghn", n: "bhjm", m: "njk"
};

const MAX_KEY = 24;          // four syllables of six letters
const WORD_COST = 30;        // every extra word costs more than any frequency gain

const words = (dict, key) => { const row = dict.d[key]; return row ? row.slice(1).split(" ") : null; };
const bucket = (dict, key) => dict.d[key].charCodeAt(0) - 97;

/** Best path through the word lattice. Returns how far it got and what it spells. */
export function compose(buffer, dict) {
  const n = buffer.length;
  const cost = new Array(n + 1).fill(Infinity); const back = new Array(n + 1).fill(null);
  cost[0] = 0;
  for (let i = 0; i < n; i += 1) {
    if (cost[i] === Infinity) continue;
    for (let j = i + 1; j <= Math.min(n, i + MAX_KEY); j += 1) {
      const key = buffer.slice(i, j);
      if (!dict.d[key]) continue;
      const c = cost[i] + WORD_COST - bucket(dict, key);
      if (c < cost[j]) { cost[j] = c; back[j] = { from: i, key }; }
    }
  }
  let reach = n; while (reach > 0 && cost[reach] === Infinity) reach -= 1;
  const parts = []; for (let at = reach; at > 0; at = back[at].from) parts.unshift(back[at].key);
  const tail = buffer.slice(reach);
  return {
    reach, parts, tail, cost: cost[reach],
    text: parts.map((k) => words(dict, k)[0]).join(""),
    // a tail that could still grow into a syllable means the person is mid-word, not mistaken
    clean: tail === "" || dict.prefixes.has(tail)
  };
}

function variantsNear(buffer, at) {
  const out = new Set();
  const lo = Math.max(0, at - 3); const hi = Math.min(buffer.length, at + 4);
  for (let i = lo; i < hi; i += 1) {
    for (const ch of NEIGHBOURS[buffer[i]] || "") out.add(buffer.slice(0, i) + ch + buffer.slice(i + 1));   // wrong neighbour
    out.add(buffer.slice(0, i) + buffer.slice(i + 1));                                                      // extra letter
    if (i + 1 < buffer.length) out.add(buffer.slice(0, i) + buffer[i + 1] + buffer[i] + buffer.slice(i + 2)); // swapped pair
  }
  out.delete(buffer);
  return out;
}

/** Repairs up to two slips. Returns the buffer to use and whether it was changed. */
export function correct(buffer, dict) {
  let current = buffer; let best = compose(current, dict);
  for (let pass = 0; pass < 2 && !best.clean; pass += 1) {
    let winner = null;
    for (const v of variantsNear(current, best.reach)) {
      const r = compose(v, dict);
      const left = v.length - r.reach; const wLeft = winner ? winner.v.length - winner.r.reach : Infinity;
      const better = !winner
        || (r.clean && !winner.r.clean)
        || (r.clean === winner.r.clean && (left < wLeft || (left === wLeft && r.cost < winner.r.cost)));
      if (better) winner = { v, r };
    }
    if (!winner || (!winner.r.clean && winner.r.reach <= best.reach)) break;
    current = winner.v; best = winner.r;
  }
  return { buffer: current, changed: current !== buffer, composed: best };
}

const FUZZY = [[/^zh/, "z"], [/^z(?!h)/, "zh"], [/^ch/, "c"], [/^c(?!h)/, "ch"], [/^sh/, "s"], [/^s(?!h)/, "sh"], [/ng$/, "n"], [/([aei])n$/, "$1ng"]];

function fuzzyKeys(parts, dict) {
  // syllable by syllable: split any multi-syllable key back into syllables first
  const syl = [];
  for (const part of parts) {
    let i = 0;
    while (i < part.length) {
      let j = Math.min(part.length, i + 6);
      while (j > i && !dict.syllables.has(part.slice(i, j))) j -= 1;
      if (j === i) return [];
      syl.push(part.slice(i, j)); i = j;
    }
  }
  if (syl.length === 0 || syl.length > 4) return [];
  let combos = [[]];
  for (const s of syl) {
    const alts = new Set([s]);
    for (const [re, to] of FUZZY) { const a = s.replace(re, to); if (a !== s && dict.syllables.has(a)) alts.add(a); }
    combos = combos.flatMap((c) => [...alts].map((a) => [...c, a])).slice(0, 24);
  }
  return combos.map((c) => c.join("")).filter((k) => k !== syl.join(""));
}

/**
 * @returns { effective, corrected, segments, list: [{ text, consumed }] }
 *   `effective` is the buffer the candidates were computed from, and `consumed`
 *   counts letters of that buffer; after a pick the composer keeps the rest.
 */
export function candidatesFor(rawBuffer, dict, limit = 48) {
  const raw = String(rawBuffer || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!raw || !dict?.d) return { effective: raw, corrected: false, segments: [], list: [] };

  const fixed = correct(raw, dict);
  const b = fixed.buffer; const sentence = fixed.composed;
  const list = []; const seen = new Set();
  const push = (text, consumed) => { if (list.length < limit && text && !seen.has(text)) { seen.add(text); list.push({ text, consumed }); } };

  if (sentence.parts.length > 1) push(sentence.text, sentence.reach);              // 你是谁
  let found = 0;
  for (let n = Math.min(b.length, MAX_KEY); n >= 1 && found < 3; n -= 1) {         // then words, longest first
    const key = b.slice(0, n);
    const row = words(dict, key);
    if (row) { for (const w of row) push(w, n); found += 1; }
  }
  if (sentence.parts.length) {
    for (const key of fuzzyKeys(sentence.parts, dict)) {
      const row = words(dict, key); if (row) for (const w of row.slice(0, 3)) push(w, sentence.reach);
    }
  }
  return { effective: b, corrected: fixed.changed, segments: [...sentence.parts, ...(sentence.tail ? [sentence.tail] : [])], list };
}

export function createComposer() {
  let buffer = "";
  return {
    get buffer() { return buffer; },
    get composing() { return buffer.length > 0; },
    type(letter) { if (/^[a-zA-Z]$/.test(letter) && buffer.length < 40) buffer += letter.toLowerCase(); return buffer; },
    backspace() { buffer = buffer.slice(0, -1); return buffer; },
    // `effective` is the possibly corrected buffer the candidate was computed from
    pick(candidate, effective = buffer) { buffer = String(effective).slice(candidate.consumed); return candidate.text; },
    flushRaw() { const raw = buffer; buffer = ""; return raw; },
    clear() { buffer = ""; }
  };
}
