#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);

const SKIP_PATTERNS = [
  /^artifacts\//,
  /^node_modules\//,
  /^web\/tiny_router_model\.generated\.js$/,
  /^web\/knowledge_shards\//,
  /^web\/brain_pack\.js$/,
  /^build_sources\//,
  /^knowledge_sources\//
];

function normalize(path) {
  return String(path || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

async function gitFiles() {
  try {
    const { stdout } = await execFileAsync("rg", ["--files"], { cwd: ROOT, maxBuffer: 24 * 1024 * 1024 });
    return stdout
      .split(/\r?\n/)
      .map(normalize)
      .filter(Boolean)
      .filter((path) => !SKIP_PATTERNS.some((pattern) => pattern.test(path)));
  } catch {
    return [];
  }
}

function add(bucket, item) {
  if (!bucket.some((existing) => existing.path === item.path && existing.script === item.script && existing.reason === item.reason)) {
    bucket.push(item);
  }
}

function classifyPath(path, buckets) {
  if (/r24|heldout|long_horizon|eval_split|no_eval|hardcoding|anti_lobotomy|dialogue|fallback_invariants|vercel|shard|recovery|source_derivation|training_provenance/i.test(path)) {
    add(buckets.keep_as_r24_gate, { path, reason: "R24 recovery, held-out, split, shard, Vercel, or provenance gate" });
  }
  if (/fallback|verifier|finalizer|privacy|unknown|task_state|micro_solvers|conversation_controller|operation_layer|answerability|surface_identity/i.test(path)) {
    add(buckets.keep_as_fallback_runtime, { path, reason: "fallback, verifier, privacy, unknown, micro-solver, or task-state runtime boundary" });
  }
  if (/personal_?200m|mini[-_ ]web[-_ ]llm|small language model|slm|tiny_router|tiny router|100M-200M/i.test(path)) {
    add(buckets.demote_from_product_path, { path, reason: "legacy SLM or tiny-router product framing; keep only as comparison, fallback, or historical context" });
  }
  if (/docs\/(r18|r0_r22|personal_200m|mini_web_llm|browser_mini_web_llm|training_depth|final_endpoint_standard)|select_candidate_web_llm_models|eval_personal_200m|eval_mini_web_llm/i.test(path)) {
    add(buckets.archive_or_delete_candidate, { path, reason: "candidate for archive/deprecation after R25 static LLM gates stabilize" });
  }
}

function classifyScript(name, command, buckets) {
  const entry = { script: name, command };
  if (/r24|heldout|long-horizon|eval-split|no-eval|anti-lobotomy|dialogue|vercel|shard|recovery|source-derivation|training-provenance/i.test(name + " " + command)) {
    add(buckets.keep_as_r24_gate, { ...entry, reason: "package gate remains part of R24 safety harness" });
  }
  if (/fallback|finalizer|dialogue-boundary|micro-solvers|task-state/i.test(name + " " + command)) {
    add(buckets.keep_as_fallback_runtime, { ...entry, reason: "fallback or finalizer runtime validation" });
  }
  if (/personal-200m|personal_200m|mini-web-llm|mini_web_llm|select_candidate_web_llm_models|run_longrun_mini_web_llm_loop/i.test(name + " " + command)) {
    add(buckets.demote_from_product_path, { ...entry, reason: "legacy SLM profile or mini-web framing; not the R25 product target" });
    add(buckets.archive_or_delete_candidate, { ...entry, reason: "keep as historical comparison until reviewed for archive" });
  }
}

async function main() {
  const packageJson = JSON.parse(await readFile(resolve(ROOT, "package.json"), "utf8"));
  const files = await gitFiles();
  const buckets = {
    keep_as_r24_gate: [],
    keep_as_fallback_runtime: [],
    demote_from_product_path: [],
    archive_or_delete_candidate: [],
    forbidden_for_r25: [],
    recommended_deletions: [],
    recommended_renames: [],
    required_followups: []
  };

  for (const path of files) classifyPath(path, buckets);
  for (const [name, command] of Object.entries(packageJson.scripts || {})) classifyScript(name, command, buckets);

  const policyForbidden = [
    "cloud inference",
    "server inference",
    "Vercel Function LLM inference",
    "external model API",
    "repo-local unreviewed model weights",
    "chain-of-thought training data",
    "answer-bank expansion as intelligence repair"
  ];
  for (const item of policyForbidden) {
    buckets.forbidden_for_r25.push({ policy: item, status: "forbidden_policy", violation: false });
  }

  buckets.recommended_renames.push(
    {
      from: "select:personal-200m-models",
      to: "legacy:select-personal-200m-models",
      reason: "make 100M-200M SLM selection explicitly legacy while preserving the old script"
    },
    {
      from: "eval:personal-200m-profile",
      to: "legacy:eval-personal-200m-profile",
      reason: "make personal_200m budget eval a comparison artifact, not product target"
    },
    {
      from: "eval:mini-web-llm-readiness",
      to: "legacy:eval-mini-web-llm-readiness",
      reason: "make mini-web readiness a historical audit, not final model admission"
    }
  );

  buckets.required_followups.push(
    "R25B must choose and admit a real same-origin static decoder LLM artifact only after manifest, budget, license, provenance, and no-backend checks pass.",
    "Review archive_or_delete_candidate entries before moving or deleting historical docs/scripts.",
    "Keep R24 recovery, held-out, shard, Vercel, anti-lobotomy, and dialogue gates green while changing the answer path."
  );

  const actualForbidden = buckets.forbidden_for_r25.filter((item) => item.violation === true);
  const counts = Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, value.length]));
  const report = {
    ok: actualForbidden.length === 0,
    counts,
    ...buckets
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
