#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = resolve(ROOT, "data/external_sources/open_dataset_registry.jsonl");
const REPORT = resolve(ROOT, "artifacts/training_os/open_dataset_registry_validation_report.json");
const REQUIRED_USES = ["metadata_cards", "runtime_cards", "training_examples", "model_weights", "public_runtime", "local_only"];
const STATUSES = new Set(["candidate", "admitted", "rejected"]);
const LICENSE_CONFIDENCE = new Set(["verified", "likely", "unclear", "rejected"]);
const SOURCE_TYPES = new Set([
  "metadata_graph",
  "benchmark",
  "public_domain_text",
  "open_text_corpus",
  "museum_collection",
  "music_metadata",
  "authority_file",
  "reasoning_dataset",
  "other"
]);

function parseJsonl(text) {
  return text
    .split(/\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return { __parse_error: error.message, __line: index + 1 };
      }
    });
}

function fail(failures, code, detail = {}) {
  failures.push({ code, ...detail });
}

async function main() {
  const rows = parseJsonl(await readFile(REGISTRY, "utf8"));
  const failures = [];
  const ids = new Set();
  for (const row of rows) {
    if (row.__parse_error) {
      fail(failures, "json_parse_error", row);
      continue;
    }
    if (!row.source_id) fail(failures, "missing_source_id", { name: row.name });
    if (ids.has(row.source_id)) fail(failures, "duplicate_source_id", { source_id: row.source_id });
    ids.add(row.source_id);
    for (const field of [
      "name",
      "homepage_url",
      "domain",
      "source_type",
      "license_name",
      "license_confidence",
      "allowed_uses",
      "copyright_risk",
      "privacy_risk",
      "source_framing_risk",
      "admission_status",
      "notes"
    ]) {
      if (row[field] === undefined || row[field] === null || row[field] === "") {
        if (!(field === "license_name" && row.admission_status !== "admitted")) {
          fail(failures, "missing_required_field", { source_id: row.source_id, field });
        }
      }
    }
    if (!SOURCE_TYPES.has(row.source_type)) fail(failures, "invalid_source_type", { source_id: row.source_id });
    if (!STATUSES.has(row.admission_status)) fail(failures, "invalid_admission_status", { source_id: row.source_id });
    if (!LICENSE_CONFIDENCE.has(row.license_confidence)) fail(failures, "invalid_license_confidence", { source_id: row.source_id });
    for (const key of REQUIRED_USES) {
      if (typeof row.allowed_uses?.[key] !== "boolean") fail(failures, "allowed_uses_missing_boolean", { source_id: row.source_id, key });
    }
    if (row.admission_status === "admitted") {
      if (row.license_confidence !== "verified") fail(failures, "admitted_without_verified_license", { source_id: row.source_id });
      if (!row.license_url) fail(failures, "admitted_without_license_url", { source_id: row.source_id });
      if (!row.license_text_url) fail(failures, "admitted_without_license_text_url", { source_id: row.source_id });
      if (row.noncommercial_only || row.no_derivatives) fail(failures, "admitted_with_nc_or_nd", { source_id: row.source_id });
      if (row.share_alike_required) fail(failures, "admitted_with_sharealike_without_policy", { source_id: row.source_id });
      if (!row.allowed_uses.metadata_cards) fail(failures, "admitted_without_metadata_cards_use", { source_id: row.source_id });
      if (row.privacy_risk === "high") fail(failures, "admitted_high_privacy_risk", { source_id: row.source_id });
    }
    if (row.admission_status === "rejected" && !row.rejection_reason) {
      fail(failures, "rejected_without_reason", { source_id: row.source_id });
    }
    if (/lyrics|lyric/i.test(`${row.name} ${row.domain}`) && row.admission_status === "admitted") {
      fail(failures, "lyrics_source_admitted", { source_id: row.source_id });
    }
    if (/dataset card/i.test(row.notes || "") && row.admission_status === "admitted") {
      fail(failures, "admitted_from_dataset_card_only", { source_id: row.source_id });
    }
    if (row.raw_text_allowed && row.admission_status === "admitted" && row.copyright_risk !== "low") {
      fail(failures, "admitted_raw_text_without_low_risk", { source_id: row.source_id });
    }
  }

  const summary = {
    total: rows.length,
    admitted: rows.filter((row) => row.admission_status === "admitted").length,
    rejected: rows.filter((row) => row.admission_status === "rejected").length,
    candidate: rows.filter((row) => row.admission_status === "candidate").length
  };
  if (summary.total < 30) fail(failures, "too_few_sources", { total: summary.total });
  if (summary.admitted < 5) fail(failures, "too_few_admitted_sources", { admitted: summary.admitted });
  if (summary.rejected < 10) fail(failures, "too_few_rejected_sources", { rejected: summary.rejected });

  const report = { ok: failures.length === 0, summary, failures };
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
