#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/r20_deployed_parity_report.json");
const DEPLOYED_URL = "https://efishother.com/?r20_parity=1";

async function localVersion() {
  const runtime = await import("../web/runtime_version.js");
  const version = runtime.RUNTIME_VERSION || {};
  try {
    return { ...version, gitHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim() };
  } catch {
    return version;
  }
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

function parseRuntimeVersionSource(source) {
  const get = (key) => source.match(new RegExp(`${key}:\\s*"([^"]*)"`))?.[1] || "";
  return {
    commit: get("commit"),
    commitShort: get("commitShort"),
    branch: get("branch"),
    buildTime: get("buildTime"),
    deploymentId: get("deploymentId"),
    vercelEnv: get("vercelEnv"),
    p0FallbackFirewall: /p0FallbackFirewall:\s*true/.test(source),
    r19ConversationController: /r19ConversationController:\s*true/.test(source),
    r20EndpointAcceptance: /r20EndpointAcceptance:\s*true/.test(source),
    publicDefaultGenerator: /publicDefaultGenerator:\s*true/.test(source),
    personal200mEnabledByDefault: /personal200mEnabledByDefault:\s*true/.test(source),
    webgpuRetrievalPilot: /webgpuRetrievalPilot:\s*true/.test(source)
  };
}

async function fetchDeployedRuntimeVersion(baseUrl) {
  const url = new URL(`/runtime_version.js?parity=${Date.now()}`, baseUrl);
  const res = await fetch(url, { headers: { "User-Agent": "another_brain_r20_parity/1.0" } });
  if (!res.ok) return { available: false, status: res.status, version: {} };
  const source = await res.text();
  return { available: true, status: res.status, version: parseRuntimeVersionSource(source) };
}

function isSameCommit(a, b) {
  if (!a || !b || a === "local" || b === "local") return false;
  return a === b || a.startsWith(b) || b.startsWith(a) || a.slice(0, 12) === b.slice(0, 12);
}

async function main() {
  const report = {
    generated_at: new Date().toISOString(),
    attempted: true,
    available: false,
    local_version: await localVersion(),
    deployed_version: "",
    deployed_runtime_version: {},
    deployed_runtime_available: false,
    deployed_app_version: "",
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
    report.deployed_app_version = html.match(/app\.js\?v=([^"']+)/)?.[1] || "";
    const deployedRuntime = await fetchDeployedRuntimeVersion(DEPLOYED_URL);
    report.deployed_runtime_available = deployedRuntime.available;
    report.deployed_runtime_version = deployedRuntime.version;
    report.deployed_version = deployedRuntime.version?.commit || report.deployed_app_version || "";
    const assets = await fetchAssetHashes(html, DEPLOYED_URL);
    report.deployed_asset_urls = assets.urls;
    report.deployed_asset_hashes = assets.hashes;
    report.stale_asset_detected = Boolean(
      (report.local_version?.gitHead && report.deployed_runtime_version?.commit && !isSameCommit(report.local_version.gitHead, report.deployed_runtime_version.commit)) ||
        (!report.deployed_runtime_version?.commit && report.deployed_app_version && report.local_version?.commit && report.local_version.commit !== "local" && report.deployed_app_version !== report.local_version.commit)
    );
  } catch (error) {
    report.available = false;
    report.reason = `network_unavailable_or_blocked: ${error.message}`;
  }
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ attempted: true, available: report.available, local_version: report.local_version, deployed_version: report.deployed_version, deployed_app_version: report.deployed_app_version, stale_asset_detected: report.stale_asset_detected, reason: report.reason, out: OUT }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
