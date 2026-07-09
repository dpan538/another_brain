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

test("Vercel build metadata does not create false external storage failures", async () => {
  const prepare = await readFile(new URL("../../scripts/prepare_vercel_static_build.mjs", import.meta.url), "utf8");
  const gate = await readFile(new URL("../../scripts/check_vercel_static_build.mjs", import.meta.url), "utf8");

  assert.ok(prepare.includes("deploymentIdAvailable"));
  assert.equal(prepare.includes('deploymentId: "${cleanString(deploymentId)}"'), false);
  assert.ok(gate.includes("\\bKV\\b"));
  assert.equal(gate.includes("AI Gateway|KV|Postgres"), false);
});

test("answer q4 generation is no longer capped to the one-token mount smoke or eight-token worker draft", async () => {
  const q4Worker = await readFile(new URL("../../web/another_brain_chat/q4_worker_runtime.js", import.meta.url), "utf8");
  const browserRuntime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  const selfCheckWorker = await readFile(new URL("../../web/another_brain_chat/self_check_worker.js", import.meta.url), "utf8");
  const runtimeWorker = await readFile(new URL("../../web/another_brain_chat/runtime_worker.js", import.meta.url), "utf8");

  assert.ok(q4Worker.includes("Q4_MOUNT_SMOKE_MAX_TOKENS = 1"));
  assert.ok(q4Worker.includes("Q4_ANSWER_MAX_TOKENS = 32"));
  assert.ok(q4Worker.includes("generation_kind"));
  assert.ok(q4Worker.includes("quality_unassessed_q4_answer_generation"));
  assert.ok(q4Worker.includes("requested_max_tokens"));
  assert.ok(q4Worker.includes("effective_max_tokens"));
  assert.ok(!q4Worker.includes("Math.min(Number(options.maxTokens || 4), 8)"));
  assert.ok(selfCheckWorker.includes('generationKind: "mount_smoke"'));
  assert.ok(browserRuntime.includes("self_check_worker.js?v=r28livefix0-live-q4-mount"));
  assert.ok(browserRuntime.includes("runtime_worker.js?v=r28livefix0-live-q4-mount"));
  assert.ok(selfCheckWorker.includes("q4_worker_runtime.js?v=r28livefix0-live-q4-mount"));
  assert.ok(runtimeWorker.includes("q4_worker_runtime.js?v=r28livefix0-live-q4-mount"));
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

test("customer Chat surface is short, fixed-screen, and hides engineering diagnostics", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../../web/another_brain_chat/styles.css", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");

  assert.ok(html.includes("efishother.com"));
  assert.ok(html.includes(">efishother<"));
  assert.ok(html.includes("efish 是旧昵称"));
  assert.ok(html.includes("brand-linework"));
  assert.ok(html.includes("chat-signal-strip"));
  assert.ok(html.includes('data-chat-signal="q4"'));
  assert.ok(html.includes("chat-loading-note"));
  assert.ok(html.includes("local memory"));
  assert.ok(html.includes("q4 warmup"));
  assert.ok(html.includes("Chat 端只显示简短回答"));
  assert.ok(html.includes("reasoning-viz"));
  assert.ok(html.includes("模型推理可视化"));
  assert.ok(html.includes("viz-q4-forward"));
  assert.ok(html.includes('class="chat-intro dashboard-only"'));
  assert.ok(html.includes("你好，我是 efishother。直接问就好。"));
  assert.match(html, /id="abort-button"[^>]*hidden/);
  assert.match(html, /id="clear-chat-button"[^>]*hidden/);
  assert.ok(app.includes("customerFacingAnswer"));
  assert.ok(app.includes("customerFacingAnswer(packet)"));
  assert.ok(app.includes("customerEvidenceAnswer"));
  assert.ok(app.includes("loadingNoteForStage"));
  assert.ok(app.includes("renderReasoningViz"));
  assert.ok(app.includes("document.body.dataset.uiMode"));
  assert.ok(app.includes("role === \"user\" ? \"you\" : \"efish\""));
  assert.ok(app.includes("another_brain 只是工程代号"));
  for (const phrase of [
    "死让时间变得有限",
    "意义是在关系、行动和承担后",
    "审美有判断",
    "可被信任的真实",
    "语言不是标签而已",
    "停在证据边界上"
  ]) {
    assert.ok(app.includes(phrase), phrase);
  }
  assert.ok(app.includes("showEngineeringFooter === true"));
  assert.match(app, /appendMessage\("assistant",\s*packet\.final_answer/);
  assert.ok(css.includes("height: 100dvh"));
  assert.ok(css.includes("overflow: hidden"));
  assert.ok(css.includes('body[data-ui-mode="dashboard"]'));
  assert.ok(css.includes("overflow-y: auto"));
  assert.ok(css.includes('width: min(1360px, 100%)'));
  assert.ok(css.includes(".chat-signal-strip"));
  assert.ok(css.includes(".chat-signal-strip div.is-warn"));
  assert.ok(css.includes(".chat-loading-note"));
  assert.ok(css.includes('grid-template-rows: auto minmax(0, 1fr)'));
  assert.ok(css.includes(".reasoning-viz"));
  assert.ok(css.includes(".viz-track"));
  assert.ok(css.includes(".composer-actions [hidden]"));
  assert.ok(css.includes("#send-button"));
  assert.ok(css.includes('grid-template-rows: auto auto minmax(0, 2.5fr) minmax(0, 1fr)'));
  assert.ok(css.includes("position: absolute"));
  assert.ok(css.includes('@media (max-width: 720px)'));
  assert.ok(css.includes(".header-side"));
  assert.ok(css.includes("display: none"));
  assert.equal(/gradient/i.test(css), false);
});

test("static RAG expands safe commonsense philosophy and aesthetic logic without answer-bank fields", async () => {
  const retriever = await readFile(new URL("../../web/another_brain_chat/static_retriever.js", import.meta.url), "utf8");
  const brandPack = JSON.parse(await readFile(new URL("../../web/another_brain/static_rag/brand_cards.json", import.meta.url), "utf8"));
  const brandLiteracyPack = JSON.parse(await readFile(new URL("../../web/another_brain/static_rag/brand_literacy_cards.json", import.meta.url), "utf8"));
  const knowledgePack = JSON.parse(await readFile(new URL("../../web/another_brain/static_rag/knowledge_cards.json", import.meta.url), "utf8"));
  const logicPack = JSON.parse(await readFile(new URL("../../web/another_brain/static_rag/logic_cards.json", import.meta.url), "utf8"));
  const historyPack = JSON.parse(await readFile(new URL("../../web/another_brain/static_rag/history_cards.json", import.meta.url), "utf8"));
  const societyPack = JSON.parse(await readFile(new URL("../../web/another_brain/static_rag/society_cards.json", import.meta.url), "utf8"));
  const serialized = JSON.stringify({ logicPack, brandPack, brandLiteracyPack, knowledgePack, historyPack, societyPack }).toLowerCase();

  assert.ok(retriever.includes("logic_cards.json"));
  assert.ok(retriever.includes("brand_cards.json"));
  assert.ok(retriever.includes("brand_literacy_cards.json"));
  assert.ok(retriever.includes("knowledge_cards.json"));
  assert.ok(retriever.includes("history_cards.json"));
  assert.ok(retriever.includes("society_cards.json"));
  for (const kind of ["brand", "brand_literacy", "commonsense", "philosophy", "logic", "history", "society"]) assert.ok(retriever.includes(`"${kind}"`), kind);
  for (const pack of [logicPack, brandPack, brandLiteracyPack, knowledgePack, historyPack, societyPack]) {
    assert.equal(pack.fixture_policy.answer_bank, false);
    assert.equal(pack.fixture_policy.allowed_for_training, false);
    assert.equal(pack.fixture_policy.private_raw_data, false);
  }
  assert.equal(/"answer"\s*:|"final_answer"\s*:|"answer_text"\s*:/.test(serialized), false);
  assert.ok(logicPack.cards.length >= 12);
  assert.ok(brandPack.cards.length >= 3);
  assert.ok(brandLiteracyPack.cards.length >= 12);
  assert.ok(knowledgePack.cards.length >= 8);
  assert.ok(historyPack.cards.length >= 14);
  assert.ok(societyPack.cards.length >= 10);
  for (const marker of ["question_pack_001", "rows 51-100", "hidden prompt", "chain-of-thought", "data/public_ingestion"]) {
    assert.equal(serialized.includes(marker), false, marker);
  }
  assert.ok(logicPack.cards.some((card) => card.kind === "commonsense" && card.keywords.includes("东升西落")));
  assert.ok(logicPack.cards.some((card) => card.kind === "philosophy" && card.keywords.includes("生与死")));
  assert.ok(logicPack.cards.some((card) => card.kind === "aesthetic" && card.keywords.includes("审美")));
  assert.ok(logicPack.cards.some((card) => card.keywords.includes("证据不足")));
  assert.ok(logicPack.cards.some((card) => card.keywords.includes("关系")));
  assert.ok(logicPack.cards.some((card) => card.keywords.includes("自由")));
  assert.ok(brandPack.cards.some((card) => card.kind === "brand" && card.keywords.includes("efishother.com")));
  assert.ok(brandLiteracyPack.cards.some((card) => card.kind === "brand_literacy" && card.keywords.includes("Apple")));
  assert.ok(brandLiteracyPack.cards.some((card) => card.kind === "brand_literacy" && card.keywords.includes("OpenAI")));
  assert.ok(knowledgePack.cards.some((card) => card.keywords.includes("天空")));
  assert.ok(knowledgePack.cards.some((card) => card.keywords.includes("正义")));
  assert.ok(knowledgePack.cards.some((card) => card.keywords.includes("记忆")));
  assert.ok(historyPack.cards.some((card) => card.kind === "history" && card.keywords.includes("工业革命")));
  assert.ok(historyPack.cards.some((card) => card.kind === "history" && card.keywords.includes("冷战")));
  assert.ok(societyPack.cards.some((card) => card.kind === "society" && card.keywords.includes("房价")));
  assert.ok(societyPack.cards.some((card) => card.kind === "society" && card.keywords.includes("隐私")));
});

test("loading panel exposes unambiguous completed q4 progress instead of skeleton-only pass state", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../../web/another_brain_chat/styles.css", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");

  assert.ok(html.includes("model-loading-summary"));
  assert.ok(html.includes("chat-loading-note"));
  assert.ok(css.includes(".loading-skeleton.is-complete"));
  assert.ok(css.includes('[data-loading-result="blocked"]'));
  for (const expected of [
    "summarizeLoadingProgress",
    "loadingNoteForStage",
    "q4ForwardConfirmed",
    "updateChatSignalStatus",
    "完成 100%",
    "模型前向未确认",
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
