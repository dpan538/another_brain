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
  candidate_warning: "未加载真实模型 assets；当前使用 synthetic / fallback 路径。",
  security_policy: "r28sec0-static-security-v1",
  local_only: true,
  imported_context_training_data: false,
  no_local_persistence_default: true,
  asset_cache_mode: "memory_fallback",
  asset_cache_policy: "same_origin_shards_only",
  asset_loader_resilience: "checksum_retry_abort_partial_fallback",
  offline_static_readiness: "shell_reload_only_no_model_assets",
  non_product_warning: "当前只是 prelaunch engineering candidate，不是 product model。"
});

const form = document.querySelector("#chat-form");
const input = document.querySelector("#chat-input");
const messageList = document.querySelector("#message-list");
const modelStatus = document.querySelector("#model-status");
const retrievalStatus = document.querySelector("#retrieval-status");
const verifierStatus = document.querySelector("#verifier-status");
const fallbackStatus = document.querySelector("#fallback-status");
const answerStatus = document.querySelector("#answer-status");
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
const debugToggle = document.querySelector("#debug-toggle");
const debugOutput = document.querySelector("#debug-output");
const packetDebugOutput = document.querySelector("#packet-debug-output");
const evidenceList = document.querySelector("#evidence-list");
const evidenceCount = document.querySelector("#evidence-count");
const contextImport = document.querySelector("#context-import");
const contextImportButton = document.querySelector("#context-import-button");
const contextClearButton = document.querySelector("#context-clear-button");
const stateExportButton = document.querySelector("#state-export-button");
const contextBridgeStatus = document.querySelector("#context-bridge-status");
const contextValidation = document.querySelector("#context-validation");
const contextPrivacyNote = document.querySelector("#context-privacy-note");
const contextTabText = document.querySelector("#context-tab-text");
const contextTabJson = document.querySelector("#context-tab-json");
const localIndicator = document.querySelector("#local-indicator");
const backendBadge = document.querySelector("#backend-badge");
const retryLastButton = document.querySelector("#retry-last-button");
const clearConversationButton = document.querySelector("#clear-conversation-button");
const sendButton = document.querySelector("#send-button");

let lastPacket = null;
let lastUserText = "";
let contextMode = "text";
let evidenceExpanded = false;
const contextBridge = createLocalContextBridge();
let runtime = new BrowserChatRuntime({ mode: DEFAULT_DELIVERY_CONFIG.model_mode, deliveryConfig: DEFAULT_DELIVERY_CONFIG });

function reasonLabel(reason = "") {
  const labels = {
    empty_evidence: "没有足够证据",
    insufficient_evidence: "证据不足",
    conflicting_evidence: "证据冲突",
    evidence_policy_refuse: "证据包含安全风险",
    evidence_hidden_prompt_request: "证据请求隐藏提示",
    evidence_instruction_injection: "证据像指令注入",
    hidden_prompt_or_developer_marker_blocked: "请求隐藏提示或开发者消息",
    prompt_injection_marker_blocked: "请求覆盖运行策略",
    chain_of_thought_request_blocked: "请求隐藏推理",
    input_too_large: "输入过长",
    generation_timeout: "生成超时",
    cache_storage_unavailable: "浏览器缓存不可用"
  };
  return labels[reason] || reason || "本地静态 guard";
}

function routeName(config) {
  const route = String(config.candidate_route || config.model_route || config.model_mode || "").toLowerCase();
  if (route.includes("product_path")) return "product_path_candidate_not_admitted";
  if (route.includes("metadata") || route.includes("candidate")) return "metadata_bound_candidate";
  return "synthetic_demo";
}

function setAnswerStatus(text) {
  answerStatus.textContent = text;
}

function makeMessage(role, text, options = {}) {
  const article = document.createElement("article");
  article.className = `message message-${role}${options.pending ? " message-pending" : ""}`;
  article.tabIndex = -1;

  const roleNode = document.createElement("div");
  roleNode.className = "message-role";
  roleNode.textContent = role === "user" ? "你" : "another_brain · 本地静态壳";

  const body = document.createElement("p");
  body.className = "message-body";
  body.textContent = text;

  article.append(roleNode, body);
  if (role === "assistant") {
    const actions = document.createElement("div");
    actions.className = "inline-message-actions";

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "mini-button";
    copyButton.textContent = "复制回答";
    copyButton.addEventListener("click", async () => {
      await copyAnswer(body.textContent);
      copyButton.textContent = "已复制";
      setTimeout(() => {
        copyButton.textContent = "复制回答";
      }, 1200);
    });
    actions.append(copyButton);
    article.append(actions);
  }
  messageList.append(article);
  messageList.scrollTop = messageList.scrollHeight;
  return { article, body };
}

async function copyAnswer(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    setAnswerStatus("回答已复制到剪贴板");
  } else {
    setAnswerStatus("当前浏览器不支持一键复制");
  }
}

function renderEvidence(packet = lastPacket) {
  const evidence = packet?.retrieved_evidence || [];
  evidenceCount.textContent = `${evidence.length} 条证据`;
  evidenceList.replaceChildren();
  if (evidence.length === 0) {
    const item = document.createElement("li");
    item.textContent = "暂无可展示证据；fallback 会说明原因。";
    evidenceList.append(item);
  } else {
    for (const record of evidence) {
      const item = document.createElement("li");
      const score = Number(record.retrieval_score || 0).toFixed(3);
      const title = document.createElement("strong");
      const meta = document.createElement("span");
      const text = document.createElement("p");
      title.textContent = record.title || "本地证据";
      meta.textContent = `${record.source_id || "local"} · score ${score}`;
      text.textContent = record.text || "";
      item.append(title, meta, text);
      evidenceList.append(item);
    }
  }
  packetDebugOutput.textContent = JSON.stringify(packet || {}, null, 2);
}

function renderDebug() {
  debugOutput.hidden = !evidenceExpanded;
  debugToggle.setAttribute("aria-expanded", String(evidenceExpanded));
  debugToggle.querySelector("span").textContent = evidenceExpanded ? "收起 evidence panel" : "展开 evidence panel";
  renderEvidence();
}

function updateStatus(packet) {
  const evidenceStatus = packet.evidence_packet?.evidence_status || "unknown";
  const fallbackReason = packet.reason || packet.verifier_result.failures?.[0] || "";
  retrievalStatus.textContent = `${packet.retrieved_evidence.length} 条证据 / ${evidenceStatus}`;
  verifierStatus.textContent = packet.verifier_result.passed ? "通过" : "已阻止";
  fallbackStatus.textContent = packet.fallback_used ? `已使用 / ${reasonLabel(fallbackReason)}` : "未使用";
  setAnswerStatus(packet.fallback_used ? `已回退：${reasonLabel(fallbackReason)}` : "已完成：通过本地 verifier");
  renderEvidence(packet);
}

function renderContextBridge(result = null) {
  const summary = contextBridge.summary();
  contextBridgeStatus.textContent = `${summary.packet_count} 个 packet / ${summary.evidence_record_count} 条证据`;
  contextPrivacyNote.textContent = "仅本地 session 使用；不会写入训练数据，也不会发送到后端。";
  if (result?.ok) {
    const warning = result.warnings?.length ? `；提示：${result.warnings.join(", ")}` : "";
    contextValidation.textContent = `导入成功：${result.packet.packet_type}，当前 session 可用；不会进入训练${warning}`;
  } else if (result?.failures?.length) {
    contextValidation.textContent = `导入失败：${result.failures.join("，")}`;
  } else {
    contextValidation.textContent = "等待导入：支持纯文本或符合 C0 contract 的 JSON packet。";
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
  const currentRoute = routeName(config);
  localIndicator.textContent = config.local_only === false ? "本地策略已阻止" : "本地静态运行";
  backendBadge.textContent = config.external_llm_api || config.backend_inference
    ? "远端推理配置已阻止"
    : "无后端 / 无外部 LLM";
  deliveryMode.textContent = config.delivery_mode;
  configuredModelMode.textContent = config.model_mode;
  configuredRagMode.textContent = config.rag_mode;
  budgetStatus.textContent = config.budget_status;
  candidateRouteStatus.textContent = currentRoute;
  handoffSourceStatus.textContent = config.handoff_source || DEFAULT_DELIVERY_CONFIG.handoff_source;
  adapterStatus.textContent = `${config.adapter_status || DEFAULT_DELIVERY_CONFIG.adapter_status} / 仅本地 session`;
  const releaseBlockers = Array.isArray(config.release_blockers) ? config.release_blockers : DEFAULT_DELIVERY_CONFIG.release_blockers;
  releaseBlockerStatus.textContent = releaseBlockers.join(" / ");
  nonProductWarning.textContent = [
    "当前不是 product model，也没有 admission。",
    "若没有真实模型 assets，界面会使用 fallback / synthetic。",
    config.candidate_warning || config.non_product_warning || DEFAULT_DELIVERY_CONFIG.non_product_warning
  ].join(" ");
}

function renderAssetStatus(status, config = DEFAULT_DELIVERY_CONFIG) {
  const assetStatus = status || {};
  assetCacheStatus.textContent = `${assetStatus.cache_mode || config.asset_cache_mode} / ${assetStatus.cache_result || "未检查"}`;
  assetProgressStatus.textContent = assetStatus.progress || "0/0";
  assetVerificationStatus.textContent = assetStatus.verification || config.asset_cache_status || "无模型资产";
  offlineStatus.textContent = assetStatus.offline_ready
    ? "静态壳可离线"
    : `回退：${reasonLabel(assetStatus.fallback_reason || "cache_storage_unavailable")}`;
}

function setPipelineStatus(status) {
  const labels = {
    loading_model: ["加载中", "等待", "等待", "未使用", "正在加载本地静态运行层"],
    retrieving_local_memory: ["已加载", "检索本地证据", "等待", "未使用", "正在读取 demo evidence 和导入上下文"],
    drafting: ["已加载", "证据就绪", "生成中", "未使用", "正在生成 synthetic draft"],
    verifying: ["已加载", "证据就绪", "校验中", "未使用", "正在检查答案边界"],
    final: ["已加载", "证据就绪", "通过", "未使用", "回答完成"],
    fallback: ["已加载", "证据就绪", "已阻止", "已使用", "已走 fallback"]
  };
  const [model, retrieval, verifier, fallback, answer] = labels[status] || labels.final;
  modelStatus.textContent = model;
  retrievalStatus.textContent = retrieval;
  verifierStatus.textContent = verifier;
  fallbackStatus.textContent = fallback;
  setAnswerStatus(answer);
}

function setContextMode(mode) {
  contextMode = mode;
  const isJson = mode === "json";
  contextTabText.classList.toggle("is-active", !isJson);
  contextTabJson.classList.toggle("is-active", isJson);
  contextTabText.setAttribute("aria-selected", String(!isJson));
  contextTabJson.setAttribute("aria-selected", String(isJson));
  contextImport.placeholder = isJson
    ? "粘贴 InputAdapterPacket / EvidencePacket / StatePacket JSON..."
    : "粘贴一段本地上下文；只进入当前 session，不保存，不训练。";
  contextImport.focus({ preventScroll: true });
}

async function runTurn(text) {
  if (!text.trim()) return;
  lastUserText = text.trim();
  retryLastButton.disabled = false;
  makeMessage("user", lastUserText);
  const pending = makeMessage("assistant", "正在生成本地回答...", { pending: true });
  input.value = "";
  sendButton.disabled = true;
  input.focus({ preventScroll: true });
  setPipelineStatus("loading_model");

  const packet = await runtime.run(lastUserText, { onStatus: setPipelineStatus });
  lastPacket = packet;
  stateExportButton.disabled = false;
  pending.article.classList.remove("message-pending");
  pending.body.textContent = packet.final_answer;
  updateStatus(packet);
  renderAssetStatus(packet.asset_status, runtime.deliveryConfig);
  renderDebug();
  sendButton.disabled = false;
  input.focus({ preventScroll: true });
}

async function boot() {
  const deliveryConfig = await loadDeliveryConfig().catch(() => DEFAULT_DELIVERY_CONFIG);
  renderDeliveryConfig(deliveryConfig);
  renderAssetStatus(null, deliveryConfig);
  runtime = new BrowserChatRuntime({ mode: deliveryConfig.model_mode, deliveryConfig });
  runtime.setContextPackets(contextBridge.getPackets());
  const loadResult = await runtime.load();
  modelStatus.textContent = `${loadResult.mode} 已加载`;
  retrievalStatus.textContent = deliveryConfig.rag_mode;
  renderAssetStatus(loadResult.asset_status, deliveryConfig);
  renderContextBridge();
  renderDebug();
  input.focus({ preventScroll: true });
}

contextTabText.addEventListener("click", () => setContextMode("text"));
contextTabJson.addEventListener("click", () => setContextMode("json"));

contextImportButton.addEventListener("click", () => {
  const result = contextBridge.importText(contextImport.value, { sourceLabel: contextMode === "json" ? "本地 JSON 导入" : "本地纯文本导入" });
  if (result.ok) {
    runtime.setContextPackets(contextBridge.getPackets());
    contextImport.value = "";
  }
  renderContextBridge(result);
  contextImport.focus({ preventScroll: true });
});

contextClearButton.addEventListener("click", () => {
  contextBridge.clear();
  runtime.setContextPackets([]);
  contextImport.value = "";
  renderContextBridge({ ok: false, failures: [] });
  contextValidation.textContent = "已清空导入上下文；后续回答只使用 demo evidence。";
  contextImport.focus({ preventScroll: true });
});

stateExportButton.addEventListener("click", () => {
  if (!lastPacket?.state_packet) {
    contextValidation.textContent = "还没有可导出的 state packet。";
    return;
  }
  setContextMode("json");
  const packet = createStateAdapterPacket(lastPacket.state_packet);
  contextImport.value = JSON.stringify(packet, null, 2);
  contextValidation.textContent = "StatePacket 已放入 JSON 输入框，可检查后再导入。";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runTurn(input.value);
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    form.requestSubmit();
  }
});

retryLastButton.addEventListener("click", async () => {
  if (!lastUserText) return;
  await runTurn(lastUserText);
});

clearConversationButton.addEventListener("click", () => {
  messageList.replaceChildren();
  lastPacket = null;
  lastUserText = "";
  retryLastButton.disabled = true;
  setAnswerStatus("对话已清空");
  renderEvidence(null);
  input.focus({ preventScroll: true });
});

debugToggle.addEventListener("click", () => {
  evidenceExpanded = !evidenceExpanded;
  renderDebug();
});

boot();
