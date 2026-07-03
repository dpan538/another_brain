#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, "artifacts/training_os/corpus_expansion/r25am/r25am_history_gate_report.json");

const STEPS = [
  ["check:r25am-promoted-corpus"],
  ["report:r25am-corpus-expansion-coverage"],
  ["check:llm-training-corpus"],
  ["check:llm-training-contamination"],
  ["report:llm-training-coverage"],
  ["check:training-provenance"],
  ["check:eval-split-integrity"],
  ["audit:r25al-expanded-corpus-quality"],
  ["check:tokenizer-dryrun-history:r25al"],
  ["report:r25al-tokenizer-readiness"],
  ["report:r25al-next-step"],
  ["check:r25ak-promoted-corpus"],
  ["report:r25ak-promoted-corpus-coverage"],
  ["analyze:r25ai-blocked-promotion"],
  ["check:candidate-target-uniqueness", "--file", "artifacts/training_os/corpus_expansion/r25aj/r25aj_repo_derived_candidate_rows.jsonl"],
  ["check:r25aj-unique-candidates"],
  ["build:r25aj-review-pack"],
  ["validate:r25ah-repo-derived-candidates"],
  ["build:r25ah-review-pack"],
  ["check:repo-text-discovery-boundaries"],
  ["check:personal-data-inventory-boundaries"],
  ["check:training-approval-markers"],
  ["check:no-training-in-routine-gates"],
  ["check:from-scratch-training-doctrine"],
  ["check:chinese-personal-training-direction"],
  ["report:from-scratch-training-progress"],
  ["check:vercel-build"]
];

function tail(text, max = 3000) {
  const value = String(text || "");
  return value.length > max ? value.slice(-max) : value;
}

function runStep([scriptName, ...args]) {
  if (/^(?:run:|train:)/.test(scriptName)) {
    return {
      script: scriptName,
      args,
      ok: false,
      status: null,
      signal: null,
      duration_ms: 0,
      stdout_tail: "",
      stderr_tail: `Forbidden routine/history step: ${scriptName}`
    };
  }
  const npmArgs = ["run", scriptName];
  if (args.length) npmArgs.push("--", ...args);
  const started = Date.now();
  const result = spawnSync("npm", npmArgs, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  return {
    script: scriptName,
    args,
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    duration_ms: Date.now() - started,
    stdout_tail: tail(result.stdout),
    stderr_tail: tail(result.stderr)
  };
}

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
const steps = STEPS.map(runStep);
const failures = steps.filter((step) => !step.ok);
const report = {
  ok: failures.length === 0,
  gate: "check:r25am-expanded-corpus-history",
  history_only: true,
  recursive_gate_replay: false,
  decoder_training_ran: false,
  tokenizer_dry_run_ran: false,
  small_pilot_training_reran: false,
  phase_4_scaled_training_ran: false,
  phase_4_scaled_training_approved: false,
  artifacts_commit_allowed: false,
  weights_commit_allowed: false,
  steps,
  failures: failures.map((step) => ({
    script: step.script,
    status: step.status,
    signal: step.signal,
    stdout_tail: step.stdout_tail,
    stderr_tail: step.stderr_tail
  })),
  notes: [
    "R25AM history gate validates the R25AM expanded corpus and direct adjacent milestone evidence only.",
    "It intentionally avoids recursive milestone-chain explosion.",
    "No training, tokenizer dry-run, phase_4 scaled training, artifact commit, or weight commit is authorized."
  ]
};

fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (!report.ok) {
  console.error(JSON.stringify({
    ok: false,
    gate: report.gate,
    report: path.relative(ROOT, REPORT_PATH),
    failed_steps: failures.map((step) => step.script)
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  gate: report.gate,
  report: path.relative(ROOT, REPORT_PATH),
  steps_run: steps.length,
  history_only: true,
  decoder_training_ran: false,
  tokenizer_dry_run_ran: false,
  phase_4_scaled_training_ran: false
}, null, 2));
