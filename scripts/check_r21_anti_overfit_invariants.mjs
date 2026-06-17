import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = process.cwd();
const OUT = resolve(ROOT, "artifacts/training_os/r21_anti_overfit_invariants_report.json");

const STRICT_CONTROL_FILES = [
  "web/contextual_question_resolver.js",
  "web/response_mode_manager.js",
  "web/conversation_controller.js",
  "web/topic_stack.js",
  "web/conversation_state_schema.js"
];
const DEBT_FILES = ["web/operation_layer.js", "web/culture_planner.js", "web/last_answer_transform.js", "web/fallback_firewall.js"];
const ENTITY_PATTERNS = [/person\.luo_dayou/, /author\.natsume_soseki/, /author\.kawabata_yasunari/, /罗大佑/, /夏目漱石/, /川端康成/];
const FAILURE_BANK = "data/failure_bank/r21_failure_bank.jsonl";
const BLIND_SIBLINGS = "evals/r21_mixed_dialogic/blind_sibling_sessions.jsonl";

function jsonlRows(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

async function countPatterns(path) {
  const text = await readFile(resolve(ROOT, path), "utf8");
  const hits = [];
  for (const pattern of ENTITY_PATTERNS) {
    const matches = text.match(new RegExp(pattern.source, "g")) || [];
    if (matches.length) hits.push({ pattern: pattern.source, count: matches.length });
  }
  return hits;
}

async function main() {
  const strictHits = [];
  const debtHits = [];
  for (const file of STRICT_CONTROL_FILES) {
    const hits = await countPatterns(file);
    if (hits.length) strictHits.push({ file, hits });
  }
  for (const file of DEBT_FILES) {
    const hits = await countPatterns(file);
    if (hits.length) debtHits.push({ file, hits });
  }
  const failureBankRows = jsonlRows(await readFile(resolve(ROOT, FAILURE_BANK), "utf8"));
  const blindSiblingRows = jsonlRows(await readFile(resolve(ROOT, BLIND_SIBLINGS), "utf8"));
  const blindThemeCoverage = {
    music_or_literature: blindSiblingRows.filter((row) => /(music|literature|faye|jay|murakami|sodagreen)/i.test(row.id)).length,
    visual_or_design: blindSiblingRows.filter((row) => /(duchamp|photography|bauhaus|cinema)/i.test(row.id)).length,
    science: blindSiblingRows.filter((row) => /(science|evolution)/i.test(row.id)).length,
    urban: blindSiblingRows.filter((row) => /(urban|space|city)/i.test(row.id)).length,
    technology: blindSiblingRows.filter((row) => /(technology|interface|tool)/i.test(row.id)).length,
    ethics: blindSiblingRows.filter((row) => /(ethics|action)/i.test(row.id)).length,
    education: blindSiblingRows.filter((row) => /(education|learning|classroom)/i.test(row.id)).length,
    economics: blindSiblingRows.filter((row) => /(economics|institution|market)/i.test(row.id)).length,
    cinema: blindSiblingRows.filter((row) => /(cinema|film|lens|movie)/i.test(row.id)).length,
    language: blindSiblingRows.filter((row) => /(language|meaning|translation)/i.test(row.id)).length,
    food: blindSiblingRows.filter((row) => /(food|cooking|craft|table|kitchen)/i.test(row.id)).length,
    law: blindSiblingRows.filter((row) => /(law|justice|precedent|fairness)/i.test(row.id)).length
  };
  const invariantFailures = [];
  if (failureBankRows.length < 15) invariantFailures.push({ reason: "failure_bank_too_small", rows: failureBankRows.length, min: 15 });
  if (blindSiblingRows.length < 14) invariantFailures.push({ reason: "blind_sibling_sessions_too_few", rows: blindSiblingRows.length, min: 14 });
  for (const [theme, count] of Object.entries(blindThemeCoverage)) {
    if (count < 1) invariantFailures.push({ reason: "blind_theme_missing", theme });
  }
  const packageText = await readFile(resolve(ROOT, "package.json"), "utf8");
  const report = {
    ok: strictHits.length === 0 && invariantFailures.length === 0,
    strict_control_files: STRICT_CONTROL_FILES,
    strict_entity_specific_hits: strictHits,
    known_runtime_entity_specific_debt: debtHits,
    failure_bank_rows: failureBankRows.length,
    blind_sibling_sessions: blindSiblingRows.length,
    blind_theme_coverage: blindThemeCoverage,
    invariant_failures: invariantFailures,
    release_gate_has_r21: /check:r21-control/.test(packageText),
    forbidden_change_guard: {
      dialog_rules_runtime_patch_allowed: false,
      answer_index_expansion_allowed: false,
      tiny_router_manual_patch_allowed: false
    }
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
