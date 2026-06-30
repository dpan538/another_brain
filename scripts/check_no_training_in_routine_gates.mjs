#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const execFileAsync = promisify(execFile);

const ALLOWED_ONE_SHOT_SCRIPTS = new Set([
  "run:r25p-second-small-pilot-once"
]);

const RUNNER_SCRIPT_ALLOWLIST = new Set([
  "scripts/check_no_training_in_routine_gates.mjs",
  "scripts/run_small_decoder_pilot.mjs",
  "scripts/run_tiny_decoder_toy_overfit.mjs",
  "scripts/train_small_decoder_pilot.py"
]);

const ROUTINE_PREFIX_RE = /^(check|eval|analyze|compare|report|plan):/;
const ORCHESTRATOR_FILE_RE = /^scripts\/(check|eval|analyze|compare|report|plan)_.*\.(mjs|js)$/;

const TRAINING_RERUN_PATTERNS = [
  {
    code: "toy_overfit_allow_flag_in_routine_gate",
    pattern: /run:tiny-decoder-toy-overfit[^"\n]*--allow-toy-training/
  },
  {
    code: "small_pilot_allow_flag_in_routine_gate",
    pattern: /run:small-decoder-pilot[^"\n]*--allow-small-pilot-training/
  },
  {
    code: "r25p_one_shot_run_nested_in_routine_gate",
    pattern: /run:r25p-second-small-pilot-once/
  },
  {
    code: "future_r25r_training_nested_in_routine_gate",
    pattern: /run:[^"\n]*r25r[^"\n]*--allow-small-pilot-training/i
  }
];

const CHECKPOINT_OUTSIDE_IGNORED_RE = /(?:writeFile|open|checkpoint|output_dir).{0,120}(?:web\/|static_llm\/assets\/|build_sources\/|knowledge_sources\/)/is;

async function gitLsFiles() {
  const { stdout } = await execFileAsync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "scripts"], {
    cwd: ROOT,
    maxBuffer: 8 * 1024 * 1024
  });
  return stdout.split(/\r?\n/).filter(Boolean);
}

function scanText({ source, text, routine }) {
  const failures = [];
  if (!routine) return failures;

  for (const rule of TRAINING_RERUN_PATTERNS) {
    if (rule.pattern.test(text)) {
      failures.push({ source, code: rule.code });
    }
  }
  if (CHECKPOINT_OUTSIDE_IGNORED_RE.test(text)) {
    failures.push({ source, code: "checkpoint_write_target_outside_ignored_training_artifacts" });
  }
  return failures;
}

async function main() {
  const pkg = JSON.parse(await readFile(resolve(ROOT, "package.json"), "utf8"));
  const packageScripts = pkg.scripts || {};
  const failures = [];
  const routineScriptsChecked = [];
  const oneShotScriptsSeen = [];

  for (const [name, command] of Object.entries(packageScripts)) {
    if (ALLOWED_ONE_SHOT_SCRIPTS.has(name)) {
      oneShotScriptsSeen.push(name);
      continue;
    }
    const routine = ROUTINE_PREFIX_RE.test(name);
    if (routine) routineScriptsChecked.push(name);
    failures.push(...scanText({ source: `package.json:scripts.${name}`, text: command, routine }));
  }

  const orchestratorFiles = [];
  for (const file of await gitLsFiles()) {
    if (RUNNER_SCRIPT_ALLOWLIST.has(file)) continue;
    if (!ORCHESTRATOR_FILE_RE.test(file)) continue;
    const text = await readFile(resolve(ROOT, file), "utf8");
    orchestratorFiles.push(file);
    failures.push(...scanText({ source: file, text, routine: true }));
  }

  const report = {
    ok: failures.length === 0,
    routine_scripts_checked: routineScriptsChecked.length,
    routine_script_names: routineScriptsChecked,
    orchestrator_files_checked: orchestratorFiles.length,
    orchestrator_files: orchestratorFiles,
    allowed_one_shot_scripts: oneShotScriptsSeen,
    training_rerun_paths: failures,
    notes: [
      "Routine R25 gates must stay history, evaluation, analysis, or report only.",
      "Approval-gated training runners remain available only behind explicit fresh approval and non-routine one-shot commands."
    ]
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
