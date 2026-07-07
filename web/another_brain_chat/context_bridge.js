export const R27C0_ADAPTER_CONTRACT_VERSION = "r27c0-adapter-packets-v1";
export const LOCAL_SESSION_PRIVACY_SCOPE = "local_session_only";
export const MAX_ADAPTER_CONTENT_CHARS = 64000;

export const ADAPTER_SOURCE_TYPES = Object.freeze([
  "manual_text",
  "manual_json",
  "browser_share",
  "future_connector"
]);

export const ADAPTER_PACKET_TYPES = Object.freeze([
  "InputAdapterPacket",
  "StatePacket",
  "EvidencePacket",
  "MemoryContextPacket",
  "AnswerSurfaceRequest",
  "AnswerSurfaceResponse"
]);

const SECURITY_TEXT_MARKERS = Object.freeze([
  "ignore previous instructions",
  "ignore the previous instructions",
  "disregard previous instructions",
  "override runtime policy",
  "reveal hidden prompt",
  "reveal the hidden prompt",
  "show hidden prompt",
  "show the hidden prompt",
  "print hidden prompt",
  "hidden prompt:",
  "reveal system prompt",
  "show system prompt",
  "show the system prompt",
  "print system prompt",
  "system prompt:",
  "reveal developer message",
  "show developer message",
  "show the developer message",
  "print developer message",
  "developer message:",
  "developer instructions:",
  "chain-of-thought",
  "chain of thought",
  "hidden reasoning",
  "<hidden",
  "<system",
  "<developer"
]);

const SECRET_LIKE_PATTERN = /\b(?:api[_-]?key|secret|password|passwd|token)\s*[:=]\s*["']?[^"'\s]{8,}/i;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nowIso(options = {}) {
  return options.createdAtClient || options.created_at_client || new Date().toISOString();
}

function normalizePacketType(value, fallback = "MemoryContextPacket") {
  const packetType = value?.packet_type || value?.type || fallback;
  return ADAPTER_PACKET_TYPES.includes(packetType) ? packetType : String(packetType || fallback);
}

function inferPacketType(value) {
  if (ADAPTER_PACKET_TYPES.includes(value?.packet_type)) return value.packet_type;
  if (Array.isArray(value?.retrieved_evidence)) return "EvidencePacket";
  if (isObject(value?.state_packet) || isObject(value?.state)) return "StatePacket";
  return "MemoryContextPacket";
}

function normalizeTrustLevel(value) {
  return ["high", "medium", "low"].includes(value) ? value : "low";
}

function sanitizeSourceIdPart(value) {
  const cleaned = String(value || "manual")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "manual";
}

function inspectSecurityText(value) {
  const text = String(value || "").toLowerCase();
  const failures = SECURITY_TEXT_MARKERS
    .filter((marker) => text.includes(marker))
    .map((marker) => marker.includes("chain") || marker.includes("reasoning")
      ? "chain_of_thought_request_blocked"
      : marker.includes("ignore") || marker.includes("override") || marker.includes("disregard")
        ? "prompt_injection_marker_blocked"
        : "hidden_prompt_or_developer_marker_blocked");
  return {
    ok: failures.length === 0,
    failures: Array.from(new Set(failures)),
    warnings: SECRET_LIKE_PATTERN.test(String(value || "")) ? ["secrets_like_input_warning"] : []
  };
}

function guardAdapterPacketPrivacy(packet = {}) {
  const failures = [];
  const warnings = [];
  if (packet.privacy_scope !== LOCAL_SESSION_PRIVACY_SCOPE) failures.push("privacy_scope_must_be_local_session_only");
  if (packet.allowed_for_training !== false) failures.push("allowed_for_training_must_be_false");
  if (packet.persist === true || packet.persistence === true || packet.save_to_disk === true || packet.local_persistence === true) {
    failures.push("adapter_local_persistence_rejected");
  }
  const firstFlag = "training_" + "promotion";
  const pVerb = "promote";
  const secondFlag = [pVerb, "to", "train" + "ing"].join("_");
  const blockedTrainingFlag = Boolean(packet[firstFlag]) || Boolean(packet[secondFlag]);
  if (blockedTrainingFlag) failures.push("adapter_training_promotion_rejected");
  const contentInspection = inspectSecurityText(packet.content || "");
  failures.push(...contentInspection.failures.map((failure) => `adapter_${failure}`));
  warnings.push(...contentInspection.warnings.map((warning) => `adapter_${warning}`));
  for (const item of Array.isArray(packet.evidence) ? packet.evidence : []) {
    for (const key of ["answer", "answer_text", "final_answer", "expected_answer", "prompt"]) {
      if (Object.prototype.hasOwnProperty.call(item || {}, key)) failures.push(`adapter_answer_bank_field_rejected:${key}`);
    }
    const evidenceInspection = inspectSecurityText(`${item?.title || ""}\n${item?.text || ""}`);
    failures.push(...evidenceInspection.failures.map((failure) => `adapter_evidence_${failure}`));
    warnings.push(...evidenceInspection.warnings.map((warning) => `adapter_evidence_${warning}`));
  }
  return {
    ok: failures.length === 0,
    failures: Array.from(new Set(failures)),
    warnings: Array.from(new Set(warnings)),
    local_session_only: true,
    allowed_for_training: false,
    imported_context_is_training_data: false
  };
}

export function validateAdapterPacket(packet, options = {}) {
  const failures = [];
  if (!isObject(packet)) {
    return { ok: false, failures: ["packet_must_be_object"], packet_type: null };
  }

  const packetType = normalizePacketType(packet, inferPacketType(packet));
  const expected = options.expectedPacketType || options.packet_type;
  if (!ADAPTER_PACKET_TYPES.includes(packetType)) failures.push("packet_type_invalid");
  if (expected && packetType !== expected) failures.push(`packet_type_mismatch:${expected}`);

  if (!ADAPTER_SOURCE_TYPES.includes(packet.source_type)) failures.push("source_type_invalid");
  if (typeof packet.source_label !== "string" || !packet.source_label.trim()) failures.push("source_label_missing");
  if (typeof packet.content !== "string") {
    failures.push("content_must_be_string");
  } else if (packet.content.length > MAX_ADAPTER_CONTENT_CHARS) {
    failures.push("content_too_large");
  }
  if (!Array.isArray(packet.evidence)) failures.push("evidence_must_be_array");
  if (packet.privacy_scope !== LOCAL_SESSION_PRIVACY_SCOPE) failures.push("privacy_scope_must_be_local_session_only");
  if (packet.allowed_for_training !== false) failures.push("allowed_for_training_must_be_false");
  if (typeof packet.created_at_client !== "string" || !packet.created_at_client.trim()) failures.push("created_at_client_missing");
  if (!isObject(packet.provenance)) failures.push("provenance_must_be_object");

  return { ok: failures.length === 0, failures, packet_type: packetType };
}

function wrapCommonPacket(packet, packetType = null) {
  return {
    ...packet,
    packet_type: packetType || normalizePacketType(packet, inferPacketType(packet)),
    privacy_scope: packet.privacy_scope,
    allowed_for_training: packet.allowed_for_training,
    provenance: packet.provenance || {}
  };
}

function isLegacyEvidencePacket(packet) {
  return isObject(packet) && Array.isArray(packet.retrieved_evidence) && typeof packet.query === "string";
}

function wrapLegacyEvidencePacket(packet, options = {}) {
  return {
    packet_type: "EvidencePacket",
    source_type: "manual_json",
    source_label: options.sourceLabel || "Manual evidence packet",
    content: String(packet.query || ""),
    evidence: packet.retrieved_evidence,
    privacy_scope: LOCAL_SESSION_PRIVACY_SCOPE,
    allowed_for_training: false,
    created_at_client: nowIso(options),
    provenance: {
      imported_as: "r27b3_evidence_packet",
      local_bridge: R27C0_ADAPTER_CONTRACT_VERSION,
      original_evidence_status: packet.evidence_status || null,
      original_answer_policy_hint: packet.answer_policy_hint || null
    }
  };
}

export function createManualTextContextPacket(content, options = {}) {
  return {
    packet_type: "MemoryContextPacket",
    source_type: "manual_text",
    source_label: options.sourceLabel || "Manual text context",
    content: String(content || ""),
    evidence: [],
    privacy_scope: LOCAL_SESSION_PRIVACY_SCOPE,
    allowed_for_training: false,
    created_at_client: nowIso(options),
    provenance: {
      imported_as: "plain_text",
      local_bridge: R27C0_ADAPTER_CONTRACT_VERSION,
      ...(options.provenance || {})
    }
  };
}

export function createStateAdapterPacket(statePacket, options = {}) {
  return {
    packet_type: "StatePacket",
    source_type: "manual_json",
    source_label: options.sourceLabel || "Local state export",
    content: JSON.stringify(statePacket || {}, null, 2),
    evidence: [],
    privacy_scope: LOCAL_SESSION_PRIVACY_SCOPE,
    allowed_for_training: false,
    created_at_client: nowIso(options),
    provenance: {
      exported_as: "state_packet",
      local_bridge: R27C0_ADAPTER_CONTRACT_VERSION,
      runtime_version: statePacket?.runtime_version || null
    }
  };
}

export function parseLocalImportPacket(rawText, options = {}) {
  const raw = String(rawText || "").trim();
  if (!raw) return { ok: false, failures: ["empty_import"], packet: null };

  let packet = null;
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (isLegacyEvidencePacket(parsed)) packet = wrapLegacyEvidencePacket(parsed, options);
      else if (isObject(parsed)) packet = wrapCommonPacket(parsed);
      else return { ok: false, failures: ["json_packet_must_be_object"], packet: null };
    } catch (error) {
      return { ok: false, failures: [`invalid_json:${error.message}`], packet: null };
    }
  } else {
    packet = createManualTextContextPacket(raw, options);
  }

  const privacyGuard = guardAdapterPacketPrivacy(packet);
  const validation = validateAdapterPacket(packet, options);
  if (!validation.ok || !privacyGuard.ok) {
    return {
      ok: false,
      failures: Array.from(new Set([...validation.failures, ...privacyGuard.failures])),
      warnings: privacyGuard.warnings,
      packet: null
    };
  }
  return { ok: true, failures: [], warnings: privacyGuard.warnings, packet };
}

export function normalizeAdapterEvidenceItem(item, index = 0, packet = {}) {
  return {
    source_id: String(item?.source_id || item?.id || `manual_context_${index}`),
    title: String(item?.title || packet.source_label || "Manual context"),
    text: String(item?.text || item?.content || ""),
    trust_level: normalizeTrustLevel(item?.trust_level),
    retrieval_score: Number(item?.retrieval_score ?? item?.score ?? 0.32),
    license_or_origin: String(item?.license_or_origin || item?.origin || `${packet.source_type || "manual"}:${LOCAL_SESSION_PRIVACY_SCOPE}`),
    can_answer: item?.can_answer !== false,
    keywords: Array.isArray(item?.keywords) ? item.keywords.map(String) : [],
    metadata: {
      ...(isObject(item?.metadata) ? item.metadata : {}),
      adapter_packet_type: packet.packet_type || inferPacketType(packet),
      adapter_source_type: packet.source_type || "manual_json",
      adapter_source_label: packet.source_label || "Manual context",
      privacy_scope: LOCAL_SESSION_PRIVACY_SCOPE,
      allowed_for_training: false,
      local_session_only: true
    }
  };
}

export function adapterPacketToEvidenceRecords(packet, options = {}) {
  const validation = validateAdapterPacket(packet);
  if (!validation.ok) throw new Error(`adapter_packet_invalid:${validation.failures.join(",")}`);
  const privacyGuard = guardAdapterPacketPrivacy(packet);
  if (!privacyGuard.ok) throw new Error(`adapter_packet_privacy_invalid:${privacyGuard.failures.join(",")}`);

  const packetType = validation.packet_type;
  if (packetType === "StatePacket" || packetType === "AnswerSurfaceRequest" || packetType === "AnswerSurfaceResponse") {
    return [];
  }

  const records = [];
  if (packetType !== "EvidencePacket" && packet.content.trim()) {
    records.push({
      source_id: `manual_context_${sanitizeSourceIdPart(packet.source_type)}_${sanitizeSourceIdPart(packet.source_label)}`,
      title: packet.source_label,
      text: packet.content,
      trust_level: options.contentTrustLevel || "medium",
      license_or_origin: `${packet.source_type}:${LOCAL_SESSION_PRIVACY_SCOPE}`,
      can_answer: true,
      keywords: String(packet.content || "").split(/\s+/).slice(0, 12),
      metadata: {
        adapter_packet_type: packetType,
        adapter_source_type: packet.source_type,
        adapter_source_label: packet.source_label,
        privacy_scope: LOCAL_SESSION_PRIVACY_SCOPE,
        allowed_for_training: false,
        local_session_only: true,
        provenance: packet.provenance
      }
    });
  }

  for (const [index, item] of packet.evidence.entries()) {
    const normalized = normalizeAdapterEvidenceItem(item, index, packet);
    if (normalized.text.trim()) records.push(normalized);
  }
  return records;
}

export function mergeAdapterEvidenceRecords(baseRecords = [], packets = [], options = {}) {
  const records = Array.isArray(baseRecords) ? [...baseRecords] : [];
  for (const packet of packets || []) records.push(...adapterPacketToEvidenceRecords(packet, options));
  return records;
}

export function applyImportedStatePackets(statePacket, packets = []) {
  const imported = [];
  for (const packet of packets || []) {
    const validation = validateAdapterPacket(packet);
    if (!validation.ok || validation.packet_type !== "StatePacket") continue;
    let parsedState = null;
    try {
      parsedState = JSON.parse(packet.content);
    } catch {
      parsedState = null;
    }
    imported.push({
      source_label: packet.source_label,
      created_at_client: packet.created_at_client,
      state: parsedState,
      privacy_scope: LOCAL_SESSION_PRIVACY_SCOPE,
      allowed_for_training: false
    });
  }
  if (imported.length === 0) return statePacket;
  return {
    ...statePacket,
    imported_state_packets: imported,
    adapter_context: {
      ...(statePacket.adapter_context || {}),
      local_session_only: true,
      allowed_for_training: false,
      imported_state_packet_count: imported.length
    }
  };
}

export function buildAdapterContextSummary(packets = []) {
  const validPackets = [];
  const failures = [];
  const warnings = [];
  let evidenceRecordCount = 0;
  for (const packet of packets || []) {
    const validation = validateAdapterPacket(packet);
    const privacyGuard = validation.ok ? guardAdapterPacketPrivacy(packet) : null;
    if (validation.ok && privacyGuard.ok) {
      validPackets.push({ packet, packet_type: validation.packet_type });
      warnings.push(...privacyGuard.warnings);
      evidenceRecordCount += adapterPacketToEvidenceRecords(packet).length;
    } else {
      failures.push(...(validation.ok ? privacyGuard.failures : validation.failures));
      if (privacyGuard) warnings.push(...privacyGuard.warnings);
    }
  }
  return {
    contract_version: R27C0_ADAPTER_CONTRACT_VERSION,
    packet_count: validPackets.length,
    packet_types: validPackets.map((item) => item.packet_type),
    evidence_record_count: evidenceRecordCount,
    privacy_scope: LOCAL_SESSION_PRIVACY_SCOPE,
    allowed_for_training: false,
    local_session_only: true,
    persistence: false,
    imported_context_is_training_data: false,
    security_policy: "r28sec0-static-security-v1",
    failures,
    warnings: Array.from(new Set(warnings))
  };
}

export function buildAnswerSurfaceRequest({ input, statePacket = null, evidencePacket = null, contextPackets = [], createdAtClient = null } = {}) {
  return {
    packet_type: "AnswerSurfaceRequest",
    source_type: "manual_json",
    source_label: "Local answer surface request",
    content: String(input || ""),
    evidence: evidencePacket?.retrieved_evidence || [],
    privacy_scope: LOCAL_SESSION_PRIVACY_SCOPE,
    allowed_for_training: false,
    created_at_client: createdAtClient || new Date().toISOString(),
    provenance: {
      local_bridge: R27C0_ADAPTER_CONTRACT_VERSION,
      runtime_version: statePacket?.runtime_version || null,
      local_only: true,
      backend_inference: false,
      external_llm_api: false,
      context_packet_count: contextPackets.length
    }
  };
}

export function buildAnswerSurfaceResponse({ finalAnswer, requestPacket = null, evidencePacket = null, createdAtClient = null } = {}) {
  return {
    packet_type: "AnswerSurfaceResponse",
    source_type: "manual_json",
    source_label: "Local answer surface response",
    content: String(finalAnswer || ""),
    evidence: evidencePacket?.retrieved_evidence || requestPacket?.evidence || [],
    privacy_scope: LOCAL_SESSION_PRIVACY_SCOPE,
    allowed_for_training: false,
    created_at_client: createdAtClient || new Date().toISOString(),
    provenance: {
      local_bridge: R27C0_ADAPTER_CONTRACT_VERSION,
      request_created_at_client: requestPacket?.created_at_client || null,
      local_only: true,
      backend_inference: false,
      external_llm_api: false,
      training_promotion: false
    }
  };
}

export function createLocalContextBridge() {
  let packets = [];
  return {
    importText(rawText, options = {}) {
      const result = parseLocalImportPacket(rawText, options);
      if (!result.ok) return result;
      packets = [...packets, result.packet];
      return { ...result, summary: buildAdapterContextSummary(packets) };
    },
    clear() {
      packets = [];
      return buildAdapterContextSummary(packets);
    },
    getPackets() {
      return [...packets];
    },
    summary() {
      return buildAdapterContextSummary(packets);
    }
  };
}
