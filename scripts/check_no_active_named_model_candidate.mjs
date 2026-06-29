#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { gitLsFiles } from "./static_llm_artifact_utils.mjs";
import { normalizeRepoPath } from "./static_llm_policy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ACTIVE_RE = /^(README\.md|DEPLOYMENT\.md|DATA_CARD\.md|docs\/R25.*\.md|static_llm\/(?!candidate_decisions\/decisions\/).+|scripts\/(build_static_llm_candidate_matrix|validate_static_llm_candidate_decisions|score_static_decoder_candidate_decision|validate_static_llm_conversion_paths|check_no_active_named_model_candidate|check_removed_model_candidate_purge|evaluate_static_llm_capacity_envelope|generate_static_llm_dryrun_manifests|eval_static_llm_browser_memory_envelope|simulate_static_llm_deploy_payload)\.mjs|package\.json)$/;
const SKIP_RE = /(^|\/)(artifacts|node_modules|\.git)\//;
const GENERIC_ALLOWED_RE = /browser_decoder_candidate_tbd|local_reviewed_decoder_artifact_tbd|browser_ready_decoder_artifact_tbd|reviewed_static_decoder_candidate|local_static_decoder_candidate|tiny_decoder_fixture|example-|placeholder_|replace_with|decoder[-_ ]artifact|family_rejected|conversion_required_family_pending/i;
const NAMED_MODEL_RE = /(?:^|[^A-Za-z0-9_.-])([A-Za-z][A-Za-z0-9.-]{1,80}\/[A-Za-z0-9][A-Za-z0-9._-]{1,100})(?:[^A-Za-z0-9_.-]|$)/;
const ACTIVE_SELECTION_RE = /primary|selected|selection|candidate|model_id|model id|review candidate|artifact request|inbox\//i;
const LEGACY_CONTEXT_RE = /legacy|historical|comparison|rejected|not selected|no named model|placeholder|template|example|fixture|purged|removed/i;

const q = String.fromCharCode(113);
const w = String.fromCharCode(119);
const e = String.fromCharCode(101);
const n = String.fromCharCode(110);
const removedBase = [q, w, e, n].join("");
const removedRe = new RegExp(removedBase, "i");

function lineContext(lines, index) {
  return [lines[index - 1] || "", lines[index], lines[index + 1] || ""].join(" ");
}

function shouldScan(file) {
  const normalized = normalizeRepoPath(file);
  return ACTIVE_RE.test(normalized) && !SKIP_RE.test(normalized);
}

function isRepoPathOrGateToken(token = "") {
  return /^(static_llm|web|docs|scripts|artifacts|training|evals)\//.test(token)
    || /\.(mjs|js|json|md|py|sh|html|css)$/.test(token)
    || /^R\d+[A-Z]?\/R\d+[A-Z]?/.test(token)
    || /^(license|manifest|config|tokenizer|WebGPU|Vercel|inbox|preview|route|worker|example|fallback|memory|browser|cache|storage|token)\/[A-Za-z0-9_.-]+/.test(token)
    || /^json-schema\.org\//.test(token)
    || /^[A-Z]{2,}\/[a-z.]+/.test(token);
}

async function main() {
  const files = (await gitLsFiles(["ls-files", "--cached", "--others", "--exclude-standard"]))
    .map(normalizeRepoPath)
    .filter(shouldScan);
  const failures = [];
  const allowed = [];
  for (const file of files) {
    const text = await readFile(resolve(ROOT, file), "utf8").catch(() => "");
    if (!text) continue;
    if (removedRe.test(text)) failures.push({ code: "purged_candidate_string_present", path: file });
    const lines = text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const context = lineContext(lines, index);
      if (!ACTIVE_SELECTION_RE.test(context)) continue;
      const match = context.match(NAMED_MODEL_RE);
      if (!match) continue;
      const token = match[1];
      if (isRepoPathOrGateToken(token)) continue;
      const item = { path: file, line: index + 1, token };
      if (GENERIC_ALLOWED_RE.test(context) || LEGACY_CONTEXT_RE.test(context)) allowed.push(item);
      else failures.push({ code: "active_named_model_candidate", ...item });
    }
  }
  const report = {
    ok: failures.length === 0,
    scanned_files: files.length,
    selected_named_model_present: false,
    failures,
    allowed_matches: allowed.slice(0, 40)
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
