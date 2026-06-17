#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";
import { makeExecutionReport } from "./r22_surface_utils.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/r22_missing_knowledge_primitives_audit.json");

const PRIMITIVE_RULES = [
  {
    turn_functions: ["abstract_comparison"],
    missing_primitive_class: "missing_contrast_operator",
    minimally_sufficient_primitives: ["contrast_card", "domain_specific_verb_set", "answer_shape_card"]
  },
  {
    turn_functions: ["analogy_statement", "cross_domain_comparison"],
    missing_primitive_class: "missing_bridge_operator",
    minimally_sufficient_primitives: ["bridge_card", "relation_card", "negative_card"]
  },
  {
    turn_functions: ["affective_disclosure", "compliment"],
    missing_primitive_class: "missing_answer_shape_primitive",
    minimally_sufficient_primitives: ["answer_shape_card", "style_card", "constraint_card"]
  },
  {
    turn_functions: ["boundary_clarification", "identity_probe"],
    missing_primitive_class: "missing_constraint",
    minimally_sufficient_primitives: ["constraint_card", "negative_card", "uncertainty_card"]
  },
  {
    turn_functions: ["recommendation_request", "list_request"],
    missing_primitive_class: "missing_example",
    minimally_sufficient_primitives: ["example_card", "factual_card", "style_card"]
  }
];

const DOMAIN_SUPPORT = {
  music: ["铺陈", "重复", "变奏", "压缩", "留白", "转调", "咬字", "童年", "罗大佑"],
  literature: ["叙述", "转视角", "留白", "嵌套", "反讽", "延宕", "夏目漱石", "川端康成"],
  film: ["调度", "取景", "剪", "对切", "镜头", "场景"],
  food: ["切", "炖", "腌", "发酵", "调味", "收汁"],
  law: ["适用", "区分", "解释", "约束", "援引", "限缩"],
  care: ["诊断", "照护", "病房", "身体", "倾听"],
  psychology: ["梦", "记忆", "情绪", "精神分析", "自我理解"],
  history: ["史料", "档案", "记忆", "叙事"]
};

function jsonlRows(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function expectedTurnFunction(row = {}, turn = {}) {
  return turn.expected_turn_function || row.expected_turn_function || row.expected?.turn_function || "";
}

function primitiveRuleFor(turnFunction) {
  return PRIMITIVE_RULES.find((rule) => rule.turn_functions.includes(turnFunction)) || {
    missing_primitive_class: "missing_factual_anchor",
    minimally_sufficient_primitives: ["factual_card", "concept_card"]
  };
}

function inferSiblingDomains(text) {
  const domains = [];
  for (const [domain, markers] of Object.entries(DOMAIN_SUPPORT)) {
    if (markers.some((marker) => text.includes(marker))) domains.push(domain);
  }
  if (/音乐|歌|专辑|单曲|流行/.test(text)) domains.push("music");
  if (/文学|小说|诗|作家/.test(text)) domains.push("literature");
  if (/舞台|戏剧|冲突/.test(text)) domains.push("theater");
  if (/法律|判例|规则|正义/.test(text)) domains.push("law");
  if (/饮食|烹饪|味觉|餐桌/.test(text)) domains.push("food");
  if (/电影|镜头|摄影/.test(text)) domains.push("film");
  return [...new Set(domains)];
}

function supportFound({ text, supportText }) {
  const domains = inferSiblingDomains(text);
  const markers = domains.flatMap((domain) => DOMAIN_SUPPORT[domain] || []);
  const found = markers.filter((marker) => supportText.includes(marker));
  return { domains, found, count: found.length };
}

async function loadSupportFiles() {
  const files = [
    "web/culture_cards.generated.js",
    "web/dialogic_domain_profiles.js",
    "web/dialogic_profile_primitives.js",
    "web/dialogic_bridge_runtime.js",
    "web/culture_planner.js",
    "web/turn_function_classifier.js"
  ];
  const chunks = {};
  for (const file of files) {
    try {
      chunks[file] = await readFile(resolve(ROOT, file), "utf8");
    } catch {
      // Optional support file.
    }
  }
  return chunks;
}

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

async function loadObservedFailures() {
  const files = [
    "artifacts/training_os/r22_natural_surface_eval_report.json",
    "artifacts/training_os/r22_shadow_surface_eval_report.json"
  ];
  const out = new Map();
  for (const file of files) {
    try {
      const report = JSON.parse(await readFile(resolve(ROOT, file), "utf8"));
      for (const failure of [...(report.current_runtime_failures || []), ...(report.failures || [])]) {
        if (failure.id) out.set(String(failure.id).replace(/#\d+$/, ""), failure);
      }
    } catch {
      // Reports are optional; absence means the primitive audit cannot claim an observed runtime failure.
    }
  }
  return out;
}

function supportEvidence({ text, supportFiles }) {
  const domains = inferSiblingDomains(text);
  const markers = domains.flatMap((domain) => DOMAIN_SUPPORT[domain] || []);
  const evidence = [];
  for (const [file, body] of Object.entries(supportFiles)) {
    const found = markers.filter((marker) => body.includes(marker));
    if (found.length) evidence.push({ support_file: file, support_span_or_marker: found.slice(0, 10) });
  }
  return {
    domains,
    found: evidence.flatMap((item) => item.support_span_or_marker),
    count: evidence.reduce((sum, item) => sum + item.support_span_or_marker.length, 0),
    evidence
  };
}

function candidatePatchClass({ hasObservedFailure, hasSupport, turnFunction, support, runtimeTraceAvailable = false }) {
  if (!hasObservedFailure) return "insufficient_evidence";
  if (hasSupport) {
    if (["analogy_statement", "affective_disclosure", "compliment"].includes(turnFunction)) return "inspect_surface";
    return runtimeTraceAvailable ? "inspect_composition" : "inspect_control";
  }
  if (support.domains.length >= 2) return "primitive_candidate_requires_review";
  return "insufficient_evidence";
}

async function main() {
  const supportFiles = await loadSupportFiles();
  const observedFailures = await loadObservedFailures();
  const sources = [
    { label: "r21_anchor", rows: [JSON.parse(await readFile(resolve(ROOT, "evals/r21_mixed_dialogic/gold_session.json"), "utf8"))] },
    { label: "r21_blind_siblings", rows: jsonlRows(await readFile(resolve(ROOT, "evals/r21_mixed_dialogic/blind_sibling_sessions.jsonl"), "utf8")) }
  ];
  const audits = [];
  for (const source of sources) {
    for (const row of source.rows) {
      for (const [turnIndex, turn] of (row.turns || []).entries()) {
        const turnFunction = expectedTurnFunction(row, turn);
        if (!turnFunction) continue;
        const rule = primitiveRuleFor(turnFunction);
        const priorContext = (row.turns || [])
          .slice(Math.max(0, turnIndex - 3), turnIndex)
          .map((item) => item.user || "")
          .join(" ");
        const text = [priorContext, turn.user, row.id || ""].join(" ");
        const support = supportEvidence({ text, supportFiles });
        const hasSupport = support.count >= Math.min(2, support.domains.length || 1);
        const observed = observedFailures.get(row.id) || observedFailures.get(`${row.id}#${turnIndex + 1}`) || null;
        const candidate_patch_class = candidatePatchClass({
          hasObservedFailure: Boolean(observed),
          hasSupport,
          turnFunction,
          support,
          runtimeTraceAvailable: Boolean(observed)
        });
        audits.push({
          source: source.label,
          session_id: row.id,
          turn_index: turnIndex + 1,
          user: turn.user,
          turn_function: turnFunction,
          heuristic_only: true,
          confidence: observed ? (hasSupport ? "medium" : "low") : "low",
          evidence_source: observed ? "observed_runtime_failure_plus_lexical_support_scan" : "user_turn_prior_context_lexical_support_scan",
          missing_primitive_class: rule.missing_primitive_class,
          minimally_sufficient_primitives: rule.minimally_sufficient_primitives,
          current_support_found: support.found.slice(0, 12),
          support_evidence: support.evidence.slice(0, 8),
          observed_runtime_failure: observed || null,
          retrieval_trace_available: false,
          composition_trace_available: false,
          candidate_patch_class,
          patch_allowed: "deprecated_use_candidate_patch_class",
          patch_type_allowed: "deprecated_use_candidate_patch_class",
          sibling_domain_support_count: support.domains.length,
          sibling_domains: support.domains,
          negative_examples_required: ["missing_bridge_operator", "missing_constraint", "missing_answer_shape_primitive"].includes(rule.missing_primitive_class),
          exact_answer_card_forbidden: true,
          requires_human_review: candidate_patch_class === "primitive_candidate_requires_review"
        });
      }
    }
  }

  const byPrimitive = {};
  for (const item of audits) byPrimitive[item.missing_primitive_class] = (byPrimitive[item.missing_primitive_class] || 0) + 1;
  const candidates = audits.filter((item) => item.candidate_patch_class === "primitive_candidate_requires_review");
  const byPatchClass = {};
  for (const item of audits) byPatchClass[item.candidate_patch_class] = (byPatchClass[item.candidate_patch_class] || 0) + 1;
  const report = makeExecutionReport({
    behaviorOk: true,
    auditOnly: true,
    evaluatedCommit: gitHead(),
    extra: {
    heuristic_only: true,
    rows_audited: audits.length,
    missing_primitive_class_counts: byPrimitive,
    candidate_patch_class_counts: byPatchClass,
    primitive_candidate_requires_review_count: candidates.length,
    patch_allowed_count: "deprecated_not_a_task_count",
    exact_answer_cards_allowed: false,
    new_entity_specific_branches_allowed: false,
    audits,
    summary: {
      interpretation: "patch_allowed=false means the KB appears to contain reusable support, so the likely issue is retrieval, composition, typed control, or surface realization rather than adding more fact cards.",
      next_step: "Use this report before adding any KB card; add only generalized primitive cards with sibling-domain reuse and negative/constraint coverage."
    }
    }
  });
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    execution_ok: report.execution_ok,
    behavior_ok: report.behavior_ok,
    heuristic_only: report.heuristic_only,
    rows_audited: audits.length,
    primitive_candidate_requires_review_count: candidates.length,
    candidate_patch_class_counts: byPatchClass,
    missing_primitive_class_counts: byPrimitive,
    out: OUT
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
