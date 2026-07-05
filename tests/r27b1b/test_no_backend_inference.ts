import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

test("R27B1B runtime files contain no backend inference or remote LLM endpoints", () => {
  const root = resolve(process.cwd());
  function runtimeFiles(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return runtimeFiles(path);
      return path.endsWith(".ts") ? [path] : [];
    });
  }
  const files = [
    ...runtimeFiles(join(root, "src/browser_runtime")),
    join(root, "web/another_brain_chat/browser_runtime.js"),
    join(root, "web/another_brain_chat/runtime_worker.js")
  ];
  const text = files.map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(text, /FastAPI|Flask|app\.post|api\.openai\.com|anthropic\.com|doubao|dashscope|volces/i);
});
