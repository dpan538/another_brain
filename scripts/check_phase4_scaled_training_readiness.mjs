#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25u/r25u_phase4_readiness_report.json";
const execFileAsync = promisify(execFile);

async function readJsonIfPresent(path) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function finite(value) {
  return Number.isFinite(Number(value));
}

async function gitFiles(paths) {
  const { stdout } = await execFileAsync("git", ["ls-files", ...paths], {
    cwd: ROOT,
    maxBuffer: 16 * 1024 * 1024
  });
  return stdout.split(/\r?\n/).filter(Boolean);
}

function lineClaimsPhase4Approved(line, block) {
  if (!/(phase[_ ]?4|scaled training|scaled decoder training)/i.test(line)) return false;
  if (!/(approved|allowed|started|ran|product|release|admitted)/i.test(line)) return false;
  if (/(not|no |never|without|blocked|false|must not|cannot|does not|do not|is not|remains unapproved|not approved|approved:false|forbidden|template|allow_phase_4_scaled_training|phase_4_scaled_training_approved|pattern:|RegExp|ACTIVE_RE|check_phase4_scaled_training_readiness)/i.test(block)) return false;
  return true;
}

async function findForbiddenPhase4Claims() {
  const paths = await gitFiles(["README.md", "DATA_CARD.md", "DEPLOYMENT.md", "docs", "scripts", "training", "package.json"]);
  const failures = [];
  for (const path of paths) {
    const text = await readFile(resolve(ROOT, path), "utf8").catch(() => "");
    if (!text) continue;
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const block = [lines[index - 1] || "", line, lines[index + 1] || ""].join(" ");
      if (lineClaimsPhase4Approved(line, block)) failures.push({ path, line: index + 1, text: line.trim().slice(0, 240) });
    });
  }
  return failures;
}

async function main() {
  const criteria = await readJsonIfPresent("training/from_scratch/phase3_exit_criteria.json");
  const r25mRun = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25m/r25m_small_decoder_run_report.json");
  const r25pRun = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25p/r25p_small_decoder_run_report.json");
  const r25sRun = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25s/r25s_small_decoder_run_report.json");
  const r25sEval = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25s/r25s_small_decoder_eval_report.json");
  const r25sHeldout = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25s/r25s_heldout_eval_report.json");
  const r25sAnalysis = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25t/r25t_r25s_analysis.json");
  const r25sBreakdown = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25t/r25t_r25s_heldout_breakdown.json");
  const r25tComparison = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25t/r25t_r25p_r25s_generalization.json");
  const forbiddenPhase4Claims = await findForbiddenPhase4Claims();

  const reviewedPilotRuns = [
    r25mRun?.ok && r25mRun?.small_pilot_training_ran === true,
    r25pRun?.ok && r25pRun?.small_pilot_training_ran === true,
    r25sRun?.ok && r25sRun?.small_pilot_training_ran === true
  ].filter(Boolean).length;
  const thresholds = criteria?.gap_thresholds || {};
  const trainDevGap = Number(r25sAnalysis?.train_dev_gap);
  const trainHeldoutGap = Number(r25sAnalysis?.train_heldout_gap);
  const criteriaPassedWithoutApproval = Boolean(
    criteria &&
    criteria.phase4_approved === false &&
    reviewedPilotRuns >= Number(criteria.minimum_reviewed_bounded_pilot_runs || 0) &&
    r25sEval?.checkpoint_validates === true &&
    r25sHeldout?.heldout_loss_finite === true &&
    r25sHeldout?.train_dev_heldout_overlap === false &&
    finite(r25sHeldout?.heldout_loss) &&
    finite(trainDevGap) &&
    trainDevGap <= Number(thresholds.latest_pilot_max_train_dev_gap ?? Infinity) &&
    finite(trainHeldoutGap) &&
    trainHeldoutGap <= Number(thresholds.latest_pilot_max_train_heldout_gap ?? Infinity) &&
    r25sBreakdown?.ok === true &&
    r25tComparison?.ok === true
  );

  const missingCriteria = [];
  if (!criteria) missingCriteria.push("phase3_exit_criteria_json");
  if (reviewedPilotRuns < Number(criteria?.minimum_reviewed_bounded_pilot_runs || 0)) missingCriteria.push("minimum_reviewed_bounded_pilot_runs");
  if (r25sEval?.checkpoint_validates !== true) missingCriteria.push("replayable_checkpoint_required");
  if (r25sHeldout?.heldout_loss_finite !== true) missingCriteria.push("finite_heldout_loss_required");
  if (!finite(trainDevGap) || trainDevGap > Number(thresholds.latest_pilot_max_train_dev_gap ?? Infinity)) missingCriteria.push("train_dev_gap_under_threshold");
  if (!finite(trainHeldoutGap) || trainHeldoutGap > Number(thresholds.latest_pilot_max_train_heldout_gap ?? Infinity)) missingCriteria.push("train_heldout_gap_under_threshold");
  if (r25sBreakdown?.ok !== true) missingCriteria.push("weak_bucket_breakdown_reviewed");
  if (r25tComparison?.ok !== true) missingCriteria.push("r25p_vs_r25s_generalization_compared");
  missingCriteria.push("fresh_reviewer_phase4_approval");

  const report = {
    ok: forbiddenPhase4Claims.length === 0,
    phase4_approved: false,
    ready: false,
    criteria_passed_without_reviewer_approval: criteriaPassedWithoutApproval,
    reviewed_bounded_pilot_runs: reviewedPilotRuns,
    latest_pilot: {
      run_id: r25sRun?.run_id || null,
      replayable_checkpoint_valid: r25sEval?.checkpoint_validates === true,
      heldout_loss: finite(r25sHeldout?.heldout_loss) ? r25sHeldout.heldout_loss : null,
      train_dev_gap: finite(trainDevGap) ? trainDevGap : null,
      train_heldout_gap: finite(trainHeldoutGap) ? trainHeldoutGap : null
    },
    missing_criteria: missingCriteria,
    blocking_risks: [
      "phase_4 scaled training is not approved",
      "reviewer approval is required even if phase_3 criteria are structurally satisfied",
      "static release admission has not started",
      "product training progress remains 0"
    ],
    reviewer_approval_required: true,
    forbidden_phase4_claims: forbiddenPhase4Claims,
    notes: [
      "This check is allowed to pass while reporting not ready and not approved.",
      "It fails only if active docs or scripts claim phase_4 is approved, started, or product/release-bound."
    ]
  };
  await writeJson(OUTPUT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
