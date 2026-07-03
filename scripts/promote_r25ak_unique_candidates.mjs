#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const APPROVAL_PATH = path.join(ROOT, "training/from_scratch/APPROVE_R25AK_PROMOTE_UNIQUE_REPO_DERIVED_CANDIDATES.json");
const POLICY_PATH = path.join(ROOT, "training/from_scratch/r25ak_promotion_policy.json");
const SOURCE_PATH = path.join(ROOT, "artifacts/training_os/corpus_expansion/r25aj/r25aj_repo_derived_candidate_rows.jsonl");
const OUT_DIR = path.join(ROOT, "artifacts/training_os/corpus_expansion/r25ak");
const REPORT_PATH = path.join(OUT_DIR, "r25ak_promotion_report.json");
const TARGETS = {
  train: path.join(ROOT, "training/llm_corpus/r25ak_repo_derived_train.jsonl"),
  dev: path.join(ROOT, "training/llm_corpus/r25ak_repo_derived_dev.jsonl"),
  heldout: path.join(ROOT, "training/llm_corpus/r25ak_repo_derived_heldout.jsonl")
};
const SPLIT_SOURCE = { train: "train", dev: "dev", heldout: "heldout_candidate" };
const SPLIT_COUNTS = { train: 256, dev: 32, heldout: 32 };
const LANGUAGE_QUOTAS = {
  train: { zh: 180, mixed: 54, en: 22 },
  dev: { zh: 22, mixed: 7, en: 3 },
  heldout: { zh: 22, mixed: 7, en: 3 }
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
  "repair_pair"
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
    .replace(/\br25a[hijk]_[a-z0-9_:-]+\b/gi, " ")
    .replace(/\br25ah_repo_(?:source|derived)_\d+\b/gi, " ")
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

function stringsOf(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => stringsOf(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => stringsOf(item, out));
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

function rejectReason(row, selectedTargets) {
  if (!String(row.sample_id || "").startsWith("r25aj_unique_repo_derived_")) return "not_r25aj_unique_candidate";
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
  if (row.provenance?.external_llm_used !== false) return "external_llm_used_not_false";
  if (row.provenance?.source_review_status !== "tracked_project_source") return "source_not_tracked_project_source";
  if (row.release_checkpoint === true || row.product_model === true) return "release_product_claim";
  const blob = stringsOf(row).join("\n");
  if (/\/Users\/|\/private\/var\/|\/Volumes\//.test(blob)) return "local_absolute_path";
  if (/chain[_-]?of[_-]?thought|hidden_prompt|system_prompt|private_memory|raw_private_data/i.test(blob)) return "forbidden_private_or_prompt_marker";
  if (/(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----)/.test(blob)) return "secret_like_string";
  if (String(row.target_answer).length > 560) return "target_answer_too_long";
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

  let cursor = 0;
  while (selected.length < wanted && cursor < 2000) {
    let advanced = false;
    for (const transformation of TRANSFORMATIONS) {
      for (const language of ["zh", "mixed", "en"]) {
        if ((quotas[language] || 0) <= 0) continue;
        const row = candidates.find((item) =>
          !item.__selected &&
          item.transformation_type === transformation &&
          item.language === language
        );
        if (!row) continue;
        const reason = rejectReason(row, selectedTargets);
        row.__selected = true;
        if (reason) {
          rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
          advanced = true;
          continue;
        }
        selected.push(row);
        selectedTargets.add(normalizeTarget(row.target_answer));
        quotas[language] -= 1;
        advanced = true;
        if (selected.length === wanted) break;
      }
      if (selected.length === wanted) break;
    }
    cursor += 1;
    if (!advanced) break;
  }

  for (const row of candidates) {
    if (selected.length === wanted) break;
    if (row.__selected) continue;
    const reason = rejectReason(row, selectedTargets);
    row.__selected = true;
    if (reason) {
      rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
      continue;
    }
    selected.push(row);
    selectedTargets.add(normalizeTarget(row.target_answer));
  }

  if (selected.length !== wanted) {
    throw new Error(`R25AK could not select ${wanted} ${split} rows; selected ${selected.length}`);
  }
  return selected;
}

function promoteRow(row, split, index) {
  const {
    split_suggestion: _splitSuggestion,
    review_rubric: _reviewRubric,
    __selected: _selected,
    ...rest
  } = row;
  return {
    ...rest,
    sample_id: `r25ak_repo_derived_${split}_${String(index + 1).padStart(3, "0")}`,
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
      promoted_by: "scripts/promote_r25ak_unique_candidates.mjs",
      promotion_phase: "R25AK",
      source_candidate_file: "artifacts/training_os/corpus_expansion/r25aj/r25aj_repo_derived_candidate_rows.jsonl",
      source_candidate_sample_id: row.sample_id
    }
  };
}

function consumeApproval(marker, reason) {
  const consumed = {
    ...marker,
    consumed: true,
    allow_additional_runs: false,
    consumed_by_phase: "R25AK",
    consumed_by_commit: "pending_r25ak_commit",
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
      if (!allTargetsExist) throw new Error("R25AK approval is consumed but target corpus files are missing");
      report.ok = true;
      report.already_promoted = true;
      writeJson(REPORT_PATH, report);
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    if (marker.approved !== true || marker.allow_promote_derived_rows !== true) throw new Error("R25AK approval marker is not active for promotion");
    if (marker.allow_training !== false || marker.allow_tokenizer_dry_run !== false || marker.allow_phase_4_scaled_training !== false) {
      throw new Error("R25AK approval marker contains forbidden training/tokenizer/phase4 approval");
    }
    if (marker.source_candidate_file !== "artifacts/training_os/corpus_expansion/r25aj/r25aj_repo_derived_candidate_rows.jsonl") {
      throw new Error("R25AK approval marker source_candidate_file mismatch");
    }
    if (!fs.existsSync(SOURCE_PATH)) throw new Error("R25AJ candidate artifact is missing");
    if (stagedArtifacts().length) throw new Error("ignored training artifacts are staged");

    const rows = readJsonl(SOURCE_PATH);
    const selectedTargets = new Set();
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
    report.source_unique_target_count = new Set(rows.map((row) => normalizeTarget(row.target_answer))).size;
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
    marker = consumeApproval(marker, "one-shot approval used for r25ak_promote_reviewed_unique_repo_derived_candidates; future runs require a new approval marker for promotion");
    report.approval_status_after = {
      approved: marker.approved === true,
      consumed: marker.consumed === true,
      allow_additional_runs: marker.allow_additional_runs === true
    };
    writeJson(REPORT_PATH, report);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    marker = consumeApproval(marker, "one-shot approval attempted for r25ak_promote_reviewed_unique_repo_derived_candidates and failed safely; future runs require a new approval marker for promotion");
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
