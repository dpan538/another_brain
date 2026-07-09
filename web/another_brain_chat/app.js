import { BrowserChatRuntime } from "./browser_runtime.js?v=r28livefix0-live-q4-mount";
import { createLocalContextBridge, createStateAdapterPacket } from "./context_bridge.js?v=r28livefix0-live-q4-mount";

const R28LIVEFIX0_BRANCH_MARKER = "R28LIVEFIX0";
const R28LIVEFIX0_BRANCH_NAME = "r28livefix0-live-q4-mount";
const R28LIVEFIX0_SOURCE_COMMIT = "build-env-pending";
const R28SHIP0_UI_VERSION = R28LIVEFIX0_BRANCH_NAME;
const R28HOTFIX3_UI_VERSION = R28SHIP0_UI_VERSION;
const R28HOTFIX3_BUILD_MARKER = R28LIVEFIX0_BRANCH_MARKER;
const R28HOTFIX2_UI_VERSION = R28HOTFIX3_UI_VERSION;
const R28HOTFIX2_BUILD_MARKER = R28HOTFIX3_BUILD_MARKER;
const R28HOTFIX1_UI_VERSION = R28HOTFIX3_UI_VERSION;
const R28HOTFIX1_BUILD_MARKER = R28HOTFIX3_BUILD_MARKER;

const DEFAULT_DELIVERY_CONFIG = Object.freeze({
  delivery_mode: "demo_static",
  model_mode: "static_q4_experimental",
  rag_mode: "static_profile_pack",
  prelaunch_stage: "r28livefix0",
  branch_marker: R28LIVEFIX0_BRANCH_MARKER,
  branch_name: R28LIVEFIX0_BRANCH_NAME,
  build_commit_short: R28LIVEFIX0_SOURCE_COMMIT,
  ui_version: R28LIVEFIX0_BRANCH_NAME,
  ui_build_marker: R28LIVEFIX0_BRANCH_MARKER,
  ui_build_timestamp: "2026-07-09T00:00:00+08:00",
  backend_inference: false,
  external_llm_api: false,
  product_model: false,
  browser_admission: false,
  release_checkpoint: false,
  budget_status: "under_100mb",
  candidate_route: "product_path_engineering_candidate",
  handoff_source: "none",
  adapter_status: "local_session_import_export_ready",
  release_blockers: ["product_admission_pending", "browser_admission_pending", "release_checkpoint_pending"],
  candidate_static_bundle: true,
  candidate_warning: "Static q4 runtime is an engineering preview path only; HOTFIX4 adds open-question SLA and no-hang fallback; this is not product, browser, or release admission.",
  asset_cache_mode: "memory_fallback",
  asset_cache_policy: "same_origin_shards_only",
  asset_loader_resilience: "checksum_retry_abort_partial_fallback",
  offline_static_readiness: "static_q4_forward_smoke_required",
  non_product_warning: "Demo static mode uses mock/synthetic generation and demo memory only.",
  tokenizer_decode_status: "exact_runtime_tokenizer",
  runtime_tokenizer_blocker: "",
  runtime_fallback_reason: "fallback_available"
});

const initWarnings = [];
const MODEL_LOADING_STAGES = ["manifest", "shards", "tokenizer", "q4-warmup", "fallback"];
const MODEL_LOADING_LABELS = {
  manifest: "读取 manifest",
  shards: "校验 shards",
  tokenizer: "加载 tokenizer",
  "q4-warmup": "q4 warmup",
  fallback: "fallback available"
};
const MODEL_LOADING_PROGRESS = {
  manifest: 14,
  shards: 44,
  tokenizer: 68,
  "q4-warmup": 86,
  fallback: 100
};
const R28SHIP0_DEEP_SELFCHECK_METHOD = "deepSelfCheckModelPath";

const appShell = document.querySelector("#app-shell");
const chatModeButton = document.querySelector("#chat-mode-button");
const dashboardModeButton = document.querySelector("#dashboard-mode-button");
const form = document.querySelector("#chat-form");
const input = document.querySelector("#chat-input");
const messageList = document.querySelector("#message-list");
const modelStatus = document.querySelector("#model-status");
const retrievalStatus = document.querySelector("#retrieval-status");
const verifierStatus = document.querySelector("#verifier-status");
const fallbackStatus = document.querySelector("#fallback-status");
const deliveryMode = document.querySelector("#delivery-mode");
const configuredModelMode = document.querySelector("#configured-model-mode");
const configuredRagMode = document.querySelector("#configured-rag-mode");
const budgetStatus = document.querySelector("#budget-status");
const nonProductWarning = document.querySelector("#non-product-warning");
const assetCacheStatus = document.querySelector("#asset-cache-status");
const assetProgressStatus = document.querySelector("#asset-progress-status");
const assetVerificationStatus = document.querySelector("#asset-verification-status");
const offlineStatus = document.querySelector("#offline-status");
const candidateRouteStatus = document.querySelector("#candidate-route-status");
const handoffSourceStatus = document.querySelector("#handoff-source-status");
const adapterStatus = document.querySelector("#adapter-status");
const releaseBlockerStatus = document.querySelector("#release-blocker-status");
const decodeStatus = document.querySelector("#decode-status");
const tokenCountStatus = document.querySelector("#token-count-status");
const runtimeModeStatus = document.querySelector("#runtime-mode-status");
const routeStatus = document.querySelector("#route-status");
const fallbackReasonStatus = document.querySelector("#fallback-reason-status");
const answerSourceStatus = document.querySelector("#answer-source-status");
const draftGeneratedStatus = document.querySelector("#draft-generated-status");
const draftReplacedStatus = document.querySelector("#draft-replaced-status");
const q4AttemptedStatus = document.querySelector("#q4-attempted-status");
const generationStartedStatus = document.querySelector("#generation-started-status");
const generationStatus = document.querySelector("#generation-status");
const firstTokenStatus = document.querySelector("#first-token-status");
const generationElapsedStatus = document.querySelector("#generation-elapsed-status");
const modelSourceBadge = document.querySelector("#model-source-badge");
const tokenizerStatusBadge = document.querySelector("#tokenizer-status-badge");
const q4StatusBadge = document.querySelector("#q4-status-badge");
const routerStatusBadge = document.querySelector("#router-status-badge");
const uiVersionBadge = document.querySelector("#ui-version-badge");
const uiBuildStatus = document.querySelector("#ui-build-status");
const traceInputSummary = document.querySelector("#trace-input-summary");
const traceContextSummary = document.querySelector("#trace-context-summary");
const traceEvidenceSummary = document.querySelector("#trace-evidence-summary");
const traceDraftSummary = document.querySelector("#trace-draft-summary");
const traceRouterSummary = document.querySelector("#trace-router-summary");
const traceFinalSummary = document.querySelector("#trace-final-summary");
const modelSelfCheckButton = document.querySelector("#model-self-check-button");
const modelSelfCheckStopButton = document.querySelector("#model-self-check-stop-button");
const selfCheckStage = document.querySelector("#self-check-stage");
const selfCheckElapsed = document.querySelector("#self-check-elapsed");
const selfCheckAssets = document.querySelector("#self-check-assets");
const selfCheckTokenizer = document.querySelector("#self-check-tokenizer");
const selfCheckQ4 = document.querySelector("#self-check-q4");
const selfCheckTokens = document.querySelector("#self-check-tokens");
const selfCheckRuntimeMode = document.querySelector("#self-check-runtime-mode");
const selfCheckAnswerSource = document.querySelector("#self-check-answer-source");
const selfCheckFallback = document.querySelector("#self-check-fallback");
const selfCheckFallbackReason = document.querySelector("#self-check-fallback-reason");
const selfCheckOutput = document.querySelector("#self-check-output");
const selfCheckBlockers = document.querySelector("#self-check-blockers");
const debugToggle = document.querySelector("#debug-toggle");
const debugOutput = document.querySelector("#debug-output");
const contextImport = document.querySelector("#context-import");
const contextImportButton = document.querySelector("#context-import-button");
const contextClearButton = document.querySelector("#context-clear-button");
const stateExportButton = document.querySelector("#state-export-button");
const abortButton = document.querySelector("#abort-button");
const clearChatButton = document.querySelector("#clear-chat-button");
const contextBridgeStatus = document.querySelector("#context-bridge-status");
const contextValidation = document.querySelector("#context-validation");
const modelLoadingPanel = document.querySelector("#model-loading-panel");
const modelLoadingTitle = document.querySelector("#model-loading-title");
const modelLoadingDetail = document.querySelector("#model-loading-detail");
const modelLoadingProgressBar = document.querySelector("#model-loading-progress-bar");
const modelLoadingStages = document.querySelector("#model-loading-stages");
const modelLoadingSummary = document.querySelector("#model-loading-summary");
const loadingCancelButton = document.querySelector("#loading-cancel-button");
const loadingSkeleton = document.querySelector(".loading-skeleton");
const q4RetryStatus = document.querySelector("#q4-retry-status");
const chatLoadingNote = document.querySelector("#chat-loading-note");
const vizCapabilityLabel = document.querySelector("#viz-capability-label");
const vizRetrieval = document.querySelector("#viz-retrieval");
const vizRetrievalFill = document.querySelector("#viz-retrieval-fill");
const vizRetrievalValue = document.querySelector("#viz-retrieval-value");
const vizQ4Forward = document.querySelector("#viz-q4-forward");
const vizQ4Fill = document.querySelector("#viz-q4-fill");
const vizQ4Value = document.querySelector("#viz-q4-value");
const vizVerifier = document.querySelector("#viz-verifier");
const vizVerifierFill = document.querySelector("#viz-verifier-fill");
const vizVerifierValue = document.querySelector("#viz-verifier-value");
const vizFinalizer = document.querySelector("#viz-finalizer");
const vizFinalizerFill = document.querySelector("#viz-finalizer-fill");
const vizFinalizerValue = document.querySelector("#viz-finalizer-value");

let lastPacket = null;
let lastSelfCheckReport = null;
let running = false;
let activeSelfCheckController = null;
let activeLoadingController = null;
const contextBridge = createLocalContextBridge();
let runtime = new BrowserChatRuntime({ mode: DEFAULT_DELIVERY_CONFIG.model_mode, deliveryConfig: DEFAULT_DELIVERY_CONFIG });

const INITIAL_ASSISTANT_MESSAGE = [
  "你好，我是 efishother。直接问就好。"
].join(" ");

function setText(node, value) {
  if (node) node.textContent = String(value ?? "");
}

function warnMissing(id, action = "bind") {
  const warning = `${action}_missing_dom:${id}`;
  initWarnings.push(warning);
  console.warn(`[another_brain] ${warning}`);
  return false;
}

function on(node, eventName, handler, options) {
  if (!node || typeof node.addEventListener !== "function") return warnMissing(eventName, "event_listener");
  node.addEventListener(eventName, handler, options);
  return true;
}

function setDisabled(node, value) {
  if (node) node.disabled = Boolean(value);
}

function setHidden(node, value) {
  if (node) node.hidden = Boolean(value);
}

function focusNode(node) {
  if (node && typeof node.focus === "function") node.focus();
}

function getValue(node) {
  return node ? String(node.value || "") : "";
}

function setValue(node, value) {
  if (node) node.value = String(value ?? "");
}

function boolText(value) {
  return value === true ? "true" : "false";
}

function setUiMode(mode) {
  const nextMode = mode === "dashboard" ? "dashboard" : "chat";
  if (appShell) appShell.dataset.uiMode = nextMode;
  if (document.body) document.body.dataset.uiMode = nextMode;
  chatModeButton?.classList.toggle("active", nextMode === "chat");
  dashboardModeButton?.classList.toggle("active", nextMode === "dashboard");
  chatModeButton?.setAttribute("aria-pressed", boolText(nextMode === "chat"));
  dashboardModeButton?.setAttribute("aria-pressed", boolText(nextMode === "dashboard"));
  if (nextMode === "dashboard") renderDebug();
}

function inferInitialMode() {
  const params = new URLSearchParams(globalThis.location?.search || "");
  if (params.get("mode") === "dashboard" || params.get("dashboard") === "1") return "dashboard";
  return "chat";
}

function loadingStageFromReport(report = {}) {
  const stage = String(report.stage || "");
  if (stage.includes("q4") || stage.includes("warmup") || stage.includes("forward")) return "q4-warmup";
  if (stage.includes("shard")) return "shards";
  if (stage.includes("tokenizer")) return "tokenizer";
  if (stage.includes("manifest")) return "manifest";
  if (report.status === "passed" || report.status === "failed" || report.status === "timeout" || report.status === "cancelled") return "fallback";
  return "manifest";
}

function renderQ4RetryStatus(input = {}) {
  const report = input.report || input.last_report || input;
  const retryPlan = input.retry_plan || report.retry_plan || null;
  const attempts = retryPlan?.attempts || input.attempts || report.attempts || [];
  const currentAttempt = input.attempt || report.attempt || attempts.at?.(-1)?.attempt || 1;
  const currentStrategy = input.strategy || report.strategy || attempts.at?.(-1)?.strategy || "primary";
  const lastBlocker = input.blocker || report.q4_forward?.blocker || report.fallback?.reason || retryPlan?.fallback_reason || (report.blockers || [])[0] || "";
  const retrying = input.retrying === true || retryPlan?.status === "retrying";
  const finalFallback = retryPlan?.status === "fallback_ready" || report.status === "failed" || report.status === "timeout";
  if (!q4RetryStatus) return;
  if (!attempts.length && !retrying) {
    setText(q4RetryStatus, "Plan B：等待 q4 初始检查");
    return;
  }
  if (retrying) {
    setText(q4RetryStatus, `正在重试模型加载：第 ${currentAttempt} 次尝试 / 当前策略 ${currentStrategy}${lastBlocker ? ` / 失败原因 ${lastBlocker}` : ""}`);
    return;
  }
  if (retryPlan?.status === "q4_ready" || report.ok) {
    setText(q4RetryStatus, `q4 ready：第 ${retryPlan?.passed_attempt?.attempt || currentAttempt} 次尝试 / 当前策略 ${retryPlan?.passed_attempt?.strategy || currentStrategy}`);
    return;
  }
  if (finalFallback) {
    setText(q4RetryStatus, `最终 fallback reason：${lastBlocker || "q4_retry_plan_exhausted"}`);
    return;
  }
  setText(q4RetryStatus, `Plan B：第 ${currentAttempt} 次尝试 / 当前策略 ${currentStrategy}${lastBlocker ? ` / 失败原因 ${lastBlocker}` : ""}`);
}

function loadingNoteForStage(report = {}, status = "checking", stage = "manifest") {
  const blocker = report.q4_forward?.blocker || report.fallback?.reason || (report.blockers || [])[0] || "";
  if (status === "passed" || report.ok) return "加载完成：本地记忆、分词器和 q4 路径已就绪。";
  if (status === "cancelled") return "加载已停止；仍可用本地检索给出保守回答。";
  if (status === "failed" || status === "timeout") return `本地模型暂未稳定参与；${blocker || "Dashboard 可查看原因"}。`;
  if (stage === "shards") return "正在读取本地 q4 分片；不会连接外部模型。";
  if (stage === "tokenizer") return "正在对齐分词器，让中文输入进入同一套本地路径。";
  if (stage === "q4-warmup") return "正在做一次短前向，确认模型不是只显示为可用。";
  if (stage === "fallback") return "可以开始对话；证据不足时会停在边界。";
  return "本地记忆正在对齐；很快就能开始。";
}

function setVizMetric({ row, fill, valueNode, pct, value, state = "" }) {
  if (fill) fill.style.width = `${Math.max(4, Math.min(100, Number(pct || 0)))}%`;
  setText(valueNode, value);
  row?.classList.toggle("is-warn", state === "warn");
  row?.classList.toggle("is-blue", state === "blue");
}

function renderReasoningViz(input = {}) {
  const trace = input.process_trace || input.trace || input || {};
  const rag = trace.rag || {};
  const model = trace.model || {};
  const generation = trace.generation || model || {};
  const finalizer = trace.finalizer || {};
  const capability = trace.capability_diagnosis || {};
  const evidenceCount = Number(rag.evidence_count || input.evidence_count || 0);
  const q4Ran = model.q4_forward_ran === true || input.q4_forward?.q4_forward_ran === true;
  const q4Status = input.q4_forward?.status;
  const q4Attempted = generation.q4_attempted === true || model.q4_attempted === true || Boolean(q4Status && q4Status !== "skipped");
  const tokens = Number(generation.tokens_generated || model.tokens_generated || input.q4_forward?.tokens_generated || 0);
  const verifierBlocked = Array.isArray(finalizer.quality_flags) && finalizer.quality_flags.length > 0 && model.q4_quality_accepted === false;
  const fallbackReason = finalizer.fallback_reason || generation.fallback_reason || input.fallback?.reason || input.q4_forward?.blocker || "";
  const finalSource = finalizer.final_answer_source || input.answer_source_label || "waiting";
  setText(vizCapabilityLabel, capability.conclusion || (q4Ran ? "q4 forward confirmed" : fallbackReason ? "fallback boundary" : "等待输入"));
  setVizMetric({
    row: vizRetrieval,
    fill: vizRetrievalFill,
    valueNode: vizRetrievalValue,
    pct: evidenceCount ? Math.min(100, 28 + evidenceCount * 18) : 8,
    value: evidenceCount ? `${evidenceCount} hit${evidenceCount > 1 ? "s" : ""}` : "idle",
    state: evidenceCount ? "blue" : ""
  });
  setVizMetric({
    row: vizQ4Forward,
    fill: vizQ4Fill,
    valueNode: vizQ4Value,
    pct: q4Ran ? 100 : q4Attempted ? 62 : 8,
    value: q4Ran ? `${tokens} token${tokens === 1 ? "" : "s"}` : q4Attempted ? "attempted" : "not run",
    state: q4Ran ? "blue" : q4Attempted ? "warn" : ""
  });
  setVizMetric({
    row: vizVerifier,
    fill: vizVerifierFill,
    valueNode: vizVerifierValue,
    pct: verifierBlocked ? 56 : q4Ran || evidenceCount ? 82 : 18,
    value: verifierBlocked ? "blocked" : "ready",
    state: verifierBlocked ? "warn" : ""
  });
  setVizMetric({
    row: vizFinalizer,
    fill: vizFinalizerFill,
    valueNode: vizFinalizerValue,
    pct: finalSource === "waiting" ? 12 : 88,
    value: fallbackReason ? "boundary" : finalSource,
    state: fallbackReason ? "warn" : "blue"
  });
}

function summarizeLoadingProgress(report = {}, progress = 8, status = "checking", stage = "manifest") {
  const assets = report.assets || {};
  const tokenizer = report.tokenizer || {};
  const q4Forward = report.q4_forward || {};
  const expectedShards = Number(assets.expected_shard_count || assets.q4_shard_count || 5);
  const shardCount = Number(assets.q4_shard_count || 0);
  const tokenizerStatus = tokenizer.status || report.tokenizer_status || "not_checked";
  const tokensGenerated = Number(q4Forward.tokens_generated || 0);
  const elapsedMs = report.elapsed_ms == null ? null : Number(report.elapsed_ms);
  const forwardRan = q4Forward.q4_forward_ran === true;
  const blocker = q4Forward.blocker || report.retry_plan?.fallback_reason || (report.blockers || [])[0] || "";
  if (status === "passed") {
    return [
      "完成 100%",
      `q4 forward=${forwardRan ? "true" : "false"}`,
      `tokens=${tokensGenerated}`,
      `shards=${shardCount}/${expectedShards}`,
      `tokenizer=${tokenizerStatus}`,
      elapsedMs == null ? "" : `elapsed=${elapsedMs}ms`
    ].filter(Boolean).join(" · ");
  }
  if (status === "failed" || status === "timeout") {
    return [
      "未完成",
      `进度 ${Math.round(progress)}%`,
      `stage=${stage}`,
      blocker ? `blocker=${blocker}` : ""
    ].filter(Boolean).join(" · ");
  }
  if (status === "cancelled") {
    return `已取消 · 进度 ${Math.round(progress)}% · fallback 可用`;
  }
  return [
    `进度 ${Math.round(progress)}%`,
    MODEL_LOADING_LABELS[stage] || stage,
    shardCount ? `shards=${shardCount}/${expectedShards}` : "",
    tokenizerStatus !== "not_checked" ? `tokenizer=${tokenizerStatus}` : ""
  ].filter(Boolean).join(" · ");
}

function renderModelLoading(input = {}) {
  if (!modelLoadingPanel) return;
  const report = input.report || input;
  const stage = input.stage || loadingStageFromReport(report);
  const status = String(input.status || report.status || "checking");
  const fallbackReason = report.fallback?.reason || report.q4_forward?.blocker || (report.blockers || [])[0] || "";
  const done = status === "passed";
  const cancelled = status === "cancelled";
  const failed = status === "failed" || status === "timeout";
  const progress = Number(input.progress || MODEL_LOADING_PROGRESS[stage] || 8);
  setHidden(modelLoadingPanel, input.hidden === true);
  setText(modelLoadingTitle, done ? "加载完成：q4 已可用" : cancelled ? "模型资产检查已取消" : failed ? "模型资产检查未完成" : "模型资产检查中");
  setText(
    modelLoadingDetail,
    done
      ? "本地 q4 shards、exact tokenizer 和 warmup 已完成；Dashboard 可查看 URL/status/bytes 细节。"
      : `${MODEL_LOADING_LABELS[stage] || "读取 manifest"}；fallback 已可用${fallbackReason ? ` / ${fallbackReason}` : ""}`
  );
  setText(modelLoadingSummary, summarizeLoadingProgress(report, progress, status, stage));
  setText(chatLoadingNote, loadingNoteForStage(report, status, stage));
  modelLoadingSummary?.classList.toggle("done", done);
  modelLoadingSummary?.classList.toggle("warn", cancelled || failed);
  loadingSkeleton?.classList.toggle("is-complete", done || cancelled || failed);
  if (loadingCancelButton) loadingCancelButton.textContent = done ? "已完成" : cancelled ? "已取消" : failed ? "查看 Dashboard" : "取消加载";
  renderQ4RetryStatus(input);
  if (modelLoadingProgressBar) modelLoadingProgressBar.style.width = `${Math.max(8, Math.min(100, progress))}%`;
  const stageNodes = modelLoadingStages?.querySelectorAll?.("[data-loading-stage]") || [];
  const activeIndex = MODEL_LOADING_STAGES.indexOf(stage);
  stageNodes.forEach((node) => {
    const nodeStage = node.getAttribute("data-loading-stage");
    const nodeIndex = MODEL_LOADING_STAGES.indexOf(nodeStage);
    node.classList.toggle("active", nodeStage === stage && !done && !cancelled && !failed);
    node.classList.toggle("done", done || (activeIndex >= 0 && nodeIndex >= 0 && nodeIndex < activeIndex));
    node.classList.toggle("warn", (cancelled || failed) && nodeStage === "fallback");
  });
  setDisabled(loadingCancelButton, done || cancelled || failed || !activeLoadingController);
}

function completeModelLoading(report = {}) {
  renderModelLoading({
    report,
    stage: "fallback",
    status: report.status || (report.ok ? "passed" : "failed"),
    progress: 100
  });
}

function sourceLabel(trace = {}) {
  if (trace.answer_source_label) return trace.answer_source_label;
  if (trace.model?.q4_forward_ran && trace.router?.used_model_draft) return "static_q4_experimental";
  if (trace.model?.q4_forward_ran && trace.router?.replaced_model_draft) return "router_after_model_draft";
  if (trace.router?.replaced_model_draft || String(trace.router?.route || "").includes("boundary")) return "hard_router_boundary";
  if (String(trace.runtime_mode || "").includes("synthetic")) return "synthetic_fallback";
  return "no_model_fallback";
}

function appendMessage(role, text, meta = {}) {
  if (!messageList) {
    warnMissing("message-list", "append_message");
    return;
  }
  const article = document.createElement("article");
  article.className = `message message-${role}`;

  const roleNode = document.createElement("div");
  roleNode.className = "message-role";
  roleNode.textContent = role === "user" ? "you" : "efish";

  const body = document.createElement("p");
  body.textContent = text;

  article.append(roleNode, body);
  if (role === "assistant" && meta.showEngineeringFooter === true && (meta.source || meta.fallbackReason)) {
    const footer = document.createElement("footer");
    footer.className = "message-footer";
    const timeoutCopy = String(meta.fallbackReason || "").includes("timeout")
      ? "本地模型超时，已走边界回答"
      : "";
    footer.textContent = [meta.source ? `source: ${meta.source}` : "", timeoutCopy || (meta.fallbackReason ? `fallback: ${meta.fallbackReason}` : "")]
      .filter(Boolean)
      .join(" / ");
    article.append(footer);
  }
  messageList.append(article);
  messageList.scrollTop = messageList.scrollHeight;
}

function shortEvidenceHint(packet = {}) {
  const evidence = packet.evidence_packet?.retrieved_evidence || [];
  const top = evidence[0];
  const kind = top?.metadata?.card_kind || "";
  if (kind === "commonsense") return "我会按常识机制来答，不把它说成玄学。";
  if (kind === "philosophy") return "我会先抓住有限性、关系和判断。";
  if (kind === "aesthetic") return "我会看结构、克制、风险和表达是否贴合。";
  if (kind === "logic") return "我会先分清现象、机制和证据。";
  return "";
}

function customerEvidenceCard(packet = {}) {
  const evidence = packet.evidence_packet?.retrieved_evidence || packet.retrieved_evidence || [];
  return evidence.find((item) => item?.metadata?.card_kind) || evidence[0] || null;
}

function compactEvidenceText(text = "", maxChars = 92) {
  const clean = String(text || "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const firstSentence = clean.match(/[^。！？!?]+[。！？!?]?/)?.[0] || clean;
  return firstSentence.slice(0, maxChars).trim();
}

function customerEvidenceAnswer(packet = {}) {
  const top = customerEvidenceCard(packet);
  if (!top) return "";
  const kind = top.metadata?.card_kind || "";
  const inputText = String(packet.input || "");
  const summary = compactEvidenceText(top.text, kind === "history" ? 110 : 96);
  if (!summary) return "";
  if (kind === "brand_literacy") {
    return `${summary} 我会看它靠什么建立信任、分发和记忆点，而不是只看名气。`;
  }
  if (kind === "history") {
    return `${summary} 这类问题要同时看触发点、结构原因和后来改变了什么。`;
  }
  if (kind === "commonsense" && /太阳|月亮|天空|季节|时间|天气|气温|自然/.test(inputText)) {
    return summary;
  }
  if (kind === "philosophy" || kind === "logic" || kind === "aesthetic") {
    return `${summary} 我会先给判断，再留下证据边界。`;
  }
  return "";
}

function customerFacingAnswer(packet = {}) {
  const raw = String(packet.final_answer || "").replace(/\s+/g, " ").trim();
  const inputText = String(packet.input || "");
  const route = packet.route_policy?.open_question_category || packet.answer_route || packet.route || "";
  const fallbackReason = String(packet.fallback_reason || "");
  const evidenceHint = shortEvidenceHint(packet);
  const evidenceAnswer = customerEvidenceAnswer(packet);
  if (/你是谁|你是.*谁|你是鳄鱼|鳄鱼|efish|efishother/i.test(inputText)) {
    return "我是 efishother。efish 是鳄鱼旧昵称，another_brain 只是工程代号；我在这里用本地检索和小模型回答。";
  }
  if (/你好|在吗|hello|hi/i.test(inputText) && raw.length <= 24) return raw;
  if (route === "natural_world_question") {
    if (/太阳|日出|日落|东升西落/.test(inputText)) {
      return "这是地球自转造成的视运动：我们随地球向东转，所以太阳看起来从东边升起、向西边落下。";
    }
    if (/气温|升温|天气|气候/.test(inputText)) {
      return "要分开看：天气、季节、地表蓄热、人类活动和长期气候趋势都可能参与，不能只归因给一个原因。";
    }
    return evidenceHint || "这是事实解释类问题，我会先看机制和证据，不套用价值判断模板。";
  }
  if (route === "aesthetic_question" || /美|审美|美学|好看|风格/.test(inputText)) {
    if (/什么是美|美是什么/.test(inputText)) return "美不是单纯好看。它是形式、分寸和感受在同一刻站住，让人愿意多看一眼。";
    if (/审美|美学/.test(inputText)) return "审美有判断，不只是偏好。它会看结构是否成立、表达是否克制，以及风险有没有被承担。";
    return "我会看它有没有自己的结构、气质和必要性，而不是只看流行或讨喜。";
  }
  if (/生死|生与死|死亡/.test(inputText)) {
    return "我会把它看成边界问题：死让时间变得有限，生让选择、关系和作品还有发生的机会。";
  }
  if (/为什么.*活|活着|人为什么要活/.test(inputText)) {
    return "人不是因为先拿到答案才活着。很多意义是在关系、行动和承担后，慢慢被做出来的。";
  }
  if (/关系|亲密|信任|爱/.test(inputText)) {
    return "关系里最重要的是可被信任的真实：能靠近，也能承认边界，不把对方变成自己的证明。";
  }
  if (route === "philosophical_question" || route === "abstract_value_question" || /存在|虚无|意义/.test(inputText)) {
    return "我会先看有限性：不能把结论说满，但仍能在选择、关系和作品里留下判断。";
  }
  if (route === "abstract_meaning_question" || /语言|词语|文字/.test(inputText)) {
    return "语言不是标签而已。它让经验能被指认、交换和修正，也会暴露我们理解世界的方式。";
  }
  if (/证据不足|证据不够|不确定|无法判断/.test(inputText)) {
    return "我会停在证据边界上：先说能确认的，再说缺什么，不把漂亮话当答案。";
  }
  if (fallbackReason || packet.fallback_used) {
    return evidenceAnswer || evidenceHint || "这个问题我会先给边界判断：能确定的说清楚，证据不够的地方不硬编。";
  }
  const sentences = raw.match(/[^。！？!?]+[。！？!?]?/g) || [raw];
  return sentences.slice(0, 2).join("").slice(0, 120).trim() || "我在。";
}

function clearConversation() {
  if (!messageList) {
    warnMissing("message-list", "clear_conversation");
    return;
  }
  messageList.textContent = "";
  appendMessage("assistant", INITIAL_ASSISTANT_MESSAGE);
  lastPacket = null;
  setDisabled(stateExportButton, true);
  setPipelineStatus("final");
  updateStatus({
    retrieved_evidence: [],
    evidence_packet: { evidence_status: "not_run" },
    verifier_result: { passed: true },
    fallback_used: false,
    runtime_stats: { tokens_generated: 0, runtime_mode: runtime.mode, decode_status: "not checked" },
    state_packet: { mode: runtime.mode },
    answer_route: "not_run",
    route_policy: { route: "not_run" },
    process_trace: null,
    answer_source_label: "no_model_fallback"
  });
  renderTrace(null);
  renderDebug();
}

function publicDebugPacket(packet = null) {
  if (!packet) return {};
  return {
    process_trace: packet.process_trace || null,
    answer_source_label: packet.answer_source_label || sourceLabel(packet.process_trace || {}),
    q4_mount_method: R28SHIP0_DEEP_SELFCHECK_METHOD,
    route: packet.answer_route || packet.route_policy?.route || "not_run",
    fallback_reason: packet.fallback_reason || "",
    runtime_stats: packet.runtime_stats || {},
    evidence_summary: {
      evidence_count: packet.process_trace?.rag?.evidence_count || 0,
      evidence_status: packet.process_trace?.rag?.evidence_status || packet.evidence_packet?.evidence_status || "none",
      top_sources: packet.process_trace?.rag?.top_sources || []
    },
    capability_diagnosis: packet.process_trace?.capability_diagnosis || null,
    non_claims: packet.process_trace?.non_claims || {
      product_admission: false,
      browser_admission: false,
      release_checkpoint: false
    }
  };
}

function renderDebug() {
  if (!debugOutput) return;
  debugOutput.hidden = !debugToggle?.checked;
  debugOutput.textContent = JSON.stringify(publicDebugPacket(lastPacket), null, 2);
}

function updateStatus(packet) {
  const trace = packet.process_trace || {};
  const truth = trace.runtime_truth_table || {};
  const generation = trace.generation || trace.model || {};
  const visibleFallbackReason = packet.fallback_reason
    || truth.blocker
    || generation.fallback_reason
    || (!truth.ok && Array.isArray(truth.failures) ? truth.failures[0] : "")
    || (packet.fallback_used ? "runtime_or_verifier_fallback" : "none");
  const evidenceStatus = packet.evidence_packet?.evidence_status || "unknown";
  setText(retrievalStatus, `${packet.retrieved_evidence.length} evidence / ${evidenceStatus}`);
  setText(verifierStatus, packet.verifier_result.passed ? "Passed" : "Blocked");
  setText(fallbackStatus, packet.fallback_used ? "Used" : "Unused");
  setText(decodeStatus, packet.decode_status || packet.runtime_stats?.decode_status || "not checked");
  setText(tokenCountStatus, `${packet.runtime_stats?.tokens_generated || 0} generated`);
  setText(runtimeModeStatus, packet.runtime_stats?.runtime_mode || packet.state_packet?.mode || "unknown");
  setText(routeStatus, packet.answer_route || packet.route_policy?.route || "not_run");
  setText(fallbackReasonStatus, visibleFallbackReason);
  setText(answerSourceStatus, packet.answer_source_label || sourceLabel(trace));
  setText(draftGeneratedStatus, boolText(trace.model?.draft_generated));
  setText(draftReplacedStatus, boolText(trace.router?.replaced_model_draft));
  setText(q4AttemptedStatus, boolText(generation.q4_attempted));
  setText(generationStartedStatus, boolText(generation.generation_started));
  setText(generationStatus, generation.generation_status || "not_run");
  setText(firstTokenStatus, generation.first_token_ms == null ? "none" : `${generation.first_token_ms} ms`);
  setText(generationElapsedStatus, generation.total_generation_ms == null ? "0 ms" : `${generation.total_generation_ms} ms`);
  setText(modelSourceBadge, packet.answer_source_label || sourceLabel(trace));
  setText(tokenizerStatusBadge, `tokenizer: ${trace.model?.tokenizer || packet.decode_status || "not checked"}`);
  const qualityAccepted = trace.model?.q4_quality_accepted === true ? "quality=true" : trace.model?.q4_quality_assessed ? "quality=false" : "quality=unknown";
  setText(q4StatusBadge, `q4 forward: ${trace.model?.q4_forward_ran ? `true / ${qualityAccepted}` : `false / ${visibleFallbackReason}`}`);
  renderQ4RetryStatus(packet);
  renderTrace(trace);
  renderReasoningViz(trace);
}

function renderTrace(trace = null) {
  if (!trace) {
    setText(traceInputSummary, "等待输入。");
    setText(traceContextSummary, "local session only / not saved.");
    setText(traceEvidenceSummary, "尚未检索。");
    setText(traceDraftSummary, "q4_forward_ran=false / model_draft_generated=false");
    setText(traceRouterSummary, "route: not_run");
    setText(traceFinalSummary, "finalizer 等待回答。");
    setText(answerSourceStatus, "no_model_fallback");
    setText(draftGeneratedStatus, "false");
    setText(draftReplacedStatus, "false");
    setText(q4AttemptedStatus, "false");
    setText(generationStartedStatus, "false");
    setText(generationStatus, "not_run");
    setText(firstTokenStatus, "none");
    setText(generationElapsedStatus, "0 ms");
    setText(q4StatusBadge, "q4 forward: false");
    renderReasoningViz({});
    return;
  }
  const input = trace.input_packet || {};
  const rag = trace.rag || {};
  const model = trace.model || {};
  const generation = trace.generation || model;
  const router = trace.router || {};
  const finalizer = trace.finalizer || {};
  const truth = trace.runtime_truth_table || {};
  const capability = trace.capability_diagnosis || {};
  const topSources = (rag.top_sources || []).map((item) => {
    const provenance = item.provenance ? `:${item.provenance}` : "";
    const kind = item.kind ? `:${item.kind}` : "";
    return `${item.title || "local evidence"}${kind}${provenance}`;
  }).filter(Boolean).join(" / ") || "无";
  const toneHints = (rag.tone_hints || []).join(", ") || "none";
  setText(traceInputSummary, `has_user_input=${boolText(input.has_user_input)} / adapter_context_present=${boolText(input.adapter_context_present)}`);
  setText(traceContextSummary, `has_local_context=${boolText(input.has_local_context)} / local-session-only / not saved`);
  setText(traceEvidenceSummary, `retrieval_used=${boolText(rag.retrieval_used)} / evidence_count=${rag.evidence_count || 0} / evidence_status=${rag.evidence_status || "none"} / sources=${topSources} / tone_hints=${toneHints}`);
  setText(q4AttemptedStatus, boolText(generation.q4_attempted));
  setText(generationStartedStatus, boolText(generation.generation_started));
  setText(generationStatus, generation.generation_status || "not_run");
  setText(firstTokenStatus, generation.first_token_ms == null ? "none" : `${generation.first_token_ms} ms`);
  setText(generationElapsedStatus, generation.total_generation_ms == null ? "0 ms" : `${generation.total_generation_ms} ms`);
  setText(traceDraftSummary, `asset_manifest_loaded=${boolText(model.asset_manifest_loaded)} / shards_verified=${boolText(model.shards_verified)} / tokenizer=${model.tokenizer || "none"} / q4_attempted=${boolText(generation.q4_attempted)} / generation_started=${boolText(generation.generation_started)} / generation_status=${generation.generation_status || "not_run"} / q4_forward_ran=${boolText(model.q4_forward_ran)} / q4_quality_accepted=${boolText(model.q4_quality_accepted)} / tokens=${generation.tokens_generated || model.tokens_generated || 0} / first_token_ms=${generation.first_token_ms == null ? "none" : generation.first_token_ms} / total_generation_ms=${generation.total_generation_ms == null ? 0 : generation.total_generation_ms} / model_draft_generated=${boolText(model.draft_generated)}`);
  setText(traceRouterSummary, `route=${router.route || "not_run"} / intent=${router.intent || "none"} / surface=${router.surface_category || "none"} / length=${router.length_policy?.trim_strategy || "none"} / used_model_draft=${boolText(router.used_model_draft)} / finalizer_replaced_draft=${boolText(router.replaced_model_draft)} / reason=${router.reason || "none"}`);
  setText(traceFinalSummary, `final_answer_source=${sourceLabel(trace)} / capability=${capability.conclusion || "not_assessed"} / invocation=${capability.invocation || "unknown"} / retrieval=${capability.retrieval || "unknown"} / truth=${truth.ok === false ? (truth.failures || []).join(", ") : "pass"} / quality_flags=${(finalizer.quality_flags || []).join(", ") || "none"} / fallback_reason=${finalizer.fallback_reason || truth.blocker || "none"}`);
  renderReasoningViz(trace);
}

function renderContextBridge(result = null) {
  const summary = contextBridge.summary();
  setText(contextBridgeStatus, `${summary.packet_count} packets / ${summary.evidence_record_count} evidence`);
  if (result?.ok) {
    setText(contextValidation, `${result.packet.packet_type} imported for this session`);
  } else if (result?.failures?.length) {
    setText(contextValidation, `Rejected: ${result.failures.join(", ")}`);
  } else {
    setText(contextValidation, "Local session only / not saved / not training data");
  }
}

async function loadDeliveryConfig() {
  if (!globalThis.location?.href) return DEFAULT_DELIVERY_CONFIG;
  const base = new URL(globalThis.location.href);
  const url = new URL("/another_brain/runtime_mode.json", base);
  if (url.origin !== base.origin) throw new Error("non_same_origin_runtime_mode_rejected");
  const response = await fetch(url.href);
  if (!response.ok) throw new Error(`runtime_mode_fetch_failed:${response.status}`);
  const config = await response.json();
  return { ...DEFAULT_DELIVERY_CONFIG, ...config };
}

function renderDeliveryConfig(config) {
  setText(deliveryMode, config.delivery_mode);
  setText(configuredModelMode, config.model_mode);
  setText(configuredRagMode, config.rag_mode);
  setText(budgetStatus, config.budget_status);
  setText(modelSourceBadge, config.model_mode || DEFAULT_DELIVERY_CONFIG.model_mode);
  setText(tokenizerStatusBadge, `tokenizer: ${config.tokenizer_decode_status || "not checked"}`);
  setText(routerStatusBadge, "router: enabled");
  const marker = config.branch_marker || config.ui_build_marker || R28HOTFIX1_BUILD_MARKER;
  const branch = config.branch_name || config.ui_version || R28HOTFIX1_UI_VERSION;
  const commit = config.build_commit_short || R28LIVEFIX0_SOURCE_COMMIT;
  const buildTime = config.ui_build_timestamp || "timestamp_missing";
  setText(uiVersionBadge, `${marker} · ${branch} · ${commit}`);
  setText(uiBuildStatus, `${marker} / ${branch} / ${commit} / ${buildTime}`);
  setText(q4StatusBadge, "q4 forward: not checked");
  const releaseBlockers = Array.isArray(config.release_blockers) ? config.release_blockers : DEFAULT_DELIVERY_CONFIG.release_blockers;
  setText(candidateRouteStatus, config.candidate_route || DEFAULT_DELIVERY_CONFIG.candidate_route);
  setText(handoffSourceStatus, config.handoff_source || DEFAULT_DELIVERY_CONFIG.handoff_source);
  setText(adapterStatus, config.adapter_status || DEFAULT_DELIVERY_CONFIG.adapter_status);
  setText(releaseBlockerStatus, releaseBlockers.join(" / "));
  setText(decodeStatus, config.tokenizer_decode_status || "not checked");
  setText(runtimeModeStatus, config.model_mode || DEFAULT_DELIVERY_CONFIG.model_mode);
  setText(fallbackReasonStatus, config.runtime_fallback_reason || "fallback_available");
  const candidateWarning = config.candidate_route === "product_path" ? "" : config.candidate_warning;
  setText(nonProductWarning, config.product_model
    ? ""
    : candidateWarning || config.non_product_warning || DEFAULT_DELIVERY_CONFIG.non_product_warning);
}

function renderAssetStatus(status, config = DEFAULT_DELIVERY_CONFIG) {
  const assetStatus = status || {};
  setText(assetCacheStatus, `${assetStatus.cache_mode || config.asset_cache_mode} / ${assetStatus.cache_result || "not_checked"} / ${assetStatus.cache_version || config.ui_version || R28HOTFIX1_UI_VERSION}`);
  setText(assetProgressStatus, assetStatus.progress || "0/0");
  setText(assetVerificationStatus, assetStatus.verification || config.asset_cache_status || "no_model_assets");
  setText(offlineStatus, assetStatus.offline_ready
    ? "Cache-capable shell"
    : `Fallback: ${assetStatus.fallback_reason || "offline_cache_unavailable"}`);
}

function renderSelfCheck(report = null) {
  lastSelfCheckReport = report || null;
  if (!report) {
    setText(selfCheckStage, "idle");
    setText(selfCheckElapsed, "0 ms");
    setText(selfCheckAssets, "未检查");
    setText(selfCheckTokenizer, "未检查");
    setText(selfCheckQ4, "未检查");
    setText(selfCheckTokens, "0");
    setText(selfCheckRuntimeMode, "not_checked");
    setText(selfCheckAnswerSource, "not_run");
    setText(selfCheckFallback, "可用");
    setText(selfCheckFallbackReason, "none");
    setText(selfCheckOutput, "输出：未检查");
    setText(selfCheckBlockers, "blocker：none");
    return;
  }
  setText(selfCheckStage, `${report.status || "idle"}${report.check_level ? ` / ${report.check_level}` : ""}${report.stage ? ` / ${report.stage}` : ""}`);
  setText(selfCheckElapsed, `${Number(report.elapsed_ms || 0)} ms`);
  const isChecking = String(report.status || "").startsWith("checking");
  const manifestStatus = report.assets?.manifest_loaded ? "pass" : isChecking ? "checking" : "fail";
  const shardStatus = report.assets?.shards_verified ? "pass" : isChecking ? "checking" : "fail";
  const tokenizerStatus = report.tokenizer?.exact_runtime_tokenizer ? "pass" : isChecking ? "checking" : "fail";
  const normalizedShardPaths = Array.isArray(report.assets?.normalized_shard_paths) ? report.assets.normalized_shard_paths : [];
  const failingShardPaths = Array.isArray(report.assets?.failing_shard_paths) ? report.assets.failing_shard_paths : [];
  const shardProbeResults = Array.isArray(report.assets?.shard_probe_results) ? report.assets.shard_probe_results : [];
  const probeHint = shardProbeResults.find((item) => item.ok !== true) || shardProbeResults[0] || null;
  const pathHint = probeHint
    ? ` / url=${probeHint.normalized_url || probeHint.normalized_path} / status=${probeHint.status || 0} / bytes=${probeHint.bytes_read || 0} / strategy=${probeHint.probe_strategy || probeHint.method || "unknown"}`
    : failingShardPaths.length
      ? ` / failing=${failingShardPaths.slice(0, 2).join(", ")}`
      : normalizedShardPaths.length
        ? ` / path=${normalizedShardPaths[0]}`
        : "";
  setText(selfCheckAssets, `manifest=${manifestStatus} / q4 shards=${shardStatus} ${report.assets?.q4_shard_count || 0}/${report.assets?.expected_shard_count || 0}${pathHint}`);
  setText(selfCheckTokenizer, `exact tokenizer=${tokenizerStatus}`);
  setText(selfCheckQ4, `${report.q4_forward?.status || "失败"} / q4_forward_ran=${boolText(report.q4_forward?.q4_forward_ran)}`);
  setText(selfCheckTokens, String(report.q4_forward?.tokens_generated || 0));
  setText(selfCheckRuntimeMode, report.q4_forward?.runtime_mode || (report.q4_forward?.q4_forward_ran ? "static_q4_experimental" : "synthetic_fallback"));
  setText(selfCheckAnswerSource, report.q4_forward?.q4_forward_ran ? "static_q4_experimental" : "no_model_fallback");
  setText(selfCheckFallback, report.fallback?.status || "可用");
  setText(selfCheckFallbackReason, report.fallback?.reason || report.q4_forward?.blocker || "none");
  setText(selfCheckOutput, `输出：tokens=${report.q4_forward?.tokens_generated || 0} / ${report.output?.text_preview || "no q4 text"}`);
  setText(selfCheckBlockers, `blocker：${(report.blockers || []).join(" / ") || "none"}`);
  setText(q4StatusBadge, `q4 forward: ${report.q4_forward?.q4_forward_ran ? "true" : report.q4_forward?.status || "false"}`);
  renderModelLoading({ report });
  renderReasoningViz(report);
}

async function fetchAssetManifestStatus() {
  const localBaseHref = ["http:", "", "localhost", ""].join("/");
  const base = new URL(globalThis.location?.href || localBaseHref);
  const url = new URL("/another_brain/asset_manifest.json", base);
  if (url.origin !== base.origin) return { ok: false, status: 0, normalized_url: url.href, failure_reason: "non_same_origin_manifest_rejected" };
  try {
    const response = await fetch(url.href, { cache: "no-store" });
    return {
      ok: response.ok,
      status: response.status,
      normalized_url: url.href,
      content_length_header: response.headers.get("content-length") || ""
    };
  } catch (error) {
    return { ok: false, status: 0, normalized_url: url.href, failure_reason: error.message || "asset_manifest_fetch_failed" };
  }
}

function diagnosticsFromReport(config, manifestStatus, report) {
  const q4Shards = Array.isArray(report?.assets?.shard_probe_results) ? report.assets.shard_probe_results : [];
  const q4Forward = report?.q4_forward || {};
  const tokenizer = report?.tokenizer || {};
  const tokensGenerated = Number(q4Forward.tokens_generated || 0);
  const forwardOk = q4Forward.q4_forward_ran === true && tokensGenerated > 0;
  const assetsOk = manifestStatus.ok === true && q4Shards.length === 5 && q4Shards.every((item) => item.ok === true && Number(item.bytes_read || 0) > 0);
  const tokenizerOk = tokenizer.exact_runtime_tokenizer === true;
  const lastCapability = lastPacket?.process_trace?.capability_diagnosis || null;
  const liveAnswerQualityAccepted = lastPacket?.process_trace?.model?.q4_quality_accepted === true;
  const q4QualityAccepted = report?.q4_quality?.accepted === true || liveAnswerQualityAccepted;
  const q4QualityStatus = q4QualityAccepted ? "accepted" : lastCapability ? "rejected_or_not_admitted_by_last_answer" : "not_assessed_by_live_answer";
  return {
    branch_marker: config.branch_marker || config.ui_build_marker || R28LIVEFIX0_BRANCH_MARKER,
    branch_name: config.branch_name || config.ui_version || R28LIVEFIX0_BRANCH_NAME,
    commit_short: config.build_commit_short || R28LIVEFIX0_SOURCE_COMMIT,
    build_timestamp: config.ui_build_timestamp || "",
    runtime_mode: q4Forward.runtime_mode || config.model_mode || "unknown",
    asset_manifest: manifestStatus,
    q4_shards: q4Shards.map((item) => ({
      path: item.requested_path || item.normalized_path || "",
      normalized_url: item.normalized_url || "",
      ok: item.ok === true,
      method: item.method || "",
      status: Number(item.status || 0),
      content_length_header: item.content_length_header || "",
      bytes_read: Number(item.bytes_read || 0),
      probe_strategy: item.probe_strategy || "",
      failure_reason: item.failure_reason || ""
    })),
    tokenizer: {
      ok: tokenizerOk,
      status: tokenizer.status || (tokenizerOk ? "exact" : "fallback"),
      path: tokenizer.path || ""
    },
    q4_forward: {
      attempted: q4Forward.status !== "skipped",
      ok: forwardOk,
      q4_forward_ran: q4Forward.q4_forward_ran === true,
      tokens_generated: tokensGenerated,
      blocker: q4Forward.blocker || report?.fallback?.reason || ""
    },
    q4_generation: {
      last_answer_kind: lastPacket?.process_trace?.model?.generation_kind || "not_run",
      last_answer_limits: lastPacket?.process_trace?.model?.generation_limits || null,
      last_answer_status: lastPacket?.process_trace?.generation?.generation_status || "not_run",
      last_answer_tokens_generated: Number(lastPacket?.process_trace?.generation?.tokens_generated || 0)
    },
    q4_quality: {
      accepted: q4QualityAccepted,
      status: q4QualityStatus,
      note: q4QualityAccepted ? "" : "mount probe cannot prove answer quality; send a live open question and inspect finalizer quality_flags",
      last_answer_capability_diagnosis: lastCapability
    },
    answer_source: forwardOk && q4QualityAccepted ? "static_q4_experimental" : forwardOk ? "q4_forward_quality_unadmitted" : "no_model_fallback",
    mount_runtime_ready: assetsOk && tokenizerOk && forwardOk,
    merge_runtime_ready: assetsOk && tokenizerOk && forwardOk && q4QualityAccepted,
    blockers: report?.blockers || []
  };
}

async function anotherBrainDiagnostics() {
  const config = await loadDeliveryConfig().catch(() => DEFAULT_DELIVERY_CONFIG);
  const manifestStatus = await fetchAssetManifestStatus();
  const report = await runtime.deepSelfCheckModelPath({
    timeoutMs: 15000,
    shardTimeoutMs: 10000,
    jsonTimeoutMs: 1200,
    cacheBust: "r28livefix0-diagnostics",
    onProgress: (progressReport) => renderSelfCheck(progressReport)
  });
  renderSelfCheck(report);
  return diagnosticsFromReport(config, manifestStatus, report);
}

if (typeof window !== "undefined") {
  window.__anotherBrainDiagnostics = anotherBrainDiagnostics;
}

function setPipelineStatus(status) {
  const labels = {
    routing_open_question: ["Loaded", "Routing", "Pending", "Unused"],
    loading_model: ["Loading", "Pending", "Pending", "Unused"],
    retrieving_local_memory: ["Loaded", "Retrieving", "Pending", "Unused"],
    drafting: ["Loaded", "Ready", "Drafting", "Unused"],
    q4_generation_attempted: ["Loaded", "Ready", "q4 attempted", "Unused"],
    q4_generation_started: ["Loaded", "Ready", "q4 started", "Unused"],
    q4_first_token: ["Loaded", "Ready", "first token", "Unused"],
    q4_generation_finished: ["Loaded", "Ready", "q4 finished", "Unused"],
    generation_timeout: ["Loaded", "Ready", "Timeout", "Used"],
    verifying: ["Loaded", "Ready", "Verifying", "Unused"],
    final: ["Loaded", "Ready", "Passed", "Unused"],
    fallback: ["Loaded", "Ready", "Blocked", "Used"]
  };
  const [model, retrieval, verifier, fallback] = labels[status] || labels.final;
  setText(modelStatus, model);
  setText(retrievalStatus, retrieval);
  setText(verifierStatus, verifier);
  setText(fallbackStatus, fallback);
}

async function boot() {
  const deliveryConfig = await loadDeliveryConfig().catch(() => DEFAULT_DELIVERY_CONFIG);
  renderDeliveryConfig(deliveryConfig);
  renderAssetStatus(null, deliveryConfig);
  runtime = new BrowserChatRuntime({ mode: deliveryConfig.model_mode, deliveryConfig, uiVersion: deliveryConfig.ui_version || R28HOTFIX1_UI_VERSION });
  runtime.setContextPackets(contextBridge.getPackets());
  renderModelLoading({ stage: "manifest", status: "checking", progress: 8 });
  const loadResult = await runtime.load();
  setText(modelStatus, `${loadResult.mode} loaded`);
  setText(retrievalStatus, deliveryConfig.rag_mode);
  renderAssetStatus(loadResult.asset_status, deliveryConfig);
  renderContextBridge();
  renderTrace(null);
  renderSelfCheck({
    status: "checking_quick",
    check_level: "quick",
    stage: "boot_quick_check",
    elapsed_ms: 0,
    assets: { manifest_loaded: false, shards_verified: false, q4_shard_count: 0, expected_shard_count: Number(deliveryConfig.shard_count || 0) },
    tokenizer: { exact_runtime_tokenizer: false },
    q4_forward: { status: "skipped", q4_forward_ran: false, tokens_generated: 0 },
    fallback: { status: "可用" },
    output: { text_preview: "" },
    blockers: []
  });
  const bootController = new AbortController();
  activeLoadingController = bootController;
  setDisabled(loadingCancelButton, false);
  let report = null;
  try {
    report = await runtime.quickSelfCheckModelPath({
      jsonTimeoutMs: 900,
      shardTimeoutMs: 900,
      signal: bootController.signal,
      onProgress: (progressReport) => {
        renderSelfCheck(progressReport);
        renderModelLoading({ report: progressReport });
      }
    });
    renderSelfCheck(report);
    renderModelLoading({ report, retrying: true, attempt: 1, strategy: "primary" });
    const mountResult = await runtime.mountQ4WithRetry({
      timeoutMs: 15000,
      shardTimeoutMs: 10000,
      signal: bootController.signal,
      onProgress: (progressReport) => {
        renderSelfCheck(progressReport.report || progressReport);
        renderModelLoading(progressReport);
      }
    });
    report = mountResult.report || report;
    if (mountResult.retry_plan) report.retry_plan = mountResult.retry_plan;
    if (mountResult.attempts) report.attempts = mountResult.attempts;
  } finally {
    if (activeLoadingController === bootController) activeLoadingController = null;
    setDisabled(loadingCancelButton, true);
  }
  renderSelfCheck(report);
  completeModelLoading(report);
  renderAssetStatus(runtime.assetStatus, runtime.deliveryConfig);
  if (report.ok) {
    setText(modelStatus, "q4_ready");
    setText(runtimeModeStatus, "static_q4_experimental");
    setText(decodeStatus, report.q4_forward?.decode_status || "exact_runtime_tokenizer");
    setText(tokenCountStatus, `${report.q4_forward?.tokens_generated || 0} generated`);
    setText(answerSourceStatus, report.q4_forward?.q4_forward_ran ? "self_check_static_q4_experimental" : "no_model_fallback");
  } else {
    setText(modelStatus, "q4_blocked");
    setText(runtimeModeStatus, "synthetic_fallback");
    setText(answerSourceStatus, "no_model_fallback");
    setText(fallbackReasonStatus, report.retry_plan?.fallback_reason || (report.blockers || []).join(" / ") || "q4_self_check_failed");
  }
}

function bindEvents() {
on(chatModeButton, "click", () => setUiMode("chat"));
on(dashboardModeButton, "click", () => setUiMode("dashboard"));
on(loadingCancelButton, "click", () => {
  if (activeLoadingController) activeLoadingController.abort();
  if (activeSelfCheckController) activeSelfCheckController.abort();
  runtime.cancelSelfCheck("model_loading_cancelled");
  activeLoadingController = null;
  activeSelfCheckController = null;
  renderModelLoading({
    status: "cancelled",
    stage: "fallback",
    progress: 100,
    report: {
      status: "cancelled",
      fallback: { status: "可用", reason: "model_loading_cancelled" },
      q4_forward: { status: "skipped", q4_forward_ran: false, blocker: "model_loading_cancelled" },
      blockers: ["model_loading_cancelled"]
    }
  });
  renderSelfCheck({
    status: "cancelled",
    check_level: "quick",
    stage: "user_cancelled",
    elapsed_ms: 0,
    assets: { status: "取消", q4_shard_count: 0, expected_shard_count: Number(runtime.deliveryConfig?.shard_count || 0) },
    tokenizer: { status: "skipped" },
    q4_forward: { status: "skipped", q4_forward_ran: false, tokens_generated: 0 },
    fallback: { status: "可用", reason: "model_loading_cancelled" },
    output: { text_preview: "" },
    blockers: ["model_loading_cancelled"]
  });
  setText(fallbackReasonStatus, "model_loading_cancelled");
});

on(contextImportButton, "click", () => {
  const result = contextBridge.importText(getValue(contextImport), { sourceLabel: "Manual local import" });
  if (result.ok) {
    runtime.setContextPackets(contextBridge.getPackets());
    setValue(contextImport, "");
  }
  renderContextBridge(result);
});

on(contextClearButton, "click", () => {
  contextBridge.clear();
  runtime.setContextPackets([]);
  setValue(contextImport, "");
  renderContextBridge();
});

on(stateExportButton, "click", () => {
  if (!lastPacket?.state_packet) {
    setText(contextValidation, "No state packet yet");
    return;
  }
  const packet = createStateAdapterPacket(lastPacket.state_packet);
  setValue(contextImport, JSON.stringify(packet, null, 2));
  setText(contextValidation, "StatePacket ready");
});

on(form, "submit", async (event) => {
  event.preventDefault();
  if (running) return;
  const text = getValue(input).trim();
  if (!text) return;

  appendMessage("user", text);
  setValue(input, "");
  focusNode(input);

  running = true;
  setDisabled(abortButton, false);
  try {
    const packet = await runtime.run(text, { onStatus: setPipelineStatus });
    lastPacket = packet;
    setDisabled(stateExportButton, false);
    const dashboardFinalAnswer = packet.final_answer;
    packet.final_answer = customerFacingAnswer(packet);
    appendMessage("assistant", packet.final_answer, {
      source: packet.answer_source_label || sourceLabel(packet.process_trace || {}),
      fallbackReason: packet.fallback_reason || packet.process_trace?.generation?.fallback_reason || ""
    });
    packet.final_answer = dashboardFinalAnswer;
    updateStatus(packet);
    renderAssetStatus(packet.asset_status, runtime.deliveryConfig);
    renderDebug();
  } finally {
    running = false;
    setDisabled(abortButton, true);
  }
});

on(debugToggle, "change", renderDebug);
on(abortButton, "click", () => {
  runtime.abort();
  setDisabled(abortButton, true);
  setPipelineStatus("fallback");
  setText(fallbackReasonStatus, "generation_aborted");
});
on(clearChatButton, "click", clearConversation);

on(modelSelfCheckButton, "click", async () => {
  if (activeSelfCheckController) {
    activeSelfCheckController.abort();
    activeSelfCheckController = null;
  }
  const controller = new AbortController();
  activeSelfCheckController = controller;
  activeLoadingController = controller;
  setDisabled(modelSelfCheckButton, true);
  setDisabled(modelSelfCheckStopButton, false);
  setDisabled(loadingCancelButton, false);
  setText(selfCheckAssets, "检查中");
  setText(selfCheckTokenizer, "检查中");
  setText(selfCheckQ4, "quick check");
  renderModelLoading({ stage: "manifest", status: "checking", progress: 8 });
  try {
    const mountResult = await runtime.mountQ4WithRetry({
      timeoutMs: 15000,
      shardTimeoutMs: 10000,
      signal: controller.signal,
      onProgress: (progressReport) => {
        renderSelfCheck(progressReport.report || progressReport);
        renderModelLoading(progressReport);
      }
    });
    const report = mountResult.report || {
      status: mountResult.ok ? "passed" : "failed",
      retry_plan: mountResult.retry_plan,
      attempts: mountResult.attempts,
      blockers: [mountResult.fallback_reason || "q4_retry_plan_exhausted"]
    };
    renderSelfCheck(report);
    completeModelLoading(report);
  } catch (error) {
    const failureReport = {
      status: controller.signal.aborted ? "cancelled" : "failed",
      check_level: "deep",
      stage: controller.signal.aborted ? "cancelled" : "failed",
      elapsed_ms: 0,
      assets: { status: "失败", q4_shard_count: 0, expected_shard_count: 0 },
      tokenizer: { status: "fallback" },
      q4_forward: { status: "失败", q4_forward_ran: false, tokens_generated: 0 },
      fallback: { status: "可用" },
      output: { text_preview: "" },
      blockers: [error.message || "model_path_self_check_failed"]
    };
    renderSelfCheck(failureReport);
    completeModelLoading(failureReport);
  } finally {
    if (activeSelfCheckController === controller) activeSelfCheckController = null;
    if (activeLoadingController === controller) activeLoadingController = null;
    setDisabled(modelSelfCheckButton, false);
    setDisabled(modelSelfCheckStopButton, true);
    setDisabled(loadingCancelButton, true);
  }
});

on(modelSelfCheckStopButton, "click", () => {
  if (activeSelfCheckController) {
    activeSelfCheckController.abort();
    runtime.cancelSelfCheck("self_check_cancelled");
  }
  activeSelfCheckController = null;
  activeLoadingController = null;
  setDisabled(modelSelfCheckStopButton, true);
  setDisabled(modelSelfCheckButton, false);
  const cancelledReport = {
    status: "cancelled",
    check_level: "deep",
    stage: "user_cancelled",
    elapsed_ms: 0,
    assets: { status: "取消", q4_shard_count: 0, expected_shard_count: Number(runtime.deliveryConfig?.shard_count || 0) },
    tokenizer: { status: "skipped" },
    q4_forward: { status: "skipped", q4_forward_ran: false, tokens_generated: 0 },
    fallback: { status: "可用", reason: "self_check_cancelled" },
    output: { text_preview: "" },
    blockers: ["self_check_cancelled"]
  };
  renderSelfCheck(cancelledReport);
  completeModelLoading(cancelledReport);
});
}

function start() {
  setUiMode(inferInitialMode());
  bindEvents();
  boot().catch((error) => {
    console.warn("[another_brain] boot_warning", error);
    setText(modelStatus, "q4_blocked");
    setText(runtimeModeStatus, "synthetic_fallback");
    setText(fallbackReasonStatus, error.message || "boot_failed");
    renderSelfCheck({
      assets: { manifest_loaded: false, shards_verified: false, q4_shard_count: 0, expected_shard_count: 0 },
      tokenizer: { exact_runtime_tokenizer: false },
      q4_forward: { status: "失败", q4_forward_ran: false, tokens_generated: 0 },
      fallback: { status: "可用" },
      output: { text_preview: "" },
      blockers: [error.message || "boot_failed"]
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
