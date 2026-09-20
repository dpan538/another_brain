// Browser-side BYOK (bring your own key) storage for the DeepSeek answer path.
//
// Boundary: the key is supplied by the person using this app, is held only in
// this browser profile's localStorage, and is sent only to the DeepSeek chat
// completions origin. It is never written to a log, a telemetry record, an
// error message, a query string, or any other origin. The repository never
// contains a key.
//
// Honest tradeoff: localStorage is readable by any script running on this
// origin, so a cross-site-scripting hole on efishother.com would expose the
// key. The static site loads no third-party script, and the key is the user's
// own revocable DeepSeek key, so this is an accepted, documented risk for a
// personal tool with no backend. A user who does not accept it can clear the
// key and the app falls back to the local static path.

const STORAGE_KEY = "another_brain.deepseek_api_key.v1";
const KEY_SHAPE = /^sk-[A-Za-z0-9_-]{16,}$/;

function storage() {
  try {
    const store = globalThis.localStorage;
    if (!store) return null;
    const probe = "another_brain.storage_probe";
    store.setItem(probe, "1");
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

export function storageAvailable() {
  return storage() !== null;
}

export function isWellFormedKey(candidate) {
  return KEY_SHAPE.test(String(candidate || "").trim());
}

export function readKey() {
  const store = storage();
  if (!store) return "";
  try {
    return String(store.getItem(STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function hasKey() {
  return readKey().length > 0;
}

export function saveKey(candidate) {
  const value = String(candidate || "").trim();
  if (!isWellFormedKey(value)) {
    return { ok: false, reason: "key_shape_not_recognized" };
  }
  const store = storage();
  if (!store) return { ok: false, reason: "browser_storage_unavailable" };
  try {
    store.setItem(STORAGE_KEY, value);
    return { ok: true, masked: maskKey(value) };
  } catch {
    return { ok: false, reason: "browser_storage_write_failed" };
  }
}

export function clearKey() {
  const store = storage();
  if (!store) return { ok: false, reason: "browser_storage_unavailable" };
  try {
    store.removeItem(STORAGE_KEY);
    return { ok: true };
  } catch {
    return { ok: false, reason: "browser_storage_write_failed" };
  }
}

// Display form. Never render or transmit the full key anywhere.
export function maskKey(candidate = readKey()) {
  const value = String(candidate || "").trim();
  if (!value) return "";
  const tail = value.slice(-4);
  return `sk-****${tail}`;
}

// Defensive scrub applied to every string that leaves this module's callers as
// a status line, an error, or a telemetry field.
export function redactKeyMaterial(text) {
  return String(text == null ? "" : text)
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-[redacted]")
    .replace(/(Bearer)\s+[A-Za-z0-9._~+/-]+=*/gi, "$1 [redacted]");
}
