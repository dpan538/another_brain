#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { answerDialogPrompt, createDialogRuntime } from "../dialog_runtime.mjs";
import { ROOT } from "../r18_utils.mjs";
import { CULTURE_CARDS } from "../../web/culture_cards.generated.js";
import {
  buildCultureIndex,
  detectCultureDomain,
  detectCultureQuestionType,
  resolveCultureEntity,
  retrieveCultureCards
} from "../../web/culture_runtime.js";
import { classifyTurnFunction } from "../../web/turn_function_classifier.js";
import { classifyUserTurn } from "../../web/user_turn_classifier.js";
import { selectResponseMode } from "../../web/response_mode_manager.js";

const TRACE_OUT = resolve(ROOT, "artifacts/recovery/direct_answer_trace.json");
const SAMPLE_OUT = resolve(ROOT, "artifacts/recovery/direct_answer_sibling_sample.json");
const DOC_OUT = resolve(ROOT, "docs/direct_answer_root_cause_trace.md");

const PUBLIC_PROMPTS = [
  "罗大佑是谁？",
  "邓丽君是谁？",
  "周杰伦是谁》",
  "和我聊聊王菲",
  "莫言是谁？",
  "莫言有什么代表作吗？"
];

const PUBLIC_ENTITY_IDS = new Set([
  "person.luo_dayou",
  "person.teresa_teng",
  "person.jay_chou",
  "person.faye_wong",
  "person.mo_yan"
]);

const FORBIDDEN_VISIBLE_PATTERNS = [
  "这个音乐对象",
  "这个文学对象",
  "华语流行里的入口",
  "先看声音、时代感、记忆和社会观察",
  "先看",
  "入口",
  "我会按",
  "卡片",
  "runtime",
  "graph",
  "不能贴歌词",
  "rural",
  "urban",
  "mandopop",
  "Contemporary Chinese writer"
];

const BAD_PHRASE_SOURCES = [
  {
    phrase: "华语流行里的入口",
    source: "web/dialogic_domain_profiles.js music.overview -> softenEntrySkeleton in web/dialogic_bridge_runtime.js",
    evidence: "Profile overview emits '可以理解为华语流行里的入口：重点在声音、时代感、记忆和社会观察。'; bridge softener rewrites it to '是华语流行里的入口；先看...'."
  },
  {
    phrase: "这个音乐对象",
    source: "web/dialogic_domain_profiles.js music.overview fallback subject",
    evidence: "When extractKnowSubject fails, music.overview uses subject || '这个音乐对象'."
  },
  {
    phrase: "先看声音、时代感、记忆和社会观察",
    source: "web/dialogic_domain_profiles.js music.overview + web/dialogic_bridge_runtime.js softenEntrySkeleton",
    evidence: "Profile axes are serialized as direct prose by the bridge softener."
  },
  {
    phrase: "我明白。这里先不机械反问……",
    source: "web/operation_layer.js answerDeclarationSignal fallback branch",
    evidence: "The literal phrase is emitted by the declaration/reflection branch when a topic-opening turn is not typed as a direct entity operation."
  },
  {
    phrase: "Contemporary Chinese writer…",
    source: "culture card factual_core serialized by web/culture_planner.js answerExplain fallback",
    evidence: "answerExplain returns `${name}：${focus.factual_core}...`; the Mo Yan card factual_core is English."
  },
  {
    phrase: "先看rural",
    source: "web/culture_planner.js answerExplain fallback themes() + LABELS miss",
    evidence: "answerExplain appends `先看${themeText}`; LABELS lacks rural, so raw schema/theme value is visible."
  },
  {
    phrase: "目前卡片覆盖还不完整",
    source: "web/culture_planner.js answerWorksList partial prefix",
    evidence: "answerWorksList sets partial when works.length < 3 and exposes card coverage to users."
  },
  {
    phrase: "不能贴歌词",
    source: "web/culture_planner.js answerWorksList representative branch",
    evidence: "Representative works answer appends a lyric boundary even when the user only asks for works."
  }
];

function clean(value) {
  return String(value || "").trim();
}

function normalizeTerminalPunctuation(value) {
  return clean(value)
    .replace(/[》〉”"'\s]+$/g, "")
    .replace(/[。.!！?？]+$/g, "")
    .trim();
}

function punctuationDiff(input) {
  const normalized = normalizeTerminalPunctuation(input);
  return {
    input,
    normalized,
    changed: input !== normalized,
    terminal_chars: [...input].filter((ch) => /[》〉”"'。.!！?？]/.test(ch))
  };
}

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffleStable(items, seed) {
  const rand = lcg(seed);
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function familyFor(card) {
  const domain = String(card.domain || "");
  if (/music/.test(domain)) return "music";
  if (/literature/.test(domain)) return "literature";
  if (/film|cinema/.test(domain)) return "film";
  if (/art|design|science|technology/.test(domain)) return "art_design_science_technology";
  return "";
}

function selectSiblingSample(seed = 240619) {
  const people = CULTURE_CARDS.filter((card) => card.entity_type === "person" && !PUBLIC_ENTITY_IDS.has(card.id));
  const families = {
    music: [],
    literature: [],
    film: [],
    art_design_science_technology: []
  };
  for (const card of shuffleStable(people, seed)) {
    const family = familyFor(card);
    if (family && families[family].length < 5) families[family].push(card);
  }
  const selected = Object.entries(families).flatMap(([family, cards]) =>
    cards.map((card) => ({
      family,
      id: card.id,
      name: card.names?.[0] || card.id,
      domain: card.domain
    }))
  );
  return { seed, excluded_entity_ids: [...PUBLIC_ENTITY_IDS], selected };
}

function visibleFailures(answer) {
  return FORBIDDEN_VISIBLE_PATTERNS.filter((pattern) => answer.includes(pattern));
}

function cardTypes(cards) {
  return cards.map((card) => ({ id: card.id, type: card.entity_type, domain: card.domain }));
}

function selectedByType(cards, type) {
  return cards.filter((card) => card.entity_type === type).map((card) => card.id);
}

async function tracePrompt(prompt, { fresh = true } = {}) {
  const runtime = createDialogRuntime();
  const state = runtime.dialogState;
  const normalized = punctuationDiff(prompt);
  const userTurn = classifyUserTurn({ query: prompt, session: state });
  const binding = {};
  const turnFunction = classifyTurnFunction({ query: prompt, session: state, userTurn, binding });
  const modeDecision = selectResponseMode({ query: prompt, session: state, trace: { binding, userTurn } });
  const index = buildCultureIndex(CULTURE_CARDS);
  const domainBefore = state.activeDomain || state.lastDomain || state.last_domain || "";
  const selectedDomain = detectCultureDomain(prompt, state);
  const questionType = detectCultureQuestionType(prompt, state);
  const entityCandidates = resolveCultureEntity(prompt, state, index);
  const retrieval = retrieveCultureCards(prompt, state, index);
  const turn = await answerDialogPrompt(prompt, runtime, { withThinkingDelay: false, uiProfile: "mobile" });
  const cards = retrieval.cards || [];
  const answer = turn.answer || "";
  const controller = turn.trace?.conversation_controller || {};
  return {
    prompt,
    fresh_session: fresh,
    normalized_user_text: normalized.normalized,
    punctuation_normalization: normalized,
    detected_named_entities: entityCandidates.map((card) => ({ id: card.id, name: card.names?.[0] || "", type: card.entity_type, domain: card.domain })),
    entity_candidates: entityCandidates.map((card) => card.id),
    selected_entity_id: entityCandidates[0]?.id || "",
    requested_operation: controller.operation || turn.trace?.context_action || "",
    selected_turn_function: turnFunction.turn_function,
    active_domain_before_selection: domainBefore,
    selected_domain: selectedDomain,
    stale_state_values: {
      activeDomain: state.activeDomain || "",
      lastDomain: state.lastDomain || "",
      last_domain: state.last_domain || "",
      last_focus_entity_id: state.last_focus_entity_id || "",
      lastAnswer: state.lastAnswer || ""
    },
    retrieved_card_ids: cards.map((card) => card.id),
    retrieved_card_types: cardTypes(cards),
    selected_person_card: selectedByType(cards, "person")[0] || "",
    selected_work_cards: selectedByType(cards, "work"),
    selected_relation_cards: selectedByType(cards, "relation"),
    answer_plan_source: controller.answer_plan?.plan_id || "",
    final_visible_answer_source: turn.route || "",
    fallback_source: turn.trace?.fallback_firewall?.replacement_policy || "",
    full_transformation_chain: {
      user_turn: userTurn,
      response_mode: modeDecision,
      turn_function: turnFunction,
      culture_detection: {
        domain: selectedDomain,
        question_type: questionType,
        entity_candidates: entityCandidates.map((card) => card.id),
        retrieved_cards: cards.map((card) => card.id)
      },
      controller_trace: controller,
      runtime_trace: turn.trace
    },
    finalizer_checks: turn.trace?.fallback_firewall || controller.finalizer || null,
    exact_final_visible_output: answer,
    hard_invariant_failures: visibleFailures(answer)
  };
}

function classifyRootCause(trace) {
  const answer = trace.exact_final_visible_output;
  const failures = trace.hard_invariant_failures;
  const causes = [];
  if (!trace.selected_entity_id || /^concept\./.test(trace.selected_entity_id)) causes.push("entity_detection");
  if (!/identify|representative|works|ANSWER_CULTURE|culture/.test(trace.requested_operation || "")) causes.push("operation_typing");
  if (/入口|先看|这个音乐对象|这个文学对象|我会按/.test(answer)) causes.push("method_profile_leakage");
  if (/rural|urban|mandopop|Contemporary Chinese writer/.test(answer)) causes.push("language_normalization");
  if (/卡片|coverage|runtime|graph/.test(answer)) causes.push("card_serialization");
  if (/不能贴歌词/.test(answer)) causes.push("fallback_selection");
  if (failures.length) causes.push("answer_source_authority");
  return [...new Set(causes.length ? causes : ["content_planning"])];
}

function rootCauseRows(traces) {
  return traces.map((trace) => {
    const causes = classifyRootCause(trace);
    return {
      prompt: trace.prompt,
      primary_root_cause: causes[0],
      secondary_root_causes: causes.slice(1),
      evidence: trace.exact_final_visible_output,
      affected_files: [
        "web/dialogic_bridge_runtime.js",
        "web/dialogic_domain_profiles.js",
        "web/culture_runtime.js",
        "web/culture_planner.js",
        "web/response_mode_manager.js"
      ],
      why_kb_card_count_did_not_help:
        "The selected answer authority could be a dialogic domain profile, generic planner branch, or raw card serialization path; adding cards does not force explicit entity + operation authority.",
      sibling_entities_affected: true,
      generalized_repair_point:
        "Add a type-driven direct entity operation path that resolves explicit current-turn entity IDs before stale context/profile authority and realizes identity/topic/works answers from cards and relations.",
      prohibited_local_patch:
        "Do not branch on specific names, exact prompts, or expected answer strings."
    };
  });
}

function mdReport({ traces, rootCauses, sample }) {
  const lines = [];
  lines.push("# Direct Answer Root Cause Trace");
  lines.push("");
  lines.push(`Baseline SHA: a17ee68fffc45d22fb7064bbab088afd99e5b42e`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Bad Phrase Sources");
  for (const item of BAD_PHRASE_SOURCES) {
    lines.push(`- ${item.phrase}: ${item.source}. ${item.evidence}`);
  }
  lines.push("");
  lines.push("## Public Regression Trace");
  for (const trace of traces) {
    lines.push(`### ${trace.prompt}`);
    lines.push(`- normalized_user_text: ${trace.normalized_user_text}`);
    lines.push(`- selected_entity_id: ${trace.selected_entity_id || "(none)"}`);
    lines.push(`- selected_domain: ${trace.selected_domain}`);
    lines.push(`- question_type: ${trace.full_transformation_chain.culture_detection.question_type}`);
    lines.push(`- requested_operation: ${trace.requested_operation}`);
    lines.push(`- selected_turn_function: ${trace.selected_turn_function}`);
    lines.push(`- retrieved_card_ids: ${trace.retrieved_card_ids.join(", ") || "(none)"}`);
    lines.push(`- final_visible_answer_source: ${trace.final_visible_answer_source}`);
    lines.push(`- exact_final_visible_output: ${trace.exact_final_visible_output}`);
    lines.push(`- hard_invariant_failures: ${trace.hard_invariant_failures.join(", ") || "none"}`);
  }
  lines.push("");
  lines.push("## Root Cause Classification");
  for (const row of rootCauses) {
    lines.push(`### ${row.prompt}`);
    lines.push(`- primary_root_cause: ${row.primary_root_cause}`);
    lines.push(`- secondary_root_causes: ${row.secondary_root_causes.join(", ") || "none"}`);
    lines.push(`- evidence: ${row.evidence}`);
    lines.push(`- affected_files: ${row.affected_files.join(", ")}`);
    lines.push(`- why_the_KB_card_count_did_not_help: ${row.why_kb_card_count_did_not_help}`);
    lines.push(`- sibling_entities_affected: ${row.sibling_entities_affected}`);
    lines.push(`- generalized_repair_point: ${row.generalized_repair_point}`);
    lines.push(`- prohibited_local_patch: ${row.prohibited_local_patch}`);
  }
  lines.push("");
  lines.push("## Frozen Sibling Sample");
  lines.push(`Seed: ${sample.seed}`);
  lines.push(`Selected count: ${sample.selected.length}`);
  for (const item of sample.selected) lines.push(`- ${item.family}: ${item.id} (${item.name})`);
  lines.push("");
  lines.push("## Phase A Status");
  lines.push("Runtime code was not modified before this trace and classification were generated.");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const sample = selectSiblingSample();
  const traces = [];
  for (const prompt of PUBLIC_PROMPTS) traces.push(await tracePrompt(prompt));
  const rootCauses = rootCauseRows(traces);
  const traceReport = {
    generated_at: new Date().toISOString(),
    baseline_sha: "a17ee68fffc45d22fb7064bbab088afd99e5b42e",
    public_prompts: PUBLIC_PROMPTS,
    bad_phrase_sources: BAD_PHRASE_SOURCES,
    traces,
    root_causes: rootCauses
  };
  await mkdir(dirname(TRACE_OUT), { recursive: true });
  await writeFile(TRACE_OUT, `${JSON.stringify(traceReport, null, 2)}\n`, "utf8");
  await writeFile(SAMPLE_OUT, `${JSON.stringify(sample, null, 2)}\n`, "utf8");
  await writeFile(DOC_OUT, mdReport({ traces, rootCauses, sample }), "utf8");
  console.log(JSON.stringify({ trace: TRACE_OUT, sample: SAMPLE_OUT, doc: DOC_OUT, prompts: traces.length, sample_count: sample.selected.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
