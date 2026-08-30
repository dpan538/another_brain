"use strict";

(function startR30J1CR1Review() {
  const pack = window.R30J1C_R1_CORRECTION_PACK;
  const app = document.getElementById("app");
  const sessionIds = ["SESSION_1", "SESSION_2", "SESSION_3", "SESSION_4", "SESSION_5"];
  const sessionStates = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "VALIDATED"];
  const partialExportFields = new Set([
    "schema_version", "pack_id", "session_id", "manifest_sha", "session_state",
    "completed_items", "total_items", "records", "review_hash", "completed_at",
    "evidence_class", "owner_review_completed", "profile_inference_allowed",
    "profile_frozen", "gold_admission", "allowed_for_training", "training_started",
  ]);
  const correctionRecordFields = new Set([
    "schema_version", "status", "item_id", "session_id", "context_family",
    "owner_decision", "owner_condition", "owner_note", "owner_written_response",
    "acceptable_alternatives", "fatigue_decision", "reason_codes",
    "normative_strength", "register", "persona_dimension", "source_family",
    "boundary_question", "review_hash", "completed_at", "evidence_class",
    "privacy_review_status", "metadata_reconciliation_status",
    "profile_inference_allowed", "gold_admission", "allowed_for_training",
    "training_started",
  ]);
  const completedAtPattern = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?Z$/u;

  if (!pack || pack.schema_version !== "r30j1c-r1.browser-review-pack.v1") {
    app.textContent = "review_seed.js 缺失或无效。请重新运行 R30J1C-R1 review UI builder。";
    return;
  }

  const sessionById = new Map(pack.sessions.map((session) => [session.session_id, session]));
  const itemById = new Map(pack.decision_items.map((item) => [item.item_id, item]));
  const promptById = new Map(pack.owner_write_prompts.map((prompt) => [prompt.prompt_id, prompt]));
  const storageKey = `r30j1c-r1-owner-correction:${pack.pack_id}:${pack.manifest_sha}`;
  const indices = Object.fromEntries(sessionIds.map((sessionId) => [sessionId, 0]));
  let view = "overview";
  let storageWarning = "";
  let state = loadState();

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/gu, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
    })[character]);
  }

  function emptyState() {
    return {
      schema_version: "r30j1c-r1.review-state.v1",
      pack_id: pack.pack_id,
      manifest_sha: pack.manifest_sha,
      sessions: Object.fromEntries(sessionIds.map((sessionId) => [sessionId, {
        responses: {},
        validated: false,
      }])),
      owner_review_completed: false,
      profile_inference_allowed: false,
      profile_frozen: false,
      gold_admission: false,
      allowed_for_training: false,
      training_started: false,
    };
  }

  function forceSafetyFlags(value) {
    value.owner_review_completed = false;
    value.profile_inference_allowed = false;
    value.profile_frozen = false;
    value.gold_admission = false;
    value.allowed_for_training = false;
    value.training_started = false;
    return value;
  }

  function cleanText(value) {
    return typeof value === "string" ? value : "";
  }

  function isObjectRecord(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function hasExactKeys(value, expected) {
    if (!isObjectRecord(value)) return false;
    const keys = Object.keys(value);
    return keys.length === expected.size && keys.every((key) => expected.has(key));
  }

  function isUniqueStringArray(value) {
    return Array.isArray(value)
      && value.every((entry) => typeof entry === "string")
      && new Set(value).size === value.length;
  }

  function sanitizeResponse(item, response) {
    const allowedDecisions = new Set(item.decision_options.map((option) => option.value));
    const candidateIds = new Set(item.candidates.map((candidate) => candidate.option_id));
    const allowedFatigue = new Set((item.fatigue_question?.options || []).map((option) => option.value));
    const allowedReasons = new Set(item.reason_options.map((option) => option.value));
    return {
      owner_decision: allowedDecisions.has(response?.owner_decision) ? response.owner_decision : "",
      owner_condition: cleanText(response?.owner_condition),
      owner_note: cleanText(response?.owner_note),
      owner_written_response: cleanText(response?.owner_written_response),
      acceptable_alternatives: Array.isArray(response?.acceptable_alternatives)
        ? [...new Set(response.acceptable_alternatives.filter((value) => candidateIds.has(value)))]
        : [],
      fatigue_decision: allowedFatigue.has(response?.fatigue_decision) ? response.fatigue_decision : "",
      reason_codes: Array.isArray(response?.reason_codes)
        ? [...new Set(response.reason_codes.filter((value) => allowedReasons.has(value)))]
        : [],
    };
  }

  function sanitizeState(value) {
    const clean = emptyState();
    if (!value || value.pack_id !== pack.pack_id || value.manifest_sha !== pack.manifest_sha) return clean;
    for (const sessionId of sessionIds) {
      const imported = value.sessions?.[sessionId];
      if (!imported || typeof imported !== "object") continue;
      if (sessionId === "SESSION_5") {
        for (const [promptId, response] of Object.entries(imported.responses || {})) {
          if (!promptById.has(promptId)) continue;
          clean.sessions[sessionId].responses[promptId] = {
            owner_written_response: cleanText(response?.owner_written_response),
          };
        }
      } else {
        for (const [itemId, response] of Object.entries(imported.responses || {})) {
          const item = itemById.get(itemId);
          if (!item || item.session_id !== sessionId) continue;
          clean.sessions[sessionId].responses[itemId] = sanitizeResponse(item, response);
        }
      }
      clean.sessions[sessionId].validated = imported.validated === true;
    }
    return forceSafetyFlags(clean);
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? sanitizeState(JSON.parse(raw)) : emptyState();
    } catch {
      storageWarning = "无法读取本地自动保存；请使用每个 session 的 JSON 导出保留进度。";
      return emptyState();
    }
  }

  function saveState() {
    forceSafetyFlags(state);
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      storageWarning = "本地自动保存失败；请立即导出当前 session 的 JSON。";
    }
    renderGlobalStatus();
  }

  function decisionResponse(item) {
    const bucket = state.sessions[item.session_id].responses;
    if (!bucket[item.item_id]) bucket[item.item_id] = sanitizeResponse(item, {});
    return bucket[item.item_id];
  }

  function ownerWriteResponse(prompt) {
    const bucket = state.sessions.SESSION_5.responses;
    if (!bucket[prompt.prompt_id]) bucket[prompt.prompt_id] = { owner_written_response: "" };
    return bucket[prompt.prompt_id];
  }

  function responseErrors(item, response) {
    const errors = [];
    const allowed = new Set(item.decision_options.map((option) => option.value));
    const ownerCondition = cleanText(response?.owner_condition);
    const ownerNote = cleanText(response?.owner_note);
    const ownerWrittenResponse = cleanText(response?.owner_written_response);
    const alternatives = Array.isArray(response?.acceptable_alternatives) ? response.acceptable_alternatives : [];
    const reasons = Array.isArray(response?.reason_codes) ? response.reason_codes : [];
    if (typeof response?.owner_condition !== "string") errors.push("条件必须是文字");
    if (typeof response?.owner_note !== "string") errors.push("说明必须是文字");
    if (typeof response?.owner_written_response !== "string") errors.push("改写必须是文字");
    if (!isUniqueStringArray(response?.acceptable_alternatives)) errors.push("可接受备选格式无效或重复");
    if (!isUniqueStringArray(response?.reason_codes)) errors.push("原因格式无效或重复");
    if (!allowed.has(response.owner_decision)) errors.push("请选择一个决定");
    if (response.owner_decision === "DEPENDS" && !ownerCondition.trim()) errors.push("DEPENDS 必须写明条件");
    if (response.owner_decision === "REGISTER_SPECIFIC" && !ownerCondition.trim()) errors.push("REGISTER_SPECIFIC 必须写明场景或条件");
    if (["DEPENDS", "NONE", "EDIT"].includes(response.owner_decision) && !ownerNote.trim()) {
      errors.push(`${response.owner_decision} 需要一条简短说明`);
    }
    if (item.boundary_question && !ownerNote.trim()) errors.push("边界题需要一条简短说明");
    if (response.owner_decision === "EDIT" && !ownerWrittenResponse.trim()) errors.push("EDIT 必须写出修改版本");
    const candidateIds = new Set(item.candidates.map((candidate) => candidate.option_id));
    if (alternatives.some((value) => !candidateIds.has(value))) errors.push("可接受备选不属于本题候选");
    if (!item.acceptable_alternatives_allowed && alternatives.length) errors.push("本题不收集可接受备选");
    if (item.fatigue_question) {
      const fatigueAllowed = new Set(item.fatigue_question.options.map((option) => option.value));
      if (!fatigueAllowed.has(response.fatigue_decision)) errors.push("请选择连续出现时是否自然");
      if (response.fatigue_decision === "DEPENDS" && !ownerCondition.trim()) errors.push("疲劳判断选 DEPENDS 时必须写明条件");
    } else if (response.fatigue_decision !== null && response.fatigue_decision !== "") {
      errors.push("本题不收集连续出现判断");
    }
    const allowedReasons = new Set(item.reason_options.map((option) => option.value));
    if (reasons.some((value) => !allowedReasons.has(value))) errors.push("原因不属于本题选项");
    if (item.reason_required_for.includes(response.owner_decision) && !reasons.length) {
      errors.push("请选择这个答案失败的原因");
    }
    if (ownerCondition.length > 10000) errors.push("条件文字超过 10000 字符");
    if (ownerNote.length > 10000) errors.push("说明超过 10000 字符");
    if (ownerWrittenResponse.length > 20000) errors.push("改写超过 20000 字符");
    return [...new Set(errors)];
  }

  function ownerWriteErrors(response, required = false) {
    const errors = [];
    if (typeof response?.owner_written_response !== "string") errors.push("回答必须是文字");
    const text = cleanText(response?.owner_written_response);
    if (required && !text.trim()) errors.push("导入的亲笔回答不能为空");
    if (text.length > 20000) errors.push("回答超过 20000 字符");
    return errors;
  }

  function isDecisionComplete(item) {
    const response = state.sessions[item.session_id].responses[item.item_id];
    return Boolean(response && responseErrors(item, response).length === 0);
  }

  function sessionEntries(sessionId) {
    if (sessionId === "SESSION_5") return pack.owner_write_prompts;
    return pack.decision_items.filter((item) => item.session_id === sessionId);
  }

  function sessionCompletedCount(sessionId) {
    if (sessionId === "SESSION_5") {
      return pack.owner_write_prompts.filter((prompt) =>
        cleanText(state.sessions.SESSION_5.responses[prompt.prompt_id]?.owner_written_response).trim()
        && ownerWriteErrors(state.sessions.SESSION_5.responses[prompt.prompt_id]).length === 0
      ).length;
    }
    return pack.decision_items.filter((item) => item.session_id === sessionId && isDecisionComplete(item)).length;
  }

  function sessionState(sessionId) {
    const total = sessionEntries(sessionId).length;
    const completed = sessionCompletedCount(sessionId);
    const validated = state.sessions[sessionId].validated && completed === total;
    if (validated) return "VALIDATED";
    if (completed === 0) return "NOT_STARTED";
    if (completed === total) return "COMPLETED";
    return "IN_PROGRESS";
  }

  function renderGlobalStatus() {
    const summary = sessionIds.map((sessionId, index) => {
      const done = sessionCompletedCount(sessionId);
      const total = sessionEntries(sessionId).length;
      return `S${index + 1} ${done}/${total} ${sessionState(sessionId)}`;
    }).join(" · ");
    document.getElementById("global-status").textContent = summary;
    const warning = document.getElementById("storage-warning");
    warning.textContent = storageWarning;
    warning.hidden = !storageWarning;
  }

  function render() {
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === view);
    });
    document.getElementById("clear-session").disabled = view === "overview";
    if (view === "overview") renderOverview();
    else renderSession(view);
    renderGlobalStatus();
  }

  function renderOverview() {
    const cards = pack.sessions.map((session) => {
      const done = sessionCompletedCount(session.session_id);
      const total = sessionEntries(session.session_id).length;
      return `
        <button class="card session-card" type="button" data-open-session="${escapeHtml(session.session_id)}">
          <span class="number">${done}/${total}</span>
          <h3>${escapeHtml(session.title)}</h3>
          <p>${escapeHtml(session.purpose)}</p>
          <span class="session-state">${escapeHtml(sessionState(session.session_id))} · ${session.estimated_minutes_min}–${session.estimated_minutes_max} min</span>
        </button>`;
    }).join("");
    app.innerHTML = `
      <h2>分开完成，也分开导出</h2>
      <section class="card">
        <p>Session 1–4 是判断题；Session 5 是可选亲笔回答。后面的 session 未完成，不会阻止当前 session 导出。</p>
        <p class="muted">页面只汇总进度，不会自动推断“你的人格是什么”。出现重复选择差异时，后续只会把它当作条件性候选。</p>
      </section>
      <div class="overview-grid">${cards}</div>`;
    document.querySelectorAll("[data-open-session]").forEach((button) => {
      button.onclick = () => {
        view = button.dataset.openSession;
        render();
      };
    });
  }

  function renderSession(sessionId) {
    const session = sessionById.get(sessionId);
    const entries = sessionEntries(sessionId);
    indices[sessionId] = Math.max(0, Math.min(indices[sessionId], entries.length - 1));
    const index = indices[sessionId];
    const done = sessionCompletedCount(sessionId);
    const total = entries.length;
    const progress = total ? (done / total) * 100 : 0;
    const current = entries[index];
    app.innerHTML = `
      <h2>${escapeHtml(session.title)}</h2>
      <p>${escapeHtml(session.purpose)}</p>
      <div class="pager">
        <button type="button" data-page="previous" ${index === 0 ? "disabled" : ""}>上一项</button>
        <span>${index + 1}/${total}</span>
        <progress class="progress-track" max="100" value="${progress}" aria-label="session 完成进度"></progress>
        <button type="button" data-page="next" ${index >= total - 1 ? "disabled" : ""}>下一项</button>
      </div>
      <section id="review-card" class="card">
        ${sessionId === "SESSION_5" ? renderOwnerWritePrompt(current) : renderDecisionItem(current)}
      </section>
      <div class="export-row">
        <button id="export-session" type="button" class="primary">导出这个 session</button>
        <span class="muted">${escapeHtml(sessionState(sessionId))} · 完成 ${done}/${total}</span>
      </div>`;
    document.querySelectorAll("[data-page]").forEach((button) => {
      button.onclick = () => {
        indices[sessionId] += button.dataset.page === "next" ? 1 : -1;
        render();
      };
    });
    if (sessionId === "SESSION_5") bindOwnerWrite(current);
    else bindDecisionItem(current);
    document.getElementById("export-session").onclick = () => exportSession(sessionId);
  }

  function renderCandidates(item) {
    if (!item.candidates.length) return "";
    return `<div class="candidate-grid">${item.candidates.map((candidate) => `
      <article class="candidate"><strong>${escapeHtml(candidate.option_id)}</strong>${escapeHtml(candidate.response_text)}</article>
    `).join("")}</div>`;
  }

  function renderDecisionItem(item) {
    const response = decisionResponse(item);
    const decisionOptions = item.decision_options.map((option) => `
      <label class="inline">
        <input type="radio" name="owner-decision" value="${escapeHtml(option.value)}" ${response.owner_decision === option.value ? "checked" : ""}>
        <span>${escapeHtml(option.label)}</span>
      </label>`).join("");
    const acceptable = item.acceptable_alternatives_allowed && item.candidates.length
      ? `<fieldset><legend>还可以接受哪些备选？（可不选）</legend>${item.candidates.map((candidate) => `
          <label class="inline"><input type="checkbox" data-acceptable="${escapeHtml(candidate.option_id)}" ${response.acceptable_alternatives.includes(candidate.option_id) ? "checked" : ""}>${escapeHtml(candidate.option_id)}</label>
        `).join("")}</fieldset>`
      : "";
    const fatigue = item.fatigue_question
      ? `<fieldset class="conditional"><legend>${escapeHtml(item.fatigue_question.question)}</legend>${item.fatigue_question.options.map((option) => `
          <label class="inline"><input type="radio" name="fatigue-decision" value="${escapeHtml(option.value)}" ${response.fatigue_decision === option.value ? "checked" : ""}>${escapeHtml(option.label)}</label>
        `).join("")}</fieldset>`
      : "";
    const reasons = item.reason_options.length
      ? `<fieldset><legend>如果更“personal-looking”的答案失败，原因是什么？</legend>${item.reason_options.map((option) => `
          <label class="inline"><input type="checkbox" data-reason="${escapeHtml(option.value)}" ${response.reason_codes.includes(option.value) ? "checked" : ""}>${escapeHtml(option.label)}</label>
        `).join("")}</fieldset>`
      : "";
    const badges = [item.boundary_question ? "边界题：需要简短说明" : "说明通常可选"];
    return `
      <div class="meta">${badges.map((badge) => `<span class="pill">${escapeHtml(badge)}</span>`).join("")}</div>
      <p class="prompt">${escapeHtml(item.context_text)}</p>
      ${renderCandidates(item)}
      <h3>${escapeHtml(item.question_text)}</h3>
      <fieldset><legend>你的选择</legend>${decisionOptions}</fieldset>
      ${acceptable}
      ${fatigue}
      ${reasons}
      <label class="conditional">条件
        <textarea id="owner-condition" placeholder="DEPENDS / REGISTER_SPECIFIC，或疲劳判断为 DEPENDS 时填写。">${escapeHtml(response.owner_condition)}</textarea>
      </label>
      <label>简短说明
        <textarea id="owner-note" placeholder="只在边界题、DEPENDS、NONE、EDIT 时必填；其他情况可留空。">${escapeHtml(response.owner_note)}</textarea>
      </label>
      <label>你的改写
        <textarea id="owner-rewrite" placeholder="EDIT 时必填；NONE 时可选。不会自动修改标点或完整度。">${escapeHtml(response.owner_written_response)}</textarea>
      </label>
      <p id="validation" class="validation">${escapeHtml(responseErrors(item, response).join("；"))}</p>`;
  }

  function bindDecisionItem(item) {
    const response = decisionResponse(item);
    const invalidate = () => {
      state.sessions[item.session_id].validated = false;
      saveState();
      const validation = document.getElementById("validation");
      if (validation) validation.textContent = responseErrors(item, response).join("；");
    };
    document.querySelectorAll("input[name='owner-decision']").forEach((input) => {
      input.onchange = () => {
        response.owner_decision = input.value;
        invalidate();
        render();
      };
    });
    document.querySelectorAll("[data-acceptable]").forEach((input) => {
      input.onchange = () => {
        const selected = new Set(response.acceptable_alternatives);
        if (input.checked) selected.add(input.dataset.acceptable);
        else selected.delete(input.dataset.acceptable);
        response.acceptable_alternatives = [...selected];
        invalidate();
      };
    });
    document.querySelectorAll("input[name='fatigue-decision']").forEach((input) => {
      input.onchange = () => {
        response.fatigue_decision = input.value;
        invalidate();
      };
    });
    document.querySelectorAll("[data-reason]").forEach((input) => {
      input.onchange = () => {
        const selected = new Set(response.reason_codes);
        if (input.checked) selected.add(input.dataset.reason);
        else selected.delete(input.dataset.reason);
        response.reason_codes = [...selected];
        invalidate();
      };
    });
    const fields = [
      ["owner-condition", "owner_condition"],
      ["owner-note", "owner_note"],
      ["owner-rewrite", "owner_written_response"],
    ];
    for (const [elementId, key] of fields) {
      document.getElementById(elementId).oninput = (event) => {
        response[key] = event.target.value;
        invalidate();
      };
    }
  }

  function renderOwnerWritePrompt(prompt) {
    const response = ownerWriteResponse(prompt);
    return `
      <div class="meta"><span class="pill">可选亲笔回答</span><span class="pill">不展示候选答案</span></div>
      <p class="prompt">${escapeHtml(prompt.prompt_text)}</p>
      <p>${escapeHtml(prompt.instruction)}</p>
      <label>你的回答
        <textarea id="owner-write" class="owner-write" placeholder="可以留空，也可以只写一个词。不会自动改写。">${escapeHtml(response.owner_written_response)}</textarea>
      </label>
      <p id="owner-write-validation" class="validation">${escapeHtml(ownerWriteErrors(response).join("；"))}</p>
      <p class="muted">亲笔回答在未来使用前仍需单独 privacy review；当前导出不是 gold。</p>`;
  }

  function bindOwnerWrite(prompt) {
    const response = ownerWriteResponse(prompt);
    document.getElementById("owner-write").oninput = (event) => {
      response.owner_written_response = event.target.value;
      state.sessions.SESSION_5.validated = false;
      saveState();
      document.getElementById("owner-write-validation").textContent = ownerWriteErrors(response).join("；");
    };
  }

  function normativeStrength(decision) {
    if (decision === "OWNER_WRITTEN") return "OWNER_WRITTEN_PENDING_PRIVACY_REVIEW";
    if (["DEPENDS", "REGISTER_SPECIFIC"].includes(decision)) return "CONDITIONAL_NORMATIVE_EVIDENCE";
    if (decision === "UNSURE") return "UNRESOLVED";
    return "EXPLICIT_NORMATIVE_CHOICE";
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
    }
    return value;
  }

  async function sha256Hex(value) {
    if (!globalThis.crypto?.subtle) throw new Error("local_crypto_unavailable");
    const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function finalizedRecord(base) {
    const record = { ...base, review_hash: null };
    record.review_hash = await sha256Hex(record);
    return record;
  }

  async function buildDecisionRecord(item, completedAt) {
    const response = state.sessions[item.session_id].responses[item.item_id];
    return finalizedRecord({
      schema_version: "r30j1c-r1.correction-record.v1",
      status: "OWNER_CORRECTION_EVIDENCE",
      item_id: item.item_id,
      session_id: item.session_id,
      context_family: null,
      owner_decision: response.owner_decision,
      owner_condition: response.owner_condition,
      owner_note: response.owner_note,
      owner_written_response: response.owner_written_response,
      acceptable_alternatives: response.acceptable_alternatives,
      fatigue_decision: response.fatigue_decision || null,
      reason_codes: response.reason_codes,
      normative_strength: normativeStrength(response.owner_decision),
      register: null,
      persona_dimension: null,
      source_family: null,
      boundary_question: item.boundary_question,
      review_hash: null,
      completed_at: completedAt,
      evidence_class: "OWNER_CORRECTION_EVIDENCE",
      privacy_review_status: "PENDING",
      metadata_reconciliation_status: "PENDING_RECONCILIATION",
      profile_inference_allowed: false,
      gold_admission: false,
      allowed_for_training: false,
      training_started: false,
    });
  }

  async function buildOwnerWriteRecord(prompt, completedAt) {
    const response = state.sessions.SESSION_5.responses[prompt.prompt_id];
    return finalizedRecord({
      schema_version: "r30j1c-r1.correction-record.v1",
      status: "OWNER_CORRECTION_EVIDENCE",
      item_id: prompt.prompt_id,
      session_id: "SESSION_5",
      context_family: null,
      owner_decision: "OWNER_WRITTEN",
      owner_condition: "",
      owner_note: "",
      owner_written_response: response.owner_written_response,
      acceptable_alternatives: [],
      fatigue_decision: null,
      reason_codes: [],
      normative_strength: "OWNER_WRITTEN_PENDING_PRIVACY_REVIEW",
      register: null,
      persona_dimension: null,
      source_family: null,
      boundary_question: false,
      review_hash: null,
      completed_at: completedAt,
      evidence_class: "OWNER_CORRECTION_EVIDENCE",
      privacy_review_status: "PENDING",
      metadata_reconciliation_status: "PENDING_RECONCILIATION",
      profile_inference_allowed: false,
      gold_admission: false,
      allowed_for_training: false,
      training_started: false,
    });
  }

  async function exportSession(sessionId) {
    const completedAt = new Date().toISOString();
    const entries = sessionEntries(sessionId);
    const records = [];
    if (sessionId === "SESSION_5") {
      for (const prompt of entries) {
        const response = state.sessions.SESSION_5.responses[prompt.prompt_id];
        if (response?.owner_written_response.trim() && ownerWriteErrors(response).length === 0) {
          records.push(await buildOwnerWriteRecord(prompt, completedAt));
        }
      }
    } else {
      for (const item of entries) {
        if (isDecisionComplete(item)) records.push(await buildDecisionRecord(item, completedAt));
      }
    }
    const complete = records.length === entries.length;
    state.sessions[sessionId].validated = complete;
    saveState();
    const session = sessionById.get(sessionId);
    const exportValue = {
      schema_version: "r30j1c-r1.session-review-export.v1",
      pack_id: pack.pack_id,
      session_id: sessionId,
      manifest_sha: pack.manifest_sha,
      session_state: complete ? "VALIDATED" : records.length ? "IN_PROGRESS" : "NOT_STARTED",
      completed_items: records.length,
      total_items: entries.length,
      records,
      review_hash: null,
      completed_at: completedAt,
      evidence_class: "OWNER_CORRECTION_EVIDENCE",
      owner_review_completed: false,
      profile_inference_allowed: false,
      profile_frozen: false,
      gold_admission: false,
      allowed_for_training: false,
      training_started: false,
    };
    exportValue.review_hash = await sha256Hex(exportValue);
    downloadJson(session.partial_export_filename, exportValue);
    render();
  }

  function downloadJson(filename, value) {
    const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function verifyHash(value) {
    const expected = value.review_hash;
    const candidate = { ...value, review_hash: null };
    return typeof expected === "string" && expected === await sha256Hex(candidate);
  }

  function expectedImportedSessionState(completedItems, totalItems, declaredState) {
    if (completedItems === 0) return "NOT_STARTED";
    if (completedItems < totalItems) return "IN_PROGRESS";
    return declaredState === "VALIDATED" ? "VALIDATED" : "COMPLETED";
  }

  function validateImportedSafetyFields(record) {
    if (
      record.schema_version !== "r30j1c-r1.correction-record.v1"
      || record.status !== "OWNER_CORRECTION_EVIDENCE"
      || record.evidence_class !== "OWNER_CORRECTION_EVIDENCE"
      || record.privacy_review_status !== "PENDING"
      || record.metadata_reconciliation_status !== "PENDING_RECONCILIATION"
      || record.profile_inference_allowed !== false
      || record.gold_admission !== false
      || record.allowed_for_training !== false
      || record.training_started !== false
    ) {
      throw new Error("unsafe_record_contract");
    }
    if (
      record.context_family !== null
      || record.register !== null
      || record.persona_dimension !== null
      || record.source_family !== null
    ) {
      throw new Error("pending_record_metadata_not_null");
    }
    if (!completedAtPattern.test(record.completed_at)) throw new Error("invalid_record_completed_at");
  }

  async function validateImportedRecord(record, sessionId) {
    if (!hasExactKeys(record, correctionRecordFields)) throw new Error("invalid_record_fields");
    if (!(await verifyHash(record))) throw new Error("invalid_record_hash");
    if (record.session_id !== sessionId) throw new Error("record_session_mismatch");
    validateImportedSafetyFields(record);

    if (sessionId === "SESSION_5") {
      if (!promptById.has(record.item_id) || record.owner_decision !== "OWNER_WRITTEN") {
        throw new Error("unknown_write_record");
      }
      if (
        record.owner_condition !== ""
        || record.owner_note !== ""
        || !isUniqueStringArray(record.acceptable_alternatives)
        || record.acceptable_alternatives.length !== 0
        || record.fatigue_decision !== null
        || !isUniqueStringArray(record.reason_codes)
        || record.reason_codes.length !== 0
        || record.normative_strength !== "OWNER_WRITTEN_PENDING_PRIVACY_REVIEW"
        || record.boundary_question !== false
        || ownerWriteErrors(record, true).length !== 0
      ) {
        throw new Error("invalid_write_record");
      }
      return;
    }

    const item = itemById.get(record.item_id);
    if (!item || item.session_id !== sessionId) throw new Error("unknown_decision_record");
    if (
      record.boundary_question !== item.boundary_question
      || record.normative_strength !== normativeStrength(record.owner_decision)
      || responseErrors(item, record).length !== 0
    ) {
      throw new Error("invalid_decision_record");
    }
  }

  async function importSessionExport(value) {
    if (!hasExactKeys(value, partialExportFields)) throw new Error("invalid_export_fields");
    if (value.schema_version !== "r30j1c-r1.session-review-export.v1") throw new Error("invalid_export_schema");
    if (value.pack_id !== pack.pack_id || value.manifest_sha !== pack.manifest_sha) throw new Error("wrong_pack");
    if (!sessionIds.includes(value.session_id) || !Array.isArray(value.records)) throw new Error("invalid_session");
    if (!sessionStates.includes(value.session_state)) throw new Error("invalid_session_state");
    if (
      value.evidence_class !== "OWNER_CORRECTION_EVIDENCE"
      || value.owner_review_completed !== false
      || value.profile_inference_allowed !== false
      || value.profile_frozen !== false
      || value.gold_admission !== false
      || value.allowed_for_training !== false
      || value.training_started !== false
    ) {
      throw new Error("unsafe_export_flags");
    }
    if (!completedAtPattern.test(value.completed_at) || !(await verifyHash(value))) throw new Error("invalid_export_hash");
    const sessionId = value.session_id;
    const expectedTotal = sessionEntries(sessionId).length;
    if (
      !Number.isInteger(value.completed_items)
      || !Number.isInteger(value.total_items)
      || value.completed_items !== value.records.length
      || value.total_items !== expectedTotal
      || value.completed_items < 0
      || value.completed_items > value.total_items
    ) {
      throw new Error("invalid_export_counts");
    }
    if (value.session_state !== expectedImportedSessionState(value.completed_items, value.total_items, value.session_state)) {
      throw new Error("invalid_export_state");
    }
    const recordIds = value.records.map((record) => isObjectRecord(record) ? record.item_id : null);
    if (recordIds.some((itemId) => typeof itemId !== "string") || new Set(recordIds).size !== recordIds.length) {
      throw new Error("duplicate_or_invalid_record_id");
    }
    const next = {};
    for (const record of value.records) {
      await validateImportedRecord(record, sessionId);
      if (sessionId === "SESSION_5") {
        next[record.item_id] = { owner_written_response: record.owner_written_response };
      } else {
        const item = itemById.get(record.item_id);
        next[record.item_id] = sanitizeResponse(item, record);
      }
    }
    if (Object.keys(state.sessions[sessionId].responses).length > 0) {
      const confirmed = window.confirm(
        "导入会替换当前 session 已填写的答案。请先导出当前 session 的 JSON 备份。确定继续吗？",
      );
      if (!confirmed) return false;
    }
    state.sessions[sessionId].responses = next;
    state.sessions[sessionId].validated = value.session_state === "VALIDATED";
    saveState();
    view = sessionId;
    render();
    return true;
  }

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.onclick = () => {
      view = button.dataset.view;
      render();
    };
  });

  document.getElementById("import-file").onchange = (event) => {
    const [file] = event.target.files;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await importSessionExport(JSON.parse(String(reader.result)));
      } catch {
        app.innerHTML = "<section class='card'><p class='validation'>导入失败：文件不属于这个 pack，或校验未通过。</p></section>";
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  };

  document.getElementById("clear-session").onclick = () => {
    if (view === "overview") return;
    const confirmed = window.confirm(
      "这会清空当前 session 中尚未另行备份的答案。请先导出 JSON 备份。确定继续吗？",
    );
    if (!confirmed) return;
    state.sessions[view] = { responses: {}, validated: false };
    saveState();
    render();
  };

  render();
}());
