#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = resolve(ROOT, "data/external_cards");
const REPORT = resolve(ROOT, "artifacts/training_os/external_metadata_samples_validation_report.json");
const FORBIDDEN = /\/Users\/|\/Volumes\/|\/home\/|[A-Za-z]:\\|完整歌词|歌词[:：]|raw PDF|\.docx|passport|visa|bank account|student ID/i;

function parseJsonl(text, file, failures) {
  return text
    .split(/\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return { ...JSON.parse(line), __file: file, __line: index + 1 };
      } catch (error) {
        failures.push({ code: "json_parse_error", file, line: index + 1, message: error.message });
        return null;
      }
    })
    .filter(Boolean);
}

async function main() {
  const failures = [];
  const files = (await readdir(DIR)).filter((file) => file.endsWith(".jsonl")).sort();
  const rows = [];
  for (const file of files) rows.push(...parseJsonl(await readFile(resolve(DIR, file), "utf8"), file, failures));
  for (const row of rows) {
    if (!row.id) failures.push({ code: "missing_id", file: row.__file, line: row.__line });
    if (!row.source_id) failures.push({ code: "missing_source_id", file: row.__file, id: row.id });
    if (!row.license_url) failures.push({ code: "missing_license_url", file: row.__file, id: row.id });
    if (!row.provenance_hash) failures.push({ code: "missing_provenance_hash", file: row.__file, id: row.id });
    if (row.approved_for_public_runtime) failures.push({ code: "metadata_sample_public_runtime_enabled", file: row.__file, id: row.id });
    if (row.needs_review !== true) failures.push({ code: "metadata_sample_missing_review", file: row.__file, id: row.id });
    if (FORBIDDEN.test(JSON.stringify(row))) failures.push({ code: "forbidden_content", file: row.__file, id: row.id });
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
