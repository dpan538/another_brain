const LOADING_COPY = Object.freeze([
  "正在加载本地小模型",
  "不会调用云端 LLM",
  "如果模型不可用，会使用边界回答",
  "证据不足时不会硬编"
]);

const STEP_ORDER = Object.freeze([
  ["checking_manifest", "读取 manifest", "manifest"],
  ["checking_shards", "校验 shards", "shards"],
  ["checking_tokenizer", "加载 tokenizer", "tokenizer"],
  ["warming_q4", "q4 warmup", "q4_forward"],
  ["fallback_ready", "fallback available", "fallback"]
]);

function text(node, value) {
  if (node) node.textContent = String(value ?? "");
}

function normalizeLoadingState(report = {}) {
  const state = report.loading_state || report;
  return {
    state: state.state || "idle",
    manifest: state.manifest || "skipped",
    shards: state.shards || "skipped",
    tokenizer: state.tokenizer || "skipped",
    q4_forward: state.q4_forward || "skipped",
    q4_forward_ran: state.q4_forward_ran === true,
    tokens_generated: Number(state.tokens_generated || 0),
    decode_status: state.decode_status || "not_run",
    runtime_mode: state.runtime_mode || "synthetic_fallback",
    blocker: state.blocker || null,
    elapsed_ms: Number(state.elapsed_ms || 0),
    cancelable: state.cancelable === true
  };
}

function stepStatus(state, stepId, field) {
  if (stepId === "fallback_ready") {
    if (state.state === "q4_ready") return "skipped";
    if (["fallback_ready", "timeout", "cancelled", "failed"].includes(state.state)) return "pass";
    return "pending";
  }
  if (state.state === stepId) return "pending";
  const value = state[field];
  if (value === "pass") return "pass";
  if (value === "fail" || value === "timeout") return "fail";
  return "pending";
}

function progressForState(state) {
  if (state.state === "q4_ready") return 100;
  if (["fallback_ready", "timeout", "cancelled", "failed"].includes(state.state)) return 84;
  const passed = ["manifest", "shards", "tokenizer"].filter((field) => state[field] === "pass").length;
  const warm = state.state === "warming_q4" ? 1 : 0;
  return Math.min(92, 12 + passed * 18 + warm * 24);
}

function statusLabel(state) {
  if (state.state === "q4_ready") return "q4 ready";
  if (state.state === "timeout") return "q4 timeout / fallback available";
  if (state.state === "cancelled") return "cancelled / fallback available";
  if (state.state === "failed") return "failed / fallback available";
  if (state.state === "fallback_ready") return "fallback available";
  if (state.state === "warming_q4") return "q4 warmup";
  if (state.state === "checking_tokenizer") return "loading tokenizer";
  if (state.state === "checking_shards") return "checking shards";
  if (state.state === "checking_manifest") return "checking manifest";
  return "idle";
}

export function createModelLoadingScreen(options = {}) {
  const root = options.root || document.querySelector("#model-loading-panel");
  const status = options.status || document.querySelector("#loading-state-label");
  const substatus = options.substatus || document.querySelector("#loading-substatus");
  const copy = options.copy || document.querySelector("#loading-copy");
  const progress = options.progress || document.querySelector("#loading-progress-bar");
  const progressText = options.progressText || document.querySelector("#loading-progress-text");
  const steps = new Map(STEP_ORDER.map(([id]) => [id, document.querySelector(`[data-loading-step="${id}"]`)]));
  const cancelButton = options.cancelButton || document.querySelector("#loading-cancel-button");
  const dashboardButton = options.dashboardButton || document.querySelector("#loading-dashboard-button");
  let copyIndex = 0;
  let hiddenByUser = false;
  let timer = null;

  const render = (report = {}) => {
    const state = normalizeLoadingState(report);
    if (root) {
      root.dataset.loadingState = state.state;
      root.hidden = hiddenByUser;
    }
    text(status, statusLabel(state));
    text(substatus, state.blocker ? `blocker: ${state.blocker}` : `runtime: ${state.runtime_mode} / tokenizer: ${state.decode_status}`);
    const percent = progressForState(state);
    if (progress) progress.style.width = `${percent}%`;
    text(progressText, `${percent}%`);
    for (const [id, label, field] of STEP_ORDER) {
      const node = steps.get(id);
      if (!node) continue;
      const stepState = stepStatus(state, id, field);
      node.dataset.stepStatus = stepState;
      const statusNode = node.querySelector("[data-step-status]");
      text(statusNode, stepState);
      const labelNode = node.querySelector("[data-step-label]");
      text(labelNode, label);
    }
    if (cancelButton) cancelButton.disabled = state.cancelable !== true;
    return state;
  };

  const startCopy = () => {
    text(copy, LOADING_COPY[copyIndex]);
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      copyIndex = (copyIndex + 1) % LOADING_COPY.length;
      text(copy, LOADING_COPY[copyIndex]);
    }, 2400);
  };

  if (cancelButton) {
    cancelButton.addEventListener("click", () => {
      hiddenByUser = true;
      if (root) root.hidden = true;
      if (typeof options.onCancel === "function") options.onCancel();
    });
  }
  if (dashboardButton) {
    dashboardButton.addEventListener("click", () => {
      const target = document.querySelector("#process-panel");
      if (target?.scrollIntoView) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  startCopy();
  render({ state: "idle", manifest: "skipped", shards: "skipped", tokenizer: "skipped", q4_forward: "skipped" });
  return { render, startCopy };
}
