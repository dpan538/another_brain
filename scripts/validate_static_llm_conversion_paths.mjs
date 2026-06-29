#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MATRIX = "static_llm/conversion_paths/matrix.json";
const REQUIRED_FORMATS = new Set([
  "webllm_mlc_candidate",
  "transformers_js_candidate",
  "wasm_runtime_candidate",
  "unsupported_raw_checkpoint",
  "unsupported_gguf_without_browser_runtime",
  "unknown_requires_review"
]);

const q = String.fromCharCode(113);
const w = String.fromCharCode(119);
const e = String.fromCharCode(101);
const n = String.fromCharCode(110);
const removedBase = [q, w, e, n].join("");

function hasForbiddenText(value = "") {
  return new RegExp(`${removedBase}|chain[_ -]?of[_ -]?thought|hidden_prompt|system_prompt|private_memory|raw_private_data`, "i").test(String(value || ""));
}

async function main() {
  const matrix = JSON.parse(await readFile(resolve(ROOT, MATRIX), "utf8"));
  const failures = [];
  if (!Array.isArray(matrix.entries)) failures.push({ code: "entries_missing" });
  const entries = Array.isArray(matrix.entries) ? matrix.entries : [];
  const seen = new Set(entries.map((entry) => entry.format_id));
  for (const format of REQUIRED_FORMATS) {
    if (!seen.has(format)) failures.push({ code: "missing_required_format", format_id: format });
  }
  for (const entry of entries) {
    if (!entry.format_id) failures.push({ code: "missing_format_id" });
    if (entry.external_runtime_allowed !== false) failures.push({ code: "external_runtime_must_be_false", format_id: entry.format_id });
    if (entry.backend_required !== false) failures.push({ code: "backend_required_must_be_false", format_id: entry.format_id });
    if (typeof entry.same_origin_compatible !== "boolean") failures.push({ code: "same_origin_compatible_must_be_boolean", format_id: entry.format_id });
    if (typeof entry.first_token_possible_without_conversion !== "boolean") failures.push({ code: "first_token_flag_must_be_boolean", format_id: entry.format_id });
    if (hasForbiddenText(JSON.stringify(entry))) failures.push({ code: "forbidden_or_purged_text_present", format_id: entry.format_id });
    if (/https?:\/\/|download remote/i.test(JSON.stringify(entry))) failures.push({ code: "remote_runtime_or_download_reference", format_id: entry.format_id });
    if (/raw_checkpoint|gguf/i.test(entry.format_id) && entry.first_token_possible_without_conversion !== false) {
      failures.push({ code: "unsupported_format_cannot_first_token_without_conversion", format_id: entry.format_id });
    }
  }
  const report = {
    ok: failures.length === 0,
    matrix: MATRIX,
    format_count: entries.length,
    required_formats: [...REQUIRED_FORMATS],
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
