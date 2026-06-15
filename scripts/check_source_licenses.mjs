#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = resolve(ROOT, "data/external_sources/open_dataset_registry.jsonl");
const OUT = resolve(ROOT, "artifacts/training_os/source_license_report.json");

function parseJsonl(text) {
  return text
    .split(/\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function add(failures, code, source, detail = {}) {
  failures.push({ code, source_id: source.source_id, name: source.name, ...detail });
}

async function main() {
  const rows = parseJsonl(await readFile(REGISTRY, "utf8"));
  const failures = [];
  const admitted = rows.filter((row) => row.admission_status === "admitted");
  const rejected = rows.filter((row) => row.admission_status === "rejected");
  const candidates = rows.filter((row) => row.admission_status === "candidate");

  for (const source of rows) {
    if (source.admission_status === "admitted") {
      if (source.license_confidence !== "verified") add(failures, "admitted_unverified_license", source);
      if (!source.license_url) add(failures, "admitted_missing_license_url", source);
      if (!source.license_text_url) add(failures, "admitted_missing_license_text_url", source);
      if (source.noncommercial_only || source.no_derivatives) add(failures, "admitted_nc_or_nd", source);
      if (source.share_alike_required) add(failures, "admitted_sharealike_without_policy", source);
      if (source.raw_text_allowed) add(failures, "admitted_raw_text_not_allowed_in_r16", source);
      if (source.privacy_risk !== "low") add(failures, "admitted_privacy_not_low", source, { privacy_risk: source.privacy_risk });
      if (/lyrics|lyric/i.test(`${source.name} ${source.domain}`)) add(failures, "admitted_lyrics_source", source);
      if (!source.allowed_uses?.metadata_cards) add(failures, "admitted_without_metadata_use", source);
    }
    if (source.admission_status === "candidate" && source.license_confidence === "verified" && source.license_url && !source.share_alike_required) {
      // Candidate can remain candidate by policy, but record it for follow-up review.
      source.review_note = "verified candidate not admitted yet";
    }
    if (source.admission_status === "rejected" && !source.rejection_reason) {
      add(failures, "rejected_missing_reason", source);
    }
  }

  const report = {
    ok: failures.length === 0,
    summary: {
      total: rows.length,
      admitted: admitted.length,
      rejected: rejected.length,
      candidate: candidates.length,
      admitted_license_names: [...new Set(admitted.map((row) => row.license_name))],
      attribution_required: rows.filter((row) => row.attribution_required).length,
      share_alike_required: rows.filter((row) => row.share_alike_required).length,
      nc_or_nd: rows.filter((row) => row.noncommercial_only || row.no_derivatives).length
    },
    admitted_sources: admitted.map((row) => ({
      source_id: row.source_id,
      name: row.name,
      license_name: row.license_name,
      license_url: row.license_url,
      license_text_url: row.license_text_url,
      sample_cap: row.sample_cap
    })),
    failures
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
