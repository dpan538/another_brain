#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/r20_runtime_asset_version_audit.json");

async function hash(path) {
  const text = await readFile(resolve(ROOT, path), "utf8");
  return createHash("sha256").update(text).digest("hex");
}

async function main() {
  const files = [
    "web/runtime_version.js",
    "web/app.js",
    "web/conversation_controller.js",
    "web/answer_deduper.js",
    "web/mobile_answer_formatter.js",
    "web/webgpu_capability.js",
    "web/embedding_runtime.js",
    "web/rerank_runtime.js",
    "web/index.html"
  ];
  const local_hashes = {};
  for (const file of files) {
    try {
      local_hashes[file] = await hash(file);
    } catch (error) {
      local_hashes[file] = `missing:${error.message}`;
    }
  }
  const version = await import("../web/runtime_version.js");
  const index = await readFile(resolve(ROOT, "web/index.html"), "utf8");
  const report = {
    generated_at: new Date().toISOString(),
    runtime_version: version.RUNTIME_VERSION || {},
    local_hashes,
    cache_busting_present: /app\.js\?v=/.test(index),
    service_worker_declared: /serviceWorker|navigator\.serviceWorker/.test(index),
    ok: Boolean(version.RUNTIME_VERSION?.r20EndpointAcceptance)
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, runtime_version: report.runtime_version, out: OUT }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});

