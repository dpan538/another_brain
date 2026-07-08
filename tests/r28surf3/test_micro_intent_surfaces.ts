import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";
import { classifyAnswerRoute, summarizeRouteForProcessTrace } from "../../src/browser_runtime/router/route_classifier.ts";
import { matchR28Surf3Intent } from "../../src/browser_runtime/router/r28surf3_intents.ts";
import { composeR28Surf3Surface, validateR28Surf3Surfaces } from "../../src/browser_runtime/router/r28surf3_surface_composer.ts";
import { buildProcessTraceFromPacket } from "../../src/browser_runtime/trace/process_trace.ts";

const dailyInputs = [
  "你好",
  "hi",
  "在吗",
  "你是谁",
  "你叫什么",
  "你是鳄鱼吗",
  "你是不是鳄鱼",
  "你从哪里来",
  "你能做什么",
  "你是AI吗",
  "证据不足怎么办"
];

test("SURF3 daily micro-intents return short natural answers under 100ms", () => {
  const start = performance.now();
  const outputs = dailyInputs.map((input) => {
    const surfaced = applyAnswerSurfacePolicy({ user_input: input, evidence_status: "none", model_output: "" });
    assert.equal(surfaced.use_model_draft, false, input);
    assert.equal(surfaced.final_answer_source, "router_surface", input);
    assert.equal(surfaced.fallback_reason, "micro_intent_fast_path", input);
    assert.ok(surfaced.final_answer.length <= 36, `${input}: ${surfaced.final_answer}`);
    assert.doesNotMatch(surfaced.final_answer, /通用客服|customer service|按.*过程摘要|本地网页里的另一个大脑界面，会按/);
    return surfaced.final_answer;
  });
  assert.ok(performance.now() - start < 100);
  assert.ok(new Set(outputs).size >= 7);
});

test("SURF3 examples keep requested identity and greeting wording available", () => {
  assert.match(applyAnswerSurfacePolicy({ user_input: "你好", evidence_status: "none" }).final_answer, /你好|在/);
  assert.match(applyAnswerSurfacePolicy({ user_input: "你是谁", evidence_status: "none" }).final_answer, /鳄鱼|本地回答界面|另一个大脑界面/);
  assert.match(applyAnswerSurfacePolicy({ user_input: "你是鳄鱼吗", evidence_status: "none" }).final_answer, /鳄鱼|可以这么叫我/);
  assert.match(applyAnswerSurfacePolicy({ user_input: "证据不足怎么办", evidence_status: "none" }).final_answer, /证据|不硬编|猜测/);
});

test("deterministic variation changes similar daily phrasings without changing style", () => {
  const first = classifyAnswerRoute({ user_input: "你是谁", evidence_status: "none" });
  const repeat = classifyAnswerRoute({ user_input: "你是谁", evidence_status: "none" });
  assert.equal(first.final_answer, repeat.final_answer);
  const variants = ["你是谁", "你叫什么", "介绍一下你自己", "who are you"].map((input) =>
    classifyAnswerRoute({ user_input: input, evidence_status: "none" }).final_answer
  );
  assert.ok(new Set(variants).size >= 2);
});

test("ordinary open questions fall through to q4/RAG route when evidence is present", () => {
  const match = matchR28Surf3Intent("为什么树在城市里会让人安心？");
  assert.equal(match.intent, "unknown_open_question");
  assert.equal(match.route, "");
  const classified = classifyAnswerRoute({
    user_input: "为什么树在城市里会让人安心？",
    evidence_status: "sufficient",
    evidence_packet: { evidence_status: "sufficient", retrieved_evidence: [{ title: "local", text: "城市树荫和心理感受" }] },
    model_output: "树提供阴影和稳定感。"
  });
  assert.equal(classified.use_model_draft, true);
  assert.equal(classified.route, "rag_grounded_answer");
});

test("process trace records SURF3 micro-intent surface schema", () => {
  const routePolicy = classifyAnswerRoute({ user_input: "你叫什么", evidence_status: "none", model_output: "" });
  const summarized = summarizeRouteForProcessTrace(routePolicy, false);
  assert.deepEqual(
    {
      route: summarized.route,
      intent: summarized.intent,
      used_model_draft: summarized.used_model_draft,
      final_answer_source: summarized.final_answer_source,
      reason: summarized.reason
    },
    {
      route: "micro_intent_surface",
      intent: "identity_name",
      used_model_draft: false,
      final_answer_source: "router_surface",
      reason: "fast_daily_question"
    }
  );
  const trace = buildProcessTraceFromPacket({
    input: "你叫什么",
    route_policy: routePolicy,
    answer_route: routePolicy.route,
    runtime_stats: { runtime_mode: "synthetic_fallback", tokens_generated: 0, decode_status: "not_run" },
    evidence_packet: { evidence_status: "none", retrieved_evidence: [] },
    retrieved_evidence: [],
    decoder_draft: "",
    fallback_used: false,
    fallback_reason: routePolicy.fallback_reason,
    use_model_draft: false,
    quality_flags: routePolicy.quality_flags
  });
  assert.equal(trace.router.route, "micro_intent_surface");
  assert.equal(trace.router.intent, "identity_name");
  assert.equal(trace.router.final_answer_source, "router_surface");
  assert.equal(trace.router.reason, "fast_daily_question");
  assert.equal(trace.finalizer.final_answer_source, "router_surface");
});

test("SURF3 surfaces are bounded and not a broad answer bank", () => {
  const report = validateR28Surf3Surfaces();
  assert.equal(report.ok, true);
  assert.equal(report.answer_bank, false);
  assert.equal(report.broad_answer_bank, false);
  assert.equal(report.variant_count <= 32, true);
  const composed = composeR28Surf3Surface({ intent: "capability", input: "你能做什么" });
  assert.equal(composed.answer_bank, false);
  assert.equal(composed.broad_answer_bank, false);
});
