#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const CONFIG_PATH = "training/from_scratch/small_decoder_pilot_config.json";
const RUN_CONFIG_PATH = "training/from_scratch/small_decoder_pilot_run_config.json";
const PLAN_PATH = "artifacts/training_os/small_decoder_pilot/r25l_small_decoder_pilot_plan.json";
const WEIGHT_RE = /\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$/i;
const q = String.fromCharCode(113);
const w = String.fromCharCode(119);
const e = String.fromCharCode(101);
const n = String.fromCharCode(110);
const PURGED_CANDIDATE_RE = new RegExp([q, w, e, n].join(""), "i");
const FORBIDDEN_PRODUCT_RE = /(?:LoRA|adapter|adapters|fine[- ]?tune|fine[- ]?tuning|pretrained|pre-trained|foundation model|external model).{0,100}(?:final strategy|product target|main product|primary path)/i;
const externalTerm = ["external", "backend"].join(" ");
const storageTerm = ["external", "storage"].join(" ");
const vectorTerm = ["hosted", "vector"].join(" ");
const remoteApiTerm = ["remote", "model", "API"].join(" ");
const vercelFunctionTerm = ["Vercel", "Function"].join(" ");
const edgeFunctionTerm = ["Edge", "Function"].join(" ");
const BACKEND_RE = new RegExp(
  `(?:${externalTerm}|${storageTerm}|${vectorTerm}|${remoteApiTerm}|${vercelFunctionTerm}|${edgeFunctionTerm}).{0,80}(?:allowed|required|main path|product)`,
  "i"
);

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function gitLines(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 });
  return stdout.split(/\r?\n/).filter(Boolean);
}

async function isIgnored(path) {
  try {
    await execFileAsync("git", ["check-ignore", path], { cwd: ROOT });
    return true;
  } catch {
    return false;
  }
}

function collectStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, out));
  return out;
}

async function main() {
  const failures = [];
  const config = await readJson(CONFIG_PATH).catch(() => null);
  const runConfig = await readJson(RUN_CONFIG_PATH).catch(() => null);
  const plan = await readJson(PLAN_PATH).catch(() => null);
  if (!config) failures.push({ code: "small_decoder_pilot_config_missing" });
  if (!runConfig) failures.push({ code: "small_decoder_pilot_run_config_missing", path: RUN_CONFIG_PATH });
  if (!plan) failures.push({ code: "small_decoder_pilot_plan_missing", path: PLAN_PATH });
  if (config) {
    if (config.product_model !== false) failures.push({ code: "pilot_config_must_not_be_product" });
    if (config.training_allowed_by_default !== false) failures.push({ code: "pilot_training_must_be_disabled_by_default" });
    if (config.commit_weights_allowed !== false) failures.push({ code: "pilot_must_not_allow_weight_commit" });
    if (!String(config.output_dir || "").startsWith("artifacts/training_os/small_decoder_pilot/")) failures.push({ code: "pilot_output_dir_must_be_ignored_artifacts" });
    if (!(await isIgnored(`${config.output_dir}probe`))) failures.push({ code: "pilot_output_dir_not_ignored", output_dir: config.output_dir });
    const text = collectStrings(config).join("\n");
    if (PURGED_CANDIDATE_RE.test(text)) failures.push({ code: "purged_candidate_reference_in_pilot_config" });
    if (FORBIDDEN_PRODUCT_RE.test(text)) failures.push({ code: "forbidden_model_strategy_claim_in_pilot_config" });
    if (BACKEND_RE.test(text)) failures.push({ code: "backend_or_storage_claim_in_pilot_config" });
  }
  if (runConfig) {
    if (runConfig.product_model !== false) failures.push({ code: "pilot_run_config_must_not_be_product" });
    if (runConfig.release_checkpoint !== false) failures.push({ code: "pilot_run_config_must_not_be_release_checkpoint" });
    if (runConfig.commit_weights_allowed !== false) failures.push({ code: "pilot_run_config_must_not_allow_weight_commit" });
    if (!String(runConfig.output_dir || "").startsWith("artifacts/training_os/small_decoder_pilot/r25m/")) failures.push({ code: "pilot_run_output_dir_must_be_r25m_ignored_artifacts" });
    if (!(await isIgnored(`${runConfig.output_dir}probe`))) failures.push({ code: "pilot_run_output_dir_not_ignored", output_dir: runConfig.output_dir });
    if (runConfig.train_source !== "training/llm_corpus/r25l_train.jsonl") failures.push({ code: "pilot_run_train_source_invalid", train_source: runConfig.train_source });
    if (runConfig.dev_source !== "training/llm_corpus/r25l_dev.jsonl") failures.push({ code: "pilot_run_dev_source_invalid", dev_source: runConfig.dev_source });
    if (Number(runConfig.max_steps || 0) > 80) failures.push({ code: "pilot_run_steps_exceed_bound", max_steps: runConfig.max_steps });
    const runText = collectStrings(runConfig).join("\n");
    if (PURGED_CANDIDATE_RE.test(runText)) failures.push({ code: "purged_candidate_reference_in_pilot_run_config" });
    if (FORBIDDEN_PRODUCT_RE.test(runText)) failures.push({ code: "forbidden_model_strategy_claim_in_pilot_run_config" });
    if (BACKEND_RE.test(runText)) failures.push({ code: "backend_or_storage_claim_in_pilot_run_config" });
  }
  if (plan) {
    if (plan.ok !== true) failures.push({ code: "pilot_plan_not_ok" });
    if (plan.training_will_run !== false) failures.push({ code: "pilot_plan_must_not_run_training" });
    if (plan.product_model !== false) failures.push({ code: "pilot_plan_must_not_be_product" });
    for (const field of ["parameter_estimate", "estimated_fp32_bytes", "estimated_q8_bytes", "estimated_q4_bytes", "context_tokens"]) {
      if (!Number.isFinite(plan[field]) || plan[field] <= 0) failures.push({ code: "pilot_plan_missing_numeric_estimate", field });
    }
    if (!plan.capacity_profile_fit || plan.capacity_profile_fit.q4_fits_profile !== true) failures.push({ code: "pilot_plan_capacity_estimate_missing_or_unfit" });
  }
  const trackedWeights = (await gitLines(["ls-files"])).filter((path) => WEIGHT_RE.test(path));
  if (trackedWeights.length) failures.push({ code: "tracked_model_like_weights_present", trackedWeights });
  const trackedPilotArtifacts = config ? (await gitLines(["ls-files", config.output_dir])).filter(Boolean) : [];
  if (trackedPilotArtifacts.length) failures.push({ code: "pilot_artifacts_tracked", trackedPilotArtifacts });

  const report = {
    ok: failures.length === 0,
    product_model: false,
    training_allowed_by_default: false,
    commit_weights_allowed: false,
    run_config_path: RUN_CONFIG_PATH,
    plan_path: PLAN_PATH,
    parameter_estimate: plan?.parameter_estimate || 0,
    estimated_fp32_bytes: plan?.estimated_fp32_bytes || 0,
    estimated_q8_bytes: plan?.estimated_q8_bytes || 0,
    estimated_q4_bytes: plan?.estimated_q4_bytes || 0,
    capacity_profile_fit: plan?.capacity_profile_fit || null,
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
