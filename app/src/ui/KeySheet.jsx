import { useState } from "react";
import { U } from "./Hand.jsx";
import { clearKey, isWellFormedKey, maskKey, saveKey, hasKey } from "../engine/key_store.js";

// Owner-only. Opened by typing /key. This is the one place the system keyboard
// is allowed, so a key can be pasted rather than typed letter by letter.
export default function KeySheet({ onClose }) {
  const [value, setValue] = useState("");
  const [note, setNote] = useState(hasKey() ? `saved: ${maskKey()}` : "no key on this device.");
  const save = () => {
    if (!isWellFormedKey(value.trim())) { setNote("that does not look like a DeepSeek key (sk-…)."); return; }
    const r = saveKey(value.trim());
    setValue("");
    setNote(r.ok ? `saved: ${r.masked}` : "could not save on this device.");
    if (r.ok) setTimeout(onClose, 600);
  };
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="DeepSeek key">
      <div className="sheet-card">
        <h2><U v={0}>KEY</U></h2>
        <p>The key stays in this browser and is sent only to api.deepseek.com. There is no server.</p>
        <input type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder="sk-…" autoComplete="off" spellCheck="false" aria-label="DeepSeek API key" />
        <p className="sheet-note" aria-live="polite">{note}</p>
        <div className="sheet-actions">
          <button type="button" onClick={save}>save</button>
          <button type="button" onClick={() => { clearKey(); setNote("key removed."); }}>remove</button>
          <button type="button" onClick={onClose}>close</button>
        </div>
      </div>
    </div>
  );
}
