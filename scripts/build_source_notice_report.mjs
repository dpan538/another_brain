#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = resolve(ROOT, "data/external_sources/open_dataset_registry.jsonl");
const OUT = resolve(ROOT, "artifacts/training_os/source_notice_report.md");

function parseJsonl(text) {
  return text
    .split(/\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

async function main() {
  const rows = parseJsonl(await readFile(REGISTRY, "utf8"));
  const admitted = rows.filter((row) => row.admission_status === "admitted");
  const candidates = rows.filter((row) => row.admission_status === "candidate");
  const rejected = rows.filter((row) => row.admission_status === "rejected");
  const lines = [
    "# Source Notice Report",
    "",
    "This report lists external source candidates and admission status. It is a notice/audit artifact, not a data dump.",
    "",
    "## Admitted Sources",
    ""
  ];
  for (const source of admitted) {
    lines.push(`- ${source.name} (${source.source_id})`);
    lines.push(`  - License: ${source.license_name}`);
    lines.push(`  - License URL: ${source.license_url}`);
    lines.push(`  - License proof: ${source.license_text_url}`);
    lines.push(`  - Allowed use: metadata/card/training candidates with review; raw text allowed: ${source.raw_text_allowed}`);
  }
  lines.push("", "## Candidate Sources", "");
  for (const source of candidates) {
    lines.push(`- ${source.name} (${source.source_id}): ${source.license_confidence}; ${source.notes}`);
  }
  lines.push("", "## Rejected Sources", "");
  for (const source of rejected) {
    lines.push(`- ${source.name} (${source.source_id}): ${source.rejection_reason}`);
  }
  lines.push("", "## Global Notices", "");
  lines.push("- Lyrics are excluded.");
  lines.push("- Raw corpora are not committed.");
  lines.push("- Candidate sources require additional review before import.");
  lines.push("- Admitted metadata candidates still default to `needs_review: true` before public runtime use.");

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${lines.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, out: OUT, admitted: admitted.length, candidate: candidates.length, rejected: rejected.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
