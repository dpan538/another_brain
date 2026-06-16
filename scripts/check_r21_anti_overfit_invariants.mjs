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
  const packageText = await readFile(resolve(ROOT, "package.json"), "utf8");
  const report = {
    ok: strictHits.length === 0,
    strict_control_files: STRICT_CONTROL_FILES,
    strict_entity_specific_hits: strictHits,
    known_runtime_entity_specific_debt: debtHits,
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
