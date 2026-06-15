#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "data/culture_cards/external_r17_knowledge_cards.jsonl",
  "data/culture_cards/external_r17_relation_graph.jsonl"
];
const REPORT = resolve(ROOT, "artifacts/training_os/r17_external_knowledge_validation_report.json");
const FORBIDDEN = /\/Users\/|\/Volumes\/|\/home\/|[A-Za-z]:\\|完整歌词|歌词[:：]|全文如下|raw PDF|\.docx|passport|visa|bank account|student ID|according to your file|根据你的文件/i;

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
  const rows = [];
  for (const file of FILES) rows.push(...parseJsonl(await readFile(resolve(ROOT, file), "utf8"), file, failures));
  for (const row of rows) {
    if (!String(row.id || "").startsWith("external.r17.")) failures.push({ code: "bad_id_prefix", file: row.__file, id: row.id });
    if (row.approved_for_public_runtime) failures.push({ code: "runtime_enabled", file: row.__file, id: row.id });
    if (row.needs_review !== true) failures.push({ code: "missing_review_flag", file: row.__file, id: row.id });
    if (!Array.isArray(row.source_ids) || row.source_ids.length === 0) failures.push({ code: "missing_source_ids", file: row.__file, id: row.id });
    if (!Array.isArray(row.license_refs) || row.license_refs.length === 0) failures.push({ code: "missing_license_refs", file: row.__file, id: row.id });
    if (!Array.isArray(row.safe_boundaries) || !row.safe_boundaries.includes("metadata_only")) failures.push({ code: "missing_metadata_boundary", file: row.__file, id: row.id });
    if (!Array.isArray(row.not_to_infer) || row.not_to_infer.length === 0) failures.push({ code: "missing_not_to_infer", file: row.__file, id: row.id });
    if (FORBIDDEN.test(JSON.stringify(row))) failures.push({ code: "forbidden_content", file: row.__file, id: row.id });
  }
  const byDomain = rows.reduce((acc, row) => {
    acc[row.domain] ||= { cards: 0, relations: 0 };
    acc[row.domain].cards += 1;
    if (row.entity_type === "relation") acc[row.domain].relations += 1;
    return acc;
  }, {});
  const report = {
    ok: failures.length === 0,
    rows: rows.length,
    approved_for_public_runtime: rows.filter((row) => row.approved_for_public_runtime).length,
    needs_review: rows.filter((row) => row.needs_review).length,
    by_domain: byDomain,
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
