#!/usr/bin/env node
import { readJson, readJsonIfPresent, writeJson, writeText } from "./r26a_project_utils.mjs";

async function main() {
  const plan = await readJsonIfPresent("artifacts/training_os/r26a_cleanup/r26a_cleanup_plan.json");
  const audit = await readJsonIfPresent("artifacts/training_os/r26a_cleanup/r26a_project_file_audit.json");
  const manifest = await readJson("training/current/corpus_manifest.json");
  const status = await readJson("training/current/training_status.json");
  const actions = plan?.actions || [];
  const byAction = {};
  for (const item of actions) {
    const key = item.action || item.classification || "unknown";
    if (!byAction[key]) byAction[key] = [];
    byAction[key].push(item);
  }
  const count = (key) => byAction[key]?.length || plan?.counts?.[key] || 0;
  const sampleLines = (key) => (byAction[key] || []).slice(0, 12).map((item) => `- \`${item.path || item.file || item.id || "unknown"}\``).join("\n") || "- none listed";
  const report = {
    ok: true,
    phase: "R26B",
    non_destructive: true,
    files_deleted: false,
    files_moved: false,
    counts: {
      keep_active: count("keep_active"),
      keep_historical: count("keep_historical"),
      archive_later: count("archive_later"),
      move_later: count("move_later"),
      delete_later_after_review: count("delete_later_after_review"),
      do_not_touch: count("do_not_touch"),
      user_review_required: count("needs_user_review") || count("user_review_required")
    },
    corpus_rows: manifest?.totals?.rows || 0,
    root_doc_count: audit?.counts?.root_doc_count || 0,
    data_public_ingestion_files: audit?.counts?.data_public_ingestion_files || 0,
    training_status: status
  };
  await writeJson("artifacts/training_os/r26b_review/r26b_cleanup_review_packet.json", report);
  await writeText(
    "docs/R26B_CLEANUP_REVIEW_PACKET.md",
    `# R26B Cleanup Review Packet

R26B reviews the R26A cleanup plan without moving or deleting files.

## Counts

- keep_active: ${report.counts.keep_active}
- keep_historical: ${report.counts.keep_historical}
- archive_later: ${report.counts.archive_later}
- move_later: ${report.counts.move_later}
- delete_later_after_review: ${report.counts.delete_later_after_review}
- do_not_touch: ${report.counts.do_not_touch}
- user_review_required: ${report.counts.user_review_required}

## Safe Keep Active

Active runtime, training/current manifests, tracked current corpus references, eval gates, R24 recovery/shard gates, R25 static release constraints, and R26 current docs should stay active.

## Archive Later Candidates

Count: ${report.counts.archive_later}

${sampleLines("archive_later")}

## Delete Later After Review Candidates

Count: ${report.counts.delete_later_after_review}

${sampleLines("delete_later_after_review")}

## Move Later Candidates

Count: ${report.counts.move_later}

${sampleLines("move_later")}

## Do Not Touch

Count: ${report.counts.do_not_touch}

${sampleLines("do_not_touch")}

## User Review Required

Count: ${report.counts.user_review_required}

${sampleLines("needs_user_review")}

## Boundaries

R26B does not delete files, move files, stage user-local files, parse root DOCX/PDF, parse \`data/public_ingestion/\`, read \`private_sources/\`, commit artifacts, or commit weights.

Current referenced corpus rows: ${report.corpus_rows}. Product training progress: ${status.product_training_progress_percent}%. Phase_4 approved: ${status.phase_4_scaled_training_approved}.
`
  );
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
