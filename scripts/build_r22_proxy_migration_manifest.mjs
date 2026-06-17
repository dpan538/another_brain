#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";

const AUDIT = resolve(ROOT, "artifacts/training_os/r22_eval_proxy_leakage_audit.json");
const OUT = resolve(ROOT, "evals/r22_natural_surface/proxy_migration_manifest.json");

function classify(item = {}) {
  const text = [
    ...(item.suspicious_must_include || []),
    item.expected_turn_function || "",
    item.path || "",
    item.file || ""
  ].join(" ");
  if (/隐私|版权|身份|边界|source|privacy|copyright|identity|boundary|安全/.test(text)) return "safety_boundary_keep";
  if (/罗大佑|夏目|川端|台湾|日本|作家|作品|童年|《/.test(text)) return "factual_anchor_keep";
  if (/接住|更深|关系|体现|本质|复杂|桥|过渡|共同|结构|维度/.test(text)) {
    if (/compliment|analogy|affective|deepening|reflection|declaration/.test(text)) return "naturalness_proxy_migrate";
    return "semantic_grounding_migrate";
  }
  return "insufficient_evidence";
}

async function main() {
  const audit = JSON.parse(await readFile(AUDIT, "utf8"));
  const rows = (audit.naturalness_sensitive_evals_using_keyword_proxy || []).map((item, index) => {
    const migration_class = classify(item);
    return {
      id: `r22_proxy_${String(index + 1).padStart(4, "0")}`,
      file: item.file,
      source_id: item.id || "",
      row_index: item.row_index,
      turn_index: item.turn_index,
      path: item.path,
      expected_turn_function: item.expected_turn_function || "",
      suspicious_must_include: item.suspicious_must_include || [],
      migration_class,
      action_allowed_this_round: migration_class === "naturalness_proxy_migrate" ? "add_replacement_rubric_shadow_only" : "keep_legacy_constraint",
      legacy_row_must_remain: true,
      replacement_required_before_removal: true,
      suggested_replacement: item.recommended_replacement || "",
      old_constraint_deleted: false,
      threshold_weakened: false
    };
  });
  const counts = {};
  for (const row of rows) counts[row.migration_class] = (counts[row.migration_class] || 0) + 1;
  const manifest = {
    generated_at: new Date().toISOString(),
    audit_source: "artifacts/training_os/r22_eval_proxy_leakage_audit.json",
    rows_total: rows.length,
    classification_counts: counts,
    policy: {
      facts_boundaries_and_identity_must_include_may_not_be_deleted_for_naturalness: true,
      legacy_rows_must_remain: true,
      migrate_only_naturalness_proxy_this_round: true,
      shadow_run_legacy_and_replacement_before_gate_change: true
    },
    rows
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ rows_total: rows.length, classification_counts: counts, out: OUT }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
