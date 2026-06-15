#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = resolve(ROOT, "artifacts/training_os/personal_200m_candidate_models.json");
const OUT = resolve(ROOT, "artifacts/training_os/personal_200m_candidate_model_license_report.json");

const ALLOWED_LICENSES = new Set(["Apache-2.0", "MIT", "BSD-3-Clause", "CC0-1.0"]);

function fail(failures, code, detail = {}) {
  failures.push({ code, ...detail });
}

async function main() {
  const payload = JSON.parse(await readFile(INPUT, "utf8"));
  const failures = [];
  const candidates = payload.candidates || [];
  for (const item of candidates) {
    if (!item.model_id) fail(failures, "missing_model_id");
    if (!item.license_name) fail(failures, "missing_license_name", { model_id: item.model_id });
    if (!item.license_url) fail(failures, "missing_license_url", { model_id: item.model_id });
    if (!["verified", "likely", "unclear", "rejected"].includes(item.license_confidence)) {
      fail(failures, "invalid_license_confidence", { model_id: item.model_id, license_confidence: item.license_confidence });
    }
    if (item.admission_status === "admitted") {
      if (item.license_confidence !== "verified") fail(failures, "admitted_without_verified_license", { model_id: item.model_id });
      if (!ALLOWED_LICENSES.has(item.license_name)) fail(failures, "admitted_incompatible_license", { model_id: item.model_id, license_name: item.license_name });
      if (item.parameter_count < 100000000 || item.parameter_count > 200000000) fail(failures, "admitted_outside_profile_size", { model_id: item.model_id });
    }
    if (/NC|NonCommercial|ND|NoDerivatives|GPL/i.test(item.license_name)) {
      if (item.admission_status !== "rejected") fail(failures, "restricted_license_not_rejected", { model_id: item.model_id, license_name: item.license_name });
    }
    if (item.supports_generation && item.admission_status === "admitted") {
      fail(failures, "generator_admitted_without_extra_policy", { model_id: item.model_id });
    }
  }
  if (payload.downloaded_weights !== false) fail(failures, "weights_downloaded_flag_not_false");
  if (payload.committed_weights !== false) fail(failures, "weights_committed_flag_not_false");

  const report = {
    ok: failures.length === 0,
    total: candidates.length,
    admitted: candidates.filter((item) => item.admission_status === "admitted").length,
    candidate: candidates.filter((item) => item.admission_status === "candidate").length,
    rejected: candidates.filter((item) => item.admission_status === "rejected").length,
    policy: "No model is admitted unless exact source license is verified and browser budget passes.",
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
