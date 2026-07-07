#!/usr/bin/env node
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname);
const out = join(tmpdir(), `r28rt1-real-forward-${process.pid}`);

async function copyAsMjs(fromDir, toDir) {
  await mkdir(toDir, { recursive: true });
  for (const entry of await readdir(fromDir, { withFileTypes: true })) {
    const source = join(fromDir, entry.name);
    const targetBase = join(toDir, entry.name);
    if (entry.isDirectory()) {
      await copyAsMjs(source, targetBase);
      continue;
    }
    if (!entry.name.endsWith(".ts")) continue;
    const target = targetBase.replace(/\.ts$/, ".mjs");
    const text = (await readFile(source, "utf8")).replace(/\.ts(["'])/g, ".mjs$1");
    await writeFile(target, text, "utf8");
  }
}

function arrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function fileFetcher(url) {
  const path = new URL(url).pathname.replace(/^\/+/, "");
  const file = join(root, "web", path);
  const bytes = await readFile(file).catch(() => null);
  if (!bytes) return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(bytes.toString("utf8")),
    arrayBuffer: async () => arrayBuffer(bytes)
  };
}

await rm(out, { recursive: true, force: true });
await copyAsMjs(join(root, "src/browser_runtime"), join(out, "src/browser_runtime"));
const mod = await import(pathToFileURL(join(out, "src/browser_runtime/q4_runtime/index.mjs")));
const runtimePackage = await mod.loadR28M1Q4RuntimePackage({ fetcher: fileFetcher, baseUrl: "https://local.test/" });
const checksum = await mod.verifyCommittedShardChecksums(runtimePackage, { fetcher: fileFetcher, baseUrl: "https://local.test/" });
const smoke = await mod.runR28RT1RealForwardSmoke(runtimePackage, {
  fetcher: fileFetcher,
  baseUrl: "https://local.test/"
});
const report = {
  ok: checksum.ok && smoke.real_inference_smoke_passed,
  checksum,
  smoke,
  non_claims: {
    product_model: false,
    browser_admission: false,
    release_admission: false,
    backend_inference: false,
    external_llm_api: false,
    doubao: false
  }
};
console.log(JSON.stringify(report, null, 2));
await rm(out, { recursive: true, force: true });
process.exit(report.ok ? 0 : 1);
