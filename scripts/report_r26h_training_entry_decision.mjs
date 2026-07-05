#!/usr/bin/env node
import { readJson, writeJson, writeText } from "./r26a_project_utils.mjs";

const READINESS = "artifacts/training_os/user_answer_readiness/r26h/r26h_user_answer_corpus_readiness.json";
const TOKENIZER = "artifacts/training_os/tokenizer_dryrun/r26h/r26h_tokenizer_readiness_report.json";
const PLAN = "artifacts/training_os/user_answer_readiness/r26h/r26i_training_entry_plan.json";
const REPORT = "artifacts/training_os/user_answer_readiness/r26h/r26h_training_entry_decision.json";
const SUMMARY = "docs/R26H_TRAINING_ENTRY_DECISION.md";

async function main() {
  const readiness = await readJson(READINESS);
  const tokenizer = await readJson(TOKENIZER);
  const plan = await readJson(PLAN);
  const blockers = [];
  if (readiness.ok !== true) blockers.push("user_answer_corpus_readiness_failed");
  if (tokenizer.recommendation !== "tokenizer_ready_for_r26i") blockers.push(`tokenizer_not_ready:${tokenizer.recommendation}`);
  if (plan.ok !== true) blockers.push("r26i_training_entry_plan_failed");
  const decision = blockers.length ? "blocked_with_single_reason" : "ready_for_r26i_answer_as_user_microcycle";
  const report = {
    ok: blockers.length === 0,
    phase: "R26H",
    decision,
    single_blocker: blockers[0] || null,
    training_approved_now: false,
    phase4_approved: false,
    recommended_next: blockers.length ? "fix_blocker_first" : "approve_r26i_one_shot_training",
    must_not_do: [
      "do not train without fresh R26I approval",
      "do not run phase_4",
      "do not commit tokenizer artifacts",
      "do not commit weights",
      "do not use old question_pack_001 rows 51-100"
    ]
  };
  await writeJson(REPORT, report);
  await writeText(SUMMARY, `# R26H Training-Entry Decision

R26H is the final readiness gate before possible R26I. It does not approve training by itself.

## Decision

- Decision: \`${decision}\`
- Single blocker: ${report.single_blocker || "none"}
- Recommended next: \`${report.recommended_next}\`
- Training approved now: false
- Phase_4 approved: false

Fresh R26I approval is required before exactly one bounded answer-as-user microcycle. R26I would not be product/formal training and would not authorize phase_4 or committed weights.
`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
