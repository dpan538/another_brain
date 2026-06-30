#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const OUT = "artifacts/training_os/small_decoder_pilot/r25m/r25m_gate_snapshot_report.json";
const MODEL_WEIGHT_RE = /\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$/i;

async function readJsonIfPresent(path) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function gitLines(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: ROOT, maxBuffer: 12 * 1024 * 1024 });
  return stdout.split(/\r?\n/).filter(Boolean);
}

function ok(report) {
  return report?.ok === true;
}

async function main() {
  const reports = {
    r24_intelligence_recovery: await readJsonIfPresent("artifacts/training_os/r24_intelligence_recovery_report.json"),
    long_horizon: await readJsonIfPresent("artifacts/training_os/long_horizon_eval_report.json"),
    r24d_heldout_recovery: await readJsonIfPresent("artifacts/training_os/r24d_heldout_recovery_report.json"),
    long_horizon_heldout: await readJsonIfPresent("artifacts/training_os/long_horizon_heldout_eval_report.json"),
    no_eval_hardcoding: await readJsonIfPresent("artifacts/training_os/eval_split_integrity_report.json"),
    eval_split_integrity: await readJsonIfPresent("artifacts/training_os/eval_split_integrity_report.json"),
    pilot_eval: await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25m/r25m_small_decoder_eval_report.json"),
    artifact_guard: null
  };
  const trackedWeights = (await gitLines(["ls-files"])).filter((path) => MODEL_WEIGHT_RE.test(path));
  const r24RecoveryOk = [
    reports.r24_intelligence_recovery,
    reports.long_horizon,
    reports.r24d_heldout_recovery,
    reports.long_horizon_heldout
  ].every(ok);
  const output = {
    ok: r24RecoveryOk && ok(reports.eval_split_integrity) && trackedWeights.length === 0,
    r24_recovery_candidate_status: r24RecoveryOk ? "reports_ok" : "missing_or_failed_reports",
    no_hardcoding_status: "see npm run check:no-eval-hardcoding output",
    eval_split_integrity_status: ok(reports.eval_split_integrity) ? "passed" : "missing_or_failed",
    vercel_build_status: "see npm run check:vercel-build output",
    no_tracked_weights_status: trackedWeights.length === 0 ? "passed" : "failed",
    tracked_model_like_files: trackedWeights,
    commands_to_verify_snapshot: [
      "npm run check:r24-recovery-candidate",
      "npm run check:no-eval-hardcoding",
      "npm run check:eval-split-integrity",
      "npm run check:vercel-build",
      "git ls-files | rg '\\\\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$'"
    ],
    notes: [
      "This report summarizes existing report artifacts and command expectations.",
      "It does not run the large nested gates by itself."
    ]
  };
  await writeJson(OUT, output);
  console.log(JSON.stringify(output, null, 2));
  if (!output.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
