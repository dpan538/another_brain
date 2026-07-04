#!/usr/bin/env node
import {
  exists,
  gitLines,
  readJson,
  stagedFiles,
  writeJson
} from "./r26a_project_utils.mjs";

const REQUIRED = [
  "project_structure.r26a.json",
  "training/current/README.md",
  "training/current/corpus_manifest.json",
  "training/current/training_status.json",
  "training/current/source_policy.json",
  "docs/current/README.md",
  "docs/archive/README.md",
  "docs/archive/r24_r25_history/README.md",
  "docs/R26A_PROJECT_FILE_AUDIT_SUMMARY.md",
  "docs/R26A_CANONICAL_DOCS_INDEX.md",
  "docs/R26A_CLEANUP_PLAN.md",
  "docs/R26A_PROJECT_STATUS.md"
];

const BAD_STAGED_RE = /^(artifacts\/|data\/public_ingestion\/|private_sources\/)|\.(pdf|PDF|docx|DOCX|doc|DOC)$/;
const WEIGHT_RE = /\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$/i;

async function main() {
  const failures = [];
  for (const path of REQUIRED) {
    if (!(await exists(path))) failures.push({ code: "missing_required_r26a_file", path });
  }
  const staged = await stagedFiles();
  for (const path of staged) {
    if (BAD_STAGED_RE.test(path)) failures.push({ code: "forbidden_file_staged", path });
    if (/^training\/llm_corpus\//.test(path)) failures.push({ code: "training_llm_corpus_staged", path });
  }
  const trackedWeights = (await gitLines(["ls-files"])).filter((path) => WEIGHT_RE.test(path));
  for (const path of trackedWeights) failures.push({ code: "tracked_model_weight", path });

  const status = await readJson("training/current/training_status.json").catch(() => null);
  if (status?.product_training_progress_percent !== 0) failures.push({ code: "product_training_progress_not_zero" });
  if (status?.formal_decoder_training_progress_percent !== 0) failures.push({ code: "formal_decoder_training_progress_not_zero" });
  if (status?.phase_4_scaled_training_approved !== false) failures.push({ code: "phase4_must_remain_blocked" });

  const plan = await readJson("artifacts/training_os/r26a_cleanup/r26a_cleanup_plan.json").catch(() => null);
  if (plan?.files_deleted !== false || plan?.files_moved !== false || plan?.non_destructive !== true) {
    failures.push({ code: "cleanup_plan_not_non_destructive" });
  }

  const policy = await readJson("project_structure.r26a.json").catch(() => null);
  if (policy?.r26a_non_destructive !== true) failures.push({ code: "structure_policy_not_non_destructive" });

  const report = {
    ok: failures.length === 0,
    failures,
    staged_checked: staged.length,
    active_training_approval_count_expected: 0,
    phase4_approved: false,
    training_ran: false,
    tokenizer_dry_run_ran: false,
    corpus_expansion_ran: false
  };
  await writeJson("artifacts/training_os/r26a_cleanup/r26a_project_structure_check.json", report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
