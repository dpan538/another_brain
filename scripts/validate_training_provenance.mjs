#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { ROOT } from "./r18_utils.mjs";

const DIR = resolve(ROOT, "training/long_horizon");
const OUT = resolve(ROOT, "artifacts/training_os/training_provenance_report.json");
const LLM_CORPUS_DIR = resolve(ROOT, "training/llm_corpus");
const PROMOTED_REPO_DERIVED_FILE = /^r25a[km]_repo_derived_(train|dev|heldout)\.jsonl$/;
const SOURCE_TYPES = new Set(["human_seed", "synthetic_llm", "repo_derived", "eval_fixture"]);
const CHAIN_KEY = /chain.?of.?thought|cot|hidden_reasoning|private_reasoning/i;
const LOCAL_PATH = /\/Users\/|\/private\/var\/|\/Volumes\//;
const SECRET = /BEGIN (RSA|OPENSSH|PRIVATE) KEY|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|api[_-]?key|secret[_-]?key/i;
const WEIGHT_REF = /(^|[/"' ])[^"' ]+\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)(["' ]|$)/i;

async function readJsonl(path) {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return { row: JSON.parse(line), line: index + 1 };
      } catch (error) {
        return { row: null, line: index + 1, parseError: error.message };
      }
    });
}

function walk(value, path = []) {
  const out = [];
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      const next = [...path, key];
      out.push({ path: next.join("."), key, value: nested });
      out.push(...walk(nested, next));
    }
  }
  return out;
}

function validateSample(sample) {
  const failures = [];
  const provenance = sample.provenance || {};
  const r25ak = String(sample.sample_id || "").startsWith("r25ak_repo_derived_");
  const r25am = String(sample.sample_id || "").startsWith("r25am_repo_derived_");
  if (!provenance || typeof provenance !== "object") failures.push("missing_provenance");
  if (!SOURCE_TYPES.has(provenance.source_type)) failures.push("invalid_source_type");
  if (provenance.source_type === "synthetic_llm" && !provenance.generator_model) failures.push("synthetic_llm_missing_generator_model");
  if (provenance.source_type !== "human_seed" && !provenance.license_or_permission) failures.push("non_human_missing_license_or_permission");
  if (provenance.contains_private_data !== false) failures.push("private_data_requires_explicit_review");
  if (r25ak || r25am) {
    const phase = r25am ? "R25AM" : "R25AK";
    const promotedBy = r25am ? "scripts/promote_r25am_second_chinese_corpus.mjs" : "scripts/promote_r25ak_unique_candidates.mjs";
    if (sample.review_status !== "reviewed_for_training_corpus") failures.push(`${phase.toLowerCase()}_review_status_not_promoted`);
    if (sample.training_allowed !== true) failures.push(`${phase.toLowerCase()}_training_allowed_not_true`);
    if (sample.public_commit_allowed !== true) failures.push(`${phase.toLowerCase()}_public_commit_allowed_not_true`);
    if (provenance.promoted_by !== promotedBy) failures.push(`${phase.toLowerCase()}_missing_promoted_by`);
    if (provenance.promotion_phase !== phase) failures.push(`${phase.toLowerCase()}_missing_promotion_phase`);
    if (provenance.external_llm_used !== false) failures.push(`${phase.toLowerCase()}_external_llm_used_not_false`);
  }
  for (const item of walk(sample)) {
    if (CHAIN_KEY.test(item.key)) failures.push(`chain_of_thought_key:${item.path}`);
    if (typeof item.value !== "string") continue;
    if (LOCAL_PATH.test(item.value)) failures.push(`local_path:${item.path}`);
    if (SECRET.test(item.value)) failures.push(`secret_like_string:${item.path}`);
    if (WEIGHT_REF.test(item.value) && !/^https?:\/\//.test(item.value)) failures.push(`repo_local_model_weight_reference:${item.path}`);
  }
  return [...new Set(failures)];
}

async function main() {
  const files = (await readdir(DIR)).filter((file) => file.endsWith(".jsonl")).sort();
  const results = [];
  for (const file of files) {
    for (const item of await readJsonl(join(DIR, file))) {
      if (item.parseError) {
        results.push({ file, line: item.line, task_id: "", ok: false, failures: [`parse_error:${item.parseError}`] });
      } else {
        const failures = validateSample(item.row);
        results.push({ file, line: item.line, task_id: item.row.task_id || "", ok: failures.length === 0, failures });
      }
    }
  }
  const promotedFiles = (await readdir(LLM_CORPUS_DIR)).filter((file) => PROMOTED_REPO_DERIVED_FILE.test(file)).sort();
  for (const promotedFile of promotedFiles) {
    const fullPath = join(LLM_CORPUS_DIR, promotedFile);
    const file = fullPath.replace(`${ROOT}/`, "");
    let items;
    try {
      items = await readJsonl(fullPath);
    } catch {
      continue;
    }
    for (const item of items) {
      if (item.parseError) {
        results.push({ file, line: item.line, task_id: "", ok: false, failures: [`parse_error:${item.parseError}`] });
      } else {
        const failures = validateSample(item.row);
        results.push({ file, line: item.line, task_id: item.row.sample_id || "", ok: failures.length === 0, failures });
      }
    }
  }
  const failed = results.filter((row) => !row.ok);
  const report = {
    ok: failed.length === 0 && results.length > 0,
    samples_total: results.length,
    files,
    failures: failed,
    report_path: OUT
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
