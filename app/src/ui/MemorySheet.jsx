import { useEffect, useState } from "react";
import { U, CircleX } from "./Hand.jsx";
import { groupConversations, RETENTION_DAYS } from "../engine/memory_store.js";

// 本地记忆 — every conversation still on this device. Opening one makes it the
// current conversation again; forgetting one removes only that one.
const when = (at) => { const d = new Date(at); const two = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`; };

export default function MemorySheet({ memory, currentId, onOpen, onClose }) {
  const [items, setItems] = useState(null);
  const refresh = () => memory.load().then((turns) => setItems(groupConversations(turns)));
  useEffect(() => { refresh(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="about memory" role="dialog" aria-modal="true" aria-label="本地记忆">
      <header className="about-bar">
        <h2 className="memory-title"><U v={1}>本地记忆</U></h2>
        <button type="button" className="xhand" onClick={onClose} aria-label="close"><CircleX /></button>
      </header>
      <main className="memory-body">
        <p className="memory-note">只存在这台设备里，{RETENTION_DAYS} 天后自己忘掉。</p>
        {items === null ? null : items.length === 0 ? <p className="memory-empty">还没有。</p> : (
          <ul className="memory-list">
            {items.map((c) => (
              <li key={c.id} className={c.id === currentId ? "is-current" : ""}>
                <button type="button" className="memory-open" onClick={() => onOpen(c)}>
                  <span className="memory-when">{when(c.lastAt)} · {c.count}</span>
                  <span className="memory-line">{c.title || "…"}</span>
                </button>
                <button type="button" className="memory-forget" onClick={async () => { await memory.removeConversation(c.id); refresh(); }} aria-label={`forget the conversation from ${when(c.lastAt)}`}><U v={3}>forget</U></button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
