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
    family_counts: countBy(rows, "task_family"),
    language_counts: countBy(rows, "language"),
    task_type_counts: countBy(rows, "task_type"),
    policy_tag_counts: countBy(rows.flatMap((row) => row.policy_tags || []).map((tag) => ({ tag })), "tag"),
    avg_target_chars: rows.length ? Math.round((totalChars / rows.length) * 10) / 10 : 0,
    notes: [
      "Corpus is deterministic and project-authored.",
      "Rows train future LLM behavior, not facts.",
      "R25B does not run training or add real weights."
    ]
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
