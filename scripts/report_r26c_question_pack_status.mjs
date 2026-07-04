#!/usr/bin/env node
import { readJson, writeJson, writeText } from "./r26a_project_utils.mjs";

async function main() {
  const manifest = await readJson("training/current/question_pack_100_manifest.r26c.json");
  const check = await readJson("artifacts/training_os/r26c_question_pack/r26c_question_pack_training_exclusion_check.json").catch(() => null);
  const status = await readJson("training/current/training_status.json").catch(() => null);
  const report = {
    ok: Boolean(check?.ok),
    phase: "R26C",
    pack_id: manifest.pack_id,
    total_rows: manifest.total_rows,
    candidate_rows_1_to_50: manifest.candidate_rows_count,
    excluded_rows_51_to_100: manifest.excluded_rows_count,
    raw_pack_committed: manifest.raw_source_committed,
    excluded_rows_in_training_corpus: check?.corpus_hits || 0,
    excluded_rows_in_tokenizer_configs: check?.tokenizer_config_hits || 0,
    excluded_rows_in_teacher_probe_configs: check?.teacher_probe_config_hits || 0,
    rows_1_to_50_promoted: false,
    allowed_next_action: [
      "review rows 1-50",
      "create replacement rows 51-100",
      "do not train now"
    ],
    training_status: status,
    training_ran: false,
    tokenizer_dry_run_ran: false,
    corpus_expansion_ran: false,
    corpus_promotion_ran: false,
    phase_4_scaled_training_approved: false
  };
  await writeJson("artifacts/training_os/r26c_question_pack/r26c_question_pack_status.json", report);
  await writeText(
    "docs/R26C_QUESTION_PACK_STATUS.md",
    `# R26C Question Pack Status

R26C quarantines the unsuitable second half of the first 100-question pack. It does not read the external raw CSV, commit raw CSV/XLSX files, train, run tokenizer dry-run, expand corpus, promote corpus rows, call teacher systems, or approve phase_4.

## Pack Status

- pack_id: ${report.pack_id}
- total rows: ${report.total_rows}
- rows 1-50: candidate_review_only (${report.candidate_rows_1_to_50})
- rows 51-100: excluded_from_training (${report.excluded_rows_51_to_100})
- raw pack committed: ${report.raw_pack_committed}
- excluded rows found in training corpus: ${report.excluded_rows_in_training_corpus}
- excluded rows found in tokenizer configs: ${report.excluded_rows_in_tokenizer_configs}
- excluded rows found in teacher probe configs: ${report.excluded_rows_in_teacher_probe_configs}
- rows 1-50 promoted: false

## Current Allowed Next Action

- Review rows 1-50 as answer-as-user candidates.
- Create replacement rows 51-100 with friend-facing prompts.
- Do not train now.

The exclusion reason is: ${manifest.exclusion_reason}
`
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
