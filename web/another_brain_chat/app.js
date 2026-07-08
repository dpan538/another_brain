import { BrowserChatRuntime } from "./browser_runtime.js?v=r28ux6-minimal-chat-dashboard";
import { createLocalContextBridge, createStateAdapterPacket } from "./context_bridge.js?v=r28ux6-minimal-chat-dashboard";
import { createModelLoadingScreen } from "./loading_screen.js?v=r28ux6-minimal-chat-dashboard";

const R28UX6_UI_VERSION = "r28ux6-minimal-chat-dashboard";
const R28UX6_BUILD_MARKER = "R28UX6";
const R28HOTFIX3_UI_VERSION = R28UX6_UI_VERSION;
const R28HOTFIX3_BUILD_MARKER = R28UX6_BUILD_MARKER;
const R28HOTFIX2_UI_VERSION = R28HOTFIX3_UI_VERSION;
const R28HOTFIX2_BUILD_MARKER = R28HOTFIX3_BUILD_MARKER;
const R28HOTFIX1_UI_VERSION = R28HOTFIX3_UI_VERSION;
const R28HOTFIX1_BUILD_MARKER = R28HOTFIX3_BUILD_MARKER;

const DEFAULT_DELIVERY_CONFIG = Object.freeze({
  delivery_mode: "demo_static",
  model_mode: "static_q4_experimental",
  rag_mode: "static_demo",
  prelaunch_stage: "r28rout1",
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
const appShell = document.querySelector("#app-shell");
const modeChatButton = document.querySelector("#mode-chat-button");
const modeDashboardButton = document.querySelector("#mode-dashboard-button");
const chatModelBadge = document.querySelector("#chat-model-badge");
const chatSourceBadge = document.querySelector("#chat-source-badge");

let lastPacket = null;
let running = false;
let activeSelfCheckController = null;
let loadingScreen = null;
let loadingScreenDismissed = false;
const contextBridge = createLocalContextBridge();
let runtime = new BrowserChatRuntime({ mode: DEFAULT_DELIVERY_CONFIG.model_mode, deliveryConfig: DEFAULT_DELIVERY_CONFIG });

const INITIAL_ASSISTANT_MESSAGE = [
  "你好。我会先用本地小模型和边界回答；证据不足时不会硬编。"
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

function setUIMode(mode = "chat") {
  const nextMode = mode === "dashboard" ? "dashboard" : "chat";
  if (appShell) appShell.dataset.uiMode = nextMode;
  if (modeChatButton) modeChatButton.setAttribute("aria-pressed", nextMode === "chat" ? "true" : "false");
  if (modeDashboardButton) modeDashboardButton.setAttribute("aria-pressed", nextMode === "dashboard" ? "true" : "false");
}

function setLoadingMode(active = false) {
  if (appShell) appShell.dataset.loadingMode = active ? "active" : "done";
}

function setGenerating(value = false) {
  if (appShell) appShell.dataset.generating = value ? "true" : "false";
}

function sourceLabel(trace = {}) {
  if (trace.answer_source_label) return trace.answer_source_label;
  if (trace.model?.q4_forward_ran && trace.router?.used_model_draft) return "static_q4_experimental";
  if (trace.router?.replaced_model_draft || String(trace.router?.route || "").includes("boundary")) return "hard_router_boundary";
  if (String(trace.runtime_mode || "").includes("synthetic")) return "synthetic_fallback";
  return "no_model_fallback";
}

function compactSourceLabel(packet = null) {
  if (!packet) return "none";
  const trace = packet.process_trace || {};
  if (trace.model?.q4_forward_ran) return "q4";
  if (packet.fallback_used || String(trace.runtime_mode || "").includes("synthetic")) return "fallback";
  if (String(trace.router?.route || "").includes("surface") || String(trace.router?.route || "").includes("boundary")) return "router";
  return sourceLabel(trace).includes("fallback") ? "fallback" : "router";
}

function evidenceLabel(packet = null) {
  if (!packet) return "none";
  return packet.evidence_packet?.evidence_status || packet.process_trace?.rag?.evidence_status || "none";
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
  if (meta && role === "assistant") {
    const metaNode = document.createElement("div");
    metaNode.className = "message-meta";
    metaNode.textContent = `source: ${meta.source || "router"} · evidence: ${meta.evidence || "none"}`;
    article.append(metaNode);
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
  appendMessage("assistant", INITIAL_ASSISTANT_MESSAGE, { source: "router", evidence: "none" });
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
    route: packet.answer_route || packet.route_policy?.route || "not_run",
    fallback_reason: packet.fallback_reason || "",
    loading_state: packet.loading_state || null,
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
  if (packet.loading_state) renderLoadingPanel(packet.loading_state);
  const evidenceStatus = packet.evidence_packet?.evidence_status || "unknown";
  setText(retrievalStatus, `${packet.retrieved_evidence.length} evidence / ${evidenceStatus}`);
  setText(verifierStatus, packet.verifier_result.passed ? "Passed" : "Blocked");
  setText(fallbackStatus, packet.fallback_used ? "Used" : "Unused");
  setText(decodeStatus, packet.decode_status || packet.runtime_stats?.decode_status || "not checked");
  setText(tokenCountStatus, `${packet.runtime_stats?.tokens_generated || 0} generated`);
  setText(runtimeModeStatus, packet.runtime_stats?.runtime_mode || packet.state_packet?.mode || "unknown");
  setText(routeStatus, packet.answer_route || packet.route_policy?.route || "not_run");
  setText(fallbackReasonStatus, packet.fallback_reason || (packet.fallback_used ? "runtime_or_verifier_fallback" : "none"));
  const trace = packet.process_trace || {};
  setText(answerSourceStatus, packet.answer_source_label || sourceLabel(trace));
  setText(draftGeneratedStatus, boolText(trace.model?.draft_generated));
  setText(draftReplacedStatus, boolText(trace.router?.replaced_model_draft));
  setText(modelSourceBadge, packet.answer_source_label || sourceLabel(trace));
  setText(tokenizerStatusBadge, `tokenizer: ${trace.model?.tokenizer || packet.decode_status || "not checked"}`);
  const loadingState = packet.loading_state || {};
  setText(q4StatusBadge, loadingState.state === "q4_ready" ? "q4 ready" : `q4 forward: ${trace.model?.q4_forward_ran ? "true" : "false"}`);
  setText(chatModelBadge, `model: ${loadingState.state === "q4_ready" ? "q4 ready" : packet.runtime_stats?.runtime_mode || runtime.loadingState?.state || "fallback"}`);
  setText(chatSourceBadge, `source: ${compactSourceLabel(packet)} / evidence: ${evidenceLabel(packet)}`);
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
    setText(q4StatusBadge, runtime.loadingState?.state === "q4_ready" ? "q4 ready" : "q4 forward: false");
    return;
  }
  const input = trace.input_packet || {};
  const rag = trace.rag || {};
  const model = trace.model || {};
  const router = trace.router || {};
  const finalizer = trace.finalizer || {};
  const topSources = (rag.top_sources || []).map((item) => {
    const title = item.title || item.source_id || "local";
    const provenance = item.provenance || item.kind || "";
    return provenance ? `${title} (${provenance})` : title;
  }).filter(Boolean).join(" / ") || "无";
  setText(traceInputSummary, `has_user_input=${boolText(input.has_user_input)} / adapter_context_present=${boolText(input.adapter_context_present)}`);
  setText(traceContextSummary, `has_local_context=${boolText(input.has_local_context)} / local-session-only / not saved`);
  setText(traceEvidenceSummary, `retrieval_used=${boolText(rag.retrieval_used)} / evidence_count=${rag.evidence_count || 0} / evidence_status=${rag.evidence_status || "none"} / sources=${topSources}`);
  setText(traceDraftSummary, `asset_manifest_loaded=${boolText(model.asset_manifest_loaded)} / shards_verified=${boolText(model.shards_verified)} / tokenizer=${model.tokenizer || "none"} / q4_forward_ran=${boolText(model.q4_forward_ran)} / tokens=${model.tokens_generated || 0} / model_draft_generated=${boolText(model.draft_generated)}`);
  setText(traceRouterSummary, `route=${router.route || "not_run"} / used_model_draft=${boolText(router.used_model_draft)} / finalizer_replaced_draft=${boolText(router.replaced_model_draft)} / reason=${router.reason || "none"}`);
  setText(traceFinalSummary, `final_answer_source=${sourceLabel(trace)} / quality_flags=${(finalizer.quality_flags || []).join(", ") || "none"} / fallback_reason=${finalizer.fallback_reason || "none"}`);
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
  setText(uiBuildStatus, `${R28HOTFIX1_BUILD_MARKER} / ${config.ui_version || R28HOTFIX1_UI_VERSION}`);
  setText(q4StatusBadge, "q4 forward: not checked");
  const releaseBlockers = Array.isArray(config.release_blockers) ? config.release_blockers : DEFAULT_DELIVERY_CONFIG.release_blockers;
  setText(candidateRouteStatus, config.candidate_route || DEFAULT_DELIVERY_CONFIG.candidate_route);
  setText(handoffSourceStatus, config.handoff_source || DEFAULT_DELIVERY_CONFIG.handoff_source);
  setText(adapterStatus, config.adapter_status || DEFAULT_DELIVERY_CONFIG.adapter_status);
  setText(releaseBlockerStatus, releaseBlockers.join(" / "));
  setText(decodeStatus, config.tokenizer_decode_status || "not checked");
  setText(runtimeModeStatus, config.model_mode || DEFAULT_DELIVERY_CONFIG.model_mode);
  setText(fallbackReasonStatus, config.runtime_fallback_reason || "fallback_available");
  setText(chatModelBadge, `model: ${config.model_mode || DEFAULT_DELIVERY_CONFIG.model_mode}`);
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

function renderLoadingPanel(report = null) {
  if (!loadingScreen) return;
  let state = null;
  if (!report) {
    state = loadingScreen.render({
      state: "idle",
      manifest: "skipped",
      shards: "skipped",
      tokenizer: "skipped",
      q4_forward: "skipped",
      runtime_mode: "synthetic_fallback",
      decode_status: "not_run",
      cancelable: false
    });
  } else {
    state = loadingScreen.render(report.loading_state || report);
  }
  if (["q4_ready", "fallback_ready", "timeout", "cancelled", "failed"].includes(state?.state)) {
    setLoadingMode(false);
  } else if (!loadingScreenDismissed) {
    setLoadingMode(true);
  }
}

function renderSelfCheck(report = null) {
  renderLoadingPanel(report);
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
  const loading = report.loading_state || {};
  setText(selfCheckStage, `${loading.state || report.state || report.status || "idle"}${report.check_level ? ` / ${report.check_level}` : ""}${report.stage ? ` / ${report.stage}` : ""}`);
  setText(selfCheckElapsed, `${Number(report.elapsed_ms || 0)} ms`);
  const isChecking = String(report.status || "").startsWith("checking");
  const manifestStatus = loading.manifest || (report.assets?.manifest_loaded ? "pass" : isChecking ? "checking" : "fail");
  const shardStatus = loading.shards || (report.assets?.shards_verified ? "pass" : isChecking ? "checking" : "fail");
  const tokenizerStatus = loading.tokenizer || (report.tokenizer?.exact_runtime_tokenizer ? "pass" : isChecking ? "checking" : "fail");
  const normalizedShardPaths = Array.isArray(report.assets?.normalized_shard_paths) ? report.assets.normalized_shard_paths : [];
  const failingShardPaths = Array.isArray(report.assets?.failing_shard_paths) ? report.assets.failing_shard_paths : [];
  const pathHint = failingShardPaths.length
    ? ` / failing=${failingShardPaths.slice(0, 2).join(", ")}`
    : normalizedShardPaths.length
      ? ` / path=${normalizedShardPaths[0]}`
      : "";
  setText(selfCheckAssets, `manifest=${manifestStatus} / q4 shards=${shardStatus} ${report.assets?.q4_shard_count || 0}/${report.assets?.expected_shard_count || 0}${pathHint}`);
  setText(selfCheckTokenizer, `exact tokenizer=${tokenizerStatus}`);
  setText(selfCheckQ4, `${loading.q4_forward || report.q4_forward?.status || "fail"} / q4_forward_ran=${boolText(loading.q4_forward_ran ?? report.q4_forward?.q4_forward_ran)}`);
  setText(selfCheckTokens, String(loading.tokens_generated ?? report.q4_forward?.tokens_generated ?? 0));
  setText(selfCheckRuntimeMode, loading.runtime_mode || report.q4_forward?.runtime_mode || (report.q4_forward?.q4_forward_ran ? "static_q4_experimental" : "synthetic_fallback"));
  setText(selfCheckAnswerSource, (loading.state === "q4_ready" || report.q4_forward?.q4_forward_ran) ? "static_q4_experimental" : "no_model_fallback");
  setText(selfCheckFallback, report.fallback?.status || "可用");
  setText(selfCheckFallbackReason, loading.blocker || report.fallback?.reason || report.q4_forward?.blocker || "none");
  setText(selfCheckOutput, `输出：tokens=${report.q4_forward?.tokens_generated || 0} / ${report.output?.text_preview || "no q4 text"}`);
  setText(selfCheckBlockers, `blocker：${loading.blocker || (report.blockers || []).join(" / ") || "none"}`);
  setText(q4StatusBadge, loading.state === "q4_ready" ? "q4 ready" : `q4 forward: ${loading.q4_forward || report.q4_forward?.status || "false"}`);
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
  const loadResult = await runtime.load();
  setText(modelStatus, `${loadResult.mode} loaded`);
  setText(retrievalStatus, deliveryConfig.rag_mode);
  renderAssetStatus(loadResult.asset_status, deliveryConfig);
  renderContextBridge();
  renderTrace(null);
  renderSelfCheck({
    status: "checking_quick",
    state: "checking_manifest",
    loading_state: {
      state: "checking_manifest",
      manifest: "pending",
      shards: "pending",
      tokenizer: "pending",
      q4_forward: "pending",
      q4_forward_ran: false,
      tokens_generated: 0,
      decode_status: "not_run",
      runtime_mode: "synthetic_fallback",
      blocker: null,
      elapsed_ms: 0,
      cancelable: true
    },
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
  const report = await runtime.quickSelfCheckModelPath({ jsonTimeoutMs: 1000, shardTimeoutMs: 1000 });
  renderSelfCheck(report);
  renderAssetStatus(runtime.assetStatus, runtime.deliveryConfig);
  if (report.ok) {
    setText(modelStatus, "warming_q4");
    setText(runtimeModeStatus, "synthetic_fallback");
    setText(decodeStatus, "exact_runtime_tokenizer");
    setText(tokenCountStatus, "0 generated");
    setText(answerSourceStatus, "no_model_fallback");
    const warmupReport = await runtime.deepSelfCheckModelPath({
      timeoutMs: 8000,
      shardTimeoutMs: 10000,
      onProgress: renderSelfCheck
    });
    renderSelfCheck(warmupReport);
    renderAssetStatus(runtime.assetStatus, runtime.deliveryConfig);
    if (warmupReport.loading_state?.state === "q4_ready") {
      setText(modelStatus, "q4_ready");
      setText(runtimeModeStatus, "static_q4_experimental");
      setText(decodeStatus, warmupReport.loading_state.decode_status);
      setText(tokenCountStatus, `${warmupReport.loading_state.tokens_generated || 0} generated`);
      setText(answerSourceStatus, "self_check_static_q4_experimental");
      setText(chatModelBadge, "model: q4 ready");
    } else {
      setText(modelStatus, warmupReport.loading_state?.state || "fallback_ready");
      setText(runtimeModeStatus, "synthetic_fallback");
      setText(fallbackReasonStatus, warmupReport.loading_state?.blocker || (warmupReport.blockers || []).join(" / ") || "q4_self_check_failed");
      setText(chatModelBadge, "model: fallback ready");
    }
  } else {
    setText(modelStatus, report.loading_state?.state || "fallback_ready");
    setText(runtimeModeStatus, "synthetic_fallback");
    setText(fallbackReasonStatus, report.loading_state?.blocker || (report.blockers || []).join(" / ") || "q4_self_check_failed");
    setText(chatModelBadge, "model: fallback ready");
  }
}

function bindEvents() {
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
  setGenerating(true);
  setDisabled(abortButton, false);
  try {
    const packet = await runtime.run(text, { onStatus: setPipelineStatus });
    lastPacket = packet;
    setDisabled(stateExportButton, false);
    appendMessage("assistant", packet.final_answer, {
      source: compactSourceLabel(packet),
      evidence: evidenceLabel(packet)
    });
    updateStatus(packet);
    renderAssetStatus(packet.asset_status, runtime.deliveryConfig);
    renderDebug();
  } finally {
    running = false;
    setGenerating(false);
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
on(modeChatButton, "click", () => setUIMode("chat"));
on(modeDashboardButton, "click", () => setUIMode("dashboard"));

on(modelSelfCheckButton, "click", async () => {
  if (activeSelfCheckController) {
    activeSelfCheckController.abort();
    activeSelfCheckController = null;
  }
  const controller = new AbortController();
  activeSelfCheckController = controller;
  setDisabled(modelSelfCheckButton, true);
  setDisabled(modelSelfCheckStopButton, false);
  setText(selfCheckAssets, "检查中");
  setText(selfCheckTokenizer, "检查中");
  setText(selfCheckQ4, "quick check");
  try {
    const report = await runtime.deepSelfCheckModelPath({
      timeoutMs: 8000,
      shardTimeoutMs: 10000,
      signal: controller.signal,
      onProgress: renderSelfCheck
    });
    renderSelfCheck(report);
  } catch (error) {
    renderSelfCheck({
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
    });
  } finally {
    if (activeSelfCheckController === controller) activeSelfCheckController = null;
    setDisabled(modelSelfCheckButton, false);
    setDisabled(modelSelfCheckStopButton, true);
  }
});

on(modelSelfCheckStopButton, "click", () => {
  if (activeSelfCheckController) {
    activeSelfCheckController.abort();
    runtime.cancelSelfCheck("self_check_cancelled");
  }
  activeSelfCheckController = null;
  setDisabled(modelSelfCheckStopButton, true);
  setDisabled(modelSelfCheckButton, false);
  renderSelfCheck({
    status: "cancelled",
    state: "cancelled",
    loading_state: {
      state: "cancelled",
      manifest: "skipped",
      shards: "skipped",
      tokenizer: "skipped",
      q4_forward: "skipped",
      q4_forward_ran: false,
      tokens_generated: 0,
      decode_status: "not_run",
      runtime_mode: "synthetic_fallback",
      blocker: "self_check_cancelled",
      elapsed_ms: 0,
      cancelable: false
    },
    check_level: "deep",
    stage: "user_cancelled",
    elapsed_ms: 0,
    assets: { status: "取消", q4_shard_count: 0, expected_shard_count: Number(runtime.deliveryConfig?.shard_count || 0) },
    tokenizer: { status: "skipped" },
    q4_forward: { status: "skipped", q4_forward_ran: false, tokens_generated: 0 },
    fallback: { status: "可用", reason: "self_check_cancelled" },
    output: { text_preview: "" },
    blockers: ["self_check_cancelled"]
  });
});
}

function renderCancelledLoading(reason = "model_loading_cancelled") {
  renderSelfCheck({
    status: "cancelled",
    state: "cancelled",
    check_level: "deep",
    stage: "user_cancelled",
    elapsed_ms: 0,
    loading_state: {
      state: "cancelled",
      manifest: "skipped",
      shards: "skipped",
      tokenizer: "skipped",
      q4_forward: "skipped",
      q4_forward_ran: false,
      tokens_generated: 0,
      decode_status: "not_run",
      runtime_mode: "synthetic_fallback",
      blocker: reason,
      elapsed_ms: 0,
      cancelable: false
    },
    assets: { status: "取消", q4_shard_count: 0, expected_shard_count: Number(runtime.deliveryConfig?.shard_count || 0) },
    tokenizer: { status: "skipped" },
    q4_forward: { status: "skipped", q4_forward_ran: false, tokens_generated: 0, blocker: reason },
    fallback: { status: "可用", reason },
    output: { text_preview: "" },
    blockers: [reason]
  });
  setText(modelStatus, "cancelled / fallback_ready");
  setText(runtimeModeStatus, "synthetic_fallback");
  setText(fallbackReasonStatus, reason);
  setText(chatModelBadge, "model: light mode");
}

function start() {
  setUIMode("chat");
  setLoadingMode(true);
  loadingScreen = createModelLoadingScreen({
    onCancel: () => {
      loadingScreenDismissed = true;
      if (activeSelfCheckController) activeSelfCheckController.abort();
      runtime.cancelSelfCheck("model_loading_cancelled");
      activeSelfCheckController = null;
      setDisabled(modelSelfCheckButton, false);
      setDisabled(modelSelfCheckStopButton, true);
      renderCancelledLoading("model_loading_cancelled");
      setLoadingMode(false);
      setUIMode("chat");
    },
    onDashboard: () => {
      loadingScreenDismissed = true;
      setLoadingMode(false);
      setUIMode("dashboard");
    }
  });
  bindEvents();
  boot().catch((error) => {
    console.warn("[another_brain] boot_warning", error);
    setText(modelStatus, "q4_blocked");
    setText(runtimeModeStatus, "synthetic_fallback");
    setText(fallbackReasonStatus, error.message || "boot_failed");
    renderSelfCheck({
      status: "failed",
      state: "failed",
      loading_state: {
        state: "failed",
        manifest: "fail",
        shards: "skipped",
        tokenizer: "skipped",
        q4_forward: "skipped",
        q4_forward_ran: false,
        tokens_generated: 0,
        decode_status: "not_run",
        runtime_mode: "synthetic_fallback",
        blocker: error.message || "boot_failed",
        elapsed_ms: 0,
        cancelable: false
      },
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
