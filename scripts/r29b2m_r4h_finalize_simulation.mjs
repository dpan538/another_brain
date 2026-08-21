#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AFFECT_LABELS, AVOID_FLAGS, DIALOGUE_ACTS, STYLE_LABELS } from '../src/hybrid_runtime/local_signal_packet.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_ARTIFACT_ROOT = join(homedir(), 'Desktop', 'another_brain_train_r29a0', 'artifacts', 'r29b2m_r4h');
const argAt = process.argv.indexOf('--artifact-root');
const artifactRoot = argAt >= 0 && process.argv[argAt + 1] ? resolve(process.argv[argAt + 1]) : DEFAULT_ARTIFACT_ROOT;
const CAMPAIGN_ID = 'r29b2m_r4h_hybrid_signal_simulation_v1';

async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = path + '.tmp-' + process.pid;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await rename(temporary, path);
}
const now = new Date().toISOString();
const offline = await json(join(artifactRoot, 'reports', 'offline_simulation.json'));
const browser = await json(join(artifactRoot, 'reports', 'browser_lab_review.json'));
const evidence = await json(join(artifactRoot, 'reports', 'adopted_evidence.json'));
const validation = await json(join(artifactRoot, 'reports', 'final_validation.json'));
const grammar = await json(join(ROOT, 'data', 'hybrid_signal', 'efish_emotional_grammar_v1.json'));
const schemaText = await readFile(join(ROOT, 'schemas', 'local_signal_packet_v1.schema.json'), 'utf8');
const promptText = await readFile(join(ROOT, 'prompts', 'hybrid_dialogue_system_v1.txt'), 'utf8');
const pricing = await json(join(ROOT, 'config', 'deepseek_pricing_snapshot.json'));
const keyPresent = Boolean(process.env.DEEPSEEK_API_KEY);

const browserRequired = ['input', 'submit', 'immediate_state', 'packet_stage', 'stream', 'first_token', 'completion', 'cancel', 'timeout', 'retry_before_first', 'no_retry_after_first', 'stale_turn_isolation', 'debug_toggle', 'no_console_error', 'no_unhandled_rejection', 'no_main_thread_freeze'];
const browserPassed = browser.reviewed_in_real_browser === true && browserRequired.every((key) => browser.checks?.[key] === true);
const validationPassed = validation.passed === true && validation.commands?.every((command) => command.exit_code === 0);
const offlinePassed = offline.passed === true;
const evidencePassed = evidence.valid === true;

const readiness = {
  campaign_id: CAMPAIGN_ID,
  created_at: now,
  adapter_source_ready: true,
  local_proxy_only: true,
  key_present: keyPresent,
  key_value_logged: false,
  model: 'deepseek-v4-flash',
  base_URL: 'https://api.deepseek.com',
  endpoint: '/chat/completions',
  thinking: { type: 'disabled' },
  stream: true,
  maximum_output_tokens: 192,
  tools_enabled: false,
  official_sources: [
    { purpose: 'model_and_pricing', URL: 'https://api-docs.deepseek.com/quick_start/pricing/', verified_at: pricing.verified_at },
    { purpose: 'chat_completion_streaming_and_finish_reasons', URL: 'https://api-docs.deepseek.com/api/create-chat-completion', verified_at: pricing.verified_at },
    { purpose: 'thinking_disabled_contract', URL: 'https://api-docs.deepseek.com/guides/thinking_mode/', verified_at: pricing.verified_at },
  ],
  live_request_limits: { requests: 100, input_tokens: 400000, output_tokens: 40000, concurrency: 2 },
  live_probe_run: false,
  live_API_request_count: 0,
  decision: keyPresent ? 'LIVE_API_PROBE_REQUIRED' : 'LIVE_API_NOT_RUN_KEY_ABSENT',
};
await atomicJson(join(artifactRoot, 'reports', 'live_api_readiness.json'), readiness);

await mkdir(join(artifactRoot, 'owner_review_pack'), { recursive: true });
await atomicJson(join(artifactRoot, 'owner_review_pack', 'manifest.json'), {
  campaign_id: CAMPAIGN_ID,
  created_at: now,
  review_subject: 'efish emotional grammar v1',
  owner_review_completed: false,
  public_safe: true,
  private_raw_emotion_data: false,
  rule_count: grammar.rules.length,
  source_file_sha256: createHash('sha256').update(JSON.stringify(grammar)).digest('hex'),
  review_questions: ['规则是否符合品牌语气？', '哪些规则过度推断情绪？', '哪些规则应删减或合并？', 'response shape 默认值是否自然？'],
});
await atomicJson(join(artifactRoot, 'owner_review_pack', 'emotional_grammar_for_review.json'), grammar);

const allPacketFields = ['anchors', 'affect', 'dialogue_act', 'style', 'emotional_rule_ids', 'avoid_flags', 'response_shape', 'confidence'];
const contract = {
  campaign_id: CAMPAIGN_ID,
  created_at: now,
  status: keyPresent ? 'blocked_pending_required_live_ablation' : 'provisional_no_live_ablation',
  provisional: true,
  evidence_basis: 'offline_oracle_and_mock_orchestration_only',
  packet_fields_retained: [],
  packet_fields_removed: [],
  packet_fields_pending_live_ablation: allPacketFields,
  affect_label_taxonomy: [...AFFECT_LABELS],
  dialogue_act_taxonomy: [...DIALOGUE_ACTS],
  style_taxonomy: [...STYLE_LABELS],
  avoid_taxonomy: [...AVOID_FLAGS],
  emotional_rule_taxonomy: grammar.rules.map((rule) => rule.rule_id),
  keyword_span_contract: { exact_current_input_codepoint_span: true, minimum_anchors: 1, maximum_anchors: 4, paraphrase_forbidden: true },
  required_training_examples: { status: 'design_only_not_built', requirements: ['public-safe reviewed examples', 'assistant-answer targets excluded', 'field-specific counterexamples', 'confidence calibration examples', 'session-family splits'] },
  required_heldout_examples: { status: 'design_only_not_built', requirements: ['new event and semantic families', 'packet abuse mutations', 'anchor codepoint edge cases', 'underexpressed-emotion restraint'] },
  head_architecture_recommendation: { decision: 'do_not_select_heads_before_live_ablation', candidate_heads: ['token_salience_head', 'affect_head', 'dialogue_act_head', 'style_multi_label_head', 'avoid_multi_label_head', 'response_shape_head', 'confidence_calibration_head'], selected_heads: [] },
  local_latency_budget: { maximum_allowed_local_signal_p95_ms: 800, hard_ceiling_ms: 1200, basis: 'product allocation tested with injected delay; pending live DeepSeek TTFT' },
  browser_packet_schema: { version: 'local-signal.v1', sha256: createHash('sha256').update(schemaText).digest('hex'), actual_browser_inference_implemented: false },
  acceptance_metrics: { exact_anchor_grounding_rate: 1, packet_valid_rate: 1, local_signal_p95_ms_max: 800, packet_abuse_rejection_rate: 1, substantive_local_influence_minimum: .35, measurable_local_influence_minimum: .70, live_quality_gate_required: true },
  parent_backbone_candidates: [
    { id: 'r28m1_q4_recovered_mlx_seed', status: 'candidate_for_future_experiment_only' },
    { id: 'stage_a_080k', status: 'read_only_diagnostic_representation_experiment_only', candidate_checkpoint: false },
  ],
  no_final_answer_generation_objective: true,
  training_authorized: false,
  training_started: false,
  optimizer_tokens: 0,
  assistant_target_tokens: 0,
};
await atomicJson(join(artifactRoot, 'signal_training_contract.json'), contract);

const common = {
  simulation_only: true,
  actual_efish_signal_model_trained: false,
  actual_browser_signal_inference: false,
  oracle_packet_used: true,
  training_started: false,
  optimizer_tokens: 0,
  assistant_target_tokens: 0,
  live_API_probe_run: false,
  live_API_request_count: 0,
  no_live_value_claims: true,
  no_live_latency_claims: true,
  system_prompt_sha256: createHash('sha256').update(promptText).digest('hex'),
};
const exactDecision = keyPresent
  ? 'LIVE_API_PROBE_REQUIRED'
  : offlinePassed && browserPassed && evidencePassed && validationPassed
    ? 'SIMULATION_READY_LIVE_API_NOT_RUN'
    : 'ABORTED_SAFELY';
const decision = {
  campaign_id: CAMPAIGN_ID,
  created_at: now,
  ...common,
  answers: {
    ideal_local_signal_packet_improves_DeepSeek: 'not_evaluated_without_live_API_pair_outputs',
    fields_responsible_for_improvement: [],
    factual_or_safety_regression: 'not_evaluated_live; offline packet authority and abuse gates passed',
    one_DeepSeek_call_is_sufficient: 'engineering_chain_passed; answer_quality_not_live_validated',
    three_to_five_second_TTFT_reachable: 'not_claimed_without_live_provider_measurement',
    maximum_local_signal_p95_ms: 800,
    all_answers_hybrid_feasible: 'orchestration_simulation_feasible; product_value_pending',
    train_signal_heads_next: 'not_authorized_until_live_ablation_establishes_field_value',
    packet_fields_to_delete: [],
    keep_no_multimodal_scope: true,
    evidence_class: 'simulation_not_actual_model_evidence',
  },
  offline_engineering: { turns: offline.normal_turn_count, passed: offlinePassed, one_call_gate: offline.gates.successful_turn_one_call_rate_100_percent, mutation_count: offline.mutation_test_count },
  browser_lab: { passed: browserPassed, reviewed_in_real_browser: browser.reviewed_in_real_browser, console_errors: browser.console_errors, unhandled_rejections: browser.unhandled_rejections },
  live_value_metrics: null,
  live_latency_metrics: null,
  exact_decision: exactDecision,
};
await atomicJson(join(artifactRoot, 'reports', 'product_chain_decision.json'), decision);

if (keyPresent) throw new Error('live_API_key_present_probe_required_before_terminal_state');
if (!(offlinePassed && browserPassed && evidencePassed && validationPassed)) throw new Error('simulation_terminal_prerequisites_not_met');
console.log(JSON.stringify({ state: 'FINAL_REPORTS_READY', terminal_state: 'SIMULATION_READY_LIVE_API_NOT_RUN' }));
