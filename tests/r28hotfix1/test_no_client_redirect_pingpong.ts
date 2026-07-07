import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("static entries do not ping-pong between slash and no-slash URLs", async () => {
  const files = [
    "../../web/index.html",
    "../../web/another_brain_chat.html",
    "../../web/another_brain_chat/index.html",
  ];
  for (const file of files) {
    const html = await readFile(new URL(file, import.meta.url), "utf8");
    assert.equal(html.includes("window.location.replace"), false);
    assert.equal(html.includes("another_brain_chat/?v="), false);
    assert.equal(html.includes("another_brain_chat/</a>"), false);
  }
});
