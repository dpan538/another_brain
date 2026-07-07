import { BrowserChatRuntime } from "./browser_runtime.js";
import { createLocalContextBridge, createStateAdapterPacket } from "./context_bridge.js";

const DEFAULT_DELIVERY_CONFIG = Object.freeze({
  delivery_mode: "demo_static",
  model_mode: "synthetic_tiny",
  rag_mode: "static_demo",
  prelaunch_stage: "r28p0b",
  backend_inference: false,
  external_llm_api: false,
  product_model: false,
  browser_admission: false,
  release_checkpoint: false,
  budget_status: "under_100mb",
  candidate_route: "synthetic_only",
  handoff_source: "none",
  adapter_status: "local_session_import_export_ready",
  release_blockers: ["product_admission_pending", "browser_admission_pending", "release_checkpoint_pending"],
  candidate_static_bundle: false,
  candidate_warning: "No product-path candidate is admitted into the static bundle; engineering smoke remains separate.",
  asset_cache_mode: "memory_fallback",
  asset_cache_policy: "same_origin_shards_only",
  asset_loader_resilience: "checksum_retry_abort_partial_fallback",
  offline_static_readiness: "shell_reload_only_no_model_assets",
  non_product_warning: "Demo static mode uses mock/synthetic generation and demo memory only.",
  tokenizer_decode_status: "not_checked",
  runtime_tokenizer_blocker: "",
  runtime_fallback_reason: "fallback_available"
});

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
const fallbackReasonStatus = document.querySelector("#fallback-reason-status");
const debugToggle = document.querySelector("#debug-toggle");
const debugOutput = document.querySelector("#debug-output");
const contextImport = document.querySelector("#context-import");
const contextImportButton = document.querySelector("#context-import-button");
const contextClearButton = document.querySelector("#context-clear-button");
const stateExportButton = document.querySelector("#state-export-button");
const contextBridgeStatus = document.querySelector("#context-bridge-status");
const contextValidation = document.querySelector("#context-validation");

let lastPacket = null;
const contextBridge = createLocalContextBridge();
let runtime = new BrowserChatRuntime({ mode: DEFAULT_DELIVERY_CONFIG.model_mode, deliveryConfig: DEFAULT_DELIVERY_CONFIG });

function appendMessage(role, text) {
  const article = document.createElement("article");
  article.className = `message message-${role}`;

  const roleNode = document.createElement("div");
  roleNode.className = "message-role";
  roleNode.textContent = role === "user" ? "you" : "another_brain";

  const body = document.createElement("p");
  body.textContent = text;

  article.append(roleNode, body);
  messageList.append(article);
  messageList.scrollTop = messageList.scrollHeight;
}

function renderDebug() {
  debugOutput.hidden = !debugToggle.checked;
  debugOutput.textContent = JSON.stringify(lastPacket || {}, null, 2);
}

function updateStatus(packet) {
  const evidenceStatus = packet.evidence_packet?.evidence_status || "unknown";
  retrievalStatus.textContent = `${packet.retrieved_evidence.length} evidence / ${evidenceStatus}`;
  verifierStatus.textContent = packet.verifier_result.passed ? "Passed" : "Blocked";
  fallbackStatus.textContent = packet.fallback_used ? "Used" : "Unused";
  decodeStatus.textContent = packet.decode_status || packet.runtime_stats?.decode_status || "not checked";
  tokenCountStatus.textContent = `${packet.runtime_stats?.tokens_generated || 0} generated`;
  runtimeModeStatus.textContent = packet.runtime_stats?.runtime_mode || packet.state_packet?.mode || "unknown";
  fallbackReasonStatus.textContent = packet.fallback_reason || (packet.fallback_used ? "runtime_or_verifier_fallback" : "none");
}

function renderContextBridge(result = null) {
  const summary = contextBridge.summary();
  contextBridgeStatus.textContent = `${summary.packet_count} packets / ${summary.evidence_record_count} evidence`;
  if (result?.ok) {
    contextValidation.textContent = `${result.packet.packet_type} imported for this session`;
  } else if (result?.failures?.length) {
    contextValidation.textContent = `Rejected: ${result.failures.join(", ")}`;
  } else {
    contextValidation.textContent = "Local session only / not saved / not training data";
  }
}

async function loadDeliveryConfig() {
  if (!globalThis.location?.href) return DEFAULT_DELIVERY_CONFIG;
  const base = new URL(globalThis.location.href);
  const url = new URL("../another_brain/runtime_mode.json", base);
  if (url.origin !== base.origin) throw new Error("non_same_origin_runtime_mode_rejected");
  const response = await fetch(url.href);
  if (!response.ok) throw new Error(`runtime_mode_fetch_failed:${response.status}`);
  const config = await response.json();
  return { ...DEFAULT_DELIVERY_CONFIG, ...config };
}

function renderDeliveryConfig(config) {
  deliveryMode.textContent = config.delivery_mode;
  configuredModelMode.textContent = config.model_mode;
  configuredRagMode.textContent = config.rag_mode;
  budgetStatus.textContent = config.budget_status;
  const releaseBlockers = Array.isArray(config.release_blockers) ? config.release_blockers : DEFAULT_DELIVERY_CONFIG.release_blockers;
  candidateRouteStatus.textContent = config.candidate_route || DEFAULT_DELIVERY_CONFIG.candidate_route;
  handoffSourceStatus.textContent = config.handoff_source || DEFAULT_DELIVERY_CONFIG.handoff_source;
  adapterStatus.textContent = config.adapter_status || DEFAULT_DELIVERY_CONFIG.adapter_status;
  releaseBlockerStatus.textContent = releaseBlockers.join(" / ");
  decodeStatus.textContent = config.tokenizer_decode_status || "not checked";
  runtimeModeStatus.textContent = config.model_mode || DEFAULT_DELIVERY_CONFIG.model_mode;
  fallbackReasonStatus.textContent = config.runtime_fallback_reason || "fallback_available";
  const candidateWarning = config.candidate_route === "product_path" ? "" : config.candidate_warning;
  nonProductWarning.textContent = config.product_model
    ? ""
    : candidateWarning || config.non_product_warning || DEFAULT_DELIVERY_CONFIG.non_product_warning;
}

function renderAssetStatus(status, config = DEFAULT_DELIVERY_CONFIG) {
  const assetStatus = status || {};
  assetCacheStatus.textContent = `${assetStatus.cache_mode || config.asset_cache_mode} / ${assetStatus.cache_result || "not_checked"}`;
  assetProgressStatus.textContent = assetStatus.progress || "0/0";
  assetVerificationStatus.textContent = assetStatus.verification || config.asset_cache_status || "no_model_assets";
  offlineStatus.textContent = assetStatus.offline_ready
    ? "Cache-capable shell"
    : `Fallback: ${assetStatus.fallback_reason || "offline_cache_unavailable"}`;
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
  modelStatus.textContent = model;
  retrievalStatus.textContent = retrieval;
  verifierStatus.textContent = verifier;
  fallbackStatus.textContent = fallback;
}

async function boot() {
  const deliveryConfig = await loadDeliveryConfig().catch(() => DEFAULT_DELIVERY_CONFIG);
  renderDeliveryConfig(deliveryConfig);
  renderAssetStatus(null, deliveryConfig);
  runtime = new BrowserChatRuntime({ mode: deliveryConfig.model_mode, deliveryConfig });
  runtime.setContextPackets(contextBridge.getPackets());
  const loadResult = await runtime.load();
  modelStatus.textContent = `${loadResult.mode} loaded`;
  retrievalStatus.textContent = deliveryConfig.rag_mode;
  renderAssetStatus(loadResult.asset_status, deliveryConfig);
  renderContextBridge();
}

contextImportButton.addEventListener("click", () => {
  const result = contextBridge.importText(contextImport.value, { sourceLabel: "Manual local import" });
  if (result.ok) {
    runtime.setContextPackets(contextBridge.getPackets());
    contextImport.value = "";
  }
  renderContextBridge(result);
});

contextClearButton.addEventListener("click", () => {
  contextBridge.clear();
  runtime.setContextPackets([]);
  contextImport.value = "";
  renderContextBridge();
});

stateExportButton.addEventListener("click", () => {
  if (!lastPacket?.state_packet) {
    contextValidation.textContent = "No state packet yet";
    return;
  }
  const packet = createStateAdapterPacket(lastPacket.state_packet);
  contextImport.value = JSON.stringify(packet, null, 2);
  contextValidation.textContent = "StatePacket ready";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  appendMessage("user", text);
  input.value = "";
  input.focus();

  const packet = await runtime.run(text, { onStatus: setPipelineStatus });
  lastPacket = packet;
  stateExportButton.disabled = false;
  appendMessage("assistant", packet.final_answer);
  updateStatus(packet);
  renderAssetStatus(packet.asset_status, runtime.deliveryConfig);
  renderDebug();
});

debugToggle.addEventListener("change", renderDebug);

boot();
