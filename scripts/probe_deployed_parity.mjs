#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/r20_deployed_parity_report.json");
const DEPLOYED_URL = "https://efishother.com/?r20_parity=1";

async function localVersion() {
  const runtime = await import("../web/runtime_version.js");
  return runtime.RUNTIME_VERSION || {};
}

async function localSmoke() {
  const runtime = createDialogRuntime();
  const prompts = ["你知道罗大佑吗？", "他的歌曲有什么代表性？", "是否能简单一点？", "嗯。"];
  const turns = [];
  for (const prompt of prompts) turns.push(await answerDialogPrompt(prompt, runtime, { withThinkingDelay: false, uiProfile: "mobile" }));
  return turns.map((turn) => ({ prompt: turn.prompt, answer: turn.answer, route: turn.route, mode: turn.trace?.conversation_controller?.response_mode || "" }));
}

async function fetchAssetHashes(html, baseUrl) {
  const urls = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => new URL(m[1], baseUrl).href);
  const hashes = {};
  for (const url of urls.slice(0, 12)) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "another_brain_r20_parity/1.0" } });
      const text = await res.text();
      hashes[url] = createHash("sha256").update(text).digest("hex");
    } catch (error) {
      hashes[url] = `fetch_failed:${error.message}`;
    }
  }
  return { urls, hashes };
}

async function main() {
  const report = {
    generated_at: new Date().toISOString(),
    attempted: true,
    available: false,
    local_version: await localVersion(),
    deployed_version: "",
    asset_hash_match: false,
    stale_asset_detected: false,
    deployed_status: 0,
    deployed_headers: {},
    deployed_asset_urls: [],
    deployed_asset_hashes: {},
    local_smoke: await localSmoke(),
    reason: ""
  };
  try {
    const res = await fetch(DEPLOYED_URL, { headers: { "User-Agent": "another_brain_r20_parity/1.0" } });
    report.deployed_status = res.status;
    report.available = res.ok;
    for (const [key, value] of res.headers.entries()) report.deployed_headers[key] = value;
    const html = await res.text();
    report.deployed_version = html.match(/RUNTIME_VERSION|runtime_version|app\.js\?v=([^"']+)/)?.[1] || "";
    const assets = await fetchAssetHashes(html, DEPLOYED_URL);
    report.deployed_asset_urls = assets.urls;
    report.deployed_asset_hashes = assets.hashes;
    report.stale_asset_detected = Boolean(report.deployed_version && report.local_version?.commit && report.deployed_version !== report.local_version.commit);
  } catch (error) {
    report.available = false;
    report.reason = `network_unavailable_or_blocked: ${error.message}`;
  }
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ attempted: true, available: report.available, local_version: report.local_version, deployed_version: report.deployed_version, stale_asset_detected: report.stale_asset_detected, reason: report.reason, out: OUT }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});

