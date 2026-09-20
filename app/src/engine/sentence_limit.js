// Two sentences, never more.
//
// The owner's rule is absolute: no answer runs past two sentences. A prompt
// instruction is not a guarantee, so the limit is enforced on the text itself,
// including while it streams, which also lets the request be cancelled the
// moment the second sentence closes.

export const MAX_SENTENCES = 2;

const TERMINATORS = "。！？!?";
const CLOSERS = "”’」』）)】》\"'";

function isLatinLetter(ch) {
  return /[A-Za-z]/.test(ch || "");
}

// Index just past the end of each complete sentence in `text`.
export function sentenceEnds(text) {
  const s = String(text || "");
  const ends = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    let terminal = false;
    if (TERMINATORS.includes(ch)) {
      terminal = true;
    } else if (ch === "…") {
      // an ellipsis ends a sentence only when nothing but closers or space follows it
      let j = i;
      while (s[j] === "…") j += 1;
      const rest = s.slice(j).replace(new RegExp(`^[${CLOSERS.replace(/[\]\\^-]/g, "\\$&")}\\s]*`), "");
      if (rest.length === 0 || /^[\n]/.test(s.slice(j))) terminal = true;
      if (!terminal) { i = j; continue; }
      i = j - 1;
    } else if (ch === ".") {
      // a Latin full stop: preceded by a letter, followed by space, closer or end
      const prev = s[i - 1];
      const next = s[i + 1];
      if (isLatinLetter(prev) && (next === undefined || /\s/.test(next) || CLOSERS.includes(next))) terminal = true;
    } else if (ch === "\n") {
      // a line break after real content closes whatever was open
      const open = s.slice(ends.length ? ends[ends.length - 1] : 0, i).trim();
      if (open.length > 0) { ends.push(i); }
      i += 1;
      continue;
    }
    if (terminal) {
      let j = i + 1;
      while (j < s.length && (TERMINATORS.includes(s[j]) || s[j] === "…")) j += 1; // "?!" and "。。。" count once
      while (j < s.length && CLOSERS.includes(s[j])) j += 1;
      ends.push(j);
      i = j;
      continue;
    }
    i += 1;
  }
  return ends;
}

export function limitSentences(text, max = MAX_SENTENCES) {
  const s = String(text || "");
  const ends = sentenceEnds(s);
  if (ends.length < max) return { text: s.trim(), complete: false, truncated: false };
  const cut = ends[max - 1];
  const kept = s.slice(0, cut).trim();
  const rest = s.slice(cut).trim();
  return { text: kept, complete: true, truncated: rest.length > 0 };
}
