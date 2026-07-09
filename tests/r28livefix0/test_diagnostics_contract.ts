import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BrowserChatRuntime, verifyDraft } from "../../web/another_brain_chat/browser_runtime.js";
import { buildEvidencePacket } from "../../web/another_brain_chat/static_retriever.js";

test("browser diagnostics exposes branch marker, shard probes, forward status, and merge runtime readiness", async () => {
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  assert.ok(app.includes("window.__anotherBrainDiagnostics"));
  assert.ok(app.includes("branch_marker"));
  assert.ok(app.includes("asset_manifest"));
  assert.ok(app.includes("q4_shards"));
  assert.ok(app.includes("bytes_read"));
  assert.ok(app.includes("q4_forward"));
  assert.ok(app.includes("q4_quality"));
  assert.ok(app.includes("q4_generation"));
  assert.ok(app.includes("mount_runtime_ready"));
  assert.ok(app.includes("merge_runtime_ready"));
  assert.ok(app.includes("capability_diagnosis"));
  assert.ok(app.includes("last_answer_capability_diagnosis"));
  assert.ok(app.includes("q4Shards.length === 5"));
  assert.ok(app.includes("assetsOk && tokenizerOk && forwardOk && q4QualityAccepted"));
});

test("answer q4 generation is no longer capped to the one-token mount smoke or eight-token worker draft", async () => {
  const q4Worker = await readFile(new URL("../../web/another_brain_chat/q4_worker_runtime.js", import.meta.url), "utf8");
  const browserRuntime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  const selfCheckWorker = await readFile(new URL("../../web/another_brain_chat/self_check_worker.js", import.meta.url), "utf8");

  assert.ok(q4Worker.includes("Q4_MOUNT_SMOKE_MAX_TOKENS = 1"));
  assert.ok(q4Worker.includes("Q4_ANSWER_MAX_TOKENS = 32"));
  assert.ok(q4Worker.includes("generation_kind"));
  assert.ok(q4Worker.includes("quality_unassessed_q4_answer_generation"));
  assert.ok(q4Worker.includes("requested_max_tokens"));
  assert.ok(q4Worker.includes("effective_max_tokens"));
  assert.ok(!q4Worker.includes("Math.min(Number(options.maxTokens || 4), 8)"));
  assert.ok(selfCheckWorker.includes('generationKind: "mount_smoke"'));
  assert.ok(browserRuntime.includes('generationKind: openRoute.should_attempt_q4 ? "answer_generation"'));
  assert.ok(browserRuntime.includes("generation_limits"));
});

test("UI and static entries expose R28LIVEFIX0 marker on root and chat routes", async () => {
  for (const path of [
    "../../web/another_brain_chat/index.html",
    "../../web/index.html",
    "../../web/another_brain_chat.html"
  ]) {
    const html = await readFile(new URL(path, import.meta.url), "utf8");
    assert.ok(html.includes("R28LIVEFIX0"), path);
    assert.ok(html.includes("r28livefix0-live-q4-mount"), path);
    assert.ok(html.includes("another-brain-commit-short"), path);
  }
});

test("loading panel exposes unambiguous completed q4 progress instead of skeleton-only pass state", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../../web/another_brain_chat/styles.css", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");

  assert.ok(html.includes("model-loading-summary"));
  assert.ok(css.includes(".loading-skeleton.is-complete"));
  for (const expected of [
    "summarizeLoadingProgress",
    "完成 100%",
    "q4 forward=",
    "tokens=",
    "shards=",
    "加载完成：q4 已可用",
    "loadingSkeleton?.classList.toggle"
  ]) {
    assert.ok(app.includes(expected), expected);
  }
});

test("mojibake q4 drafts are rejected before reaching the chat surface", async () => {
  const app = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  const draft = "� plant buy如果命题P� really•ания。";
  const verifier = verifyDraft(draft, {
    evidence_status: "sufficient",
    retrieved_evidence: [{ title: "local", text: "生与死问题的本地证据", source_id: "local" }]
  });

  assert.equal(verifier.passed, false);
  assert.ok(verifier.failures.includes("mojibake_output"));
  assert.ok(verifier.fallback_recommended);
  assert.ok(app.includes("model_gibberish_fallback"));
  assert.ok(app.includes("mojibake_output"));
});

test("q4 forward with rejected mojibake is quality-blocked and uses visible RAG-grounded fallback", async () => {
  const runtime = new BrowserChatRuntime({
    mode: "static_q4_experimental",
    deliveryConfig: { model_mode: "static_q4_experimental", delivery_mode: "demo_static", rag_mode: "static_profile_pack" }
  });
  runtime.memoryRecords = [{
    source_id: "local-aesthetic-card",
    title: "Local aesthetic boundary",
    text: "Aesthetic judgment should look at structure, restraint, risk, and expressive accuracy instead of flattening taste into a vote.",
    trust_level: "high",
    license_or_origin: "approved_anchor_summary",
    can_answer: true,
    keywords: ["审美", "美学", "美", "aesthetic", "structure", "restraint"],
    metadata: { card_kind: "aesthetic", provenance: "approved_anchor_summary" }
  }];
  runtime.worker = {};
  runtime.isQ4ReadyForGeneration = () => true;
  runtime.load = async () => ({ ok: true });
  runtime.draftWithWorker = async () => {
    runtime.lastRuntimeStats = {
      tokens_generated: 1,
      elapsed_ms: 9,
      total_generation_ms: 9,
      first_token_ms: 3,
      runtime_mode: "static_q4_experimental",
      decoded_text_available: true,
      decode_status: "exact_runtime_tokenizer",
      generation_status: "completed",
      q4_attempted: true,
      generation_started: true,
      generation_finished: true,
      q4_ready_at_request: true,
      assets_verified: true,
      fallback_used: false
    };
    return "� plant buy如果命题P� really•ания。";
  };

  const packet = await runtime.run("你怎么看待美学");

  assert.equal(packet.runtime_stats.tokens_generated, 1);
  assert.equal(packet.process_trace.model.q4_forward_ran, true);
  assert.equal(packet.process_trace.model.q4_quality_accepted, false);
  assert.equal(packet.answer_source_label, "q4_forward_rejected_quality_blocker");
  assert.equal(packet.process_trace.runtime_truth_table.ok, false);
  assert.ok(packet.process_trace.runtime_truth_table.failures.includes("q4_forward_quality_not_admitted"));
  assert.match(packet.final_answer, /q4 草稿未被采纳|不能把这次输出说成模型思考/);
  assert.match(packet.final_answer, /本地检索实际命中/);
  assert.match(packet.final_answer, /Local aesthetic boundary/);
});

test("unrelated high-trust profile cards do not masquerade as relevant local evidence", () => {
  const records = [
    {
      source_id: "identity-card",
      title: "R28RAG3 identity card",
      text: "Identity questions should answer as the local another_brain surface.",
      trust_level: "high",
      can_answer: true,
      keywords: ["identity", "你是谁", "another_brain"],
      metadata: { r28rag3_profile_card: true, card_kind: "identity" }
    },
    {
      source_id: "capability-card",
      title: "R28RAG3 capability card",
      text: "The runtime is useful for boundary judgment and evidence organization.",
      trust_level: "high",
      can_answer: true,
      keywords: ["capability", "能做什么", "evidence"],
      metadata: { r28rag3_profile_card: true, card_kind: "capability" }
    }
  ];
  const packet = buildEvidencePacket("你怎么看到太阳会升起，日落会朝西", {}, records);
  assert.equal(packet.evidence_status, "insufficient");
  assert.equal(packet.retrieved_evidence.length, 0);

  const relevant = buildEvidencePacket("你怎么看待美学", {}, [{
    source_id: "aesthetic-card",
    title: "R28RAG3 aesthetic card",
    text: "Aesthetic judgment should look at structure, restraint, risk, and expressive accuracy.",
    trust_level: "high",
    can_answer: true,
    keywords: ["审美", "美学", "aesthetic"],
    metadata: { r28rag3_profile_card: true, card_kind: "aesthetic" }
  }]);
  assert.equal(relevant.evidence_status, "sufficient");
  assert.equal(relevant.retrieved_evidence.length, 1);
});

test("natural-world open questions do not collapse into abstract value fallback when q4 is not admitted", async () => {
  const runtime = new BrowserChatRuntime({
    mode: "static_q4_experimental",
    deliveryConfig: { model_mode: "static_q4_experimental", delivery_mode: "demo_static", rag_mode: "static_profile_pack" }
  });
  runtime.memoryRecords = [];
  runtime.worker = {};
  runtime.isQ4ReadyForGeneration = () => true;
  runtime.load = async () => ({ ok: true });
  runtime.draftWithWorker = async () => {
    runtime.lastRuntimeStats = {
      tokens_generated: 12,
      elapsed_ms: 30,
      total_generation_ms: 30,
      first_token_ms: 4,
      runtime_mode: "static_q4_experimental",
      decoded_text_available: true,
      decode_status: "exact_runtime_tokenizer",
      generation_status: "completed",
      generation_kind: "answer_generation",
      generation_limits: {
        requested_max_tokens: 24,
        effective_max_tokens: 24,
        worker_token_cap: 32,
        effective_context_length: 96
      },
      q4_attempted: true,
      generation_started: true,
      generation_finished: true,
      q4_ready_at_request: true,
      assets_verified: true,
      fallback_used: false
    };
    return "� plant buy如果命题P� really•ания。";
  };

  const packet = await runtime.run("你怎么看待太阳东升西落的问题");

  assert.equal(packet.process_trace.model.q4_forward_ran, true);
  assert.equal(packet.process_trace.model.q4_quality_accepted, false);
  assert.equal(packet.process_trace.model.generation_kind, "answer_generation");
  assert.equal(packet.process_trace.model.generation_limits.worker_token_cap, 32);
  assert.equal(packet.process_trace.capability_diagnosis.retrieval, "no_relevant_local_evidence");
  assert.match(packet.final_answer, /自然事实解释类问题/);
  assert.doesNotMatch(packet.final_answer, /关系、代价和证据/);
  assert.doesNotMatch(packet.final_answer, /生不是纯粹的开始/);
});
