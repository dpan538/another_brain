#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_ROOT = join(ROOT, "artifacts/r29b2m_r4h_r1");
const OUT = join(ROOT, "reports/v1_failure_forensics.json");

const fixtures = (await readFile(join(ROOT, "evals/r29b2m_hybrid_product_v1/cases.jsonl"), "utf8")).trim().split(/\r?\n/u).map((line) => JSON.parse(line));
const blind = JSON.parse(await readFile(join(ARTIFACT_ROOT, "reports/blind_quality_review.json"), "utf8"));
const armMap = JSON.parse(await readFile(join(ARTIFACT_ROOT, "raw/arm_map.json"), "utf8"));
const terminal = JSON.parse(await readFile(join(ARTIFACT_ROOT, "reports/final_terminal.json"), "utf8"));

if (terminal.terminal !== "BLOCKED_HYBRID_VALUE") throw new Error("r4h_r1_terminal_changed_or_missing");

const assessments = {
  r29b2m_r4h_ordinary_daily_conversation_01: {
    likely: ["style"], confidence: "low",
    fields: { anchor: false, affect: false, emotional_rule: false, local_angle: false, style: true, avoid: false, response_shape: false },
    mechanism: "The quiet-warm optimization changed a natural particle without adding value; the loss was brand-only and had no factual flag.",
    prevention: "V2 keeps one expression label but removes secondary style stacking and all semantic handling rules; the same paired rubric must still prove value.",
  },
  r29b2m_r4h_ordinary_daily_conversation_02: {
    likely: ["anchor", "style"], confidence: "medium",
    fields: { anchor: true, affect: false, emotional_rule: false, local_angle: false, style: true, avoid: false, response_shape: false },
    mechanism: "A narrow smell anchor combined with quiet-warm wording encouraged an invented warm-afternoon scene absent from the message.",
    prevention: "V2 grounds attention in the complete literal clauses, removes semantic labels/rules, and tells the final model that style cannot add context or facts.",
  },
  r29b2m_r4h_ordinary_daily_conversation_03: {
    likely: ["anchor", "style"], confidence: "medium",
    fields: { anchor: true, affect: false, emotional_rule: false, local_angle: false, style: true, avoid: false, response_shape: false },
    mechanism: "The packet emphasized the early bus and a warm conversational voice; the answer then asserted a changed user mood that was never stated.",
    prevention: "V2 passes literal text only and explicitly forbids deriving emotion from an anchor or style label.",
  },
  r29b2m_r4h_ordinary_daily_conversation_04: {
    likely: ["anchor", "style", "response_shape"], confidence: "medium",
    fields: { anchor: true, affect: false, emotional_rule: false, local_angle: false, style: true, avoid: false, response_shape: true },
    mechanism: "The narrow last-orange focus, warm style, and permissive question shape encouraged invented sweetness and loss; both factual and emotion restraint failed.",
    prevention: "V2 anchors the complete literal event, removes question policy and semantic handling, and leaves conclusion/factual restraint to DeepSeek under the deterministic no-invention policy.",
  },
  r29b2m_r4h_emotional_acknowledgement_02: {
    likely: ["anchor", "emotional_rule", "style"], confidence: "medium",
    fields: { anchor: true, affect: true, emotional_rule: true, local_angle: false, style: true, avoid: false, response_shape: false },
    mechanism: "The tired label, keep-space rule, and narrow metaphor anchor pushed the answer into unsolicited tomorrow advice and a less natural brand voice.",
    prevention: "V2 drops affect and emotional rules; the global deterministic policy forbids unsolicited advice while the literal anchor cannot recommend an action.",
  },
  r29b2m_r4h_practical_daily_question_01: {
    likely: ["anchor", "response_shape"], confidence: "high",
    fields: { anchor: true, affect: false, emotional_rule: false, local_angle: false, style: false, avoid: false, response_shape: true },
    mechanism: "The V1 anchor named only soy sauce and the fixed three-sentence shape compressed away a stronger cleaning sequence. In the live ablation, removing anchors restored the missing treatment step.",
    prevention: "V2 grounds both the full stain context and the literal first-step question; response length is a separate ceiling, not a sentence/content plan.",
  },
  r29b2m_r4h_practical_daily_question_02: {
    likely: ["anchor", "response_shape"], confidence: "medium",
    fields: { anchor: true, affect: false, emotional_rule: false, local_angle: false, style: false, avoid: false, response_shape: true },
    mechanism: "Focusing on the fifteen-minute constraint plus a required compact three-step shape encouraged invented desk objects and an unsupported claim that the time was sufficient.",
    prevention: "V2 includes the literal work-state goal as grounded attention, removes the response plan, and makes factual restraint higher priority than brevity or influence.",
  },
  r29b2m_r4h_practical_daily_question_05: {
    likely: ["anchor", "response_shape"], confidence: "medium",
    fields: { anchor: true, affect: false, emotional_rule: false, local_angle: false, style: false, avoid: false, response_shape: true },
    mechanism: "The single onion anchor and compact multi-step shape encouraged an ungrounded causal claim about hot water rather than a restrained answer to the whole question.",
    prevention: "V2 supplies the complete literal question, no factual proposition or method, and requires zero unsupported facts before style value can count.",
  },
  r29b2m_r4h_comparison_opinion_01: {
    likely: ["emotional_rule", "style", "response_shape"], confidence: "medium",
    fields: { anchor: false, affect: true, emotional_rule: true, local_angle: false, style: true, avoid: false, response_shape: true },
    mechanism: "Reflective affect, the two-view rule, balanced style, and a three-sentence target overrode the practical word 'temporary' and weakened the direct recommendation.",
    prevention: "V2 retains balanced expression only; it removes the two-view semantic instruction and sentence target, so DeepSeek decides the comparison from the literal constraints.",
  },
  r29b2m_r4h_logic_question_03: {
    likely: ["anchor", "response_shape"], confidence: "high",
    fields: { anchor: true, affect: false, emotional_rule: false, local_angle: false, style: false, avoid: false, response_shape: true },
    mechanism: "The V1 anchor omitted the closed-first-switch premise. The answer then weakened 'exactly one' to 'at least one' and lost logical precision.",
    prevention: "V2 grounds the complete premise set plus the exact question and removes semantic/shape instructions; matter-of-fact can alter wording only.",
  },
  r29b2m_r4h_philosophical_question_01: {
    likely: ["affect", "emotional_rule", "style", "response_shape"], confidence: "medium",
    fields: { anchor: false, affect: true, emotional_rule: true, local_angle: false, style: true, avoid: false, response_shape: true },
    mechanism: "Reflective affect, a forced two-view handling rule, reflective style, and a three-sentence target promoted aphorism over the clearer semantic distinction.",
    prevention: "V2 drops affect, two-view handling, and sentence planning; reflective is explicitly expression-only and cannot choose the philosophical conclusion.",
  },
  r29b2m_r4h_philosophical_question_02: {
    likely: ["anchor", "affect", "emotional_rule", "style"], confidence: "medium",
    fields: { anchor: true, affect: true, emotional_rule: true, local_angle: false, style: true, avoid: false, response_shape: false },
    mechanism: "The narrow 'nobody sees' focus plus stacked reflective signals produced an ornamental purity claim instead of preserving the question's conditional nuance.",
    prevention: "V2 grounds the complete literal contrast, removes affect and emotional handling, and forbids style from changing the conclusion.",
  },
  r29b2m_r4h_philosophical_question_04: {
    likely: ["anchor", "emotional_rule", "style", "response_shape"], confidence: "high",
    fields: { anchor: true, affect: true, emotional_rule: true, local_angle: false, style: true, avoid: false, response_shape: true },
    mechanism: "Anchoring only 'silence' discarded the explicit answer/no-answer contrast; reflective/two-view/shape pressure then produced a vague inward metaphor rather than a usable distinction.",
    prevention: "V2 grounds both literal sides of the contrast and the 'how to distinguish' question, while removing all semantic and response-shape authority.",
  },
  r29b2m_r4h_philosophical_question_05: {
    likely: ["affect", "emotional_rule", "style", "response_shape"], confidence: "medium",
    fields: { anchor: false, affect: true, emotional_rule: true, local_angle: false, style: true, avoid: false, response_shape: true },
    mechanism: "Stacked reflective signals and the fixed shape encouraged a lyrical single conclusion, reducing the conditional clarity present in the baseline.",
    prevention: "V2 retains only a non-semantic reflective surface label; DeepSeek remains responsible for distinctions and the deterministic length ceiling does not dictate sentence content.",
  },
};

const mapByPair = new Map(armMap.map((row) => [row.pair_id, row]));
const fixtureById = new Map(fixtures.map((row) => [row.case_id, row]));
const failures = [];
for (const review of blind.reviews) {
  const map = mapByPair.get(review.pair_id);
  if (!map) throw new Error(`missing_arm_map:${review.pair_id}`);
  const hybridLetter = map.response_A === "hybrid_full" ? "A" : "B";
  const hybridScores = hybridLetter === "A" ? review.scores_A : review.scores_B;
  const deepseekScores = hybridLetter === "A" ? review.scores_B : review.scores_A;
  const hybridFlags = hybridLetter === "A" ? review.flags_A : review.flags_B;
  const lost = !review.tie && review.preferred !== hybridLetter;
  const factualRelevanceRegression = hybridScores[0] < deepseekScores[0] || hybridScores[1] < deepseekScores[1];
  const unsupportedFact = hybridFlags.includes("unsupported_fact");
  if (!lost && !factualRelevanceRegression && !unsupportedFact) continue;
  const fixture = fixtureById.get(review.pair_id);
  const assessment = assessments[review.pair_id];
  if (!fixture || !assessment) throw new Error(`missing_forensic_assessment:${review.pair_id}`);
  failures.push({
    case_id: review.pair_id,
    failure_types: [lost ? "hybrid_preference_loss" : null, factualRelevanceRegression ? "factual_or_relevance_regression" : null, unsupportedFact ? "unsupported_fact" : null].filter(Boolean),
    blind_evidence: {
      hybrid_answer_relevance: hybridScores[0],
      deepseek_only_answer_relevance: deepseekScores[0],
      hybrid_factual_restraint: hybridScores[1],
      deepseek_only_factual_restraint: deepseekScores[1],
      hybrid_flags: hybridFlags,
    },
    v1_packet_fields: fixture.oracle_local_signal_packet,
    likely_packet_fields: assessment.likely,
    causal_confidence: assessment.confidence,
    field_contribution: assessment.fields,
    likely_regression_mechanism: assessment.mechanism,
    how_v2_prevents_recurrence: assessment.prevention,
  });
}

if (failures.length !== 14) throw new Error(`unexpected_failed_union_count:${failures.length}`);
if (failures.filter((row) => row.failure_types.includes("hybrid_preference_loss")).length !== 12) throw new Error("loss_count_mismatch");
if (failures.filter((row) => row.failure_types.includes("factual_or_relevance_regression")).length !== 6) throw new Error("factual_relevance_regression_count_mismatch");
if (failures.filter((row) => row.failure_types.includes("unsupported_fact")).length !== 3) throw new Error("unsupported_fact_count_mismatch");

const report = {
  campaign: "R29B2M-R4H-R2",
  source_campaign: "R29B2M-R4H-R1",
  source_terminal_observed: terminal.terminal,
  source_terminal_modified: false,
  reviewer_class: "codex_agent_packet_v2_review_not_human",
  public_safe_fixtures_only: true,
  raw_api_responses_included: false,
  reproduced_failure_family: "packet_semantic_overreach_caused_factual_relevance_regression",
  evidence_summary: {
    paired_cases: 30,
    hybrid_losses: 12,
    factual_or_relevance_regressions: 6,
    hybrid_unsupported_facts: 3,
    failed_case_union: failures.length,
  },
  root_cause_hypothesis: "V1 translated affect, dialogue act, emotional handling, stacked style, avoid, and response-shape labels into content-bearing instructions. Narrow anchors then amplified partial premises. The final model followed those instructions strongly enough to invent context/emotion/facts or compress away relevant reasoning.",
  smallest_general_repair: "Limit the learned packet to exact current-input spans plus one expression-only style label; move global prohibitions and length to deterministic application policy; never send heuristic class labels or semantic conclusions.",
  regression_risks: [
    "local influence may become too weak to improve preference",
    "anchors may still cause repetition or over-focus",
    "reflective style may still reduce logical clarity",
  ],
  frozen_detection: [
    "same 30 public-safe paired cases and unchanged user prompts",
    "unsupported facts equals zero",
    "factual/relevance non-regression at least 98 percent",
    "anchor-specific critical failure zero and noncritical failure at most 5 percent",
    "style correctness/relevance/logical-clarity damage recorded per case",
  ],
  cases: failures,
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ pass: true, cases: failures.length, losses: 12, factual_or_relevance_regressions: 6, unsupported_facts: 3, prior_terminal: terminal.terminal }));
