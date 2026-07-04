#!/usr/bin/env node
import { stat } from "node:fs/promises";
import {
  R26A_REPORT_DIR,
  addCount,
  classifyTracked,
  classifyUntracked,
  countTreeMetadata,
  extOf,
  gitStatusIgnored,
  gitStatusShort,
  isModelLike,
  isRootDoc,
  parseStatusLine,
  repoPath,
  rootDocumentMetadata,
  topCategory,
  trackedFiles,
  writeJson,
  writeText
} from "./r26a_project_utils.mjs";

async function safeStat(path) {
  try {
    return await stat(repoPath(path));
  } catch {
    return null;
  }
}

async function main() {
  const tracked = await trackedFiles();
  const status = (await gitStatusShort()).map(parseStatusLine);
  const ignoredStatus = (await gitStatusIgnored(["artifacts", "data/public_ingestion", "private_sources"])).map(parseStatusLine);
  const rootDocs = await rootDocumentMetadata();
  const artifacts = await countTreeMetadata("artifacts");
  const publicIngestion = await countTreeMetadata("data/public_ingestion");
  const privateSources = await countTreeMetadata("private_sources", { skipContents: true });

  const trackedByClass = {};
  const trackedByTop = {};
  const trackedModelLike = [];
  const trackedLargeFiles = [];
  const trackedSamples = [];
  for (const path of tracked) {
    const classification = classifyTracked(path);
    addCount(trackedByClass, classification);
    addCount(trackedByTop, topCategory(path));
    if (isModelLike(path)) trackedModelLike.push(path);
    const info = await safeStat(path);
    if (info?.isFile() && info.size >= 5 * 1024 * 1024) trackedLargeFiles.push({ path, byte_size: info.size });
    if (trackedSamples.length < 80) trackedSamples.push({ path, classification, top_category: topCategory(path) });
  }

  const untrackedByClass = {};
  const untrackedByTop = {};
  const statusSummary = [];
  for (const item of status) {
    const classification = item.code === "??" ? classifyUntracked(item.path) : "tracked_modified_or_staged";
    addCount(untrackedByClass, classification);
    addCount(untrackedByTop, topCategory(item.path));
    statusSummary.push({ ...item, classification, top_category: topCategory(item.path) });
  }

  const ignoredByTop = {};
  for (const item of ignoredStatus) addCount(ignoredByTop, topCategory(item.path));

  const report = {
    ok: true,
    phase: "R26A",
    non_destructive: true,
    training_ran: false,
    tokenizer_dry_run_ran: false,
    corpus_expansion_ran: false,
    moved_files: false,
    deleted_files: false,
    metadata_only: {
      root_pdf_docx: true,
      data_public_ingestion: true,
      artifacts: true,
      private_sources_contents_read: false
    },
    counts: {
      tracked_files: tracked.length,
      untracked_or_modified_status_entries: status.length,
      ignored_status_entries: ignoredStatus.length,
      docs_tracked: tracked.filter((path) => /^docs\//.test(path)).length,
      training_tracked: tracked.filter((path) => /^training\//.test(path)).length,
      evals_tracked: tracked.filter((path) => /^evals\//.test(path)).length,
      scripts_tracked: tracked.filter((path) => /^scripts\//.test(path)).length,
      runtime_tracked: tracked.filter((path) => /^(web|knowledge_sources|build_sources|static_llm)\//.test(path)).length,
      root_doc_count: rootDocs.length,
      root_doc_bytes: rootDocs.reduce((sum, item) => sum + item.byte_size, 0),
      artifact_files: artifacts.files,
      artifact_bytes: artifacts.bytes,
      data_public_ingestion_files: publicIngestion.files,
      data_public_ingestion_bytes: publicIngestion.bytes,
      model_like_tracked_files: trackedModelLike.length,
      large_tracked_files: trackedLargeFiles.length
    },
    tracked_by_class: trackedByClass,
    tracked_by_top_category: trackedByTop,
    status_by_class: untrackedByClass,
    status_by_top_category: untrackedByTop,
    ignored_by_top_category: ignoredByTop,
    root_documents: rootDocs,
    artifacts_metadata: artifacts,
    data_public_ingestion_metadata: publicIngestion,
    private_sources_metadata: privateSources,
    tracked_model_like_files: trackedModelLike,
    tracked_large_files: trackedLargeFiles,
    status_entries: statusSummary,
    tracked_samples: trackedSamples,
    recommendation: "pause_training_for_structure_review"
  };

  await writeJson(`${R26A_REPORT_DIR}/r26a_project_file_audit.json`, report);

  const summary = `# R26A Project File Audit Summary

R26A is non-destructive. It audits and classifies the repository structure without training, tokenizer dry-run, corpus expansion, file deletion, file moves, or private/raw document ingestion.

## Aggregate Counts

| Metric | Count |
| --- | ---: |
| Tracked files | ${report.counts.tracked_files} |
| Status entries, modified/untracked | ${report.counts.untracked_or_modified_status_entries} |
| Ignored status entries | ${report.counts.ignored_status_entries} |
| Tracked docs | ${report.counts.docs_tracked} |
| Tracked training files | ${report.counts.training_tracked} |
| Tracked eval files | ${report.counts.evals_tracked} |
| Tracked scripts | ${report.counts.scripts_tracked} |
| Tracked runtime files | ${report.counts.runtime_tracked} |
| Root DOC/PDF files, metadata-only | ${report.counts.root_doc_count} |
| data/public_ingestion files, metadata-only | ${report.counts.data_public_ingestion_files} |
| Ignored artifact files, metadata-only | ${report.counts.artifact_files} |
| Tracked model-like files | ${report.counts.model_like_tracked_files} |

## Tracked Classification

${Object.entries(trackedByClass).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Local Residue

Root DOC/PDF files and \`data/public_ingestion/\` remain local/unreviewed and are not training input. Ignored \`artifacts/\` remain generated local reports/checkpoints/tokenizers and are not commit candidates. R26A did not parse private/root document content.
`;
  await writeText("docs/R26A_PROJECT_FILE_AUDIT_SUMMARY.md", summary);

  console.log(JSON.stringify({
    ok: true,
    tracked_files: report.counts.tracked_files,
    root_doc_count: report.counts.root_doc_count,
    data_public_ingestion_files: report.counts.data_public_ingestion_files,
    artifact_files: report.counts.artifact_files,
    report: `${R26A_REPORT_DIR}/r26a_project_file_audit.json`
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
