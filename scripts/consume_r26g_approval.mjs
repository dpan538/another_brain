#!/usr/bin/env node
import { consumeR26GApproval } from "./r26g_user_answer_utils.mjs";

async function main() {
  const consumed = await consumeR26GApproval();
  const report = {
    ok: consumed.consumed === true,
    approval: "R26G",
    consumed: consumed.consumed,
    allow_additional_runs: consumed.allow_additional_runs,
    consumed_by_phase: consumed.consumed_by_phase,
    consumed_reason: consumed.consumed_reason,
    active_training_approval_count_after_consumption: 0
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
