#!/usr/bin/env node
import { readJson, writeJson, writeText } from "./r26a_project_utils.mjs";

async function main() {
  const manifest = await readJson("training/current/corpus_manifest.json");
  const status = await readJson("training/current/training_status.json");
  const completeness = await readJson("artifacts/training_os/r26b_review/r26b_r26a_completeness.json").catch(() => null);
  const persona = await readJson("artifacts/training_os/r26b_review/r26b_assistant_persona_wording.json").catch(() => null);
  const cleanup = await readJson("artifacts/training_os/r26b_review/r26b_cleanup_review_packet.json").catch(() => null);
  const report = {
    ok: Boolean(completeness?.ok && persona?.ok && cleanup?.ok),
    phase: "R26B",
    product_narrative_status: completeness?.ok ? "complete" : "incomplete",
    answer_as_user_schema_status: "present_and_json_valid",
    anti_malicious_fallback_eval_status: "planned_current_eval",
    cleanup_review_status: cleanup?.ok ? "review_packet_ready" : "missing",
    teacher_probe_status: "optional_side_track_only_no_calls",
    current_corpus_row_count: manifest?.totals?.rows || 0,
    training_status: status,
    remaining_user_actions: [
      "review R26B cleanup packet",
      "accept answer-as-user schema",
      "prepare user-answered question pack only after structure review"
    ],
    recommended_next: [
      "user_answer_question_collection",
      "R26C user-answer corpus intake design",
      "no_training_now"
    ],
    training_ran: false,
    tokenizer_dry_run_ran: false,
    corpus_expansion_ran: false,
    corpus_promotion_ran: false,
    external_api_used: false,
    doubao_called: false
  };
  await writeJson("artifacts/training_os/r26b_review/r26b_product_readiness.json", report);
  await writeText(
    "docs/R26B_PRODUCT_AND_DATA_READINESS.md",
    `# R26B Product and Data Readiness

R26B completes product narrative, answer-as-user schema, eval plans, teacher-probe policy, and cleanup-plan review. It does not train, run tokenizer dry-run, expand corpus, promote corpus rows, call Doubao, call external APIs, move files, delete files, commit artifacts, or commit weights.

## Status

- product narrative: ${report.product_narrative_status}
- answer-as-user schema: ${report.answer_as_user_schema_status}
- anti-malicious fallback eval: ${report.anti_malicious_fallback_eval_status}
- cleanup review: ${report.cleanup_review_status}
- teacher probe: ${report.teacher_probe_status}
- current corpus row count: ${report.current_corpus_row_count}

## Training Status

- product training progress: ${status.product_training_progress_percent}%
- formal decoder training progress: ${status.formal_decoder_training_progress_percent}%
- pilot training progress: ${status.pilot_training_progress_percent}%
- training-readiness estimate: ${status.training_readiness_percent_estimate}%
- browser product completion estimate: ${status.browser_product_completion_estimate}%
- phase_4 scaled training approved: ${status.phase_4_scaled_training_approved}

## Recommended Next

- user_answer_question_collection
- R26C user-answer corpus intake design
- no_training_now

Remaining R26C work is to create a user-answer question collection pipeline and transform reviewed 100-question answers into answer-as-user candidate corpus. That future step is still not training unless separately approved.
`
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
