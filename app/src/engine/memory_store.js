// Conversation memory, kept on this device only.
//
// Turns live in IndexedDB for thirty days and are pruned on every load. Nothing
// here is sent anywhere except as the rolling context of the next question.
// Going back to the home page does not clear it; "/forget" does.
//
// Every turn carries the id of its conversation (`c`). "new" in the chat window
// only starts another id: earlier conversations stay in the store until they
// expire, and the "本地记忆" window lists them so they can be reopened.

export const RETENTION_DAYS = 30;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
const DB_NAME = "efish-other";
const STORE = "turns";
const FALLBACK_KEY = "efish-other.turns.v1";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("indexeddb_unavailable"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true }).createIndex("at", "at");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("indexeddb_open_failed"));
  });
}

function tx(db, mode, run) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = run(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/** Turns → conversations, newest first. Turns saved before conversations existed share id 0. */
export function groupConversations(turns) {
  const map = new Map();
  for (const t of turns) {
    const id = Number.isFinite(t?.c) ? t.c : 0;
    if (!map.has(id)) map.set(id, { id, turns: [] });
    map.get(id).turns.push(t);
  }
  return [...map.values()].map((c) => {
    c.turns.sort((a, b) => a.at - b.at);
    const first = c.turns.find((t) => t.role === "user" && String(t.text).trim()) || c.turns[0];
    return { id: c.id, turns: c.turns, startedAt: c.turns[0].at, lastAt: c.turns[c.turns.length - 1].at, title: String(first?.text || "").trim().slice(0, 40), count: c.turns.length };
  }).sort((a, b) => b.lastAt - a.lastAt);
}

export function pruneExpired(turns, now = Date.now()) {
  return turns.filter((t) => t && Number.isFinite(t.at) && now - t.at <= RETENTION_MS);
}

function fallbackRead() {
  try { return JSON.parse(globalThis.localStorage?.getItem(FALLBACK_KEY) || "[]"); } catch { return []; }
}
function fallbackWrite(turns) {
  try { globalThis.localStorage?.setItem(FALLBACK_KEY, JSON.stringify(turns.slice(-400))); } catch { /* memory is best effort */ }
}

export function createMemoryStore({ now = () => Date.now() } = {}) {
  let dbPromise = null;
  let volatile = [];
  const db = () => (dbPromise ??= openDb().catch(() => null));

  return {
    async load() {
      const handle = await db();
      if (!handle) { volatile = pruneExpired(fallbackRead(), now()); fallbackWrite(volatile); return volatile.slice(); }
      const all = await new Promise((resolve, reject) => {
        const req = handle.transaction(STORE, "readonly").objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      }).catch(() => []);
      const keep = pruneExpired(all, now());
      const expired = all.filter((t) => !keep.includes(t));
      if (expired.length) await tx(handle, "readwrite", (s) => { for (const t of expired) s.delete(t.id); }).catch(() => {});
      try { await navigator.storage?.persist?.(); } catch { /* optional */ }
      return keep.sort((a, b) => a.at - b.at);
    },
    async append(role, text, extra = {}) {
      const turn = { role, text: String(text || ""), at: now(), ...extra };
      const handle = await db();
      if (!handle) { volatile.push(turn); fallbackWrite(volatile); return turn; }
      await tx(handle, "readwrite", (s) => s.add(turn)).catch(() => {});
      return turn;
    },
    /** Forgets one conversation and leaves the others alone. */
    async removeConversation(id) {
      const belongs = (t) => (Number.isFinite(t?.c) ? t.c : 0) === id;
      volatile = volatile.filter((t) => !belongs(t)); fallbackWrite(volatile);
      const handle = await db(); if (!handle) return;
      const all = await new Promise((resolve) => { const req = handle.transaction(STORE, "readonly").objectStore(STORE).getAll(); req.onsuccess = () => resolve(req.result || []); req.onerror = () => resolve([]); });
      await tx(handle, "readwrite", (s) => { for (const t of all) if (belongs(t)) s.delete(t.id); }).catch(() => {});
    },
    async clear() {
      volatile = [];
      fallbackWrite([]);
      const handle = await db();
      if (handle) await tx(handle, "readwrite", (s) => s.clear()).catch(() => {});
    }
  };
}
