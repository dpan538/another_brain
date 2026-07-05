const HIDDEN_MARKERS = ["system prompt", "hidden prompt", "<hidden", "chain-of-thought"];
const GENERIC_FALLBACK_MARKERS = ["as an ai language model", "i cannot answer that"];

export function verifyDraft(draft, options = {}) {
  const text = String(draft || "");
  const lowered = text.toLowerCase();
  const maxChars = Number(options.maxChars || 1200);
  const failures = [];
  if (!text.trim()) failures.push("empty_output");
  if (text.length > maxChars) failures.push("overlong_output");
  if (HIDDEN_MARKERS.some((marker) => lowered.includes(marker))) failures.push("hidden_prompt_disclosure_marker");
  if (GENERIC_FALLBACK_MARKERS.some((marker) => lowered.includes(marker))) failures.push("generic_fallback_marker");
  return {
    passed: failures.length === 0,
    failures,
    fallback_recommended: failures.length > 0
  };
}

export function finalizeDraft(draft, verifierResult) {
  if (!verifierResult.passed) return "";
  return String(draft || "").trim();
}
