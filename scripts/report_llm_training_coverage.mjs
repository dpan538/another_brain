#!/usr/bin/env node
import { loadCorpusRows } from "./validate_llm_training_corpus.mjs";

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = row[key];
    if (Array.isArray(value)) {
      for (const item of value) out[item] = (out[item] || 0) + 1;
    } else {
      out[value] = (out[value] || 0) + 1;
    }
  }
  return out;
}

async function main() {
  const rows = (await loadCorpusRows()).filter((row) => !row.__parse_error);
  const totalChars = rows.reduce((sum, row) => sum + String(row.target_answer || "").length, 0);
  const report = {
    ok: true,
    total_rows: rows.length,
    split_counts: countBy(rows, "split"),
    family_counts: countBy(rows.map((row) => ({ family: row.task_family || row.transformation_type || "unknown" })), "family"),
    language_counts: countBy(rows, "language"),
    task_type_counts: countBy(rows.map((row) => ({ task_type: row.task_type || row.transformation_type || "unknown" })), "task_type"),
    source_category_counts: countBy(rows.map((row) => ({ source_category: row.source_category || "legacy_or_unspecified" })), "source_category"),
    review_status_counts: countBy(rows, "review_status"),
    policy_tag_counts: countBy(rows.flatMap((row) => row.policy_tags || []).map((tag) => ({ tag })), "tag"),
    personal_color_target_counts: countBy(rows.flatMap((row) => row.personal_color_targets || []).map((target) => ({ target })), "target"),
    avg_target_chars: rows.length ? Math.round((totalChars / rows.length) * 10) / 10 : 0,
    notes: [
      "Corpus is deterministic and project-authored.",
      "Rows train future LLM behavior, not facts.",
      "R25B/R25AK corpus checks do not run training, tokenizer dry-run, or add real weights."
    ]
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
