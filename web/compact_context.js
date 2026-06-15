export const CONTEXT_WINDOWS = Object.freeze({
  maxVisibleExchangeTurns: 4,
  maxRawExchangeTurnsInRuntimePacket: 4,
  maxInternalCompactExchangeTurns: 16,
  maxTrainingSyntheticExchangeTurns: 16,
  maxRawTurnChars: 600,
  maxCompactStateBytes: 8192,
  maxRuntimePacketBytes: 24576,
  maxPersonaPacketCards: 8,
  maxCultureCards: 12,
  maxMemoryAtoms: 6,
  maxReflectionCards: 4,
  maxMethodCards: 4
});

const RAW_TEXT_KEYS = new Set(["question", "answer", "text", "content", "message", "prompt", "raw"]);
const FIELD_LIMITS = Object.freeze({
  cultureCards: "maxCultureCards",
  personaCards: "maxPersonaPacketCards",
  methodCards: "maxMethodCards",
  memoryAtoms: "maxMemoryAtoms",
  reflectionCards: "maxReflectionCards"
});
const DROP_ORDER = ["reflectionCards", "memoryAtoms", "cultureCards", "personaCards", "methodCards"];
const PRIVATE_PATTERN =
  /\/Users\/|\/Volumes\/|\/home\/|[A-Za-z]:\\|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b\d{3,}[-.\s]\d{3,}[-.\s]\d{3,}\b|\b-?\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/i;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sourceTurnsFromState(state = {}) {
  if (Array.isArray(state)) return state;
  if (Array.isArray(state.contextTurns)) return state.contextTurns;
  if (Array.isArray(state.turns)) return state.turns;
  if (Array.isArray(state.recentTurns)) return state.recentTurns;
  return [];
}

function truncateRaw(value, limit = CONTEXT_WINDOWS.maxRawTurnChars) {
  const text = String(value || "");
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
}

function cloneRawTurn(turn = {}) {
  return {
    question: truncateRaw(turn.question || turn.user || ""),
    answer: truncateRaw(turn.answer || turn.assistant || ""),
    intent: String(turn.intent || ""),
    topic: String(turn.topic || "")
  };
}

function cleanList(value, limit = 8) {
  return asArray(value)
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function compactTurn(turn = {}) {
  return {
    domain: String(turn.domain || turn.last_domain || turn.topic || ""),
    intent: String(turn.intent || ""),
    question_type: String(turn.question_type || turn.questionType || ""),
    operation: String(turn.operation || ""),
    answer_policy: String(turn.answer_policy || turn.answerPolicy || ""),
    focus_entity_id: String(turn.focus_entity_id || turn.last_focus_entity_id || ""),
    entity_ids: cleanList(turn.entity_ids || turn.entities || turn.last_entities),
    work_ids: cleanList(turn.work_ids || turn.works || turn.last_works),
    correction: String(turn.correction || ""),
    boundary: String(turn.boundary || turn.risk_label || ""),
    unresolved_reference: String(turn.unresolved_reference || turn.referent || "")
  };
}

function byteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function pruneCards(cards, maxItems) {
  return asArray(cards).slice(0, Math.max(0, maxItems)).map((item) => ({ ...item }));
}

export function visibleTurnsFromState(state, limit = CONTEXT_WINDOWS.maxVisibleExchangeTurns) {
  return sourceTurnsFromState(state)
    .slice(-Math.min(limit, CONTEXT_WINDOWS.maxVisibleExchangeTurns))
    .map(cloneRawTurn);
}

export function rawRuntimeTurnsFromState(state, limit = CONTEXT_WINDOWS.maxRawExchangeTurnsInRuntimePacket) {
  return sourceTurnsFromState(state)
    .slice(-Math.min(limit, CONTEXT_WINDOWS.maxRawExchangeTurnsInRuntimePacket))
    .map(cloneRawTurn);
}

export function compactExtractionTurnsFromState(state, limit = CONTEXT_WINDOWS.maxInternalCompactExchangeTurns) {
  return sourceTurnsFromState(state)
    .slice(-Math.min(limit, CONTEXT_WINDOWS.maxInternalCompactExchangeTurns))
    .map(compactTurn);
}

export function buildCompactStateFromTurns(turns, previousState = {}) {
  const compactTurns = compactExtractionTurnsFromState(turns);
  const last = compactTurns.at(-1) || {};
  const entityIds = [];
  const workIds = [];
  const corrections = [];
  const boundaries = [];
  const unresolved = [];

  for (const turn of compactTurns) {
    for (const id of turn.entity_ids || []) if (id && !entityIds.includes(id)) entityIds.push(id);
    for (const id of turn.work_ids || []) if (id && !workIds.includes(id)) workIds.push(id);
    if (turn.focus_entity_id && !entityIds.includes(turn.focus_entity_id)) entityIds.push(turn.focus_entity_id);
    if (turn.correction) corrections.push({ kind: "correction", value: turn.correction });
    if (turn.boundary) boundaries.push(turn.boundary);
    if (turn.unresolved_reference) unresolved.push(turn.unresolved_reference);
  }

  return {
    last_domain: last.domain || previousState.last_domain || "",
    last_entities: entityIds.slice(-8),
    last_works: workIds.slice(-8),
    last_question_type: last.question_type || previousState.last_question_type || "",
    last_operation: last.operation || previousState.last_operation || "",
    last_answer_policy: last.answer_policy || previousState.last_answer_policy || "",
    last_focus_entity_id: last.focus_entity_id || entityIds.at(-1) || previousState.last_focus_entity_id || "",
    last_two_entity_ids: entityIds.slice(-2),
    recent_corrections: corrections.slice(-4),
    active_boundaries: [...new Set(boundaries)].slice(-6),
    unresolved_references: unresolved.slice(-6),
    turn_count_window: Math.min(compactTurns.length, CONTEXT_WINDOWS.maxInternalCompactExchangeTurns)
  };
}

export function compactStateContainsRawText(value) {
  const stack = [{ path: "", value }];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current.value !== "object") continue;
    for (const [key, child] of Object.entries(current.value)) {
      const lowered = key.toLowerCase();
      if (RAW_TEXT_KEYS.has(lowered)) return true;
      if (child && typeof child === "object") stack.push({ path: `${current.path}.${key}`, value: child });
    }
  }
  return false;
}

export function compactStateContainsPrivateValue(value) {
  return PRIVATE_PATTERN.test(JSON.stringify(value || {}));
}

export function buildRuntimePacket({
  query,
  visibleTurns,
  compactState,
  cultureCards,
  personaCards,
  methodCards,
  memoryAtoms,
  reflectionCards,
  solverPlan,
  verifierRules
} = {}) {
  const rawTurns = rawRuntimeTurnsFromState(visibleTurns || []);
  const packet = {
    query: truncateRaw(query || ""),
    raw_turns: rawTurns,
    compact_state: {
      ...(compactState || {}),
      turn_count_window: Math.min(
        Number(compactState?.turn_count_window || 0),
        CONTEXT_WINDOWS.maxInternalCompactExchangeTurns
      )
    },
    cultureCards: pruneCards(cultureCards, CONTEXT_WINDOWS.maxCultureCards),
    personaCards: pruneCards(personaCards, CONTEXT_WINDOWS.maxPersonaPacketCards),
    methodCards: pruneCards(methodCards, CONTEXT_WINDOWS.maxMethodCards),
    memoryAtoms: pruneCards(memoryAtoms, CONTEXT_WINDOWS.maxMemoryAtoms),
    reflectionCards: pruneCards(reflectionCards, CONTEXT_WINDOWS.maxReflectionCards),
    solver_plan: solverPlan || {},
    verifier_rules: verifierRules || {}
  };

  if (compactStateContainsRawText(packet.compact_state) || compactStateContainsPrivateValue(packet.compact_state)) {
    packet.compact_state = {
      turn_count_window: packet.compact_state.turn_count_window,
      rejected: true,
      rejection_reason: "compact_state_boundary"
    };
  }

  for (const key of Object.keys(FIELD_LIMITS)) {
    const maxKey = FIELD_LIMITS[key];
    packet[key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)] = pruneCards(packet[key] || [], CONTEXT_WINDOWS[maxKey]);
    delete packet[key];
  }

  while (byteLength(packet) > CONTEXT_WINDOWS.maxRuntimePacketBytes) {
    const key = DROP_ORDER.find((name) => {
      const snake = name.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
      return asArray(packet[snake]).length > 0;
    });
    if (!key) break;
    const snake = key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
    packet[snake] = packet[snake].slice(0, Math.max(0, packet[snake].length - 1));
  }

  return packet;
}
