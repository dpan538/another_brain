#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, extname, resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";
import {
  makeExecutionReport,
  NATURALNESS_TURN_FUNCTIONS,
  PROXY_KEYWORDS,
  flattenStrings,
  listFiles,
  parseMaybeJsonLines,
  pathHint,
  relativeRoot,
  turnFunctionFromObject
} from "./r22_surface_utils.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/r22_eval_proxy_leakage_audit.json");
const BASELINE_ARG = process.argv.find((arg) => arg.startsWith("--baseline="));
const BASELINE = BASELINE_ARG ? BASELINE_ARG.slice("--baseline=".length) : "424e4b7cbe41fb8439fe38a2a75d43abfe3c862b";

function git(args, fallback = "") {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return fallback;
  }
}

function gitHead() {
  return git(["rev-parse", "HEAD"], "unknown");
}

function suspiciousMustInclude(items = []) {
  return items.filter((item) => PROXY_KEYWORDS.some((keyword) => String(item).includes(keyword)));
}

function recommendedReplacement({ turnFunction, items }) {
  if (["analogy_statement", "affective_disclosure", "compliment"].includes(turnFunction)) {
    return "Replace keyword must_include with bad/better surface-shape rubric, forbidden template patterns, response mode check, and one concrete specificity check.";
  }
  if (turnFunction === "deepening_invitation") {
    return "Replace required words such as 更深 with a deep-question shape check: one non-menu question grounded in active topic.";
  }
  return `Replace keyword proxy (${items.join(", ")}) with semantic anchor or natural-language unit test.`;
}

function rowMustIncludes(row = {}) {
  const found = [];
  function visit(value, path = []) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, String(index)]));
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      if (/must_include/.test(key) && Array.isArray(nested)) found.push({ path: [...path, key], items: nested });
      else visit(nested, [...path, key]);
    }
  }
  visit(row);
  return found;
}

function stableRowId(row = {}, index = 0) {
  return row.id || row.name || row.prompt || row.user || `row_${index}`;
}

function parseRowsSafe(text = "", file = "") {
  try {
    return parseMaybeJsonLines(text, file);
  } catch {
    return [];
  }
}

function baselineFileText(path) {
  const text = git(["show", `${BASELINE}:${path}`], "");
  return text || "";
}

function splitForPath(path = "") {
  if (/blind/i.test(path)) return "blind";
  if (/train/i.test(path)) return "train";
  if (/dev|validation/i.test(path)) return "dev";
  return "unspecified";
}

function thresholdEntries(row = {}, prefix = []) {
  const out = [];
  function visit(value, path = []) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, String(index)]));
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      const next = [...path, key];
      if (typeof nested === "number" && /(threshold|min|max|rate|score|accuracy|precision|recall|count|chars|sentences|items)/i.test(key)) {
        out.push({ path: pathHint(next), key, value: nested });
      } else {
        visit(nested, next);
      }
    }
  }
  visit(row, prefix);
  return out;
}

function compareThresholds({ file, oldRows, newRows }) {
  const changes = [];
  const oldById = new Map(oldRows.map((row, index) => [stableRowId(row, index), row]));
  for (const [index, row] of newRows.entries()) {
    const id = stableRowId(row, index);
    const old = oldById.get(id);
    if (!old) continue;
    const oldEntries = new Map(thresholdEntries(old).map((entry) => [entry.path, entry]));
    for (const entry of thresholdEntries(row)) {
      const previous = oldEntries.get(entry.path);
      if (!previous || previous.value === entry.value) continue;
      let possibleWeakening = "unknown";
      if (/^max/i.test(entry.key) || /max_/i.test(entry.key)) possibleWeakening = entry.value > previous.value;
      if (/^min/i.test(entry.key) || /min_|accuracy|precision|recall|score|pass_rate/i.test(entry.key)) possibleWeakening = entry.value < previous.value;
      changes.push({
        file,
        id,
        path: entry.path,
        before: previous.value,
        after: entry.value,
        possible_weakening: possibleWeakening
      });
    }
  }
  return changes;
}

function compareMustIncludeMigration({ file, oldRows, newRows }) {
  const removed = [];
  const oldById = new Map(oldRows.map((row, index) => [stableRowId(row, index), row]));
  for (const [index, row] of newRows.entries()) {
    const id = stableRowId(row, index);
    const old = oldById.get(id);
    if (!old) continue;
    const oldMusts = rowMustIncludes(old).flatMap((entry) => entry.items.map((item) => ({ path: pathHint(entry.path), item: String(item) })));
    const newMusts = new Set(rowMustIncludes(row).flatMap((entry) => entry.items.map((item) => String(item))));
    const newText = flattenStrings(row).map((item) => item.text).join("\n");
    for (const entry of oldMusts) {
      if (newMusts.has(entry.item)) continue;
      removed.push({
        file,
        id,
        path: entry.path,
        removed_must_include: entry.item,
        migration_replacement_present: /(rubric|semantic|forbidden_surface_patterns|bad_answer_examples|better_answer_shape|expected_surface_mode|turn_function)/.test(newText),
        possible_eval_weakening: /(隐私|版权|身份|边界|source|privacy|copyright|identity|boundary)/i.test(entry.item) ? true : "unknown"
      });
    }
  }
  return removed;
}

async function auditGitEvalChanges(files) {
  const nameStatus = git(["diff", "--name-status", `${BASELINE}..HEAD`, "--", "evals"], "");
  const evalFilesModified = nameStatus
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split(/\s+/);
      return { status, file: rest[rest.length - 1] || "" };
    })
    .filter((item) => item.file);
  const rowsAdded = [];
  const rowsRemoved = [];
  const thresholdsChanged = [];
  const proxyConstraintsMigrated = [];
  const splitBefore = new Map();
  const splitAfter = new Map();

  for (const file of files.map(relativeRoot).filter((path) => /^evals\//.test(path))) {
    const currentText = await readFile(resolve(ROOT, file), "utf8").catch(() => "");
    const oldText = baselineFileText(file);
    const currentRows = parseRowsSafe(currentText, file);
    const oldRows = oldText ? parseRowsSafe(oldText, file) : [];
    const oldIds = new Set(oldRows.map((row, index) => stableRowId(row, index)));
    const currentIds = new Set(currentRows.map((row, index) => stableRowId(row, index)));
    for (const [index, row] of oldRows.entries()) {
      const id = stableRowId(row, index);
      splitBefore.set(id, splitForPath(file));
      if (!currentIds.has(id)) rowsRemoved.push({ file, id });
    }
    for (const [index, row] of currentRows.entries()) {
      const id = stableRowId(row, index);
      splitAfter.set(id, splitForPath(file));
      if (!oldIds.has(id)) rowsAdded.push({ file, id });
    }
    thresholdsChanged.push(...compareThresholds({ file, oldRows, newRows: currentRows }));
    proxyConstraintsMigrated.push(...compareMustIncludeMigration({ file, oldRows, newRows: currentRows }));
  }

  const blindSplitMovements = [];
  for (const [id, before] of splitBefore.entries()) {
    const after = splitAfter.get(id);
    if (after && before !== after) blindSplitMovements.push({ id, before, after });
  }
  const possibleEvalWeakening = [
    ...thresholdsChanged.filter((item) => item.possible_weakening === true),
    ...proxyConstraintsMigrated.filter((item) => item.possible_eval_weakening === true || item.migration_replacement_present === false)
  ];

  return {
    baseline_commit: BASELINE,
    evaluated_commit: gitHead(),
    eval_files_modified: evalFilesModified,
    rows_added: rowsAdded,
    rows_removed: rowsRemoved,
    thresholds_changed: thresholdsChanged,
    blind_split_movements: blindSplitMovements,
    proxy_constraints_migrated: proxyConstraintsMigrated,
    migration_replacement_present: proxyConstraintsMigrated.length ? proxyConstraintsMigrated.every((item) => item.migration_replacement_present) : "unknown",
    possible_eval_weakening: possibleEvalWeakening.length ? possibleEvalWeakening : "unknown"
  };
}

function rowHasNaturalnessSensitiveText(row = {}) {
  const strings = flattenStrings(row).map((item) => item.text).join("\n");
  return /(像|羡慕|喜欢你|努力|童年|文学诗歌|舞台剧|更深|接住|赞许|compliment|analogy|affective)/.test(strings);
}

async function main() {
  const files = (await listFiles("evals", (path) => [".json", ".jsonl"].includes(extname(path)))).filter(
    (path) => !/proxy_migration_manifest\.json$/.test(path)
  );
  const gitEvalChangeAudit = await auditGitEvalChanges(files);
  const suspicious = [];
  let rowsScanned = 0;
  for (const file of files) {
    let rows;
    try {
      rows = parseMaybeJsonLines(await readFile(file, "utf8"), file);
    } catch {
      continue;
    }
    for (const [rowIndex, row] of rows.entries()) {
      rowsScanned += 1;
      const turnFunction = turnFunctionFromObject(row);
      const naturalnessSensitive = NATURALNESS_TURN_FUNCTIONS.has(turnFunction) || rowHasNaturalnessSensitiveText(row);
      for (const entry of rowMustIncludes(row)) {
        const leaked = suspiciousMustInclude(entry.items);
        if (!leaked.length) continue;
        if (!naturalnessSensitive && !/(接住|更深|关系)/.test(leaked.join(" "))) continue;
        suspicious.push({
          file: relativeRoot(file),
          id: row.id || "",
          row_index: rowIndex,
          turn_index: entry.path.find((part) => /^\d+$/.test(part)) || "",
          expected_turn_function: turnFunction,
          path: pathHint(entry.path),
          suspicious_must_include: leaked,
          why_this_can_game_surface: "The eval can be satisfied by rendering rubric keywords into the visible answer instead of producing a natural turn-specific response.",
          recommended_replacement: recommendedReplacement({ turnFunction, items: leaked })
        });
      }
    }
  }

  const byFile = {};
  for (const item of suspicious) byFile[item.file] = (byFile[item.file] || 0) + 1;
  const report = makeExecutionReport({
    behaviorOk: true,
    auditOnly: true,
    baselineCommit: gitEvalChangeAudit.baseline_commit,
    evaluatedCommit: gitEvalChangeAudit.evaluated_commit,
    extra: {
    files_scanned: files.length,
    rows_scanned: rowsScanned,
    suspicious_count: suspicious.length,
    suspicious_by_file: byFile,
    naturalness_sensitive_evals_using_keyword_proxy: suspicious,
    git_eval_change_audit: gitEvalChangeAudit,
    old_tests_modified: gitEvalChangeAudit.eval_files_modified.length ? gitEvalChangeAudit.eval_files_modified : "unknown",
    thresholds_weakened: gitEvalChangeAudit.possible_eval_weakening === "unknown" ? "unknown" : gitEvalChangeAudit.possible_eval_weakening
    }
  });
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    execution_ok: report.execution_ok,
    behavior_ok: report.behavior_ok,
    audit_only: report.audit_only,
    suspicious_count: suspicious.length,
    eval_files_modified: gitEvalChangeAudit.eval_files_modified.length,
    possible_eval_weakening: gitEvalChangeAudit.possible_eval_weakening === "unknown" ? "unknown" : gitEvalChangeAudit.possible_eval_weakening.length,
    top_files: Object.entries(byFile).slice(0, 12),
    out: OUT
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
