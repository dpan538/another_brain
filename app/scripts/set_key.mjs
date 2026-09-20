// Stores the DeepSeek key for local development, without it ever appearing on screen,
// in shell history, or anywhere but app/.env.local (git-ignored, readable only by you).
//   npm --prefix app run key
import { writeFile, chmod } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const target = join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local");
if (!process.stdin.isTTY) { console.error("Run this in a terminal: it reads the key from the keyboard."); process.exit(1); }

const CTRL_C = 3; const BACKSPACE = 8; const DELETE = 127; const RETURN = 13; const NEWLINE = 10;
process.stdout.write("Paste the DeepSeek key and press Return (nothing will be shown): ");
process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding("utf8");
let key = "";
process.stdin.on("data", async (chunk) => {
  for (const ch of chunk) {
    const code = ch.codePointAt(0);
    if (code === CTRL_C) { process.stdout.write("cancelled.\n"); process.exit(1); }
    if (code === RETURN || code === NEWLINE) {
      process.stdin.setRawMode(false); process.stdin.pause(); console.log("");
      key = key.trim();
      if (!/^sk-[A-Za-z0-9_-]{16,}$/.test(key)) { console.error("That does not look like a DeepSeek key (sk-...). Nothing was written."); process.exit(1); }
      await writeFile(target, "DEEPSEEK_API_KEY=" + key + String.fromCharCode(NEWLINE), { mode: 0o600 }); await chmod(target, 0o600);
      console.log("saved to app/.env.local (" + key.length + " characters). The running dev server picks it up on the next question.");
      process.exit(0);
    }
    if (code === DELETE || code === BACKSPACE) key = key.slice(0, -1); else if (code >= 32) key += ch;
  }
});
