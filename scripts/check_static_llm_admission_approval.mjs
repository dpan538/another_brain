#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { discoverStaticLlmArtifacts } from "./discover_static_llm_artifacts.mjs";
import {
  PRODUCTION_APPROVAL_MARKER_FILENAME,
  exists
} from "./static_llm_artifact_utils.mjs";
import { ROOT } from "./static_llm_manifest_utils.mjs";
import { normalizeRepoPath } from "./static_llm_policy.mjs";

const VALID_SCOPES = new Set(["inspect_only", "stage_assets", "commit_assets"]);

function hasPrivateOrSecretText(value = "") {
  return /\/Users\/|\/private\/var\/|\/Volumes\/|BEGIN PRIVATE KEY|api[_-]?key|secret|token=/i.test(String(value || ""));
}

function validateMarker(marker = {}, candidate) {
  const failures = [];
  if (marker.approved !== true) failures.push({ code: "approval_marker_must_set_approved_true" });
  if (typeof marker.model_id !== "string" || !marker.model_id.trim()) failures.push({ code: "approval_marker_missing_model_id" });
  if (candidate.review_status && marker.model_id && candidate.candidate_id && !String(marker.model_id).trim()) {
    failures.push({ code: "approval_marker_model_id_empty" });
  }
  if (typeof marker.reviewer !== "string" || !marker.reviewer.trim()) failures.push({ code: "approval_marker_missing_reviewer" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(marker.date || ""))) failures.push({ code: "approval_marker_date_must_be_yyyy_mm_dd" });
  if (!VALID_SCOPES.has(String(marker.scope || ""))) failures.push({ code: "approval_marker_invalid_scope", scope: marker.scope });
  for (const [key, value] of Object.entries(marker)) {
    if (typeof value === "string" && hasPrivateOrSecretText(value)) {
      failures.push({ code: "approval_marker_contains_private_or_secret_text", field: key });
    }
  }
  return failures;
}

async function readMarker(candidate) {
  const markerPath = resolve(ROOT, candidate.dir, PRODUCTION_APPROVAL_MARKER_FILENAME);
  if (!(await exists(markerPath))) {
    return {
      present: false,
      path: normalizeRepoPath(relative(ROOT, markerPath)),
      scope: "inspect_only",
      valid: true,
      marker: null,
      failures: []
    };
  }
  try {
    const marker = JSON.parse(await readFile(markerPath, "utf8"));
    const failures = validateMarker(marker, candidate);
    return {
      present: true,
      path: normalizeRepoPath(relative(ROOT, markerPath)),
      scope: marker.scope || "",
      valid: failures.length === 0,
      marker,
      failures
    };
  } catch (error) {
    return {
      present: true,
      path: normalizeRepoPath(relative(ROOT, markerPath)),
      scope: "",
      valid: false,
      marker: null,
      failures: [{ code: "approval_marker_json_parse_failed", message: error.message }]
    };
  }
}

export async function checkStaticLlmAdmissionApproval() {
  const discovery = await discoverStaticLlmArtifacts();
  const candidates = [];
  const failures = [];
  for (const candidate of discovery.candidates) {
    const approval = await readMarker(candidate);
    if (!approval.valid) {
      for (const failure of approval.failures) failures.push({ candidate_id: candidate.candidate_id, path: approval.path, ...failure });
    }
    candidates.push({
      ...candidate,
      approval_marker_present: approval.present,
      approval_marker_path: approval.path,
      approval_scope: approval.scope,
      approval_valid: approval.valid,
      may_inspect: true,
      may_stage_assets: approval.present && approval.valid && ["stage_assets", "commit_assets"].includes(approval.scope),
      may_commit_assets: approval.present && approval.valid && approval.scope === "commit_assets",
      approval_failures: approval.failures
    });
  }
  return {
    ok: failures.length === 0,
    blocked: discovery.blocked,
    blocked_reason: discovery.blocked_reason,
    candidate_count: candidates.length,
    production_marker_filename: PRODUCTION_APPROVAL_MARKER_FILENAME,
    default_scope_without_marker: "inspect_only",
    candidates,
    failures
  };
}

async function main() {
  const report = await checkStaticLlmAdmissionApproval();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
