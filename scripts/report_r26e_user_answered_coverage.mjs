#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  R26E_COVERAGE_REPORT,
  R26E_FILES,
  R26E_PHASE,
  countBy,
  loadPromotedRows,
  writePromotionLikeReport
} from "./r26e_user_answer_promotion_utils.mjs";
import { ROOT, writeText } from "./r26a_project_utils.mjs";

async function countAllCorpusRows() {
  const dir = resolve(ROOT, "training/llm_corpus");
  const files = (await readdir(dir)).filter((file) => file.endsWith(".jsonl")).sort();
  let total = 0;
  const byFile = {};
  let userAnswered = 0;
  for (const file of files) {
    const text = await readFile(resolve(dir, file), "utf8");
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    byFile[file] = lines.length;
    total += lines.length;
    for (const line of lines) {
      try {
        const row = JSON.parse(line);
        if (row?.provenance?.source_type === "user_answered") userAnswered += 1;
      } catch {}
    }
  }
  return { total, byFile, userAnswered };
}

async function main() {
  const rows = await loadPromotedRows();
  const combined = await countAllCorpusRows();
  const report = {
    ok: rows.length > 0,
    phase: R26E_PHASE,
    promoted_row_count: rows.length,
    split_counts: countBy(rows, "split"),
    module_distribution: countBy(rows, "module"),
    answer_mode_distribution: countBy(rows, "answer_mode"),
    candidate_type_distribution: countBy(rows, "candidate_type"),
    should_answer_distribution: countBy(rows, (row) => String(row.should_answer)),
    evidence_policy_distribution: countBy(rows, "evidence_policy"),
    speaker_context_distribution: countBy(rows, "speaker_context"),
    provenance_distribution: countBy(rows, (row) => row.provenance?.source_type || "unknown"),
    combined_corpus_row_count_after_r26e: combined.total,
    corpus_rows_by_file: combined.byFile,
    user_answered_provenance_count: combined.userAnswered,
    current_user_answered_share: combined.total ? Math.round((combined.userAnswered / combined.total) * 10000) / 100 : 0,
    replacement_51_100_still_needed: true,
    training_ran: false,
    tokenizer_dry_run_ran: false,
    phase4_approved: false
  };
  await writePromotionLikeReport(R26E_COVERAGE_REPORT, report);
  await writeText("docs/R26E_USER_ANSWERED_CORPUS_SUMMARY.md", `# R26E User-Answered Corpus Summary

R26E promoted ${report.promoted_row_count} reviewed first-50 user-answer candidates into tracked corpus split files.

Split counts:
- train: ${report.split_counts.train || 0}
- dev: ${report.split_counts.dev || 0}
- heldout: ${report.split_counts.heldout || 0}

Module distribution:
${Object.entries(report.module_distribution).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

Answer mode distribution:
${Object.entries(report.answer_mode_distribution).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

Candidate type distribution:
${Object.entries(report.candidate_type_distribution).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

Combined corpus rows after R26E: ${report.combined_corpus_row_count_after_r26e}

User-answered provenance rows after R26E: ${report.user_answered_provenance_count} (${report.current_user_answered_share}%).

Rows 51-100 from the first question pack remain excluded. Replacement 51-100 answers are still needed before any serious training decision.

R26E did not run training, tokenizer dry-run, teacher calls, phase_4 training, or artifact/weight commit.
`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
