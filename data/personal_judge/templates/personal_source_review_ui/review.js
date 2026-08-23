"use strict";

(function startPersonalSourceReview() {
  const seed = window.R30J0_PERSONAL_SOURCE_REVIEW;
  const section = document.body.dataset.section;
  const sectionKeys = ["source_summary", "style_hypotheses", "preference_evidence", "contrast_pairs", "register_profiles"];
  const decisions = ["ACCEPT", "REJECT", "EDIT", "UNSURE"];
  const forbiddenText = [
    /\bAuthorization\s*:/iu,
    /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/u,
    /\bsk-[A-Za-z0-9_-]{8,}/u,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
    /(?:^|[\s"'`])\/(?:Users|private|home|var\/folders)\//u,
    /\b[A-Za-z]:\\(?:Users|Documents|AppData)\\/u,
  ];

  const safeSeed = seed
    && seed.schema_version === "r30j0.personal_source_review_payload.v1"
    && seed.sanitized === true
    && seed.public_safe === true
    && seed.credential_free === true
    && seed.sensitive_raw_removed === true
    && seed.owner_review_completed === false
    && seed.profile_frozen === false
    && seed.allowed_for_training === false
    && seed.sections
    && sectionKeys.every((key) => Array.isArray(seed.sections[key]));
  if (!safeSeed || !sectionKeys.includes(section)) {
    document.getElementById("app").textContent = "sanitized review payload 无效、缺失或页面 section 未知。";
    return;
  }

  const storageKey = `r30j0-personal-source-review:${seed.payload_id}`;
  const knownItemIds = new Set(sectionKeys.flatMap((key) => seed.sections[key].map((item) => item.item_id)));
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const initialState = () => ({
    schema_version: "r30j0.personal_source_review_export.v1",
    payload_id: seed.payload_id,
    source_payload_sha256: seed.source_payload_sha256,
    owner_review_completed: false,
    profile_frozen: false,
    allowed_for_training: false,
    local_only: true,
    decisions: {},
  });
  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return initialState();
      const parsed = JSON.parse(raw);
      if (parsed.payload_id !== seed.payload_id || parsed.source_payload_sha256 !== seed.source_payload_sha256) return initialState();
      const normalized = initialState();
      if (!parsed.decisions || typeof parsed.decisions !== "object" || Array.isArray(parsed.decisions)) return normalized;
      for (const [itemId, draft] of Object.entries(parsed.decisions)) {
        if (!knownItemIds.has(itemId) || !draft || typeof draft !== "object" || Array.isArray(draft)) continue;
        const decision = decisions.includes(draft.decision) ? draft.decision : null;
        const edited = typeof draft.edited_interpretation === "string" ? draft.edited_interpretation.slice(0, 600) : "";
        const note = typeof draft.reviewer_note === "string" ? draft.reviewer_note.slice(0, 500) : "";
        if (!decision || hasForbiddenText(edited) || hasForbiddenText(note)) continue;
        normalized.decisions[itemId] = {
          decision,
          edited_interpretation: decision === "EDIT" ? edited : "",
          reviewer_note: note,
        };
      }
      return normalized;
    } catch {
      return initialState();
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/gu, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
    })[character]);
  }

  function hasForbiddenText(value) {
    return forbiddenText.some((pattern) => pattern.test(value));
  }

  function safeDraft(itemId) {
    const draft = state.decisions[itemId];
    if (!draft || !decisions.includes(draft.decision)) {
      return { decision: "UNSURE", edited_interpretation: "", reviewer_note: "" };
    }
    return draft;
  }

  function completion() {
    const allItems = sectionKeys.flatMap((key) => seed.sections[key].map((item) => item.item_id));
    const reviewed = allItems.filter((itemId) => Object.hasOwn(state.decisions, itemId)).length;
    return { reviewed, total: allItems.length };
  }

  function persist() {
    state.owner_review_completed = false;
    state.profile_frozen = false;
    state.allowed_for_training = false;
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* explicit export remains available */ }
    renderStatus();
  }

  function renderStatus() {
    const done = completion();
    document.getElementById("status").textContent =
      `reviewed ${done.reviewed}/${done.total} · owner_review_completed=false · profile_frozen=false · allowed_for_training=false`;
  }

  function sectionNotice() {
    if (section === "register_profiles") {
      return "这里登记的是待 owner 审阅的 profile 假设，不是真实 profile；任何选择都不会在 J0 冻结或写入 tracked profile。";
    }
    if (section === "contrast_pairs") {
      return "对照只用于检查偏好证据；不得把 pair 当作产品推理架构，也不得从差异中推断敏感人格。";
    }
    return "只判断已清洗证据是否支持候选解释。原始敏感材料不应出现在此 pack。";
  }

  function renderItem(item) {
    const draft = safeDraft(item.item_id);
    const options = decisions.map((decision) =>
      `<option value="${decision}"${draft.decision === decision ? " selected" : ""}>${decision}</option>`).join("");
    const conflicts = item.conflicts.length
      ? `<div class="conflicts"><strong>Conflicts</strong><ul>${item.conflicts.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul></div>`
      : `<div class="conflicts muted">No recorded conflict in sanitized payload.</div>`;
    return `<article class="card" data-item-id="${escapeHtml(item.item_id)}">
      <h2>${escapeHtml(item.item_id)}</h2>
      <div class="metadata">
        <span>source type: <strong>${escapeHtml(item.source_type)}</strong></span>
        <span>confidence: <strong>${escapeHtml(item.confidence.toFixed(2))}</strong></span>
        <span>redaction: <strong>sanitized</strong></span>
      </div>
      <p class="snippet"><strong>Short redacted snippet</strong><br>${escapeHtml(item.redacted_snippet)}</p>
      <p class="interpretation"><strong>Proposed interpretation</strong><br>${escapeHtml(item.proposed_interpretation)}</p>
      ${conflicts}
      <label>Decision
        <select data-field="decision">${options}</select>
      </label>
      <label>Edited interpretation（仅在 EDIT 时作为 owner 草稿）
        <textarea data-field="edited_interpretation" maxlength="600">${escapeHtml(draft.edited_interpretation)}</textarea>
      </label>
      <label>Reviewer note（不得加入敏感原文、身份或 secrets）
        <textarea data-field="reviewer_note" maxlength="500">${escapeHtml(draft.reviewer_note)}</textarea>
      </label>
      <button type="button" data-action="save">保存本项</button><span class="save-result" aria-live="polite"></span>
    </article>`;
  }

  function bindItems() {
    document.querySelectorAll("[data-item-id]").forEach((card) => {
      card.querySelector('[data-action="save"]').onclick = () => {
        const itemId = card.dataset.itemId;
        const decision = card.querySelector('[data-field="decision"]').value;
        const edited = card.querySelector('[data-field="edited_interpretation"]').value.trim();
        const note = card.querySelector('[data-field="reviewer_note"]').value.trim();
        const result = card.querySelector(".save-result");
        if (!decisions.includes(decision) || (decision === "EDIT" && !edited)) {
          result.textContent = "EDIT 必须填写修改后的解释。";
          result.className = "save-result validation-error";
          return;
        }
        if (hasForbiddenText(edited) || hasForbiddenText(note)) {
          result.textContent = "检测到凭证、标识符或机器路径样式；未保存。";
          result.className = "save-result validation-error";
          return;
        }
        state.decisions[itemId] = {
          decision,
          edited_interpretation: decision === "EDIT" ? edited : "",
          reviewer_note: note,
        };
        persist();
        result.textContent = "已保存到本地浏览器。";
        result.className = "save-result";
      };
    });
  }

  function render() {
    document.querySelectorAll("nav a").forEach((link) => {
      link.classList.toggle("active", link.getAttribute("href") === `${section}.html`);
    });
    const items = seed.sections[section];
    document.getElementById("section-note").textContent = sectionNotice();
    document.getElementById("section-note").classList.toggle("warning", section === "register_profiles");
    document.getElementById("app").innerHTML = items.length
      ? items.map(renderItem).join("")
      : `<p class="empty">当前 sanitized payload 在此 section 没有待审条目。</p>`;
    bindItems();
    renderStatus();
  }

  function downloadReview() {
    for (const draft of Object.values(state.decisions)) {
      if (hasForbiddenText(draft.edited_interpretation) || hasForbiddenText(draft.reviewer_note)) {
        window.alert("导出被拒绝：本地草稿包含凭证、标识符或机器路径样式。");
        return;
      }
    }
    const payload = clone(state);
    payload.decisions = Object.fromEntries(Object.entries(payload.decisions)
      .filter(([itemId]) => knownItemIds.has(itemId))
      .map(([itemId, draft]) => [itemId, {
        decision: draft.decision,
        edited_interpretation: draft.decision === "EDIT" ? draft.edited_interpretation : "",
        reviewer_note: draft.reviewer_note,
      }]));
    payload.owner_review_completed = false;
    payload.profile_frozen = false;
    payload.allowed_for_training = false;
    payload.export_kind = "personal_source_owner_review_draft";
    payload.exported_at = new Date().toISOString();
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `r30j0_personal_source_review_${seed.payload_id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  document.getElementById("export-review").onclick = downloadReview;
  document.getElementById("clear-local").onclick = () => {
    if (!window.confirm("确认清除此 pack 的本地审阅状态？已下载文件不会被删除。")) return;
    try { localStorage.removeItem(storageKey); } catch { /* no-op */ }
    state = initialState();
    render();
  };
  render();
})();
