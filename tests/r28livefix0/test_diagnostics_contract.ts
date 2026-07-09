import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
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

test("license and model docs expose the committed R28M1 q4 package as MIT-scoped public runtime", async () => {
  const readRoot = (path) => readFile(join(process.cwd(), path), "utf8");
  const readme = await readRoot("README.md");
  const license = await readRoot("LICENSE");
  const modelLicense = await readRoot("MODEL_LICENSE.md");
  const modelCard = await readRoot("MODEL_CARD.md");
  const notice = await readRoot("NOTICE");

  assert.ok(license.includes("MIT License"));
  assert.ok(readme.includes("efishother"));
  assert.ok(readme.includes("efishv1"));
  assert.ok(readme.includes("96M-parameter local"));
  assert.ok(readme.includes("Chinese answer model"));
  assert.equal(readme.includes("engineering codename"), false);
  assert.ok(readme.includes("48,267,968"));
  assert.ok(readme.includes("MODEL_LICENSE.md"));
  assert.ok(modelLicense.includes("web/another_brain/model_assets/r28m1/**"));
  assert.ok(modelLicense.includes("raw"));
  assert.ok(modelLicense.includes("checkpoints"));
  assert.ok(modelLicense.includes("data/public_ingestion/**"));
  assert.ok(modelCard.includes("R28M1 q4 Browser Model"));
  assert.ok(modelCard.includes("q4 shard bytes: 48,267,968"));
  assert.ok(modelCard.includes("public-source/public-library"));
  assert.ok(notice.includes("public-source/public-library"));
  assert.ok(notice.includes("without backend inference"));
  assert.equal(/All rights reserved/i.test(license), false);
  assert.equal(/source-available only/i.test(readme + notice), false);
});

test("Vercel build metadata does not create false external storage failures", async () => {
  const prepare = await readFile(new URL("../../scripts/prepare_vercel_static_build.mjs", import.meta.url), "utf8");
  const gate = await readFile(new URL("../../scripts/check_vercel_static_build.mjs", import.meta.url), "utf8");

  assert.ok(prepare.includes("deploymentIdAvailable"));
  assert.equal(prepare.includes('deploymentId: "${cleanString(deploymentId)}"'), false);
  assert.ok(gate.includes("\\bKV\\b"));
  assert.equal(gate.includes("AI Gateway|KV|Postgres"), false);
});

test("Vercel build cache-busts the full chat runtime and q4 worker import chain", async () => {
  const prepare = await readFile(new URL("../../scripts/prepare_vercel_static_build.mjs", import.meta.url), "utf8");

  assert.ok(prepare.includes("patchChatHtmlAssetTokens"));
  assert.ok(prepare.includes("patchChatModuleAssetTokens"));
  for (const expected of [
    "styles.css?v=${versionToken}",
    "app.js?v=${versionToken}",
    "browser_runtime.js?v=${versionToken}",
    "context_bridge.js?v=${versionToken}",
    "runtime_worker.js?v=${versionToken}",
    "self_check_worker.js?v=${versionToken}",
    "q4_worker_runtime.js?v=${versionToken}",
    "chatBrowserRuntimeChanged",
    "chatRuntimeWorkerChanged",
    "chatSelfCheckWorkerChanged"
  ]) {
    assert.ok(prepare.includes(expected), expected);
  }
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
  assert.equal(browserRuntime.includes("self_check_worker.js?v=r28livefix0-live-q4-mount"), false);
  assert.ok(browserRuntime.includes("runtime_worker.js?v=r28livefix0-live-q4-mount"));
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

  assert.ok(html.includes("an other efish"));
  assert.ok(html.includes("<title>an other efish | local answer</title>"));
  assert.ok(html.includes("interactive-widget=resizes-content"));
  assert.ok(html.includes('property="og:title" content="an other efish | local answer"'));
  assert.ok(html.includes('name="twitter:card" content="summary"'));
  assert.equal(html.includes("https://"), false);
  assert.equal(html.includes("http://"), false);
  assert.ok(html.includes('href="/favicon.png"'));
  assert.equal(html.includes("croc-logo"), false);
  assert.equal(html.includes("efishother crocodile logo"), false);
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
  assert.ok(html.includes("你好，我是鳄鱼，也就是另一个 efish。直接问就好。"));
  assert.match(html, /id="abort-button"[^>]*hidden/);
  assert.match(html, /id="clear-chat-button"[^>]*hidden/);
  assert.ok(app.includes("customerFacingAnswer"));
  assert.ok(app.includes("customerFacingAnswer(packet)"));
  assert.ok(app.includes("customerEvidenceAnswer"));
  assert.ok(app.includes("ruleBasedFallbackAnswer"));
  assert.ok(app.includes("我是鳄鱼，也可以理解成另一个 efish"));
  assert.ok(app.includes("loadingNoteForStage"));
  assert.ok(app.includes("renderReasoningViz"));
  assert.ok(app.includes("document.body.dataset.uiMode"));
  assert.ok(app.includes("role === \"user\" ? \"you\" : \"efish\""));
  assert.ok(app.includes("CUSTOMER_ENGINEERING_MARKERS"));
  assert.ok(app.includes("cleanCustomerAnswer"));
  assert.ok(app.includes("containsEngineeringMarker"));
  assert.ok(app.includes("我是鳄鱼，也可以理解成另一个 efish。直接问就好。"));
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
  assert.ok(css.includes('body[data-ui-mode="chat"]'));
  assert.ok(css.includes("background: #dce5de"));
  assert.ok(css.includes("--cover-green: #1f5138"));
  assert.ok(css.includes("--ivory: #eee5c9"));
  assert.ok(css.includes(".app-shell[data-ui-mode=\"chat\"] h1"));
  assert.ok(css.includes("display: none !important"));
  assert.ok(css.includes(".chat-loading-note"));
  assert.ok(css.includes('grid-template-rows: auto minmax(0, 1fr)'));
  assert.ok(css.includes(".reasoning-viz"));
  assert.ok(css.includes(".viz-track"));
  assert.ok(css.includes(".composer-actions [hidden]"));
  assert.ok(css.includes("#send-button"));
  assert.ok(css.includes('grid-template-rows: auto auto minmax(0, 2fr) minmax(0, 0.9fr)'));
  assert.ok(css.includes("R28POSTMERGE10"));
  assert.ok(css.includes("width: fit-content"));
  assert.ok(css.includes("max-width: min(72ch, 76%)"));
  assert.ok(css.includes("grid-template-columns: minmax(0, 1fr) auto"));
  assert.ok(css.includes("position: static"));
  assert.ok(css.includes("R28POSTMERGE12"));
  assert.ok(css.includes("@supports (-webkit-touch-callout: none)"));
  assert.ok(css.includes("position: sticky"));
  assert.ok(css.includes("100svh"));
  assert.ok(css.includes("env(safe-area-inset-bottom)"));
  assert.ok(css.includes("overflow-wrap: anywhere"));
  assert.ok(css.includes("R28POSTMERGE13"));
  assert.ok(css.includes("letter-spacing: 0.035em"));
  assert.ok(css.includes("word-spacing: 0.26em"));
  assert.ok(css.includes('@media (max-width: 720px)'));
  assert.ok(css.includes(".header-side"));
  assert.ok(css.includes("display: none"));
  assert.equal(/gradient/i.test(css), false);
});

test("chat supports enter-to-send and local session context without exposing engineering trace", async () => {
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");

  assert.ok(app.includes('on(input, "keydown"'));
  assert.ok(app.includes('event.key !== "Enter"'));
  assert.ok(app.includes("event.isComposing"));
  assert.ok(app.includes("event.shiftKey"));
  assert.ok(app.includes("form.requestSubmit"));
  assert.ok(app.includes("conversationTurns"));
  assert.ok(app.includes("contextualizeUserInput"));
  assert.ok(app.includes("compactConversationContext"));
  assert.ok(app.includes("rememberConversationTurn"));
  assert.ok(app.includes("repeatedUserQuestionState"));
  assert.ok(app.includes("repeatedQuestionReply"));
  assert.ok(app.includes("personalityFallbackAnswer"));
  assert.ok(app.includes("pickVariant"));
  assert.ok(app.includes("localAnswerVariantSeed"));
  assert.ok(app.includes("你已经问过了"));
  assert.ok(app.includes("别以为我记不住哦"));
  assert.ok(app.includes("没有的话我就去睡觉咯"));
  assert.ok(app.includes("能判断的我会说，不能装懂的地方我也不会硬编"));
  assert.ok(app.includes("少一点说明书味"));
  assert.ok(app.includes("价值判断没有这个代价表"));
  assert.ok(app.includes("isEvaluationTurn"));
  assert.ok(app.includes("evaluationTurnReply"));
  assert.ok(app.includes("isConceptualTimeParadox"));
  assert.ok(app.includes("tooHardSoftRedirect"));
  assert.ok(app.includes("我只是个对话框"));
  assert.ok(app.includes("contextual_input_used"));
  assert.ok(app.includes("铁路方便"));
  assert.ok(app.includes("钟表时间"));
});

test("static RAG expands safe commonsense philosophy and aesthetic logic without answer-bank fields", async () => {
  const retriever = await readFile(new URL("../../web/another_brain_chat/static_retriever.js", import.meta.url), "utf8");
  const brandPack = JSON.parse(await readFile(new URL("../../web/another_brain/static_rag/brand_cards.json", import.meta.url), "utf8"));
  const brandLiteracyPack = JSON.parse(await readFile(new URL("../../web/another_brain/static_rag/brand_literacy_cards.json", import.meta.url), "utf8"));
  const worldRaw = await readFile(new URL("../../web/another_brain/static_rag/world_cards.json", import.meta.url), "utf8");
  const worldPack = JSON.parse(worldRaw);
  const reasoningRaw = await readFile(new URL("../../web/another_brain/static_rag/reasoning_cards.json", import.meta.url), "utf8");
  const reasoningPack = JSON.parse(reasoningRaw);
  const knowledgePack = JSON.parse(await readFile(new URL("../../web/another_brain/static_rag/knowledge_cards.json", import.meta.url), "utf8"));
  const logicPack = JSON.parse(await readFile(new URL("../../web/another_brain/static_rag/logic_cards.json", import.meta.url), "utf8"));
  const historyPack = JSON.parse(await readFile(new URL("../../web/another_brain/static_rag/history_cards.json", import.meta.url), "utf8"));
  const societyPack = JSON.parse(await readFile(new URL("../../web/another_brain/static_rag/society_cards.json", import.meta.url), "utf8"));
  const serialized = JSON.stringify({ logicPack, brandPack, brandLiteracyPack, worldPack, reasoningPack, knowledgePack, historyPack, societyPack }).toLowerCase();

  assert.ok(retriever.includes("logic_cards.json"));
  assert.ok(retriever.includes("brand_cards.json"));
  assert.ok(retriever.includes("brand_literacy_cards.json"));
  assert.ok(retriever.includes("world_cards.json"));
  assert.ok(retriever.includes("reasoning_cards.json"));
  assert.ok(retriever.includes("knowledge_cards.json"));
  assert.ok(retriever.includes("history_cards.json"));
  assert.ok(retriever.includes("society_cards.json"));
  assert.ok(retriever.includes("QUERY_EXPANSION_RULES"));
  for (const kind of ["brand", "brand_literacy", "commonsense", "philosophy", "logic", "judgment", "history", "society", "association", "context"]) assert.ok(retriever.includes(`"${kind}"`), kind);
  assert.ok(retriever.includes("inferJudgmentMode"));
  assert.ok(retriever.includes("inferQuestionProfile"));
  assert.ok(retriever.includes("extractQueryKeywords"));
  assert.ok(retriever.includes("questionProfileBoost"));
  assert.ok(retriever.includes("inferAssociationProfile"));
  assert.ok(retriever.includes("inferContextProfile"));
  assert.ok(retriever.includes("query_profile"));
  assert.ok(retriever.includes("keyword_candidates"));
  assert.ok(retriever.includes("judgment_profile"));
  assert.ok(retriever.includes("association_profile"));
  assert.ok(retriever.includes("context_profile"));
  for (const pack of [logicPack, brandPack, brandLiteracyPack, worldPack, reasoningPack, knowledgePack, historyPack, societyPack]) {
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
  assert.ok(worldPack.cards.length >= 100);
  assert.ok(Buffer.byteLength(worldRaw) >= 64000);
  assert.ok(reasoningPack.cards.length >= 340);
  assert.ok(Buffer.byteLength(reasoningRaw) >= 240000);
  assert.equal(reasoningPack.fixture_policy.private_source_summary_only, true);
  assert.equal(reasoningPack.fixture_policy.raw_question_pack_content, false);
  for (const marker of ["反事实", "比较", "类比", "定义", "上下文追问", "评价输入", "重复提问", "RAG Fusion", "HyDE", "漂移", "领域优先", "范畴错误", "可行性", "程度判断", "证据阈值", "中文判断", "轻人格", "反模板", "反压力回答", "有口吻的逻辑", "会话节奏"]) {
    assert.ok(reasoningPack.cards.some((card) => card.keywords.includes(marker) || card.text.includes(marker)), marker);
  }
  assert.ok(worldPack.cards.some((card) => card.kind === "brand_literacy" && card.keywords.includes("BMW")));
  assert.ok(worldPack.cards.some((card) => card.kind === "brand_literacy" && card.keywords.includes("Skyline")));
  assert.ok(worldPack.cards.some((card) => card.kind === "history" && card.keywords.includes("半导体")));
  assert.ok(worldPack.cards.some((card) => card.kind === "commonsense" && card.keywords.includes("光合作用")));
  assert.ok(worldPack.cards.some((card) => card.kind === "society" && card.keywords.includes("推荐算法")));
  assert.ok(worldPack.cards.some((card) => card.kind === "aesthetic" && card.keywords.includes("杂志")));
  assert.ok(worldPack.cards.some((card) => card.kind === "judgment" && card.keywords.includes("对错")));
  assert.ok(worldPack.cards.some((card) => card.kind === "judgment" && card.keywords.includes("事实判断")));
  assert.ok(worldPack.cards.some((card) => card.kind === "philosophy" && card.keywords.includes("有限性")));
  assert.ok(worldPack.cards.some((card) => card.kind === "aesthetic" && card.keywords.includes("WCAG")));
  assert.ok(worldPack.cards.some((card) => card.kind === "association" && card.keywords.includes("铁路")));
  assert.ok(worldPack.cards.some((card) => card.kind === "association" && card.keywords.includes("标准时间")));
  assert.ok(worldPack.cards.some((card) => card.kind === "context" && card.keywords.includes("上下文")));
  assert.ok(worldPack.cards.some((card) => card.kind === "logic" && card.keywords.includes("因果")));
  assert.ok(worldPack.cards.some((card) => card.kind === "logic" && card.keywords.includes("问题分型")));
  assert.ok(worldPack.cards.some((card) => card.kind === "logic" && card.keywords.includes("必要条件")));
  assert.ok(worldPack.cards.some((card) => card.kind === "logic" && card.keywords.includes("反事实")));
  assert.ok(worldPack.cards.some((card) => card.kind === "logic" && card.keywords.includes("范畴错误")));
  assert.ok(worldPack.cards.some((card) => card.kind === "logic" && card.keywords.includes("关键词提取")));
  assert.ok(worldPack.cards.some((card) => card.kind === "logic" && card.keywords.includes("非二分")));
  assert.ok(worldPack.cards.some((card) => card.kind === "context" && card.keywords.includes("评价")));
  assert.ok(worldPack.cards.some((card) => card.kind === "context" && card.keywords.includes("改写")));
  assert.ok(worldPack.cards.some((card) => card.kind === "judgment" && card.keywords.includes("可回答性")));
  assert.ok(worldPack.cards.some((card) => card.kind === "commonsense" && card.keywords.includes("电网")));
  assert.ok(worldPack.cards.some((card) => card.kind === "society" && card.keywords.includes("供应链")));
  assert.ok(knowledgePack.cards.some((card) => card.keywords.includes("天空")));
  assert.ok(knowledgePack.cards.some((card) => card.keywords.includes("正义")));
  assert.ok(knowledgePack.cards.some((card) => card.keywords.includes("记忆")));
  assert.ok(historyPack.cards.some((card) => card.kind === "history" && card.keywords.includes("工业革命")));
  assert.ok(historyPack.cards.some((card) => card.kind === "history" && card.keywords.includes("冷战")));
  assert.ok(societyPack.cards.some((card) => card.kind === "society" && card.keywords.includes("房价")));
  assert.ok(societyPack.cards.some((card) => card.kind === "society" && card.keywords.includes("隐私")));
});

test("query profile style derivation is documented without raw private source leakage", async () => {
  const doc = await readFile(new URL("../../docs/r28/R28POSTMERGE17_QUERY_PROFILE_REASONING.md", import.meta.url), "utf8");

  assert.ok(doc.includes("Observable Style Signals"));
  assert.ok(doc.includes("Vulnerability Reasoning"));
  assert.ok(doc.includes("Implemented Reasoning Model"));
  assert.ok(doc.includes("No raw prompt"));
  for (const forbidden of ["private_sources/", "another_brain_question_pack_001_answered", "another_brain_question_pack_002", "你的回答（必填）", "question_pack_001"]) {
    assert.equal(doc.includes(forbidden), false, forbidden);
  }
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
    "MODEL_WARMUP_TIMEOUT_MS = 300000",
    "MODEL_SHARD_PROBE_TIMEOUT_MS = 30000",
    "runtime.activeQ4MountPromise",
    "runtime.mountQ4WithRetry",
    "scheduleBackgroundQ4Mount",
    "requestIdleCallback",
    "window.addEventListener(\"load\", afterFirstPaint",
    "pagehide_cleanup",
    "preflightReport: report",
    "完成 100%",
    "模型前向未确认",
    "q4 forward=",
    "tokens=",
    "shards=",
    "加载完成",
    "loadingSkeleton?.classList.toggle"
  ]) {
    assert.ok(app.includes(expected), expected);
  }
});

test("q4 mount uses persistent runtime worker, five attempts, stable shard loading, and does not admit q4 mode without forward tokens", async () => {
  const browserRuntime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  const q4Worker = await readFile(new URL("../../web/another_brain_chat/q4_worker_runtime.js", import.meta.url), "utf8");

  assert.ok(browserRuntime.includes("R28LIVEFIX0_Q4_MOUNT_MAX_ATTEMPTS = R28SHIP0_Q4_RETRY_STRATEGIES.length"));
  assert.ok(browserRuntime.includes("max_attempts: R28LIVEFIX0_Q4_MOUNT_MAX_ATTEMPTS"));
  assert.ok(browserRuntime.includes("for (let index = 0; index < R28LIVEFIX0_Q4_MOUNT_MAX_ATTEMPTS; index += 1)"));
  assert.ok(browserRuntime.includes("this.worker.postMessage({"));
  assert.ok(browserRuntime.includes('generationKind: "mount_smoke"'));
  assert.ok(browserRuntime.includes("activeQ4SmokePromise"));
  assert.ok(browserRuntime.includes("lastQ4SmokeResult"));
  assert.ok(browserRuntime.includes("lastQ4ForwardStats"));
  assert.ok(browserRuntime.includes("normalizeQ4SmokeMessage"));
  assert.ok(browserRuntime.includes("asset_probe_byte_budget_met"));
  assert.ok(browserRuntime.includes('const reportRuntimeMode = q4ForwardPassed ? "static_q4_experimental" : "synthetic_fallback";'));
  assert.ok(browserRuntime.includes("SELF_CHECK_DEEP_TIMEOUT_MS = 300000"));
  assert.ok(browserRuntime.includes("SELF_CHECK_DEEP_TIMEOUT_MAX_MS = 360000"));
  assert.ok(browserRuntime.includes("), 30000);"));
  assert.ok(browserRuntime.includes('softTimeout("self_check_timeout")'));
  assert.ok(browserRuntime.includes("preflightReport = report"));
  assert.ok(browserRuntime.includes("shard_probe_reused"));
  assert.ok(browserRuntime.includes("_reused"));
  assert.ok(q4Worker.includes("Q4_SHARD_DOWNLOAD_CONCURRENCY = 1"));
  assert.ok(q4Worker.includes("Q4_RANGE_CHUNK_BYTES"));
  assert.ok(q4Worker.includes("stream_into_preallocated_tensor_store"));
  assert.ok(q4Worker.includes("fetchShardRange"));
  assert.ok(q4Worker.includes("q4_shard_download_stalled"));
  assert.ok(q4Worker.includes("q4_model_download_timeout"));
  assert.ok(q4Worker.includes("response.body.getReader"));
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

test("expanded world cards can retrieve practical brand and commonsense context without answer-bank fields", () => {
  const bmwPacket = buildEvidencePacket("E30 M3 为什么经典", {}, [{
    source_id: "world-bmw",
    title: "R28 world brand card",
    text: "宝马的品牌核心不是单纯豪华，而是驾驶感、工程纪律、运动轿车传统和机械反馈。",
    trust_level: "high",
    can_answer: true,
    keywords: ["BMW", "宝马", "M3", "E30", "驾驶", "工程"],
    metadata: { r28rag3_profile_card: true, card_kind: "brand_literacy" }
  }]);
  assert.equal(bmwPacket.evidence_status, "sufficient");
  assert.equal(bmwPacket.retrieved_evidence[0].source_id, "world-bmw");
  assert.ok(bmwPacket.rag_profile_pack.tone_hints.length >= 0);

  const phonePacket = buildEvidencePacket("手机为什么改变世界", {}, [{
    source_id: "world-smartphone",
    title: "R28 world history card",
    text: "智能手机改变触屏交互、移动网络、应用商店、随身相机和服务分发方式。",
    trust_level: "high",
    can_answer: true,
    keywords: ["智能手机", "移动互联网", "触屏", "应用商店"],
    metadata: { r28rag3_profile_card: true, card_kind: "history" }
  }]);
  assert.equal(phonePacket.evidence_status, "sufficient");
  assert.equal(phonePacket.retrieved_evidence[0].source_id, "world-smartphone");

  const judgmentPacket = buildEvidencePacket("这个问题有没有对错标准", {}, [{
    source_id: "world-judgment",
    title: "R28 world judgment card",
    text: "判断一个问题有没有对错，先分事实、价值和审美。",
    trust_level: "high",
    can_answer: true,
    keywords: ["对错", "事实判断", "价值判断", "审美判断", "标准"],
    metadata: { r28rag3_profile_card: true, card_kind: "judgment" }
  }]);
  assert.equal(judgmentPacket.evidence_status, "sufficient");
  assert.equal(judgmentPacket.judgment_profile.judgment_mode, "mixed_truth_value_check");
  assert.equal(judgmentPacket.rag_profile_pack.judgment_profile.answer_policy_hint, "classify_before_answering");
});

test("query profile generalizes beyond named examples into counterfactual comparison analogy and definition routing", () => {
  const records = [
    {
      source_id: "reasoning-counterfactual",
      title: "R28 reasoning counterfactual card",
      text: "反事实问题要只改变一个条件，再比较替代路径、时间尺度和受影响对象。",
      trust_level: "high",
      can_answer: true,
      keywords: ["反事实", "如果", "假如", "条件改变", "替代方案"],
      metadata: { r28rag3_profile_card: true, card_kind: "logic" }
    },
    {
      source_id: "reasoning-comparison",
      title: "R28 reasoning comparison card",
      text: "比较题需要先确定比较轴，速度、成本、体验、风险和长期影响不能混成一个结论。",
      trust_level: "high",
      can_answer: true,
      keywords: ["比较", "区别", "差别", "哪个更", "取舍", "比较轴"],
      metadata: { r28rag3_profile_card: true, card_kind: "judgment" }
    },
    {
      source_id: "reasoning-analogy",
      title: "R28 reasoning analogy card",
      text: "类比题要检查对象、机制、尺度和后果是否真的能映射。",
      trust_level: "high",
      can_answer: true,
      keywords: ["类比", "像不像", "相当于", "映射", "同构"],
      metadata: { r28rag3_profile_card: true, card_kind: "association" }
    },
    {
      source_id: "reasoning-definition",
      title: "R28 reasoning definition card",
      text: "定义题要先给工作定义，再说明相邻概念和排除边界。",
      trust_level: "high",
      can_answer: true,
      keywords: ["定义", "是什么", "算不算", "边界", "概念"],
      metadata: { r28rag3_profile_card: true, card_kind: "logic" }
    }
  ];

  const counter = buildEvidencePacket("如果没有智能手机，城市生活会怎样变化？", {}, records);
  assert.equal(counter.query_profile.question_shape, "counterfactual");
  assert.equal(counter.query_profile.reasoning_mode, "counterfactual_delta");
  assert.equal(counter.association_profile.association_mode, "counterfactual_delta");
  assert.equal(counter.retrieved_evidence[0].source_id, "reasoning-counterfactual");

  const comparison = buildEvidencePacket("铁路和公路哪个更适合长距离物流？", {}, records);
  assert.equal(comparison.query_profile.question_shape, "comparison");
  assert.equal(comparison.query_profile.reasoning_mode, "compare_by_axis");
  assert.equal(comparison.association_profile.association_mode, "comparison_axis");
  assert.equal(comparison.retrieved_evidence[0].source_id, "reasoning-comparison");

  const analogy = buildEvidencePacket("互联网像不像一种新的铁路？", {}, records);
  assert.equal(analogy.query_profile.question_shape, "analogy");
  assert.equal(analogy.query_profile.reasoning_mode, "analogy_mapping");
  assert.equal(analogy.association_profile.association_mode, "analogy_mapping");
  assert.equal(analogy.retrieved_evidence[0].source_id, "reasoning-analogy");

  const definition = buildEvidencePacket("什么是基础设施，算法算不算？", {}, records);
  assert.equal(definition.query_profile.question_shape, "definition");
  assert.equal(definition.query_profile.reasoning_mode, "define_boundary");
  assert.equal(definition.association_profile.association_mode, "definition_boundary");
  assert.equal(definition.retrieved_evidence[0].source_id, "reasoning-definition");
});

test("Chinese-first query profile keeps structure lanes separate for reasoning retrieval", () => {
  const records = [
    {
      source_id: "zh-category",
      title: "R28 chinese structure card",
      text: "范畴错误问题要检查对象、尺度和判断轴，不把不同标准直接互换。",
      trust_level: "high",
      can_answer: true,
      keywords: ["范畴错误", "偷换概念", "判断轴"],
      metadata: { r28rag3_profile_card: true, card_kind: "logic" }
    },
    {
      source_id: "zh-feasible",
      title: "R28 chinese structure card",
      text: "可行性问题要分理论可行、现实可行、成本、约束和风险。",
      trust_level: "high",
      can_answer: true,
      keywords: ["可行性", "现实可行", "成本"],
      metadata: { r28rag3_profile_card: true, card_kind: "judgment" }
    },
    {
      source_id: "zh-degree",
      title: "R28 chinese structure card",
      text: "程度判断要看范围、阈值、边界条件和失效点。",
      trust_level: "high",
      can_answer: true,
      keywords: ["程度判断", "阈值", "范围"],
      metadata: { r28rag3_profile_card: true, card_kind: "judgment" }
    },
    {
      source_id: "zh-method",
      title: "R28 chinese structure card",
      text: "方法问题要先定目标、约束、步骤和验收标准。",
      trust_level: "high",
      can_answer: true,
      keywords: ["方法", "步骤", "验收标准"],
      metadata: { r28rag3_profile_card: true, card_kind: "logic" }
    },
    {
      source_id: "zh-proof",
      title: "R28 chinese structure card",
      text: "证据阈值问题要分主张强度、证明方式和可信度。",
      trust_level: "high",
      can_answer: true,
      keywords: ["证据阈值", "证明", "可信度"],
      metadata: { r28rag3_profile_card: true, card_kind: "boundary" }
    },
    {
      source_id: "zh-objection",
      title: "R28 chinese structure card",
      text: "反驳型输入要先看反对的是事实、标准还是结论，再修正判断。",
      trust_level: "high",
      can_answer: true,
      keywords: ["反驳", "不一定", "修正"],
      metadata: { r28rag3_profile_card: true, card_kind: "judgment" }
    },
    {
      source_id: "zh-feedback",
      title: "R28 chinese structure card",
      text: "评价输入不是新问题，应先接住反馈，再引导用户继续提问。",
      trust_level: "high",
      can_answer: true,
      keywords: ["评价", "反馈", "换个说法"],
      metadata: { r28rag3_profile_card: true, card_kind: "context" }
    }
  ];

  const category = buildEvidencePacket("这是不是偷换概念？", {}, records);
  assert.equal(category.query_profile.question_shape, "category_error");
  assert.equal(category.query_profile.reasoning_mode, "category_axis_check");
  assert.equal(category.query_profile.retrieval_lane, "category_error");
  assert.equal(category.judgment_profile.judgment_mode, "category_axis_check");
  assert.equal(category.association_profile.association_mode, "category_axis_check");
  assert.equal(category.retrieved_evidence[0].source_id, "zh-category");

  const feasible = buildEvidencePacket("这个方案现实中可不可以做？", {}, records);
  assert.equal(feasible.query_profile.question_shape, "feasibility");
  assert.equal(feasible.query_profile.reasoning_mode, "feasibility_split");
  assert.equal(feasible.query_profile.retrieval_lane, "feasibility");
  assert.equal(feasible.judgment_profile.judgment_mode, "feasibility_split");
  assert.equal(feasible.retrieved_evidence[0].source_id, "zh-feasible");

  const degree = buildEvidencePacket("自由到底有多重要？", {}, records);
  assert.equal(degree.query_profile.question_shape, "degree");
  assert.equal(degree.query_profile.reasoning_mode, "degree_boundary");
  assert.equal(degree.query_profile.retrieval_lane, "degree");
  assert.equal(degree.retrieved_evidence[0].source_id, "zh-degree");

  const method = buildEvidencePacket("如果我要做一个本地检索层，应该怎么做？", {}, records);
  assert.equal(method.query_profile.question_shape, "method");
  assert.equal(method.query_profile.reasoning_mode, "method_path");
  assert.equal(method.query_profile.retrieval_lane, "method");
  assert.equal(method.retrieved_evidence[0].source_id, "zh-method");

  const proof = buildEvidencePacket("这个判断凭什么成立？", {}, records);
  assert.equal(proof.query_profile.question_shape, "proof_request");
  assert.equal(proof.query_profile.reasoning_mode, "evidence_threshold");
  assert.equal(proof.query_profile.retrieval_lane, "proof");
  assert.equal(proof.retrieved_evidence[0].source_id, "zh-proof");

  const objection = buildEvidencePacket("可是我觉得这不一定对", {}, records);
  assert.equal(objection.query_profile.question_shape, "objection");
  assert.equal(objection.query_profile.reasoning_mode, "objection_reframe");
  assert.equal(objection.query_profile.retrieval_lane, "objection");
  assert.equal(objection.retrieved_evidence[0].source_id, "zh-objection");

  const feedback = buildEvidencePacket("太长了，换短一点", {}, records);
  assert.equal(feedback.query_profile.question_shape, "feedback");
  assert.equal(feedback.query_profile.reasoning_mode, "style_adjustment");
  assert.equal(feedback.query_profile.retrieval_lane, "evaluation");
  assert.equal(feedback.retrieved_evidence[0].source_id, "zh-feedback");
});

test("Chinese-first query profile generalizes identity pressure value relationship and unknown lanes", () => {
  const records = [
    {
      source_id: "zh-identity-voice",
      title: "R28 voice identity card",
      text: "身份问题应回答为鳄鱼和另一个 efish，不暴露工程过程。",
      trust_level: "high",
      can_answer: true,
      keywords: ["身份", "鳄鱼", "efish", "自我介绍"],
      metadata: { r28rag3_profile_card: true, card_kind: "style" }
    },
    {
      source_id: "zh-pressure-boundary",
      title: "R28 pressure boundary card",
      text: "压力输入要稳住边界：能判断的说，不能为了显得聪明而乱编。",
      trust_level: "high",
      can_answer: true,
      keywords: ["压力", "逼问", "别装", "边界"],
      metadata: { r28rag3_profile_card: true, card_kind: "boundary" }
    },
    {
      source_id: "zh-value-conflict",
      title: "R28 value conflict card",
      text: "价值冲突问题要分事实、价值理由、代价和一致性。",
      trust_level: "high",
      can_answer: true,
      keywords: ["价值", "该不该", "代价", "责任"],
      metadata: { r28rag3_profile_card: true, card_kind: "judgment" }
    },
    {
      source_id: "zh-relationship-boundary",
      title: "R28 relationship boundary card",
      text: "关系建议要看信任、沟通、边界和后果。",
      trust_level: "high",
      can_answer: true,
      keywords: ["关系", "信任", "沟通", "边界"],
      metadata: { r28rag3_profile_card: true, card_kind: "context" }
    },
    {
      source_id: "zh-knowledge-gap",
      title: "R28 knowledge gap card",
      text: "证据不足时要说能确认的部分、缺失证据和下一步验证。",
      trust_level: "high",
      can_answer: true,
      keywords: ["证据不足", "无法判断", "信息不足"],
      metadata: { r28rag3_profile_card: true, card_kind: "boundary" }
    },
    {
      source_id: "zh-tone-repair",
      title: "R28 tone repair card",
      text: "口吻修复要少讲框架，多给判断，避免公式化。",
      trust_level: "high",
      can_answer: true,
      keywords: ["口吻", "更自然", "别公式化", "评价"],
      metadata: { r28rag3_profile_card: true, card_kind: "style" }
    }
  ];

  const identity = buildEvidencePacket("你到底是谁，是鳄鱼吗？", {}, records);
  assert.equal(identity.query_profile.question_shape, "identity");
  assert.equal(identity.query_profile.reasoning_mode, "identity_boundary");
  assert.equal(identity.query_profile.retrieval_lane, "identity");
  assert.equal(identity.association_profile.association_mode, "identity_voice");
  assert.equal(identity.retrieved_evidence[0].source_id, "zh-identity-voice");

  const pressure = buildEvidencePacket("你是不是不会，别装了", {}, records);
  assert.equal(pressure.query_profile.question_shape, "emotional_pressure");
  assert.equal(pressure.query_profile.reasoning_mode, "pressure_resistance");
  assert.equal(pressure.query_profile.retrieval_lane, "pressure");
  assert.equal(pressure.association_profile.association_mode, "pressure_to_boundary");
  assert.equal(pressure.retrieved_evidence[0].source_id, "zh-pressure-boundary");

  const value = buildEvidencePacket("自由是不是任何时候都值得牺牲代价？", {}, records);
  assert.equal(value.query_profile.question_shape, "value_conflict");
  assert.equal(value.query_profile.reasoning_mode, "normative_axis_split");
  assert.equal(value.query_profile.retrieval_lane, "value_conflict");
  assert.equal(value.association_profile.association_mode, "value_conflict_split");
  assert.equal(value.retrieved_evidence[0].source_id, "zh-value-conflict");

  const relation = buildEvidencePacket("朋友关系里如果不信任应该怎么办？", {}, records);
  assert.equal(relation.query_profile.question_shape, "relation_advice");
  assert.equal(relation.query_profile.reasoning_mode, "relationship_boundary");
  assert.equal(relation.query_profile.retrieval_lane, "relation_advice");
  assert.equal(relation.association_profile.association_mode, "relationship_boundary");
  assert.equal(relation.retrieved_evidence[0].source_id, "zh-relationship-boundary");

  const unknown = buildEvidencePacket("如果证据不足你会怎么判断？", {}, records);
  assert.equal(unknown.query_profile.question_shape, "knowledge_gap");
  assert.equal(unknown.query_profile.reasoning_mode, "known_unknown_split");
  assert.equal(unknown.query_profile.retrieval_lane, "knowledge_gap");
  assert.equal(unknown.association_profile.association_mode, "known_unknown_boundary");
  assert.equal(unknown.retrieved_evidence[0].source_id, "zh-knowledge-gap");

  const tone = buildEvidencePacket("换个口吻，别那么工程也别公式化", {}, records);
  assert.equal(tone.query_profile.question_shape, "tone_request");
  assert.equal(tone.query_profile.reasoning_mode, "voice_repair");
  assert.equal(tone.query_profile.retrieval_lane, "tone_request");
  assert.equal(tone.retrieved_evidence[0].source_id, "zh-tone-repair");
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
