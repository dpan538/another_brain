#!/usr/bin/env node
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  ROOT,
  exists,
  readJson,
  repoPath,
  writeJson,
  writeText
} from "./r26a_project_utils.mjs";

const REPORT = "artifacts/training_os/r26c_question_pack/r26c_question_pack_eligibility_audit.json";
const DOC = "docs/R26C_QUESTION_PACK_ELIGIBILITY_AUDIT.md";
const SAFE_ROOTS = [
  "training/current",
  "training/intake",
  "private_sources/question_packs",
  "artifacts/training_os/question_packs"
];
const PACK_FILE_RE = /question|问题|pack|100|answer/i;
const RAW_EXT_RE = /\.(csv|xlsx|jsonl|json)$/i;
const POLICY_FILE_RE = /question_pack_(policy|manifest|100_manifest)|answer_as_user\.schema|answer_modes/i;

async function walkMetadata(root) {
  const absRoot = repoPath(root);
  const files = [];
  try {
    const rootStat = await stat(absRoot);
    if (!rootStat.isDirectory()) return files;
  } catch {
    return files;
  }
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const rel = relative(ROOT, abs);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile()) {
        const info = await stat(abs);
        if (RAW_EXT_RE.test(entry.name) && PACK_FILE_RE.test(rel) && !POLICY_FILE_RE.test(rel)) {
          files.push({
            path: rel,
            byte_size: info.size,
            metadata_only: rel.startsWith("private_sources/") || rel.startsWith("artifacts/"),
            committed_source_allowed: false
          });
        }
      }
    }
  }
  await walk(absRoot);
  return files;
}

async function main() {
  const manifest = await readJson("training/current/question_pack_100_manifest.r26c.json");
  const found = [];
  for (const root of SAFE_ROOTS) {
    found.push(...(await walkMetadata(root)));
  }
  const status = found.length ? "safe_paths_checked_metadata_only" : "manifest_policy_only";
  const report = {
    ok: true,
    phase: "R26C",
    status,
    pack_id: manifest.pack_id,
    total_rows: manifest.total_rows,
    candidate_rows: manifest.candidate_rows_count,
    excluded_rows: manifest.excluded_rows_count,
    raw_question_pack_files_found_in_safe_paths: found.length,
    raw_question_pack_files: found,
    parsed_raw_question_pack: false,
    external_csv_path_read: false,
    rows_1_to_50: "candidate_review_only",
    rows_51_to_100: "excluded_from_training",
    training_ran: false,
    tokenizer_dry_run_ran: false,
    corpus_expansion_ran: false,
    corpus_promotion_ran: false
  };
  await writeJson(REPORT, report);
  await writeText(
    DOC,
    `# R26C Question Pack Eligibility Audit

R26C uses manifest policy only unless a future approved intake path is present inside the repo. It does not read the external raw CSV, parse root DOCX/PDF files, parse \`data/public_ingestion\`, read \`private_sources\` content, train, run tokenizer dry-run, expand corpus, or promote rows.

## Result

- status: ${status}
- pack_id: ${manifest.pack_id}
- total rows: ${manifest.total_rows}
- rows 1-50: candidate_review_only
- rows 51-100: excluded_from_training
- raw question-pack files found in safe paths: ${found.length}
- raw external CSV read: false

Rows 51-100 remain excluded from all training, tokenizer, teacher-probe, corpus-generation, corpus-promotion, preference-pair, repair-pair, long-horizon, and eval-derived training paths.
`
  );
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
