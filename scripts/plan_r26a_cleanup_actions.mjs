#!/usr/bin/env node
import {
  readJson,
  writeJson,
  writeText
} from "./r26a_project_utils.mjs";

function actionForStatus(entry) {
  if (entry.top_category === "root_documents") return "do_not_touch";
  if (entry.top_category === "data_public_ingestion") return "do_not_touch";
  if (/private_sources/.test(entry.path)) return "do_not_touch";
  if (/R25AI|r25ai/.test(entry.path)) return "delete_later_after_review";
  if (/^web\//.test(entry.path)) return "needs_user_review";
  if (/^docs\/R25A(E|G|H|K|L)/.test(entry.path)) return "archive_later";
  return "needs_user_review";
}

async function main() {
  const audit = await readJson("artifacts/training_os/r26a_cleanup/r26a_project_file_audit.json");
  const docsIndex = await readJson("artifacts/training_os/r26a_cleanup/r26a_docs_index.json");
  const trainingManifest = await readJson("training/current/corpus_manifest.json");
  const actions = [];

  for (const entry of audit.status_entries || []) {
    actions.push({
      path: entry.path,
      current_state: entry.code === "??" ? "untracked" : "modified_or_staged",
      category: entry.top_category,
      recommended_action: actionForStatus(entry),
      r26a_action_taken: "none"
    });
  }

  for (const item of [...(docsIndex.categories?.pilot_history || []), ...(docsIndex.categories?.r25_history || [])].slice(0, 120)) {
    actions.push({
      path: item.path,
      current_state: "tracked",
      category: item.category,
      recommended_action: "archive_later",
      r26a_action_taken: "none"
    });
  }

  const counts = {};
  for (const action of actions) counts[action.recommended_action] = (counts[action.recommended_action] || 0) + 1;
  const plan = {
    ok: true,
    phase: "R26A",
    non_destructive: true,
    files_deleted: false,
    files_moved: false,
    user_local_files_staged: false,
    recommendation: "run_R26B_cleanup_after_user_review",
    counts,
    active_training_rows: trainingManifest.totals?.rows || 0,
    actions,
    notes: [
      "R26A only plans cleanup. It does not delete, move, archive, ignore, or stage user-local files.",
      "R25AI failed-promotion drafts are cleanup candidates, not R26A commit candidates.",
      "Root DOC/PDF files, data/public_ingestion, private_sources, ignored artifacts, and unrelated web edits are do-not-touch until a later explicit approval."
    ]
  };
  await writeJson("artifacts/training_os/r26a_cleanup/r26a_cleanup_plan.json", plan);

  await writeText("docs/R26A_CLEANUP_PLAN.md", `# R26A Cleanup Plan

R26A is non-destructive. It recommends future cleanup actions but does not perform them.

## Recommendation

- ${plan.recommendation}
- Future R26B may perform approved moves/deletions/archives after user review.
- No root DOC/PDF, \`data/public_ingestion/\`, \`private_sources/\`, ignored artifacts, unrelated web edits, or failed R25AI drafts were staged by R26A.

## Action Counts

${Object.entries(counts).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Main Cleanup Themes

- Keep active runtime, current corpus, current evals, active scripts, and active doctrine.
- Archive R24/R25 pilot docs later after review; preserve gates.
- Review old failed R25AI draft files before deleting.
- Leave user-local documents and ingestion folders untouched.
`);

  console.log(JSON.stringify({ ok: true, recommendation: plan.recommendation, counts }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
