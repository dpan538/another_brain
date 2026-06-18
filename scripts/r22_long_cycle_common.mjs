import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";

export const R22_BASELINE_COMMIT = "c6911d3c203413bfab99a87c0b8576cbd11f0f36";
export const R22_STATE_PATH = resolve(ROOT, "artifacts/training_os/r22_long_cycle_state.json");

export function nowIso() {
  return new Date().toISOString();
}

export function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
  } catch {
    return fallback;
  }
}

export function jsonlRows(text = "") {
  return String(text)
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

export async function readJsonl(path) {
  return jsonlRows(await readFile(resolve(ROOT, path), "utf8"));
}

export async function writeJson(path, value) {
  const target = path.startsWith("/") ? path : resolve(ROOT, path);
  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function loadR22State() {
  const existing = await readJson("artifacts/training_os/r22_long_cycle_state.json", null);
  if (existing) return existing;
  return {
    baseline_commit: R22_BASELINE_COMMIT,
    current_head: gitHead(),
    started_at: nowIso(),
    current_phase: "not_started",
    completed_phases: [],
    last_good_commit: "",
    last_full_gate_result: null,
    pending_failures: [],
    pending_followups: [],
    live_switch: false,
    promotion_ready: false,
    human_review_status: "pending"
  };
}

export async function updateR22State(patch = {}) {
  const previous = await loadR22State();
  const next = {
    ...previous,
    ...patch,
    baseline_commit: previous.baseline_commit || R22_BASELINE_COMMIT,
    current_head: gitHead(),
    live_switch: false,
    promotion_ready: false,
    human_review_status: "pending",
    updated_at: nowIso()
  };
  await writeJson(R22_STATE_PATH, next);
  return next;
}

export function surfaceCandidateOf(turn = {}) {
  return turn.trace?.conversation_controller?.surface_candidate || {};
}

export function controllerTraceOf(turn = {}) {
  return turn.trace?.conversation_controller || {};
}

export function compactSemanticVerifier(verifier = {}) {
  return {
    ok: verifier.ok ?? null,
    semantic_preservation_ok: verifier.semantic_preservation_ok ?? null,
    context_fit_ok: verifier.context_fit_ok ?? null,
    boundary_ok: verifier.boundary_ok ?? null,
    hard_failures: verifier.hard_failures || [],
    warnings: verifier.warnings || [],
    missing_required_units: verifier.missing_required_units || [],
    unsupported_named_items: verifier.unsupported_named_items || [],
    unsupported_relation_ids: verifier.unsupported_relation_ids || [],
    confidence: verifier.confidence ?? null
  };
}

