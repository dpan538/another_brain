#!/usr/bin/env node
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "artifacts/training_os/browser_profile_budget_report.json");
const KB = 1024;
const MB = 1024 * KB;

async function fileSize(path) {
  try {
    return (await stat(resolve(ROOT, path))).size;
  } catch {
    return 0;
  }
}

async function dirSize(path, exts = new Set([".js", ".json", ".jsonl", ".css", ".html"])) {
  const root = resolve(ROOT, path);
  let total = 0;
  async function walk(current) {
    let entries = [];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const next = resolve(current, entry.name);
      if (entry.isDirectory()) await walk(next);
      else if (exts.has(extname(entry.name))) total += (await stat(next)).size;
    }
  }
  await walk(root);
  return total;
}

function mb(value) {
  return Math.round((value / MB) * 1000) / 1000;
}

function profile(name, fields) {
  const failures = [];
  if (fields.total_bytes > fields.max_bytes) failures.push("bundle_budget");
  if (!fields.no_cloud_guarantee) failures.push("no_cloud_guarantee_missing");
  if (!fields.fallback_path) failures.push("fallback_path_missing");
  return {
    name,
    ...fields,
    total_mb: mb(fields.total_bytes),
    max_mb: mb(fields.max_bytes),
    ok: failures.length === 0,
    failures
  };
}

async function main() {
  const appBytes = await fileSize("web/app.js");
  const routerBytes = await fileSize("web/tiny_router_model.generated.js");
  const cultureBytes = await fileSize("web/culture_cards.generated.js");
  const knowledgeBytes = await fileSize("web/knowledge_base.generated.js");
  const coreWebBytes = await dirSize("web");
  const controlledGateBytes = await fileSize("web/controlled_gate_model.generated.js");

  const profiles = [
    profile("lite", {
      total_bytes: appBytes + routerBytes + knowledgeBytes,
      max_bytes: 8 * MB,
      p95_answer_latency_ms_target: 1500,
      memory_budget_mb: 128,
      cold_load_risk: routerBytes > 6 * MB ? "medium" : "low",
      safari_mobile_risk: "medium",
      webgpu_required: false,
      fallback_path: "deterministic standard-lite runtime",
      no_cloud_guarantee: true
    }),
    profile("standard", {
      total_bytes: coreWebBytes,
      max_bytes: 16 * MB,
      p95_answer_latency_ms_target: 1800,
      memory_budget_mb: 192,
      cold_load_risk: coreWebBytes > 12 * MB ? "medium" : "low",
      safari_mobile_risk: "medium",
      webgpu_required: false,
      fallback_path: "lite profile",
      no_cloud_guarantee: true
    }),
    profile("full", {
      total_bytes: coreWebBytes + controlledGateBytes,
      max_bytes: 24 * MB,
      p95_answer_latency_ms_target: 2200,
      memory_budget_mb: 256,
      cold_load_risk: controlledGateBytes ? "medium" : "not_ready",
      safari_mobile_risk: "medium_high",
      webgpu_required: false,
      fallback_path: "standard profile",
      no_cloud_guarantee: true
    }),
    profile("web_llm_experimental", {
      total_bytes: coreWebBytes + controlledGateBytes,
      max_bytes: 64 * MB,
      p95_answer_latency_ms_target: 4000,
      memory_budget_mb: 1024,
      cold_load_risk: "high",
      safari_mobile_risk: "high",
      webgpu_required: true,
      fallback_path: "standard profile",
      no_cloud_guarantee: true
    })
  ];

  const ready = profiles.filter((item) => item.name !== "web_llm_experimental").every((item) => item.ok);
  const report = {
    ok: true,
    ready,
    generated_js_size: {
      app_mb: mb(appBytes),
      tiny_router_model_mb: mb(routerBytes),
      culture_cards_mb: mb(cultureBytes),
      knowledge_base_mb: mb(knowledgeBytes),
      controlled_gate_model_mb: mb(controlledGateBytes),
      web_total_mb: mb(coreWebBytes)
    },
    profiles,
    recommendations: [
      "Keep lite/standard as deterministic no-cloud fallback.",
      "Shard external culture reserves before public runtime admission.",
      "Do not integrate controlled gate until artifact and strict evals pass.",
      "Keep WebGPU generation experimental and local-only."
    ]
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
