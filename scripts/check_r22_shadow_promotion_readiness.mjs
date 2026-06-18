#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";
import { gitHead, nowIso, R22_BASELINE_COMMIT, updateR22State } from "./r22_long_cycle_common.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/r22_shadow_promotion_readiness_report.json");

async function readJson(path, fallback = {}) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
  } catch {
    return fallback;
  }
}

async function main() {
  await updateR22State({ current_phase: "phase11_shadow_promotion_preflight" });
  const shadow = await readJson("artifacts/training_os/r22_shadow_surface_eval_report.json");
  const semantic = await readJson("artifacts/training_os/r22_surface_semantic_selectivity_report.json");
  const fallback = await readJson("artifacts/training_os/r22_fallback_appropriateness_report.json");
  const primitive = await readJson("artifacts/training_os/r22_dialogic_profile_primitives_validation.json");
  const rhythm = await readJson("artifacts/training_os/r22_shadow_session_rhythm_report.json");
  const holdout = await readJson("artifacts/training_os/r22_postfreeze_holdout_report.json");
  const review = await readJson("artifacts/training_os/r22_surface_review_summary.json");
  const automatedSurfaceReady =
    shadow.automated_surface_ok === true && (shadow.candidate_surface_pattern_failure_count || 0) === 0;
  const semanticReady =
    semantic.behavior_ok === true &&
    (semantic.verifier_false_negative_count || 0) === 0 &&
    (semantic.verifier_false_positive_count || 0) === 0;
  const fallbackReady = fallback.behavior_ok === true && (fallback.unnecessary_fallback_count || 0) === 0;
  const blindSiblingReady = (shadow.candidate_failure_count || 0) === 0;
  const postfreezeReady = holdout.behavior_ok === true && (holdout.holdout_candidate_failures || 0) === 0;
  const sessionRhythmReady = rhythm.behavior_ok === true;
  const primitiveReady = primitive.behavior_ok === true;
  const report = {
    execution_ok: true,
    behavior_ok: automatedSurfaceReady && semanticReady && fallbackReady && blindSiblingReady && postfreezeReady && sessionRhythmReady && primitiveReady,
    audit_only: false,
    baseline_commit: R22_BASELINE_COMMIT,
    evaluated_commit: gitHead(),
    generated_at: nowIso(),
    automated_surface_ready: automatedSurfaceReady,
    semantic_preservation_ready: semanticReady,
    fallback_appropriateness_ready: fallbackReady,
    blind_sibling_ready: blindSiblingReady,
    postfreeze_holdout_ready: postfreezeReady,
    session_rhythm_ready: sessionRhythmReady,
    primitive_schema_ready: primitiveReady,
    human_review_ready: false,
    live_switch: false,
    promotion_ready: false,
    human_review_status: "pending",
    status: "automated checks passed or reported; human pending",
    blocking_failures: []
  };
  if (!report.behavior_ok) {
    report.blocking_failures = Object.entries({
      automated_surface_ready: automatedSurfaceReady,
      semantic_preservation_ready: semanticReady,
      fallback_appropriateness_ready: fallbackReady,
      blind_sibling_ready: blindSiblingReady,
      postfreeze_holdout_ready: postfreezeReady,
      session_rhythm_ready: sessionRhythmReady,
      primitive_schema_ready: primitiveReady
    })
      .filter(([, ok]) => !ok)
      .map(([key]) => key);
  }
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await updateR22State({ current_phase: "phase11_shadow_promotion_preflight_done" });
  console.log(JSON.stringify({
    behavior_ok: report.behavior_ok,
    human_review_ready: report.human_review_ready,
    live_switch: report.live_switch,
    promotion_ready: report.promotion_ready,
    human_review_status: report.human_review_status,
    blocking_failures: report.blocking_failures,
    out: OUT
  }, null, 2));
  if (!report.behavior_ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
