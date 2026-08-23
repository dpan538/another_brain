"use strict";

(function startPersonaReviewV2() {
  const seed = window.R30J0_P2_ELICITATION_SEED;
  const app = document.getElementById("app");
  if (!seed || seed.schema_version !== "r30j0.owner_persona_elicitation_pack.v2") {
    app.textContent = "review_seed.js 缺失或无效。请重新运行 P2 owner-review builder。";
    return;
  }

  const ACTIONS = ["ACCEPT", "REJECT", "EDIT", "DEPENDS", "UNSURE"];
  const storageKey = `r30j0-p2-persona-review:${seed.pack_id}`;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const itemById = new Map(seed.decision_items.map((item) => [item.item_id, item]));
  const writeById = new Map(seed.optional_owner_write_prompts.map((item) => [item.prompt_id, item]));
  let state = loadState();
  let view = "overview";
  const indices = { A: 0, B: 0, C: 0, D: 0, E: 0, write: 0 };

  function emptyState() {
    return {
      schema_version: "r30j0.owner_persona_elicitation_review.v2",
      pack_id: seed.pack_id,
      status: "HUMAN_PERSONA_ELICITATION_REQUIRED",
      responses: {},
      owner_written_responses: {},
      owner_review_completed: false,
      profile_frozen: false,
      training_authorized: false,
      training_started: false,
      allowed_for_training: false,
    };
  }

  function forceReadinessFlagsFalse(value) {
    value.owner_review_completed = false;
    value.profile_frozen = false;
    value.training_authorized = false;
    value.training_started = false;
    value.allowed_for_training = false;
    value.status = "HUMAN_PERSONA_ELICITATION_REQUIRED";
    return value;
  }

  function sanitizeImported(value) {
    const clean = emptyState();
    if (!value || value.pack_id !== seed.pack_id || value.schema_version !== clean.schema_version) return clean;
    if (value.responses && typeof value.responses === "object") {
      for (const [itemId, response] of Object.entries(value.responses)) {
        if (!itemById.has(itemId) || !response || typeof response !== "object") continue;
        const item = itemById.get(itemId);
        const decision = item.allowed_decisions.includes(response.decision) ? response.decision : "";
        const importedRanks = response.ranks && typeof response.ranks === "object" ? response.ranks : {};
        const ranks = {};
        for (const candidateId of ["A", "B", "C"]) {
          const rank = String(importedRanks[candidateId] || "");
          ranks[candidateId] = ["1", "2", "3"].includes(rank) ? rank : "";
        }
        const importedScenarios = response.scenario_decisions && typeof response.scenario_decisions === "object" ? response.scenario_decisions : {};
        const scenarioOptions = item.scenario_decision_options || [];
        const scenarioDecisions = {};
        for (const scenarioId of ["A", "B"]) {
          scenarioDecisions[scenarioId] = decision === "PAIR_DECISION" && scenarioOptions.includes(importedScenarios[scenarioId]) ? importedScenarios[scenarioId] : "";
        }
        clean.responses[itemId] = {
          review_action: ACTIONS.includes(response.review_action) ? response.review_action : "",
          decision,
          ranks,
          scenario_decisions: scenarioDecisions,
          condition: String(response.condition || ""),
          edit_text: String(response.edit_text || ""),
          open_response: String(response.open_response || ""),
          notes: String(response.notes || ""),
        };
      }
    }
    if (value.owner_written_responses && typeof value.owner_written_responses === "object") {
      for (const [promptId, response] of Object.entries(value.owner_written_responses)) {
        if (writeById.has(promptId)) clean.owner_written_responses[promptId] = String(response || "");
      }
    }
    return forceReadinessFlagsFalse(clean);
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? sanitizeImported(JSON.parse(raw)) : emptyState();
    } catch {
      return emptyState();
    }
  }

  function saveState() {
    forceReadinessFlagsFalse(state);
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* durable export remains available */ }
    renderGlobalStatus();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/gu, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
    })[character]);
  }

  function currentResponse(itemId) {
    if (!state.responses[itemId]) {
      state.responses[itemId] = {
        review_action: "",
        decision: "",
        ranks: {},
        scenario_decisions: { A: "", B: "" },
        condition: "",
        edit_text: "",
        open_response: "",
        notes: "",
      };
    }
    return state.responses[itemId];
  }

  function responseErrors(item, response) {
    const errors = [];
    if (!ACTIONS.includes(response.review_action)) errors.push("请选择 review action");
    if (response.review_action === "DEPENDS" && !response.condition.trim()) errors.push("DEPENDS 必须写明条件");
    if (response.review_action === "EDIT" && !response.edit_text.trim()) errors.push("EDIT 必须写出修改版本");
    if (response.review_action && response.review_action !== "UNSURE") {
      if (!item.allowed_decisions.includes(response.decision)) errors.push("请选择该题的 decision");
      if (response.decision === "IT_DEPENDS" && !response.condition.trim()) errors.push("IT_DEPENDS 必须写明条件");
      if (response.decision === "RANK_A_B_C") {
        const ranks = [response.ranks.A, response.ranks.B, response.ranks.C].map(Number);
        if (new Set(ranks).size !== 3 || ranks.some((rank) => ![1, 2, 3].includes(rank))) errors.push("Ranking 需要给 A/B/C 不重复的 1–3 名");
      }
      if (response.decision === "PAIR_DECISION") {
        for (const scenarioId of ["A", "B"]) {
          if (!item.scenario_decision_options.includes(response.scenario_decisions[scenarioId])) errors.push(`情境 ${scenarioId} 必须独立选择`);
        }
        if (Object.values(response.scenario_decisions).includes("DEPENDS") && !response.condition.trim()) errors.push("情境选择 DEPENDS 时必须写明条件");
      }
      if (item.task_type === "edit_response" && response.decision === "SUBMIT_EDIT" && !response.edit_text.trim()) errors.push("SUBMIT_EDIT 必须写出修改版本");
      if (response.decision === "WRITE_RESPONSE" && !response.open_response.trim()) errors.push("请写回答，或选择 SKIP / UNSURE");
    }
    return errors;
  }

  function isDecisionComplete(item) {
    const response = state.responses[item.item_id];
    return Boolean(response && responseErrors(item, response).length === 0 && response.review_action);
  }

  function completedCount(items) {
    return items.filter(isDecisionComplete).length;
  }

  function normalizedOutcome(item, response) {
    if (!response || !isDecisionComplete(item)) return null;
    let outcome;
    if (["A", "B", "C"].includes(response.decision)) {
      outcome = item.candidates.find((candidate) => candidate.candidate_id === response.decision)?.canonical_option_id || null;
    } else if (response.decision === "RANK_A_B_C") {
      outcome = item.candidates
        .map((candidate) => ({ canonical_option_id: candidate.canonical_option_id, rank: Number(response.ranks[candidate.candidate_id]) }))
        .sort((left, right) => left.rank - right.rank)
        .map((entry) => entry.canonical_option_id);
    } else if (response.decision === "PAIR_DECISION") {
      outcome = Object.fromEntries(item.scenario_pair
        .map((scenario) => [scenario.canonical_scenario_id, response.scenario_decisions[scenario.scenario_id]])
        .sort(([left], [right]) => left.localeCompare(right)));
    } else {
      outcome = response.decision;
    }
    // Review action is a meta-action about the elicitation item. Consistency
    // measures the underlying normalized choice/rank/pair outcome only.
    return JSON.stringify({ outcome });
  }

  function repeatConsistency() {
    const repeats = seed.decision_items.filter((item) => item.blind_repeat);
    const metrics = {
      eligible_pair_count: repeats.length,
      completed_pair_count: 0,
      consistent_pair_count: 0,
      consistency_rate: null,
      per_trait_family: {},
    };
    for (const repeat of repeats) {
      const source = itemById.get(repeat.repeat_of);
      const sourceOutcome = normalizedOutcome(source, state.responses[source.item_id]);
      const repeatOutcome = normalizedOutcome(repeat, state.responses[repeat.item_id]);
      if (sourceOutcome === null || repeatOutcome === null) continue;
      const family = repeat.discriminates[0];
      if (!metrics.per_trait_family[family]) {
        metrics.per_trait_family[family] = { completed_pair_count: 0, consistent_pair_count: 0, consistency_rate: null };
      }
      const bucket = metrics.per_trait_family[family];
      metrics.completed_pair_count += 1;
      bucket.completed_pair_count += 1;
      if (sourceOutcome === repeatOutcome) {
        metrics.consistent_pair_count += 1;
        bucket.consistent_pair_count += 1;
      }
    }
    metrics.consistency_rate = metrics.completed_pair_count ? metrics.consistent_pair_count / metrics.completed_pair_count : null;
    for (const bucket of Object.values(metrics.per_trait_family)) {
      bucket.consistency_rate = bucket.completed_pair_count ? bucket.consistent_pair_count / bucket.completed_pair_count : null;
    }
    return metrics;
  }

  function writeCompletedCount() {
    return seed.optional_owner_write_prompts.filter((prompt) => String(state.owner_written_responses[prompt.prompt_id] || "").trim()).length;
  }

  function renderGlobalStatus() {
    const done = completedCount(seed.decision_items);
    document.getElementById("global-status").textContent =
      `owner_review_completed=false · decisions ${done}/${seed.decision_items.length} · optional written ${writeCompletedCount()}/${seed.optional_owner_write_prompts.length}`;
  }

  function sessionItems(session) {
    return seed.decision_items.filter((item) => item.session === session);
  }

  function render() {
    document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    if (view === "overview") renderOverview();
    else if (["A", "B", "C", "D", "E"].includes(view)) renderSession(view);
    else if (view === "write") renderOwnerWrite();
    else renderExport();
    renderGlobalStatus();
  }

  function renderOverview() {
    const cards = Object.entries(seed.session_targets).map(([session, total]) => {
      const items = sessionItems(session);
      const done = completedCount(items);
      return `<button class="card session-card" type="button" data-open-session="${session}"><span class="number">${done}/${total}</span><h3>Session ${session}</h3><p>${sessionDescription(session)}</p></button>`;
    }).join("");
    const sectionIndex = seed.sections.map((section, index) => {
      const count = seed.decision_items.filter((item) => item.section === section).length;
      return `<span class="pill">${index + 1}. ${escapeHtml(section)} · ${count}</span>`;
    }).join("");
    app.innerHTML = `
      <h2>先发现边界，不冻结人格</h2>
      <section class="card">
        <p>特殊 persona seed 的边界仍未知；本 pack 不把任何特殊模式推广成全局偏好。</p>
        <p>过度粗糙的历史标签不会成为 model class。所有候选刺激都只是待审材料。</p>
      </section>
      <div class="overview-grid">${cards}</div>
      <section class="card"><h3>11 个审阅 section</h3><div class="meta">${sectionIndex}</div><p class="muted">Sections 按信息类型标记；Sessions A–E 按 owner burden 分批呈现。一个 session 可以覆盖多个 section。</p></section>
      <section class="card"><h3>Review contract</h3><p>每项都支持 ACCEPT / REJECT / EDIT / DEPENDS / UNSURE；候选题支持 NONE_OF_THESE 和 IT_DEPENDS。选择 DEPENDS 时必须写条件。可以分多次完成。</p></section>`;
    document.querySelectorAll("[data-open-session]").forEach((button) => {
      button.onclick = () => { view = button.dataset.openSession; render(); };
    });
  }

  function sessionDescription(session) {
    return ({
      A: "高信息量 response choice 与 ranking",
      B: "persona mode 与 serious/playful 边界",
      C: "weird question 与 crocodile boundary",
      D: "register、anti-pattern 与 reverse control",
      E: "open-ended、矛盾与 grammar review",
    })[session];
  }

  function renderPager(kind, index, total, done) {
    const options = Array.from({ length: total }, (_, offset) => `<option value="${offset}"${offset === index ? " selected" : ""}>${offset + 1}</option>`).join("");
    const width = total ? Math.round((done / total) * 100) : 0;
    return `<div class="pager"><button type="button" id="previous-item">上一项</button><label>跳转<select id="item-select">${options}</select></label><button type="button" id="next-item">下一项</button><div class="progress-track" aria-label="completion"><div class="progress-fill" style="width:${width}%"></div></div><span>${done}/${total}</span></div>`;
  }

  function bindPager(kind, total) {
    document.getElementById("previous-item").onclick = () => { indices[kind] = Math.max(0, indices[kind] - 1); render(); };
    document.getElementById("next-item").onclick = () => { indices[kind] = Math.min(total - 1, indices[kind] + 1); render(); };
    document.getElementById("item-select").onchange = (event) => { indices[kind] = Number(event.target.value); render(); };
  }

  function candidateCards(item) {
    if (!item.candidates) return "";
    return `<div class="candidate-grid">${item.candidates.map((candidate) => `<article class="candidate"><strong>${escapeHtml(candidate.candidate_id)}</strong>${escapeHtml(candidate.text)}</article>`).join("")}</div>`;
  }

  function scenarioCards(item) {
    if (!item.scenario_pair) return "";
    return `<div class="candidate-grid">${item.scenario_pair.map((scenario) => `<article class="candidate"><strong>情境 ${escapeHtml(scenario.scenario_id)}</strong>${escapeHtml(scenario.text)}</article>`).join("")}</div>`;
  }

  function targetRefDetails(item) {
    const refs = item.target_refs.map((ref) => `<code>${escapeHtml(ref.target_type)}:${escapeHtml(ref.target_id)}</code>`).join(" · ");
    return `<details class="target-refs"><summary>Public-safe hypothesis links</summary><p class="muted">${refs}</p><p class="muted">这些是待审阅证据链接，不是 owner preference 标签。</p></details>`;
  }

  function scenarioDecisionFields(item, response) {
    if (!item.scenario_pair || response.decision !== "PAIR_DECISION") return "";
    const options = (value) => `<option value="">请选择</option>${item.scenario_decision_options.map((choice) => `<option value="${choice}"${value === choice ? " selected" : ""}>${choice}</option>`).join("")}`;
    return `<div class="rank-grid">${item.scenario_pair.map((scenario) => `<label>情境 ${escapeHtml(scenario.scenario_id)} 的模式<select data-scenario-decision="${escapeHtml(scenario.scenario_id)}">${options(response.scenario_decisions[scenario.scenario_id])}</select></label>`).join("")}</div>`;
  }

  function actionOptions(value) {
    return `<option value="">请选择</option>${ACTIONS.map((action) => `<option value="${action}"${value === action ? " selected" : ""}>${action}</option>`).join("")}`;
  }

  function decisionOptions(item, value) {
    return `<option value="">请选择</option>${item.allowed_decisions.map((decision) => `<option value="${escapeHtml(decision)}"${value === decision ? " selected" : ""}>${escapeHtml(decision)}</option>`).join("")}`;
  }

  function rankFields(response) {
    const options = (value) => `<option value=""></option>${[1, 2, 3].map((rank) => `<option value="${rank}"${Number(value) === rank ? " selected" : ""}>${rank}</option>`).join("")}`;
    return `<div class="rank-grid"><label>A rank<select data-rank="A">${options(response.ranks.A)}</select></label><label>B rank<select data-rank="B">${options(response.ranks.B)}</select></label><label>C rank<select data-rank="C">${options(response.ranks.C)}</select></label></div>`;
  }

  function renderSession(session) {
    const items = sessionItems(session);
    const index = Math.min(indices[session], items.length - 1);
    indices[session] = index;
    const item = items[index];
    const response = currentResponse(item.item_id);
    const errors = responseErrors(item, response);
    const needsCondition = response.review_action === "DEPENDS" || response.decision === "IT_DEPENDS" || Object.values(response.scenario_decisions).includes("DEPENDS");
    app.innerHTML = `
      <h2>Session ${session} · ${escapeHtml(sessionDescription(session))}</h2>
      ${renderPager(session, index, items.length, completedCount(items))}
      <article class="card" data-item-id="${escapeHtml(item.item_id)}">
        <div class="meta"><span class="pill">${index + 1}/${items.length}</span><span class="pill">${escapeHtml(item.section)}</span><span class="pill">${escapeHtml(item.register)}</span><span class="pill">${escapeHtml(item.task_type)}</span></div>
        <p class="prompt">${escapeHtml(item.prompt)}</p>
        ${scenarioCards(item)}${candidateCards(item)}
        ${targetRefDetails(item)}
        ${item.response_to_edit ? `<section class="condition"><strong>指定待编辑回应</strong><p>${escapeHtml(item.response_to_edit.text)}</p><p class="muted">KEEP_AS_IS 保留原文；SUBMIT_EDIT 必须在下方提交实际修改。</p></section>` : ""}
        <label>Review action<select id="review-action">${actionOptions(response.review_action)}</select></label>
        <label>Decision<select id="primary-decision">${decisionOptions(item, response.decision)}</select></label>
        ${response.decision === "RANK_A_B_C" ? rankFields(response) : ""}
        ${scenarioDecisionFields(item, response)}
        ${item.task_type === "open_ended_question" ? `<label>你的具体回答<textarea id="open-response" class="long-answer">${escapeHtml(response.open_response)}</textarea></label>` : ""}
        <div id="condition-wrap" class="condition"${needsCondition ? "" : " hidden"}><label>适用条件（DEPENDS / IT_DEPENDS 必填）<textarea id="condition-text">${escapeHtml(response.condition)}</textarea></label></div>
        <label>${item.task_type === "edit_response" ? "修改后的回应（SUBMIT_EDIT / EDIT 必填）" : "如果选择 EDIT，请写修改后的回应"}<textarea id="edit-text">${escapeHtml(response.edit_text)}</textarea></label>
        <label>Notes（可选）<textarea id="response-notes">${escapeHtml(response.notes)}</textarea></label>
        <p id="item-validation" class="validation">${escapeHtml(errors.join("；"))}</p>
        <button type="button" id="save-and-next" class="primary">保存并到下一项</button>
      </article>`;
    bindPager(session, items.length);
    bindDecisionForm(item, response, session, items.length);
  }

  function bindDecisionForm(item, response, session, total) {
    const action = document.getElementById("review-action");
    const decision = document.getElementById("primary-decision");
    const condition = document.getElementById("condition-text");
    const edit = document.getElementById("edit-text");
    const notes = document.getElementById("response-notes");
    const open = document.getElementById("open-response");

    function collect() {
      response.review_action = action.value;
      response.decision = decision.value;
      response.condition = condition.value;
      response.edit_text = edit.value;
      response.notes = notes.value;
      if (open) response.open_response = open.value;
      document.querySelectorAll("[data-rank]").forEach((select) => { response.ranks[select.dataset.rank] = select.value; });
      document.querySelectorAll("[data-scenario-decision]").forEach((select) => { response.scenario_decisions[select.dataset.scenarioDecision] = select.value; });
      if (response.decision !== "PAIR_DECISION") response.scenario_decisions = { A: "", B: "" };
      const scenarioDepends = Object.values(response.scenario_decisions).includes("DEPENDS");
      document.getElementById("condition-wrap").hidden = !(response.review_action === "DEPENDS" || response.decision === "IT_DEPENDS" || scenarioDepends);
      document.getElementById("item-validation").textContent = responseErrors(item, response).join("；");
      saveState();
    }

    for (const element of [action, decision, condition, edit, notes, open, ...document.querySelectorAll("[data-rank]"), ...document.querySelectorAll("[data-scenario-decision]")].filter(Boolean)) {
      element.addEventListener("input", collect);
      element.addEventListener("change", collect);
    }
    decision.addEventListener("change", render);
    document.getElementById("save-and-next").onclick = () => {
      collect();
      if (responseErrors(item, response).length === 0) indices[session] = Math.min(total - 1, indices[session] + 1);
      render();
    };
  }

  function renderOwnerWrite() {
    const prompts = seed.optional_owner_write_prompts;
    const index = Math.min(indices.write, prompts.length - 1);
    indices.write = index;
    const prompt = prompts[index];
    const value = state.owner_written_responses[prompt.prompt_id] || "";
    app.innerHTML = `
      <h2>可选：不看候选，直接写 efish 会说什么</h2>
      <p class="muted">40 项全部可跳过。亲笔回答只有完成隐私审查与后续 owner 确认后，才可能进入未来的数据准入审查。</p>
      ${renderPager("write", index, prompts.length, writeCompletedCount())}
      <article class="card">
        <div class="meta"><span class="pill">${index + 1}/${prompts.length}</span><span class="pill">${escapeHtml(prompt.category)}</span></div>
        <p class="prompt">用户：${escapeHtml(prompt.user_prompt)}</p>
        <p>${escapeHtml(prompt.instruction)}</p>
        <label>Owner-written response（可选）<textarea id="owner-write-text" class="long-answer">${escapeHtml(value)}</textarea></label>
        <button type="button" id="save-write-next" class="primary">保存并到下一项</button>
      </article>`;
    bindPager("write", prompts.length);
    const textarea = document.getElementById("owner-write-text");
    const collect = () => { state.owner_written_responses[prompt.prompt_id] = textarea.value; saveState(); };
    textarea.addEventListener("input", collect);
    document.getElementById("save-write-next").onclick = () => { collect(); indices.write = Math.min(prompts.length - 1, index + 1); render(); };
  }

  function renderExport() {
    const completed = completedCount(seed.decision_items);
    const bySession = Object.fromEntries(Object.keys(seed.session_targets).map((session) => [session, `${completedCount(sessionItems(session))}/${seed.session_targets[session]}`]));
    const consistency = repeatConsistency();
    const consistencyLabel = consistency.consistency_rate === null ? "尚无可比较 pair" : `${(consistency.consistency_rate * 100).toFixed(1)}%`;
    const familyRows = Object.entries(consistency.per_trait_family).map(([family, metrics]) => `<li>${escapeHtml(family)}：${metrics.consistent_pair_count}/${metrics.completed_pair_count}</li>`).join("");
    app.innerHTML = `
      <h2>本地草稿与进度</h2>
      <section class="card">
        <p>Decisions：<strong>${completed}/${seed.decision_items.length}</strong></p>
        <p>Sessions：${escapeHtml(JSON.stringify(bySession))}</p>
        <p>Optional owner-written：<strong>${writeCompletedCount()}/${seed.optional_owner_write_prompts.length}</strong></p>
        <p>Blind-repeat consistency：<strong>${escapeHtml(consistencyLabel)}</strong>（${consistency.consistent_pair_count}/${consistency.completed_pair_count} completed；eligible ${consistency.eligible_pair_count}）</p>
        ${familyRows ? `<details><summary>Per trait family</summary><ul>${familyRows}</ul></details>` : ""}
        <p>即使全部完成，本阶段导出仍固定：<code>owner_review_completed=false</code>、<code>profile_frozen=false</code>、<code>training_authorized=false</code>、<code>training_started=false</code>。</p>
      </section>
      <button type="button" id="export-from-view" class="primary">下载当前草稿</button>`;
    document.getElementById("export-from-view").onclick = exportDraft;
  }

  function exportDraft() {
    const payload = forceReadinessFlagsFalse(clone(state));
    payload.progress = {
      completed_decisions: completedCount(seed.decision_items),
      total_decisions: seed.decision_items.length,
      optional_owner_written_completed: writeCompletedCount(),
      optional_owner_written_total: seed.optional_owner_write_prompts.length,
    };
    payload.repeat_consistency = repeatConsistency();
    payload.export_contract = {
      local_only: true,
      contains_owner_review_data: true,
      must_remain_ignored: true,
      authorizes_training: false,
    };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
    const address = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = address;
    link.download = `r30j0-p2-owner-review-${seed.pack_id}.json`;
    link.click();
    URL.revokeObjectURL(address);
  }

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.onclick = () => { view = button.dataset.view; render(); };
  });
  document.getElementById("export-draft").onclick = exportDraft;
  document.getElementById("clear-local").onclick = () => {
    if (!window.confirm("清除这个 pack 在当前浏览器中的全部草稿？")) return;
    localStorage.removeItem(storageKey);
    state = emptyState();
    render();
  };
  document.getElementById("import-file").onchange = (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        state = sanitizeImported(JSON.parse(String(reader.result)));
        saveState();
        render();
      } catch {
        window.alert("草稿 JSON 无法读取。");
      }
    };
    reader.readAsText(file);
  };

  render();
}());
