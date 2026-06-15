#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_REGISTRY = resolve(ROOT, "data/external_sources/admitted_open_sources.jsonl");
const CARD_DIR = resolve(ROOT, "data/external_cards");
const REPORT = resolve(ROOT, "artifacts/training_os/external_cards_validation_report.json");
const FORBIDDEN =
  /\/Users\/|\/Volumes\/|\/home\/|[A-Za-z]:\\|lyrics?全文|完整歌词|according to your file|根据你的文件|根据你的网站|source path|local path|passport|visa|bank account|student ID/i;
const FORBIDDEN_NEGATIVE_GUARDS = /\/Users\/|\/Volumes\/|\/home\/|[A-Za-z]:\\|passport|visa|bank account|student ID/i;

function parseJsonl(text, file, failures) {
  return text
    .split(/\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        failures.push({ code: "json_parse_error", file, line: index + 1, message: error.message });
        return null;
      }
    })
    .filter(Boolean);
}

async function main() {
  const failures = [];
  const admitted = new Map(
    parseJsonl(await readFile(SOURCE_REGISTRY, "utf8"), "admitted_open_sources.jsonl", failures).map((row) => [
      row.source_id,
      row
    ])
  );
  const files = (await readdir(CARD_DIR)).filter((file) => file.endsWith(".jsonl")).sort();
  const rows = [];
  for (const file of files) {
    const parsed = parseJsonl(await readFile(resolve(CARD_DIR, file), "utf8"), file, failures);
    for (const row of parsed) rows.push({ ...row, __file: file });
  }

  for (const row of rows) {
    if (!row.id) failures.push({ code: "missing_id", file: row.__file });
    const source = admitted.get(row.source_id);
    if (!source) failures.push({ code: "unknown_or_unadmitted_source", file: row.__file, id: row.id, source_id: row.source_id });
    if (!row.license_url) failures.push({ code: "missing_license_url", file: row.__file, id: row.id });
    if (!row.provenance_hash) failures.push({ code: "missing_provenance_hash", file: row.__file, id: row.id });
    if (row.visibility !== "public") failures.push({ code: "external_candidate_not_public_visibility", file: row.__file, id: row.id });
    if (row.approved_for_public_runtime) failures.push({ code: "external_candidate_public_runtime_enabled", file: row.__file, id: row.id });
    if (!row.needs_review) failures.push({ code: "external_candidate_missing_review_flag", file: row.__file, id: row.id });
    if (!Array.isArray(row.not_to_infer) || row.not_to_infer.length === 0) {
      failures.push({ code: "missing_not_to_infer", file: row.__file, id: row.id });
    }
    if (!Array.isArray(row.must_not_include) || row.must_not_include.length === 0) {
      failures.push({ code: "missing_must_not_include", file: row.__file, id: row.id });
    }
    const rowForSurfaceScan = { ...row, not_to_infer: [], must_not_include: [] };
    const surfaceText = JSON.stringify(rowForSurfaceScan);
    if (FORBIDDEN.test(surfaceText)) failures.push({ code: "forbidden_content", file: row.__file, id: row.id });
    const guardText = JSON.stringify({ not_to_infer: row.not_to_infer, must_not_include: row.must_not_include });
    if (FORBIDDEN_NEGATIVE_GUARDS.test(guardText)) failures.push({ code: "forbidden_guard_value", file: row.__file, id: row.id });
    if (/\b(\S+\s+){25,}\S+\b/.test(String(row.payload?.description || ""))) {
      failures.push({ code: "long_raw_description", file: row.__file, id: row.id });
    }
  }

  const report = {
    ok: failures.length === 0,
    files: files.length,
    rows: rows.length,
    approved_for_public_runtime: rows.filter((row) => row.approved_for_public_runtime).length,
    needs_review: rows.filter((row) => row.needs_review).length,
    failures
  };
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
