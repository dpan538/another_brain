#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const APPROVAL_PATH = path.join(ROOT, "training/from_scratch/APPROVE_R25AM_SECOND_CHINESE_CORPUS_EXPANSION.json");
const POLICY_PATH = path.join(ROOT, "training/from_scratch/r25am_second_chinese_corpus_expansion_policy.json");
const SOURCE_PATH = path.join(ROOT, "artifacts/training_os/corpus_expansion/r25am/r25am_candidate_rows.jsonl");
const VALIDATION_PATH = path.join(ROOT, "artifacts/training_os/corpus_expansion/r25am/r25am_candidate_validation_report.json");
const OUT_DIR = path.join(ROOT, "artifacts/training_os/corpus_expansion/r25am");
const REPORT_PATH = path.join(OUT_DIR, "r25am_promotion_report.json");
const CORPUS_DIR = path.join(ROOT, "training/llm_corpus");
const TARGETS = {
  train: path.join(ROOT, "training/llm_corpus/r25am_repo_derived_train.jsonl"),
  dev: path.join(ROOT, "training/llm_corpus/r25am_repo_derived_dev.jsonl"),
  heldout: path.join(ROOT, "training/llm_corpus/r25am_repo_derived_heldout.jsonl")
};
const SPLIT_SOURCE = { train: "train", dev: "dev", heldout: "heldout_candidate" };
const SPLIT_COUNTS = { train: 768, dev: 96, heldout: 96 };
const LANGUAGE_QUOTAS = {
  train: { zh: 672, mixed: 96, en: 0 },
  dev: { zh: 48, mixed: 48, en: 0 },
  heldout: { zh: 52, mixed: 0, en: 44 }
};
const TRANSFORMATIONS = [
  "project_continuation",
  "repair_after_weak_answer",
  "local_first_static_browser_reasoning",
  "tool_status_honesty",
  "bounded_judgment",
  "style_preference",
  "Chinese_explanation",
  "Chinese_rewrite_or_compression",
  "preference_pair",
  "repair_pair",
  "Chinese_follow_up_binding",
  "Chinese_project_decision"
];

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${rel(filePath)}:${index + 1}: ${error.message}`);
      }
    });
}

function writeJsonl(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

function normalizeTarget(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[，。！？；：、]/g, " ")
    .replace(/[,.!?;:()[\]{}<>《》「」『』"']/g, " ")
    .replace(/\br25a[hijklm]_[a-z0-9_:-]+\b/gi, " ")
    .replace(/\bsource[_ -]?\d+\b/gi, " ")
    .replace(/\bsample[_ -]?\d+\b/gi, " ")
    .replace(/(?:^|\s)(?:第)?\d+(?:条|项|段|行)(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countBy(items, fn) {
  const counts = {};
  for (const item of items) {
    const key = fn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function flattenTargets(rows) {
  return countBy(rows.flatMap((row) => row.personal_color_targets || []), (target) => target);
}

function collectStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, out));
  return out;
}

function sourceAllowed(row) {
  return (row.source_file_refs || []).every((ref) =>
    !ref.startsWith("evals/") &&
    !ref.startsWith("data/public_ingestion/") &&
    !ref.startsWith("private_sources/") &&
    !ref.startsWith("artifacts/") &&
    !/^[^/]+\.(pdf|PDF|docx|DOCX|doc|DOC)$/.test(ref)
  );
}

function existingTargetSet() {
  const targets = new Set();
  const files = fs.readdirSync(CORPUS_DIR)
    .filter((file) => file.endsWith(".jsonl"))
    .filter((file) => !file.startsWith("r25am_repo_derived_"));
  for (const file of files) {
    for (const row of readJsonl(path.join(CORPUS_DIR, file))) {
      const normalized = normalizeTarget(row.target_answer);
      if (normalized) targets.add(normalized);
    }
  }
  return targets;
}

function rejectReason(row, selectedTargets) {
  if (!String(row.sample_id || "").startsWith("r25am_second_chinese_")) return "not_r25am_candidate";
  if (row.training_allowed !== false) return "training_allowed_true_before_promotion";
  if (row.public_commit_allowed !== false) return "public_commit_allowed_true_before_promotion";
  if (row.review_status !== "candidate_unreviewed") return "review_status_not_candidate_unreviewed";
  if (row.contains_private_data !== false) return "contains_private_data_true_or_unknown";
  if (!["zh", "mixed", "en"].includes(row.language)) return "invalid_language";
  if (!TRANSFORMATIONS.includes(row.transformation_type)) return "invalid_transformation_type";
  if (!sourceAllowed(row)) return "forbidden_source_reference";
  if (!row.target_answer || !String(row.target_answer).trim()) return "target_answer_empty";
  const normalized = normalizeTarget(row.target_answer);
  if (!normalized) return "target_answer_empty_after_normalization";
  if (selectedTargets.has(normalized)) return "duplicate_normalized_target_answer";
  if (row.provenance?.source_type !== "repo_derived") return "invalid_source_type";
  if (row.provenance?.generator !== "scripts/generate_r25am_second_chinese_candidates.mjs") return "invalid_generator";
  if (row.provenance?.external_llm_used !== false) return "external_llm_used_not_false";
  if (row.provenance?.source_review_status !== "tracked_project_source") return "source_not_tracked_project_source";
  if (row.release_checkpoint === true || row.product_model === true || row.phase_4_scaled_training === true) return "release_product_or_phase4_claim";
  const blob = collectStrings(row).join("\n");
  if (/\/Users\/|\/private\/var\/|\/Volumes\//.test(blob)) return "local_absolute_path";
  if (/chain[_-]?of[_-]?thought|hidden_prompt|system_prompt|private_memory|raw_private_data/i.test(blob)) return "forbidden_private_or_prompt_marker";
  if (/(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----)/.test(blob)) return "secret_like_string";
  if (/model training ran|training completed|tokenizer dry-run ran|tokenizer dry run ran|phase_4 approved|product model exists/i.test(blob)) return "forbidden_completion_claim";
  if (String(row.target_answer).length > 700) return "target_answer_too_long";
  return null;
}

function chooseRows(rows, split, selectedTargets, rejectionReasons) {
  const wanted = SPLIT_COUNTS[split];
  const quotas = { ...LANGUAGE_QUOTAS[split] };
  const sourceSplit = SPLIT_SOURCE[split];
  const selected = [];
  const candidates = rows
    .filter((row) => row.split_suggestion === sourceSplit)
    .sort((a, b) => {
      const typeDelta = TRANSFORMATIONS.indexOf(a.transformation_type) - TRANSFORMATIONS.indexOf(b.transformation_type);
      if (typeDelta) return typeDelta;
      return String(a.sample_id).localeCompare(String(b.sample_id));
    });

  for (const language of ["zh", "mixed", "en"]) {
    let needed = quotas[language] || 0;
    let cursor = 0;
    while (needed > 0) {
      let advanced = false;
      for (const transformation of TRANSFORMATIONS) {
        const row = candidates.find((item) =>
          !item.__selected &&
          item.language === language &&
          item.transformation_type === transformation
        );
        if (!row) continue;
        row.__selected = true;
        advanced = true;
        const reason = rejectReason(row, selectedTargets);
        if (reason) {
          rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
          continue;
        }
        selected.push(row);
        selectedTargets.add(normalizeTarget(row.target_answer));
        needed -= 1;
        if (needed === 0) break;
      }
      cursor += 1;
      if (!advanced || cursor > candidates.length) break;
    }
    quotas[language] = needed;
  }

  if (selected.length !== wanted) {
    throw new Error(`R25AM could not select ${wanted} ${split} rows; selected ${selected.length}; remaining quotas ${JSON.stringify(quotas)}`);
  }
  return selected;
}

function promoteRow(row, split, index) {
  const {
    split_suggestion: _splitSuggestion,
    review_rubric: _reviewRubric,
    product_model: _productModel,
    release_checkpoint: _releaseCheckpoint,
    phase_4_scaled_training: _phase4,
    __selected: _selected,
    ...rest
  } = row;
  return {
    ...rest,
    sample_id: `r25am_repo_derived_${split}_${String(index + 1).padStart(3, "0")}`,
    split,
    review_status: "reviewed_for_training_corpus",
    contains_private_data: false,
    public_commit_allowed: true,
    training_allowed: true,
    provenance: {
      ...row.provenance,
      source_type: "repo_derived",
      source_review_status: "tracked_project_source",
      license_or_permission: "project-authored repo-tracked source",
      contains_private_data: false,
      external_llm_used: false,
      promoted_by: "scripts/promote_r25am_second_chinese_corpus.mjs",
      promotion_phase: "R25AM",
      source_candidate_file: "artifacts/training_os/corpus_expansion/r25am/r25am_candidate_rows.jsonl",
      source_candidate_sample_id: row.sample_id
    }
  };
}

function consumeApproval(marker, reason) {
  const consumed = {
    ...marker,
    consumed: true,
    allow_additional_runs: false,
    consumed_by_phase: "R25AM",
    consumed_by_commit: "pending_r25am_commit",
    consumed_reason: reason
  };
  writeJson(APPROVAL_PATH, consumed);
  return consumed;
}

function stagedArtifacts() {
  return execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: ROOT, encoding: "utf8" })
    .split(/\r?\n/)
    .filter((file) => file.startsWith("artifacts/training_os/"));
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const policy = readJson(POLICY_PATH);
  let marker = readJson(APPROVAL_PATH);
  const report = {
    ok: false,
    source_candidate_count: 0,
    source_unique_target_count: 0,
    promoted_total: 0,
    promoted_train: 0,
    promoted_dev: 0,
    promoted_heldout: 0,
    language_counts: {},
    transformation_counts: {},
    personal_target_counts: {},
    source_category_counts: {},
    rejected_count: 0,
    rejection_reasons: {},
    training_ran: false,
    tokenizer_dry_run_ran: false,
    phase4_approved: false,
    policy_id: policy.policy_id,
    approval_status_before: {
      approved: marker.approved === true,
      consumed: marker.consumed === true
    }
  };

  try {
    if (marker.consumed === true) {
      const allTargetsExist = Object.values(TARGETS).every((file) => fs.existsSync(file));
      if (!allTargetsExist) throw new Error("R25AM approval is consumed but target corpus files are missing");
      report.ok = true;
      report.already_promoted = true;
      writeJson(REPORT_PATH, report);
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    if (marker.approved !== true || marker.allow_promote_derived_rows !== true || marker.allow_candidate_generation !== true) {
      throw new Error("R25AM approval marker is not active for generation/promotion");
    }
    if (marker.allow_training !== false || marker.allow_tokenizer_dry_run !== false || marker.allow_decoder_training !== false || marker.allow_phase_4_scaled_training !== false) {
      throw new Error("R25AM approval marker contains forbidden training/tokenizer/phase4 approval");
    }
    if (Object.values(TARGETS).some((file) => fs.existsSync(file))) throw new Error("R25AM target corpus file already exists before active promotion");
    if (!fs.existsSync(SOURCE_PATH)) throw new Error("R25AM candidate artifact is missing");
    const validation = fs.existsSync(VALIDATION_PATH) ? readJson(VALIDATION_PATH) : null;
    if (validation?.ok !== true) throw new Error("R25AM candidate validation report is missing or not ok");
    if (stagedArtifacts().length) throw new Error("ignored training artifacts are staged");

    const rows = readJsonl(SOURCE_PATH);
    const selectedTargets = existingTargetSet();
    const sourceUniqueTargets = new Set(rows.map((row) => normalizeTarget(row.target_answer)).filter(Boolean));
    const rejectionReasons = {};
    const selected = {
      train: chooseRows(rows, "train", selectedTargets, rejectionReasons),
      dev: chooseRows(rows, "dev", selectedTargets, rejectionReasons),
      heldout: chooseRows(rows, "heldout", selectedTargets, rejectionReasons)
    };
    const promoted = {
      train: selected.train.map((row, index) => promoteRow(row, "train", index)),
      dev: selected.dev.map((row, index) => promoteRow(row, "dev", index)),
      heldout: selected.heldout.map((row, index) => promoteRow(row, "heldout", index))
    };

    writeJsonl(TARGETS.train, promoted.train);
    writeJsonl(TARGETS.dev, promoted.dev);
    writeJsonl(TARGETS.heldout, promoted.heldout);

    const allPromoted = [...promoted.train, ...promoted.dev, ...promoted.heldout];
    report.ok = true;
    report.source_candidate_count = rows.length;
    report.source_unique_target_count = sourceUniqueTargets.size;
    report.promoted_total = allPromoted.length;
    report.promoted_train = promoted.train.length;
    report.promoted_dev = promoted.dev.length;
    report.promoted_heldout = promoted.heldout.length;
    report.language_counts = countBy(allPromoted, (row) => row.language);
    report.transformation_counts = countBy(allPromoted, (row) => row.transformation_type);
    report.personal_target_counts = flattenTargets(allPromoted);
    report.source_category_counts = countBy(allPromoted, (row) => row.source_category);
    report.rejected_count = Object.values(rejectionReasons).reduce((sum, count) => sum + count, 0);
    report.rejection_reasons = rejectionReasons;
    report.target_corpus_files = Object.values(TARGETS).map(rel);
    marker = consumeApproval(marker, "one-shot approval used for r25am_second_chinese_personal_corpus_expansion; future corpus generation/promotion requires a new approval marker; future runs require a new approval marker");
    report.approval_status_after = {
      approved: marker.approved === true,
      consumed: marker.consumed === true,
      allow_additional_runs: marker.allow_additional_runs === true
    };
    writeJson(REPORT_PATH, report);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    marker = consumeApproval(marker, "one-shot approval attempted for r25am_second_chinese_personal_corpus_expansion and failed safely; future corpus generation/promotion requires a new approval marker; future runs require a new approval marker");
    report.error = error.message;
    report.approval_status_after = {
      approved: marker.approved === true,
      consumed: marker.consumed === true,
      allow_additional_runs: marker.allow_additional_runs === true
    };
    writeJson(REPORT_PATH, report);
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }
}

main();
