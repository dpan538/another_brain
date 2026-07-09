import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

async function collect(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await collect(path));
    else if (/\.(js|ts|json|md|py|mjs|html|css)$/.test(entry.name)) out.push(path);
  }
  return out;
}

test("runtime launch candidate files do not ingest eval rows, private raw data, or root documents", async () => {
  const root = new URL("../..", import.meta.url).pathname;
  const guardedRuntime = [
    ...(await collect(join(root, "src/browser_runtime")))
  ];
  const ingestionSurfaces = [
    ...(await collect(join(root, "web/another_brain/static_rag"))),
    ...(await collect(join(root, "scripts"))).filter((file) => basename(file).startsWith("r28ship2_"))
  ];
  const runtimeText = (await Promise.all(guardedRuntime.map((file) => readFile(file, "utf8")))).join("\n").toLowerCase();
  const text = (await Promise.all(ingestionSurfaces.map((file) => readFile(file, "utf8")))).join("\n").toLowerCase();
  for (const marker of ["data/public_ingestion", "private_sources/", ".docx", ".pdf", "raw_public_samples", "clean_public_samples", "training_mix"]) {
    assert.equal(text.includes(marker), false, marker);
  }
  assert.ok(runtimeText.includes("public_ingestion_path_rejected"));
  assert.equal(/question_pack_001.*51/.test(text), false);
});
