import { BrowserChatRuntime } from "./browser_runtime.js?v=r28merge3-final-premerge-gate";
import { createLocalContextBridge, createStateAdapterPacket } from "./context_bridge.js?v=r28merge3-final-premerge-gate";

const R28SHIP0_UI_VERSION = "r28ship0-unified-q4-mount";
const R28MERGE3_UI_VERSION = "r28merge3-final-premerge-gate";
const R28HOTFIX3_UI_VERSION = R28SHIP0_UI_VERSION;
const R28HOTFIX3_BUILD_MARKER = "R28MERGE3";
const R28HOTFIX2_UI_VERSION = R28HOTFIX3_UI_VERSION;
const R28HOTFIX2_BUILD_MARKER = R28HOTFIX3_BUILD_MARKER;
const R28HOTFIX1_UI_VERSION = R28HOTFIX3_UI_VERSION;
const R28HOTFIX1_BUILD_MARKER = R28HOTFIX3_BUILD_MARKER;

const DEFAULT_DELIVERY_CONFIG = Object.freeze({
  delivery_mode: "demo_static",
  model_mode: "static_q4_experimental",
  rag_mode: "static_profile_pack",
  prelaunch_stage: "r28merge3",
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
  candidate_warning: "Static q4 runtime is an engineering preview path only; this is not product, browser, or release admission.",
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
const loadingCancelButton = document.querySelector("#loading-cancel-button");
const loadingDashboardButton = document.querySelector("#loading-dashboard-button");
const q4RetryStatus = document.querySelector("#q4-retry-status");

let lastPacket = null;
let running = false;
let activeSelfCheckController = null;
let activeLoadingController = null;
const contextBridge = createLocalContextBridge();
let runtime = new BrowserChatRuntime({ mode: DEFAULT_DELIVERY_CONFIG.model_mode, deliveryConfig: DEFAULT_DELIVERY_CONFIG });

const INITIAL_ASSISTANT_MESSAGE = [
  "你好，我在。你可以直接问；需要看 q4、RAG 或 blocker 时，点 Dashboard。",
  "这里不展示隐藏推理或内部提示，也不声称这是产品模型。"
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

function setLoadingScreenActive(value) {
  if (appShell) appShell.dataset.loading = value ? "active" : "idle";
  setHidden(modelLoadingPanel, !value);
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
  setLoadingScreenActive(input.hidden !== true);
  setText(modelLoadingTitle, done ? "模型资产检查完成" : cancelled ? "模型资产检查已取消" : failed ? "模型资产检查未完成" : "模型资产检查中");
  setText(modelLoadingDetail, `${MODEL_LOADING_LABELS[stage] || "读取 manifest"}；fallback available${fallbackReason ? ` / ${fallbackReason}` : ""}`);
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
  globalThis.setTimeout?.(() => setLoadingScreenActive(false), 450);
}

function sourceLabel(trace = {}) {
  if (trace.answer_source_label) return trace.answer_source_label;
  if (trace.model?.q4_forward_ran && trace.router?.used_model_draft) return "static_q4_experimental";
  if (trace.router?.replaced_model_draft || String(trace.router?.route || "").includes("boundary")) return "hard_router_boundary";
  if (String(trace.runtime_mode || "").includes("synthetic")) return "synthetic_fallback";
  return "no_model_fallback";
}

function appendMessage(role, text, meta = null) {
  if (!messageList) {
    warnMissing("message-list", "append_message");
    return;
  }
  const article = document.createElement("article");
  article.className = `message message-${role}`;

  const roleNode = document.createElement("div");
  roleNode.className = "message-role";
  roleNode.textContent = role === "user" ? "you" : "another_brain";

  const body = document.createElement("p");
  body.textContent = text;

  article.append(roleNode, body);
  if (role === "assistant" && meta) {
    const footer = document.createElement("div");
    footer.className = "message-footer";
    footer.textContent = `source: ${meta.source || "unknown"} / evidence: ${meta.evidence || "none"}`;
    article.append(footer);
  }
  messageList.append(article);
  messageList.scrollTop = messageList.scrollHeight;
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
  const visibleFallbackReason = packet.fallback_reason
    || truth.blocker
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
  setText(modelSourceBadge, packet.answer_source_label || sourceLabel(trace));
  setText(tokenizerStatusBadge, `tokenizer: ${trace.model?.tokenizer || packet.decode_status || "not checked"}`);
  setText(q4StatusBadge, `q4 forward: ${trace.model?.q4_forward_ran ? "true" : `false / ${visibleFallbackReason}`}`);
  renderQ4RetryStatus(packet);
  renderTrace(trace);
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
    setText(q4StatusBadge, "q4 forward: false");
    return;
  }
  const input = trace.input_packet || {};
  const rag = trace.rag || {};
  const model = trace.model || {};
  const router = trace.router || {};
  const finalizer = trace.finalizer || {};
  const truth = trace.runtime_truth_table || {};
  const topSources = (rag.top_sources || []).map((item) => {
    const provenance = item.provenance ? `:${item.provenance}` : "";
    const kind = item.kind ? `:${item.kind}` : "";
    return `${item.title || "local evidence"}${kind}${provenance}`;
  }).filter(Boolean).join(" / ") || "无";
  const toneHints = (rag.tone_hints || []).join(", ") || "none";
  setText(traceInputSummary, `has_user_input=${boolText(input.has_user_input)} / adapter_context_present=${boolText(input.adapter_context_present)}`);
  setText(traceContextSummary, `has_local_context=${boolText(input.has_local_context)} / local-session-only / not saved`);
  setText(traceEvidenceSummary, `retrieval_used=${boolText(rag.retrieval_used)} / evidence_count=${rag.evidence_count || 0} / evidence_status=${rag.evidence_status || "none"} / sources=${topSources} / tone_hints=${toneHints}`);
  setText(traceDraftSummary, `asset_manifest_loaded=${boolText(model.asset_manifest_loaded)} / shards_verified=${boolText(model.shards_verified)} / tokenizer=${model.tokenizer || "none"} / q4_forward_ran=${boolText(model.q4_forward_ran)} / tokens=${model.tokens_generated || 0} / model_draft_generated=${boolText(model.draft_generated)}`);
  setText(traceRouterSummary, `route=${router.route || "not_run"} / used_model_draft=${boolText(router.used_model_draft)} / finalizer_replaced_draft=${boolText(router.replaced_model_draft)} / reason=${router.reason || "none"}`);
  setText(traceFinalSummary, `final_answer_source=${sourceLabel(trace)} / truth=${truth.ok === false ? (truth.failures || []).join(", ") : "pass"} / quality_flags=${(finalizer.quality_flags || []).join(", ") || "none"} / fallback_reason=${finalizer.fallback_reason || truth.blocker || "none"}`);
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
  setText(uiVersionBadge, `${R28HOTFIX1_BUILD_MARKER} · ${config.ui_version || R28HOTFIX1_UI_VERSION}`);
  setText(uiBuildStatus, `${R28HOTFIX1_BUILD_MARKER} / ${R28MERGE3_UI_VERSION} / base=${config.ui_version || R28HOTFIX1_UI_VERSION}`);
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
  const pathHint = failingShardPaths.length
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
}

function setPipelineStatus(status) {
  const labels = {
    loading_model: ["Loading", "Pending", "Pending", "Unused"],
    retrieving_local_memory: ["Loaded", "Retrieving", "Pending", "Unused"],
    drafting: ["Loaded", "Ready", "Drafting", "Unused"],
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
on(loadingDashboardButton, "click", () => setUiMode("dashboard"));
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
  setLoadingScreenActive(false);
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
  if (appShell) appShell.dataset.generating = "true";
  setDisabled(abortButton, false);
  try {
    const packet = await runtime.run(text, { onStatus: setPipelineStatus });
    lastPacket = packet;
    setDisabled(stateExportButton, false);
    appendMessage("assistant", packet.final_answer, {
      source: packet.answer_source_label || sourceLabel(packet.process_trace || {}),
      evidence: packet.evidence_packet?.evidence_status || "none"
    });
    updateStatus(packet);
    renderAssetStatus(packet.asset_status, runtime.deliveryConfig);
    renderDebug();
  } finally {
    running = false;
    if (appShell) appShell.dataset.generating = "false";
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
    setLoadingScreenActive(false);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
