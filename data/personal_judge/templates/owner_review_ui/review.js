"use strict";

(function startR30J0OwnerReview() {
  const seed = window.R30J0_REVIEW_PACK;
  if (!seed || seed.schema_version !== "r30j0.owner_review_state.v1") {
    document.getElementById("app").textContent = "review_data.js 无效或缺失。请重新运行本地 pack builder。";
    return;
  }

  const storageKey = `r30j0-owner-review:${seed.pack_id}`;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  let state = loadState();
  let view = "charter";
  let pilotIndex = 0;
  let contrastIndex = 0;

  function loadState() {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return clone(seed);
      const parsed = JSON.parse(saved);
      if (parsed.pack_id !== seed.pack_id) return clone(seed);
      parsed.owner_review_completed = false;
      parsed.validated_export = false;
      parsed.allowed_for_training = false;
      return parsed;
    } catch {
      return clone(seed);
    }
  }

  function saveState() {
    state.owner_review_completed = false;
    state.validated_export = false;
    state.allowed_for_training = false;
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* explicit export remains available */ }
    renderStatus();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/gu, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
    })[character]);
  }

  function boolSelect(value, id, label) {
    return `<label>${escapeHtml(label)}<select id="${id}"><option value=""></option><option value="true"${value === true ? " selected" : ""}>是</option><option value="false"${value === false ? " selected" : ""}>否</option></select></label>`;
  }

  function valueFromBoolSelect(id) {
    const value = document.getElementById(id).value;
    return value === "" ? null : value === "true";
  }

  function completion() {
    return {
      profile: Object.values(state.candidate_profile.values).filter(Boolean).length,
      profile_total: Object.keys(state.profile_taxonomy).length,
      taxonomy: Object.values(state.taxonomy_review).filter((item) => item.reviewed).length,
      taxonomy_total: Object.keys(state.taxonomy_review).length,
      presentation: Object.values(state.presentation_review).filter((item) => item.reviewed).length,
      presentation_total: Object.keys(state.presentation_review).length,
      pilot: state.pilot_slots.filter((slot) => slot.review_status === "reviewed").length,
      pilot_total: state.pilot_slots.length,
      contrast: state.contrast_slots.filter((slot) => slot.review_status === "reviewed").length,
      contrast_total: state.contrast_slots.length,
    };
  }

  function renderStatus() {
    const done = completion();
    document.getElementById("status").textContent =
      `owner_review_completed=false · profile ${done.profile}/${done.profile_total} · taxonomy ${done.taxonomy}/${done.taxonomy_total} · presentation ${done.presentation}/${done.presentation_total} · pilot ${done.pilot}/${done.pilot_total} · contrast ${done.contrast}/${done.contrast_total}`;
  }

  function render() {
    document.querySelectorAll("nav [data-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === view);
    });
    if (view === "charter") renderCharter();
    if (view === "taxonomy") renderTaxonomy();
    if (view === "presentation") renderPresentation();
    if (view === "pilot") renderPilot();
    if (view === "contrast") renderContrast();
    if (view === "validation") renderValidation();
    renderStatus();
  }

  function renderCharter() {
    const rows = Object.entries(state.profile_taxonomy).map(([axis, values]) => {
      const current = state.candidate_profile.values[axis];
      const options = values.map((value) => `<option value="${escapeHtml(value)}"${current === value ? " selected" : ""}>${escapeHtml(value)}</option>`).join("");
      return `<label>${escapeHtml(axis)}<select data-profile-axis="${escapeHtml(axis)}"><option value="">owner review required</option>${options}</select></label>`;
    }).join("");
    document.getElementById("app").innerHTML = `
      <h2>Personal Preference Charter</h2>
      <p>这里只记录明确、非敏感的 owner/efish 表达偏好；不推断 end-user 心理或身份。本包没有预填实际值。</p>
      <div class="grid">${rows}</div>
      <label class="inline"><input id="charter-reviewed" type="checkbox"${state.charter_review.reviewed ? " checked" : ""}>我已逐项审阅这些 charter 值</label>
      <label>Charter notes<textarea id="charter-notes">${escapeHtml(state.charter_review.notes)}</textarea></label>
      <details><summary>Public-safe charter snapshot</summary><pre>${escapeHtml(JSON.stringify(state.charter_snapshot, null, 2))}</pre></details>
      <button id="save-charter" type="button">保存 Charter 草稿</button>`;
    document.getElementById("save-charter").onclick = () => {
      document.querySelectorAll("[data-profile-axis]").forEach((select) => {
        state.candidate_profile.values[select.dataset.profileAxis] = select.value || null;
      });
      state.charter_review.reviewed = document.getElementById("charter-reviewed").checked;
      state.charter_review.notes = document.getElementById("charter-notes").value;
      saveState();
      render();
    };
  }

  function renderTaxonomy() {
    const groups = Object.entries(state.taxonomy_review).map(([key, item]) => `
      <section class="card">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${item.labels.map(escapeHtml).join(" · ")}</p>
        <label class="inline"><input data-taxonomy-reviewed="${escapeHtml(key)}" type="checkbox"${item.reviewed ? " checked" : ""}>taxonomy 已审阅</label>
        <label>Notes<textarea data-taxonomy-notes="${escapeHtml(key)}">${escapeHtml(item.notes)}</textarea></label>
      </section>`).join("");
    document.getElementById("app").innerHTML = `<h2>Label taxonomy</h2><p>这些低熵输出是唯一候选 head；不包含 factuality、emotion diagnosis 或 personality inference。</p>${groups}<button id="save-taxonomy" type="button">保存 taxonomy 草稿</button>`;
    document.getElementById("save-taxonomy").onclick = () => {
      for (const key of Object.keys(state.taxonomy_review)) {
        state.taxonomy_review[key].reviewed = document.querySelector(`[data-taxonomy-reviewed="${key}"]`).checked;
        state.taxonomy_review[key].notes = document.querySelector(`[data-taxonomy-notes="${key}"]`).value;
      }
      saveState();
      render();
    };
  }

  function renderPresentation() {
    const cards = Object.entries(state.presentation_review).map(([mode, item]) => `
      <section class="card">
        <h3>${escapeHtml(mode)}</h3>
        <p>${escapeHtml(item.contract)}</p>
        ${boolSelect(item.appropriate, `presentation-${mode}`, "这个 non-semantic presentation mode 是否适合保留？")}
        <label class="inline"><input data-presentation-reviewed="${escapeHtml(mode)}" type="checkbox"${item.reviewed ? " checked" : ""}>已审阅</label>
        <label>Notes<textarea data-presentation-notes="${escapeHtml(mode)}">${escapeHtml(item.notes)}</textarea></label>
      </section>`).join("");
    document.getElementById("app").innerHTML = `<h2>Presentation modes</h2><p>Presentation 只能控制 reveal、spacing、motion 等 UI 行为，绝不能编辑答案文字。</p>${cards}<button id="save-presentation" type="button">保存 presentation 草稿</button>`;
    document.getElementById("save-presentation").onclick = () => {
      for (const mode of Object.keys(state.presentation_review)) {
        state.presentation_review[mode].appropriate = valueFromBoolSelect(`presentation-${mode}`);
        state.presentation_review[mode].reviewed = document.querySelector(`[data-presentation-reviewed="${mode}"]`).checked;
        state.presentation_review[mode].notes = document.querySelector(`[data-presentation-notes="${mode}"]`).value;
      }
      saveState();
      render();
    };
  }

  function slotNavigation(kind, index, total) {
    return `<div class="slot-nav"><label>跳转到槽位<select id="slot-select">${Array.from({ length: total }, (_, offset) => `<option value="${offset}"${offset === index ? " selected" : ""}>${kind}-${String(offset + 1).padStart(3, "0")}</option>`).join("")}</select></label><button id="slot-prev" type="button">上一项</button><button id="slot-next" type="button">下一项</button></div>`;
  }

  function bindSlotNavigation(kind, total) {
    document.getElementById("slot-select").onchange = (event) => {
      if (kind === "pilot") pilotIndex = Number(event.target.value);
      else contrastIndex = Number(event.target.value);
      render();
    };
    document.getElementById("slot-prev").onclick = () => {
      if (kind === "pilot") pilotIndex = Math.max(0, pilotIndex - 1);
      else contrastIndex = Math.max(0, contrastIndex - 1);
      render();
    };
    document.getElementById("slot-next").onclick = () => {
      if (kind === "pilot") pilotIndex = Math.min(total - 1, pilotIndex + 1);
      else contrastIndex = Math.min(total - 1, contrastIndex + 1);
      render();
    };
  }

  function renderIssueChecks(selected) {
    return state.taxonomy_review.voice_issue.labels.map((label) => `<label class="inline"><input name="voice-issue" type="checkbox" value="${escapeHtml(label)}"${selected.includes(label) ? " checked" : ""}>${escapeHtml(label)}</label>`).join("");
  }

  function renderPilot() {
    const slot = state.pilot_slots[pilotIndex];
    const fitOptions = state.taxonomy_review.personal_fit.labels.map((label) => `<option${slot.owner_labels.personal_fit_label === label ? " selected" : ""}>${escapeHtml(label)}</option>`).join("");
    const presentationOptions = state.taxonomy_review.presentation.labels.map((label) => `<option${slot.owner_labels.presentation_label === label ? " selected" : ""}>${escapeHtml(label)}</option>`).join("");
    const confidenceOptions = state.taxonomy_review.confidence.labels.map((label) => `<option${slot.owner_labels.confidence_target === label ? " selected" : ""}>${escapeHtml(label)}</option>`).join("");
    document.getElementById("app").innerHTML = `
      <h2>Pilot owner review · 200 slots</h2>
      <p>当前槽位是空白 readiness scaffold，不是训练样本。只有填入 public-safe 内容后才可审阅。</p>
      ${slotNavigation("pilot", pilotIndex, state.pilot_slots.length)}
      <section class="card">
        <h3>${escapeHtml(slot.slot_id)} · ${escapeHtml(slot.review_status)}</h3>
        <label>Context（最小必要、public-safe）<textarea id="pilot-context">${escapeHtml(slot.content.context)}</textarea></label>
        <label>Latest user message<textarea id="pilot-user">${escapeHtml(slot.content.latest_user_message)}</textarea></label>
        <label>DeepSeek answer<textarea id="pilot-answer">${escapeHtml(slot.content.deepseek_answer)}</textarea></label>
        <label class="inline"><input id="pilot-public-safe" type="checkbox"${slot.public_safe === true ? " checked" : ""}>内容已确认为 public-safe</label>
        <div class="grid"><label>Personal Fit<select id="pilot-fit"><option value=""></option>${fitOptions}</select></label><label>Presentation<select id="pilot-presentation"><option value=""></option>${presentationOptions}</select></label><label>Confidence<select id="pilot-confidence"><option value=""></option>${confidenceOptions}</select></label></div>
        <fieldset><legend>Voice issues</legend><div class="label-grid">${renderIssueChecks(slot.owner_labels.voice_issue_labels)}</div></fieldset>
        <div class="grid">
          ${boolSelect(slot.owner_labels.feels_like_efish, "pilot-feels", "Does this feel like efish?")}
          ${boolSelect(slot.owner_labels.too_assistant_like, "pilot-assistant", "Is this too assistant-like?")}
          ${boolSelect(slot.owner_labels.too_short, "pilot-short", "Is it too short?")}
          ${boolSelect(slot.owner_labels.too_cold, "pilot-cold", "Is it too cold?")}
          ${boolSelect(slot.owner_labels.too_polished, "pilot-polished", "Is it too polished?")}
          ${boolSelect(slot.owner_labels.presentation_appropriate, "pilot-mode", "Is the presentation mode appropriate?")}
        </div>
        <label>Owner notes<textarea id="pilot-notes">${escapeHtml(slot.owner_labels.notes)}</textarea></label>
        <button id="save-pilot" type="button">保存此槽位</button>
      </section>`;
    bindSlotNavigation("pilot", state.pilot_slots.length);
    document.getElementById("save-pilot").onclick = () => {
      slot.content.context = document.getElementById("pilot-context").value.trim();
      slot.content.latest_user_message = document.getElementById("pilot-user").value.trim();
      slot.content.deepseek_answer = document.getElementById("pilot-answer").value.trim();
      slot.public_safe = document.getElementById("pilot-public-safe").checked;
      slot.owner_labels.personal_fit_label = document.getElementById("pilot-fit").value || null;
      slot.owner_labels.presentation_label = document.getElementById("pilot-presentation").value || null;
      slot.owner_labels.confidence_target = document.getElementById("pilot-confidence").value || null;
      slot.owner_labels.voice_issue_labels = Array.from(document.querySelectorAll('[name="voice-issue"]:checked')).map((element) => element.value);
      slot.owner_labels.feels_like_efish = valueFromBoolSelect("pilot-feels");
      slot.owner_labels.too_assistant_like = valueFromBoolSelect("pilot-assistant");
      slot.owner_labels.too_short = valueFromBoolSelect("pilot-short");
      slot.owner_labels.too_cold = valueFromBoolSelect("pilot-cold");
      slot.owner_labels.too_polished = valueFromBoolSelect("pilot-polished");
      slot.owner_labels.presentation_appropriate = valueFromBoolSelect("pilot-mode");
      slot.owner_labels.notes = document.getElementById("pilot-notes").value;
      slot.content_status = slot.content.latest_user_message && slot.content.deepseek_answer && slot.public_safe ? "public_safe_content_ready" : "awaiting_public_safe_content";
      slot.review_status = validatePilotSlot(slot).length === 0 ? "reviewed" : "incomplete";
      slot.allowed_for_training = false;
      saveState();
      render();
    };
  }

  function renderContrast() {
    const slot = state.contrast_slots[contrastIndex];
    document.getElementById("app").innerHTML = `
      <h2>Personalization contrast review · 100 slots</h2>
      <p>Pairs 只用于未来 preference supervision，不是 product pairwise architecture。A/B 必须保持同一 factual content，并包含 reverse controls。</p>
      ${slotNavigation("contrast", contrastIndex, state.contrast_slots.length)}
      <section class="card">
        <h3>${escapeHtml(slot.slot_id)} · ${escapeHtml(slot.review_status)}</h3>
        <label>Context<textarea id="contrast-context">${escapeHtml(slot.content.context)}</textarea></label>
        <label>Latest user message<textarea id="contrast-user">${escapeHtml(slot.content.latest_user_message)}</textarea></label>
        <div class="grid"><label>Answer A<textarea id="contrast-a">${escapeHtml(slot.content.answer_A)}</textarea></label><label>Answer B<textarea id="contrast-b">${escapeHtml(slot.content.answer_B)}</textarea></label></div>
        <label class="inline"><input id="contrast-public-safe" type="checkbox"${slot.public_safe === true ? " checked" : ""}>内容已确认为 public-safe</label>
        <label class="inline"><input id="contrast-same-facts" type="checkbox"${slot.same_factual_content_verified ? " checked" : ""}>A/B 同一 factual content 已验证</label>
        <label>Which answer would you actually prefer?<select id="contrast-preference"><option value=""></option><option value="A"${slot.owner_labels.owner_preference === "A" ? " selected" : ""}>A</option><option value="B"${slot.owner_labels.owner_preference === "B" ? " selected" : ""}>B</option><option value="TIE"${slot.owner_labels.owner_preference === "TIE" ? " selected" : ""}>TIE</option></select></label>
        <label>Control kind<select id="contrast-control"><option value=""></option><option value="generic_good_but_efish_mismatch"${slot.control_kind === "generic_good_but_efish_mismatch" ? " selected" : ""}>generic-good / efish-mismatch</option><option value="reverse_control"${slot.control_kind === "reverse_control" ? " selected" : ""}>reverse control</option><option value="subtle_personal_preference"${slot.control_kind === "subtle_personal_preference" ? " selected" : ""}>subtle personal preference</option></select></label>
        <div class="grid">
          ${boolSelect(slot.owner_labels.feels_like_efish, "contrast-feels", "Does the preferred answer feel like efish?")}
          ${boolSelect(slot.owner_labels.too_assistant_like, "contrast-assistant", "Is either answer too assistant-like?")}
          ${boolSelect(slot.owner_labels.too_short, "contrast-short", "Is either answer too short?")}
          ${boolSelect(slot.owner_labels.too_cold, "contrast-cold", "Is either answer too cold?")}
          ${boolSelect(slot.owner_labels.too_polished, "contrast-polished", "Is either answer too polished?")}
        </div>
        <label>Owner notes<textarea id="contrast-notes">${escapeHtml(slot.owner_labels.notes)}</textarea></label>
        <button id="save-contrast" type="button">保存此 pair</button>
      </section>`;
    bindSlotNavigation("contrast", state.contrast_slots.length);
    document.getElementById("save-contrast").onclick = () => {
      slot.content.context = document.getElementById("contrast-context").value.trim();
      slot.content.latest_user_message = document.getElementById("contrast-user").value.trim();
      slot.content.answer_A = document.getElementById("contrast-a").value.trim();
      slot.content.answer_B = document.getElementById("contrast-b").value.trim();
      slot.public_safe = document.getElementById("contrast-public-safe").checked;
      slot.same_factual_content_verified = document.getElementById("contrast-same-facts").checked;
      slot.owner_labels.owner_preference = document.getElementById("contrast-preference").value || null;
      slot.control_kind = document.getElementById("contrast-control").value || null;
      slot.owner_labels.feels_like_efish = valueFromBoolSelect("contrast-feels");
      slot.owner_labels.too_assistant_like = valueFromBoolSelect("contrast-assistant");
      slot.owner_labels.too_short = valueFromBoolSelect("contrast-short");
      slot.owner_labels.too_cold = valueFromBoolSelect("contrast-cold");
      slot.owner_labels.too_polished = valueFromBoolSelect("contrast-polished");
      slot.owner_labels.notes = document.getElementById("contrast-notes").value;
      slot.content_status = slot.content.latest_user_message && slot.content.answer_A && slot.content.answer_B && slot.public_safe ? "public_safe_content_ready" : "awaiting_public_safe_content";
      slot.review_status = validateContrastSlot(slot).length === 0 ? "reviewed" : "incomplete";
      slot.allowed_for_training = false;
      saveState();
      render();
    };
  }

  function validatePilotSlot(slot) {
    const errors = [];
    if (!slot.public_safe) errors.push("public_safe");
    if (!slot.content.latest_user_message) errors.push("latest_user_message");
    if (!slot.content.deepseek_answer) errors.push("deepseek_answer");
    if (!state.taxonomy_review.personal_fit.labels.includes(slot.owner_labels.personal_fit_label)) errors.push("personal_fit_label");
    if (!state.taxonomy_review.presentation.labels.includes(slot.owner_labels.presentation_label)) errors.push("presentation_label");
    if (!state.taxonomy_review.confidence.labels.includes(slot.owner_labels.confidence_target)) errors.push("confidence_target");
    for (const key of ["feels_like_efish", "too_assistant_like", "too_short", "too_cold", "too_polished", "presentation_appropriate"]) {
      if (typeof slot.owner_labels[key] !== "boolean") errors.push(key);
    }
    if (slot.owner_labels.voice_issue_labels.some((label) => !state.taxonomy_review.voice_issue.labels.includes(label))) errors.push("voice_issue_labels");
    return errors;
  }

  function validateContrastSlot(slot) {
    const errors = [];
    if (!slot.public_safe) errors.push("public_safe");
    if (!slot.same_factual_content_verified) errors.push("same_factual_content_verified");
    if (!slot.content.latest_user_message || !slot.content.answer_A || !slot.content.answer_B) errors.push("pair_content");
    if (!["A", "B", "TIE"].includes(slot.owner_labels.owner_preference)) errors.push("owner_preference");
    if (!["generic_good_but_efish_mismatch", "reverse_control", "subtle_personal_preference"].includes(slot.control_kind)) errors.push("control_kind");
    for (const key of ["feels_like_efish", "too_assistant_like", "too_short", "too_cold", "too_polished"]) {
      if (typeof slot.owner_labels[key] !== "boolean") errors.push(key);
    }
    return errors;
  }

  function validateAll() {
    const errors = [];
    for (const [axis, allowed] of Object.entries(state.profile_taxonomy)) {
      if (!allowed.includes(state.candidate_profile.values[axis])) errors.push(`charter:${axis}`);
    }
    if (!state.charter_review.reviewed) errors.push("charter:reviewed");
    for (const [key, item] of Object.entries(state.taxonomy_review)) if (!item.reviewed) errors.push(`taxonomy:${key}`);
    for (const [key, item] of Object.entries(state.presentation_review)) {
      if (!item.reviewed || typeof item.appropriate !== "boolean") errors.push(`presentation:${key}`);
    }
    state.pilot_slots.forEach((slot) => validatePilotSlot(slot).forEach((error) => errors.push(`${slot.slot_id}:${error}`)));
    state.contrast_slots.forEach((slot) => validateContrastSlot(slot).forEach((error) => errors.push(`${slot.slot_id}:${error}`)));
    if (!state.owner_attestation.explicit_owner_review) errors.push("attestation:explicit_owner_review");
    if (!state.owner_attestation.contains_only_non_sensitive_preferences) errors.push("attestation:non_sensitive");
    if (!state.owner_attestation.approves_public_safe_pilot_for_future_training_review) errors.push("attestation:future_training_review");
    return errors;
  }

  function renderValidation() {
    const errors = validateAll();
    document.getElementById("app").innerHTML = `
      <h2>Validation</h2>
      <p class="${errors.length ? "validation-fail" : "validation-pass"} card">${errors.length ? `${errors.length} 个必填条件尚未满足。` : "本地内容校验通过，可生成 validated owner-review export。"}</p>
      <div class="card">
        <label class="inline"><input id="attest-owner" type="checkbox"${state.owner_attestation.explicit_owner_review ? " checked" : ""}>这是 owner 的明确审阅，不是 Codex 推断</label>
        <label class="inline"><input id="attest-safe" type="checkbox"${state.owner_attestation.contains_only_non_sensitive_preferences ? " checked" : ""}>只包含非敏感偏好与 public-safe 内容</label>
        <label class="inline"><input id="attest-future" type="checkbox"${state.owner_attestation.approves_public_safe_pilot_for_future_training_review ? " checked" : ""}>同意把这份 pilot 交给未来训练授权审查（不等于当前训练授权）</label>
        <label>Reviewer note<textarea id="attest-note">${escapeHtml(state.owner_attestation.reviewer_note)}</textarea></label>
        <button id="save-attestation" type="button">保存 attestation 草稿</button>
      </div>
      <details><summary>前 100 个错误</summary><pre>${escapeHtml(errors.slice(0, 100).join("\n"))}</pre></details>`;
    document.getElementById("save-attestation").onclick = () => {
      state.owner_attestation.explicit_owner_review = document.getElementById("attest-owner").checked;
      state.owner_attestation.contains_only_non_sensitive_preferences = document.getElementById("attest-safe").checked;
      state.owner_attestation.approves_public_safe_pilot_for_future_training_review = document.getElementById("attest-future").checked;
      state.owner_attestation.reviewer_note = document.getElementById("attest-note").value;
      saveState();
      render();
    };
  }

  function download(payload, filename) {
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function draftExport() {
    const payload = clone(state);
    payload.owner_review_completed = false;
    payload.validated_export = false;
    payload.allowed_for_training = false;
    payload.export_kind = "owner_review_draft";
    payload.exported_at = new Date().toISOString();
    download(payload, "r30j0_owner_review_draft.json");
  }

  function validatedExport() {
    const errors = validateAll();
    if (errors.length > 0) {
      view = "validation";
      render();
      window.alert(`不能导出 completed review：仍有 ${errors.length} 个校验错误。`);
      return;
    }
    const payload = clone(state);
    payload.owner_review_completed = true;
    payload.validated_export = true;
    payload.allowed_for_training = false;
    payload.training_authorized = false;
    payload.export_kind = "validated_owner_review";
    payload.exported_at = new Date().toISOString();
    download(payload, "r30j0_owner_review_validated.json");
  }

  document.querySelectorAll("nav [data-view]").forEach((button) => {
    button.onclick = () => { view = button.dataset.view; render(); };
  });
  document.getElementById("export-draft").onclick = draftExport;
  document.getElementById("validate-export").onclick = validatedExport;
  document.getElementById("clear-local").onclick = () => {
    if (!window.confirm("确认清除此 review pack 的本地浏览器草稿？已下载文件不会被删除。")) return;
    try { localStorage.removeItem(storageKey); } catch { /* no-op */ }
    state = clone(seed);
    view = "charter";
    render();
  };
  document.getElementById("import-file").onchange = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (imported.pack_id !== seed.pack_id || imported.schema_version !== seed.schema_version) throw new Error("pack identity mismatch");
      imported.owner_review_completed = false;
      imported.validated_export = false;
      imported.allowed_for_training = false;
      state = imported;
      saveState();
      render();
    } catch (error) {
      window.alert(`导入失败：${error instanceof Error ? error.message : "invalid JSON"}`);
    } finally {
      event.target.value = "";
    }
  };

  render();
})();
