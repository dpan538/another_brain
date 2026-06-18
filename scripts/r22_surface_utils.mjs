import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";

export const SURFACE_PATTERNS = [
  { id: "can_enter_from", regex: /可以从.{0,32}进入/g, severity: "suspicious" },
  { id: "focus_is", regex: /重点在于/g, severity: "suspicious" },
  { id: "this_reflects", regex: /这体现了/g, severity: "suspicious" },
  { id: "cross_media_association", regex: /跨媒介关联/g, severity: "suspicious" },
  { id: "essentially", regex: /本质上/g, severity: "suspicious" },
  { id: "complex_relation", regex: /复杂关系/g, severity: "suspicious" },
  { id: "you_can_continue_ask", regex: /你可以继续问|可以继续问/g, severity: "hard_in_active_non_question" },
  { id: "another_angle", regex: /从另一个角度/g, severity: "suspicious" },
  { id: "deeper_level", regex: /更深层次/g, severity: "suspicious" },
  { id: "this_is_a_kind", regex: /这是一种/g, severity: "suspicious" },
  { id: "core_is", regex: /核心在于/g, severity: "suspicious" },
  { id: "not_simple_but", regex: /不是简单的.{0,24}而是/g, severity: "suspicious" },
  { id: "triggered_projection", regex: /触发了.{0,18}(情感)?投射/g, severity: "suspicious" },
  { id: "deeper_question_is", regex: /更深的问题是/g, severity: "suspicious" },
  { id: "i_caught_it", regex: /我接住了|我接住这个|我接住这/g, severity: "hard_on_compliment" },
  { id: "generic_thanks", regex: /谢谢你的认可/g, severity: "hard_on_compliment" },
  { id: "continue_effort", regex: /我会继续努力/g, severity: "hard_on_compliment" },
  { id: "as_a", regex: /作为一个/g, severity: "suspicious" },
  { id: "cannot_really", regex: /我无法真正/g, severity: "suspicious" },
  { id: "beyond_but_you_can", regex: /这超出了我的能力，但你可以/g, severity: "suspicious" }
];

export const SURFACE_SYNONYM_SKELETONS = [
  {
    id: "focus_synonym_skeleton",
    regex: /(重点|关键|核心|要点|厉害处|真正重要的地方)(在于|是|其实是)/g,
    severity: "suspicious"
  },
  {
    id: "domain_profile_entry_skeleton",
    regex: /(可以|能够|适合)?从.{1,24}(进入|入手|开始|切入)/g,
    severity: "suspicious"
  },
  {
    id: "abstract_not_x_but_y_skeleton",
    regex: /不(只是|是|单是|简单是).{1,28}(而是|更是|真正是)/g,
    severity: "suspicious"
  },
  {
    id: "announced_bridge_skeleton",
    regex: /(这|它)(体现|说明|呈现|构成|形成).{0,28}(关系|关联|结构|维度|桥接)/g,
    severity: "suspicious"
  },
  {
    id: "praise_thanks_skeleton",
    regex: /(谢谢|感谢).{0,12}(认可|喜欢|夸奖|鼓励)/g,
    severity: "hard_on_compliment"
  }
];

export const NATURALNESS_TURN_FUNCTIONS = new Set([
  "analogy_statement",
  "affective_disclosure",
  "compliment",
  "confirmation",
  "evaluation_request",
  "deepening_invitation",
  "boundary_clarification",
  "identity_probe",
  "reflection",
  "declaration_with_signal"
]);

export const NON_QUESTION_TURN_FUNCTIONS = new Set([
  "analogy_statement",
  "affective_disclosure",
  "compliment",
  "reflection",
  "declaration_with_signal"
]);

export const PROXY_KEYWORDS = [
  "接住",
  "更深",
  "关系",
  "体现",
  "本质",
  "复杂",
  "桥",
  "过渡",
  "共同",
  "结构",
  "维度"
];

export function zhChars(text) {
  return [...String(text || "")].filter((char) => /[\u4e00-\u9fff]/.test(char)).length;
}

export async function listFiles(dir, predicate = () => true) {
  const out = [];
  async function walk(path) {
    let info;
    try {
      info = await stat(path);
    } catch {
      return;
    }
    if (info.isDirectory()) {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        await walk(join(path, entry.name));
      }
      return;
    }
    if (predicate(path)) out.push(path);
  }
  await walk(resolve(ROOT, dir));
  return out;
}

export function parseMaybeJsonLines(text, file = "") {
  const ext = extname(file);
  if (ext === ".json") return [JSON.parse(text)];
  if (ext === ".jsonl") {
    return text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  }
  return [];
}

export function flattenStrings(value, path = [], out = []) {
  if (typeof value === "string") {
    out.push({ path, text: value });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenStrings(item, [...path, String(index)], out));
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) flattenStrings(nested, [...path, key], out);
  }
  return out;
}

export function isCandidateAnswerPath(path = []) {
  const key = path[path.length - 1] || "";
  if (/^(answer|output|final_answer|raw_answer|reply|assistant)$/.test(key)) return true;
  if (/better_answer_shape/.test(key)) return true;
  return false;
}

export function isBadExamplePath(path = []) {
  return path.some((key) => /bad_answer|forbidden|must_not|unacceptable|notes|reason|rubric/.test(key));
}

export function pathHint(path = []) {
  return path.join(".");
}

export function classifySurfaceHits(text) {
  const hits = [];
  for (const pattern of [...SURFACE_PATTERNS, ...SURFACE_SYNONYM_SKELETONS]) {
    const matches = [...String(text || "").matchAll(pattern.regex)].map((match) => match[0]);
    if (matches.length) hits.push({ id: pattern.id, severity: pattern.severity, matches });
  }
  return hits;
}

export function provenanceForString({ file = "", path = [] } = {}) {
  const normalized = relativeRoot(file);
  const hint = pathHint(path);
  const isCurrentRuntimeArtifact =
    /^artifacts\/training_os\/(?:culture_awareness_report|r10_culture_report|r11_reasoning_report|r13_coverage_report|p0_lobotomy_report|p0_response_mode_report|non_question_affordance_report|r19_dialogue_boundary_report|r19_contextual_binding_report|r20_endpoint_readiness_report|r21_mixed_dialogic_report|dialog_probe_report|production_smoke_canary_report|casepack_eval_report|model_inference_report)\.json$/.test(
      normalized
    );
  if (/better_answer_shape/.test(hint)) return "fixture_better_shape";
  if (/bad_answer|bad_answer_examples/.test(hint)) return "fixture_bad_answer";
  if (/shadow_candidate|candidate_answer|surface_candidate/.test(hint)) return "shadow_candidate_output";
  if (/transcripts\.\d+\.answer|turns\.\d+\.answer|current_answer|final_answer|raw_answer|output|reply/.test(hint)) {
    if (isCurrentRuntimeArtifact) return "current_runtime_output";
    if (/^artifacts\/training_os\/r22_/.test(normalized)) return "current_runtime_output";
    if (/^artifacts\/training_os\//.test(normalized)) return "historical_artifact";
    if (/^evals\//.test(normalized)) return "eval_expected_answer";
  }
  if (/^(?:results|local_outputs|samples|protected|allowedUnknown)\.\d+\.answer$/.test(hint) && isCurrentRuntimeArtifact) {
    return "current_runtime_output";
  }
  if (/expected|must_include|must_not_include|answer_shape|rubric/.test(hint) && /^evals\//.test(normalized)) return "eval_expected_answer";
  if (/^docs\//.test(normalized)) return "documentation_or_contract";
  if (/^artifacts\/training_os\//.test(normalized)) return "historical_artifact";
  if (/^evals\//.test(normalized)) return "eval_expected_answer";
  return "unknown";
}

export function turnFunctionFromObject(value = {}) {
  return (
    value.turn_function ||
    value.expected_turn_function ||
    value.trace?.conversation_controller?.turn_function ||
    value.conversation_controller?.turn_function ||
    value.expected?.turn_function ||
    ""
  );
}

export function responseModeFromObject(value = {}) {
  return (
    value.response_mode ||
    value.expected_response_mode ||
    value.trace?.conversation_controller?.response_mode ||
    value.conversation_controller?.response_mode ||
    value.expected?.response_mode ||
    ""
  );
}

export function relativeRoot(path) {
  return relative(ROOT, path);
}

export function makeExecutionReport({
  behaviorOk = true,
  auditOnly = true,
  blocking = false,
  baselineCommit = "",
  evaluatedCommit = "",
  extra = {}
} = {}) {
  return {
    execution_ok: true,
    behavior_ok: Boolean(behaviorOk),
    audit_only: Boolean(auditOnly),
    blocking: Boolean(blocking),
    baseline_commit: baselineCommit || "unknown",
    evaluated_commit: evaluatedCommit || "unknown",
    generated_at: new Date().toISOString(),
    ...extra
  };
}
