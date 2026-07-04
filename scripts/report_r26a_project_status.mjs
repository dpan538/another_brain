#!/usr/bin/env node
import {
  readJson,
  writeJson,
  writeText
} from "./r26a_project_utils.mjs";

async function main() {
  const audit = await readJson("artifacts/training_os/r26a_cleanup/r26a_project_file_audit.json");
  const manifest = await readJson("training/current/corpus_manifest.json");
  const docs = await readJson("artifacts/training_os/r26a_cleanup/r26a_docs_index.json");
  const cleanup = await readJson("artifacts/training_os/r26a_cleanup/r26a_cleanup_plan.json");
  const trainingStatus = await readJson("training/current/training_status.json");

  const status = {
    ok: true,
    phase: "R26A",
    current_active_runtime_structure: ["web/", "knowledge_sources/", "build_sources/", "static_llm/ scaffolds"],
    current_training_corpus_structure: manifest.files.filter((file) => file.exists).map((file) => ({ path: file.path, split: file.split, rows: file.row_count })),
    current_docs_structure: docs.counts,
    current_safety_gates: ["R24 recovery", "R24G source derivation", "R24B shard runtime", "R25 static release constraints", "Vercel static build"],
    current_ignored_local_residue: {
      root_doc_count: audit.counts.root_doc_count,
      data_public_ingestion_files: audit.counts.data_public_ingestion_files,
      artifact_files: audit.counts.artifact_files,
      do_not_touch_count: cleanup.counts?.do_not_touch || 0
    },
    current_cleanup_candidates: cleanup.counts,
    recommendation: [
      "pause_training_for_structure_review",
      "run_R26B_cleanup_after_user_review",
      "prepare_question_answer_collection_after_structure_cleanup",
      "do_not_train_now"
    ],
    training_status: trainingStatus,
    training_ran: false,
    tokenizer_dry_run_ran: false,
    corpus_expansion_ran: false,
    files_deleted: false,
    files_moved: false,
    artifacts_committed: false,
    weights_committed: false
  };
  await writeJson("artifacts/training_os/r26a_cleanup/r26a_project_status.json", status);

  await writeText("docs/R26A_PROJECT_STATUS.md", `# R26A Project Status

R26A pauses training and standardizes the project structure.

## Recommendation

- pause_training_for_structure_review
- run_R26B_cleanup_after_user_review
- prepare_question_answer_collection_after_structure_cleanup
- do_not_train_now

## Current Surfaces

- Runtime: \`web/\`, \`knowledge_sources/\`, \`build_sources/\`, \`static_llm/\` scaffolds
- Training corpus: ${manifest.files.filter((file) => file.exists).length} active referenced files, ${manifest.totals.rows} rows
- Docs: active docs indexed in \`docs/R26A_CANONICAL_DOCS_INDEX.md\`
- Safety gates: R24 recovery, R24G source derivation, R24B shard runtime, R25 static constraints, Vercel build

## Local Residue

- Root DOC/PDF metadata count: ${audit.counts.root_doc_count}
- data/public_ingestion metadata count: ${audit.counts.data_public_ingestion_files}
- Ignored artifact metadata count: ${audit.counts.artifact_files}

R26A did not train, run tokenizer dry-run, expand corpus, move files, delete files, parse root documents, parse \`data/public_ingestion/\`, read \`private_sources/\`, commit artifacts, or commit weights.
`);

  console.log(JSON.stringify({
    ok: true,
    recommendation: status.recommendation,
    training_rows: manifest.totals.rows,
    root_doc_count: audit.counts.root_doc_count,
    data_public_ingestion_files: audit.counts.data_public_ingestion_files
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
