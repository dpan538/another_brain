#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const BASELINE = "5338ac22dee506b216ef2c625875caaaaf662d31";

const RUNTIME_FILES = [
  "web/conversation_controller.js",
  "web/r23_candidate_controller.js",
  "web/r23_content_plan.js",
  "web/r23_knowledge_primitives.js",
  "web/r23_live_finalizer.js",
  "web/r23_surface_realizer.js",
  "web/app.js",
  "scripts/dialog_runtime.mjs",
  "scripts/dialog_probe.mjs"
];

const ENTITY_BRANCH_RE =
  /(if|else if|switch|case|=>).{0,80}(罗大佑|夏目漱石|川端康成|王菲|周杰伦|小津|杜尚|达尔文|person\.|author\.)/;
const EXACT_PROMPT_RE = /(query|prompt|text)\s*(?:===|==|\.includes\()\s*["'`][^"'`]{6,80}["'`]/;
const REGEX_TO_ANSWER_RE = /\/.+\/\.test\([^)]*\).{0,160}(return\s+["'`][^"'`]{12,220}[。！？]|answer:\s*["'`][^"'`]{12,220}[。！？])/s;
const FULL_SENTENCE_PROFILE_RE = /(overview|confirmation|evaluation|recommendation|compliment|deepening)\s*:\s*["'`][^"'`]{16,220}[。！？]/;
const RUNTIME_IMPORT_EVAL_RE = /from\s+["'`]\.\.\/evals|readFileSync\([^)]*evals|artifacts\/training_os\/truth_audit|better_answer_shape/;

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function changedFiles() {
  const tracked = git(["diff", "--name-only", BASELINE, "--"]).split(/\r?\n/).filter(Boolean);
  const untracked = git(["ls-files", "--others", "--exclude-standard"])
    .split(/\r?\n/)
    .filter((file) => file.startsWith("web/") || file.startsWith("scripts/r23_diagnostics/") || file.startsWith("artifacts/training_os/r23/"));
  return [...new Set([...tracked, ...untracked])].filter(Boolean);
}

function diffText(file) {
  try {
    return git(["diff", "-U0", BASELINE, "--", file]);
  } catch {
    return "";
  }
}

function isTracked(file) {
  return git(["ls-files", "--", file]).split(/\r?\n/).includes(file);
}

function addedLines(file) {
  if (!isTracked(file)) return trackedText(file).split(/\r?\n/);
  return diffText(file)
    .split(/\r?\n/)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));
}

function trackedText(file) {
  try {
    return readFileSync(resolve(ROOT, file), "utf8");
  } catch {
    return "";
  }
}

function countBaselineDebt() {
  const files = [
    "web/last_answer_transform.js",
    "web/answer_plan.js",
    "web/dialogic_bridge_runtime.js",
    "web/dialogic_domain_profiles.js",
    "web/operation_layer.js",
    "web/culture_planner.js"
  ];
  return files.map((file) => {
    let before = "";
    try {
      before = execFileSync("git", ["show", `${BASELINE}:${file}`], { cwd: ROOT, encoding: "utf8" });
    } catch {
      before = "";
    }
    const current = trackedText(file);
    const baselineCount = (before.match(/罗大佑|夏目漱石|川端康成|王菲|周杰伦|小津|杜尚|达尔文|person\.luo_dayou|author\./g) || []).length;
    const currentCount = (current.match(/罗大佑|夏目漱石|川端康成|王菲|周杰伦|小津|杜尚|达尔文|person\.luo_dayou|author\./g) || []).length;
    return { file, baseline_entity_specific_debt: baselineCount, current_entity_specific_debt: currentCount, removed_debt: Math.max(0, baselineCount - currentCount), newly_added_debt_estimate: Math.max(0, currentCount - baselineCount) };
  });
}

function main() {
  const changed = changedFiles();
  const failures = [];
  const frozenChanged = changed.filter(
    (file) =>
      file.startsWith("evals/") ||
      file.startsWith("scripts/truth_audit/") ||
      /^scripts\/(?:eval_|check_|build_.*eval)/.test(file) ||
      file === "web/tiny_router_model.generated.js"
  );
  if (frozenChanged.length) failures.push({ kind: "frozen_files_changed", files: frozenChanged });

  for (const file of RUNTIME_FILES.filter((item) => changed.includes(item))) {
    const added = addedLines(file).join("\n");
    if (ENTITY_BRANCH_RE.test(added)) failures.push({ kind: "new_entity_specific_branch", file, evidence: added.match(ENTITY_BRANCH_RE)?.[0] || "" });
    if (EXACT_PROMPT_RE.test(added)) failures.push({ kind: "new_exact_prompt_logic", file, evidence: added.match(EXACT_PROMPT_RE)?.[0] || "" });
    if (REGEX_TO_ANSWER_RE.test(added)) failures.push({ kind: "new_regex_to_complete_answer_branch", file, evidence: added.match(REGEX_TO_ANSWER_RE)?.[0] || "" });
    if (FULL_SENTENCE_PROFILE_RE.test(added)) failures.push({ kind: "new_full_sentence_domain_profile_field", file, evidence: added.match(FULL_SENTENCE_PROFILE_RE)?.[0] || "" });
    if (RUNTIME_IMPORT_EVAL_RE.test(trackedText(file))) failures.push({ kind: "runtime_imports_eval_or_audit_fixture", file });
  }

  const packageDiff = changed.includes("package.json") ? diffText("package.json") : "";
  if (/"check:|\"eval:|\"audit:/.test(packageDiff)) failures.push({ kind: "package_test_commands_changed", file: "package.json" });

  const answerIndexExpansion = changed.some((file) => /answerIndex|answer_index|tiny_router_model\.generated/.test(file));
  if (answerIndexExpansion) failures.push({ kind: "answer_index_or_generated_router_changed" });

  const debt = countBaselineDebt();
  const report = {
    generated_at: new Date().toISOString(),
    baseline_commit: BASELINE,
    evaluated_commit: git(["rev-parse", "HEAD"]),
    changed_files: changed,
    baseline_debt: debt,
    failures,
    ok: failures.length === 0
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main();
