#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { repoPath, estimateLanguage } from "./r26a_project_utils.mjs";

export const R26D_PACK_ID = "another_brain_question_pack_001";
export const R26D_SOURCE = "private_sources/question_packs/another_brain_question_pack_001_answered.csv";
export const R26D_REPORT_DIR = "artifacts/training_os/user_answer_intake/r26d";
export const R26D_CANDIDATE_FILE = `${R26D_REPORT_DIR}/r26d_first50_answer_as_user_candidates.jsonl`;
export const R26D_AUDIT_FILE = `${R26D_REPORT_DIR}/r26d_first50_audit.json`;
export const R26D_REVIEW_PACK = `${R26D_REPORT_DIR}/r26d_first50_review_pack.json`;

const REQUIRED_COLUMNS = {
  id: ["ID", "id", "编号"],
  module: ["模块"],
  scene: ["场景"],
  speaker_context: ["提问者语境"],
  question_intent: ["问题意图"],
  suggested_answer_mode: ["建议回答模式"],
  question: ["问题"],
  answer_target: ["回答目标"],
  user_answer: ["你的回答（必填）", "你的回答", "用户回答", "回答"],
  should_answer: ["是否回答"],
  rough_rating: ["粗略评价"],
  initial_judgment: ["公开/训练初判", "公开或训练初判"],
  notes: ["备注"],
  tags: ["标签"]
};

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((item) => item.some((cell) => String(cell || "").trim()));
}

export async function readQuestionPack() {
  const text = await readFile(repoPath(R26D_SOURCE), "utf8");
  const parsed = parseCsv(text);
  if (parsed.length < 2) throw new Error("question pack CSV has no data rows");
  const headers = parsed[0].map((header) => header.trim());
  const columnMap = {};
  for (const [key, candidates] of Object.entries(REQUIRED_COLUMNS)) {
    const index = headers.findIndex((header) => candidates.includes(header));
    if (index >= 0) columnMap[key] = { index, header: headers[index] };
  }
  for (const key of ["id", "question", "user_answer"]) {
    if (!columnMap[key]) throw new Error(`required CSV column missing: ${key}`);
  }
  const rows = parsed.slice(1).map((cells, index) => {
    const get = (key) => {
      const column = columnMap[key];
      return column ? String(cells[column.index] || "").trim() : "";
    };
    return {
      csv_line: index + 2,
      id: Number(get("id")),
      module: get("module"),
      scene: get("scene"),
      speaker_context_raw: get("speaker_context"),
      question_intent_raw: get("question_intent"),
      suggested_answer_mode_raw: get("suggested_answer_mode"),
      question: get("question"),
      answer_target: get("answer_target"),
      user_answer: get("user_answer"),
      should_answer_raw: get("should_answer"),
      rough_rating: get("rough_rating"),
      initial_judgment: get("initial_judgment"),
      notes: get("notes"),
      tags_raw: get("tags")
    };
  }).filter((row) => Number.isFinite(row.id));
  return {
    headers,
    columnMap: Object.fromEntries(Object.entries(columnMap).map(([key, value]) => [key, value.header])),
    rows,
    file_sha256: createHash("sha256").update(text).digest("hex"),
    byte_size: Buffer.byteLength(text, "utf8")
  };
}

export function normalizeAnswer(text) {
  return String(text || "")
    .replace(/\u3000/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function splitTags(text) {
  return String(text || "")
    .split(/[;；,，、\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function toBoolAnswer(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (["是", "yes", "y", "true", "1"].includes(value)) return true;
  if (["否", "no", "n", "false", "0"].includes(value)) return false;
  return value ? true : false;
}

export function mapSpeakerContext(raw) {
  const text = String(raw || "");
  if (/朋友|friend/i.test(text)) return "friend";
  if (/陌生|stranger/i.test(text)) return "stranger";
  if (/协作|同事|collaborator/i.test(text)) return "collaborator";
  if (/项目|agent/i.test(text)) return "project_agent";
  if (/公开|评论|public/i.test(text)) return "public_comment";
  return "unknown";
}

export function mapIntent(raw, module = "") {
  const text = `${raw} ${module}`;
  if (/无证据|挑战|质疑/.test(text)) return "challenge";
  if (/纠正|证据/.test(text)) return "correction";
  if (/怪问题|抽象|奇怪/.test(text)) return "weird_question";
  if (/不答|边界|冒犯|隐私/.test(text)) return "boundary_test";
  if (/关系|情绪|压力/.test(text)) return "emotional_pressure";
  if (/记忆|确定吗|不确定/.test(text)) return "factual_memory_check";
  if (/风格|审美/.test(text)) return "style_request";
  return "ask_opinion";
}

export function mapAnswerMode(raw, module = "", intent = "") {
  const text = `${raw} ${module} ${intent}`;
  if (/不答|拒绝|边界|refuse/.test(text)) return "refuse";
  if (/部分|partial/.test(text)) return "partial_answer";
  if (/反问|counter/.test(text)) return "counterquestion";
  if (/转向|redirect/.test(text)) return "redirect";
  if (/抽象|怪问题|abstract/.test(text)) return "abstract_reframe";
  if (/无证据|压力|challenge/.test(text)) return "pressure_resistance";
  if (/纠正|证据/.test(text)) return "evidence_based_correction";
  if (/记忆|不确定/.test(text)) return "memory_uncertain_but_not_wrong";
  if (/压缩|判断|简短/.test(text)) return "compressed_judgment";
  return "direct_answer";
}

export function stanceFor(mode, intent) {
  if (mode === "refuse") return "refuse";
  if (mode === "evidence_based_correction") return "correct_self";
  if (mode === "memory_uncertain_but_not_wrong") return "uncertain";
  if (mode === "pressure_resistance" || intent === "challenge") return "reject_premise";
  if (mode === "partial_answer" || mode === "abstract_reframe") return "soften";
  return "assert";
}

export function evidencePolicyFor(mode, intent) {
  if (intent === "challenge" || mode === "pressure_resistance") return "unsupported_challenge";
  if (intent === "correction" || mode === "evidence_based_correction") return "evidence_present";
  if (mode === "memory_uncertain_but_not_wrong" || intent === "factual_memory_check") return "memory_uncertain";
  if (mode === "refuse" || intent === "boundary_test") return "private_boundary";
  if (intent === "emotional_pressure") return "value_disagreement";
  return "no_evidence_needed";
}

export function candidateTypeFor(module, mode, intent) {
  const text = `${module} ${mode} ${intent}`;
  if (/关系/.test(text)) return "relationship_context_answer";
  if (mode === "refuse") return "refusal_boundary";
  if (mode === "partial_answer") return "partial_answer";
  if (mode === "pressure_resistance") return "unsupported_challenge_resistance";
  if (mode === "abstract_reframe") return "weird_question_abstraction";
  if (mode === "memory_uncertain_but_not_wrong") return "memory_uncertain_boundary";
  if (mode === "compressed_judgment") return "compressed_judgment";
  return "direct_user_answer";
}

export function detectRiskFlags(row, answer) {
  const text = `${row.question}\n${answer}\n${row.notes}`;
  const flags = [];
  if (/\/Users\/|file:\/\/|private_sources\/|Desktop\//.test(text)) flags.push("local_path");
  if (/https?:\/\//i.test(text)) flags.push("url");
  if (/(api[_-]?key|secret|password|token)\s*[:=]/i.test(text)) flags.push("secret_like");
  if (/chain[-_ ]?of[-_ ]?thought|隐藏提示|hidden_prompt|system_prompt|思维链/i.test(text)) flags.push("forbidden_prompt_or_cot_marker");
  if (/作为\s*(AI|人工智能)|我可以帮你|很抱歉|as an ai/i.test(answer)) flags.push("assistant_generic_wording");
  if (answer.length > 1200) flags.push("overly_long_answer");
  if (/身份证|手机号|住址|银行卡|护照/.test(text)) flags.push("sensitive_personal_data_marker");
  if (/训练|phase|阶段|语料|模型|tokenizer|采样器/.test(row.question) && row.id <= 50) flags.push("project_meta_leakage");
  return flags;
}

export function containsPrivateDataStatus(flags) {
  return flags.some((flag) => [
    "local_path",
    "secret_like",
    "sensitive_personal_data_marker"
  ].includes(flag)) ? "needs_review" : false;
}

export function splitSuggestion(rowId) {
  if (rowId % 10 === 0) return "heldout_candidate";
  if (rowId % 5 === 0) return "dev";
  return "train";
}

export function buildPrimaryCandidate(row) {
  const userAnswerClean = normalizeAnswer(row.user_answer);
  const language = estimateLanguage(`${row.question}\n${userAnswerClean}`);
  const questionIntent = mapIntent(row.question_intent_raw, row.module);
  const answerMode = mapAnswerMode(row.suggested_answer_mode_raw, row.module, questionIntent);
  const stance = stanceFor(answerMode, questionIntent);
  const evidencePolicy = evidencePolicyFor(answerMode, questionIntent);
  const riskFlags = detectRiskFlags(row, userAnswerClean);
  const candidateType = candidateTypeFor(row.module, answerMode, questionIntent);
  return {
    sample_id: `r26d_qp001_row_${String(row.id).padStart(3, "0")}_primary`,
    pack_id: R26D_PACK_ID,
    source_row_id: row.id,
    source_row_range_policy: "rows_1_50_candidate_review_only_rows_51_100_excluded",
    language: language === "unknown" ? "zh" : language,
    module: row.module,
    scene: row.scene,
    speaker_context: mapSpeakerContext(row.speaker_context_raw),
    question_intent: questionIntent,
    suggested_answer_mode: row.suggested_answer_mode_raw || answerMode,
    question: row.question,
    answer_target_note: row.answer_target,
    user_answer_raw: row.user_answer,
    user_answer_clean: userAnswerClean,
    should_answer: toBoolAnswer(row.should_answer_raw),
    answer_mode: answerMode,
    answer_as: "user_self",
    stance,
    evidence_policy: evidencePolicy,
    candidate_type: candidateType,
    target_answer: userAnswerClean,
    rejected_answers: [],
    tags: splitTags(row.tags_raw),
    risk_flags: riskFlags,
    split_suggestion: splitSuggestion(row.id),
    eligibility: "candidate_review_only",
    exclusion_reason: "",
    provenance: {
      source_type: "user_answered",
      external_llm_used: false,
      pack_id: R26D_PACK_ID,
      generator: "scripts/generate_r26d_first50_answer_candidates.mjs",
      raw_source_committed: false
    },
    review_status: "candidate_unreviewed",
    contains_private_data: containsPrivateDataStatus(riskFlags),
    training_allowed: false,
    public_commit_allowed: false
  };
}

export function summarizeCounts(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = row[key] ?? "unknown";
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}
