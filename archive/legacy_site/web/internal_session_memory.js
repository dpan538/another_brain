export const SESSION_MEMORY_WINDOWS = Object.freeze({
  visibleUiExchangeTurns: 4,
  internalRuntimeExchangeTurns: 16,
  modelUsableSessionExchangeTurns: 16,
  persistentMemoryRequiresApproval: true,
  maxRawTurnChars: 800,
  maxInternalMemoryBytes: 65536,
  maxRuntimePacketBytes: 49152,
  maxCompactStateBytes: 16384,
  answerSlaMs: 3000
});

const SENSITIVE_PATTERNS = [
  { kind: "local_path", re: /\/Users\/[^\s]+|\/Volumes\/[^\s]+|\/home\/[^\s]+|[A-Za-z]:\\[^\s]+/g },
  { kind: "email", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  { kind: "phone", re: /(?:\+?\d[\s.-]?){9,}/g },
  { kind: "gps", re: /-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/g },
  { kind: "id_or_account", re: /\b(?:passport|visa|bank|account|student\s*id|身份证|护照|签证|银行卡|账号)[:：]?\s*[A-Z0-9-]{4,}\b/gi }
];

const ENTITY_PATTERNS = [
  ["person.luo_dayou", /罗大佑|lo\s*ta-?yu|luo\s*dayou/i],
  ["person.natsume_soseki", /夏目漱石|natsume/i],
  ["person.kawabata_yasunari", /川端康成|kawabata/i],
  ["person.murakami_haruki", /村上春树|murakami/i],
  ["person.duchamp", /杜尚|duchamp/i],
  ["alias.crocodile", /鳄鱼/]
];

const WORK_PATTERNS = [
  ["work.album.zhihu_zheye", /之乎者也/],
  ["work.song.tongnian", /童年/],
  ["work.song.lukang_xiaozhen", /鹿港小镇/],
  ["work.kokoro", /《?心》?|kokoro/i],
  ["work.snow_country", /雪国/],
  ["work.genji", /源氏物语/]
];

const DOMAIN_PATTERNS = [
  ["music.chinese_pop_general", /华语流行|中文流行|台湾流行|香港流行|罗大佑|李宗盛|周杰伦|邓丽君/],
  ["literature.japanese", /日本文学|夏目漱石|川端康成|村上春树|太宰治|源氏物语/],
  ["art_history", /艺术史|杜尚|包豪斯|摄影史|美术馆/],
  ["philosophy", /哲学|存在主义|德里达|解构|康德|黑格尔/],
  ["reasoning", /苹果|谁最高|会飞|不是鱼|加|减|乘|除|等于/]
];

const CORRECTION_PATTERN = /(不是|不要|这里的|我指的是|纠正|改成|以后.*叫|不要再)/;
const BOUNDARY_PATTERN = /(不要歌词|不贴歌词|不要原文|隐私|不要泄露|不要根据我的文件|不要路径|不要复述)/;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function byteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value ?? {})).length;
}

function truncateText(value, limit = SESSION_MEMORY_WINDOWS.maxRawTurnChars) {
  const text = String(value || "");
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
}

function sourceTurns(session = {}) {
  if (Array.isArray(session)) return session;
  if (Array.isArray(session.contextTurns)) return session.contextTurns;
  if (Array.isArray(session.turns)) return session.turns;
  if (Array.isArray(session.recentTurns)) return session.recentTurns;
  return [];
}

function redactText(text) {
  let redacted = truncateText(text);
  const redactions = [];
  for (const pattern of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern.re, () => {
      redactions.push(pattern.kind);
      return `[REDACTED:${pattern.kind}]`;
    });
  }
  return { text: redacted, redactions };
}

function normalizeTurn(turn = {}) {
  const question = redactText(turn.question || turn.user || turn.prompt || "");
  const answer = redactText(turn.answer || turn.assistant || turn.output || "");
  return {
    question: question.text,
    answer: answer.text,
    intent: String(turn.intent || ""),
    topic: String(turn.topic || turn.domain || ""),
    redactions: [...new Set([...question.redactions, ...answer.redactions])]
  };
}

function uniquePush(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

function collectPatternIds(turns, patterns) {
  const ids = [];
  for (const turn of turns) {
    const text = `${turn.question} ${turn.answer} ${turn.intent} ${turn.topic}`;
    for (const [id, re] of patterns) if (re.test(text)) uniquePush(ids, id);
  }
  return ids;
}

export function visibleUiTurnsFromSession(session) {
  return sourceTurns(session)
    .slice(-SESSION_MEMORY_WINDOWS.visibleUiExchangeTurns)
    .map(normalizeTurn);
}

export function internalRuntimeTurnsFromSession(session) {
  return sourceTurns(session)
    .slice(-SESSION_MEMORY_WINDOWS.internalRuntimeExchangeTurns)
    .map(normalizeTurn);
}

export function modelUsableTurnsFromSession(session) {
  return sourceTurns(session)
    .slice(-SESSION_MEMORY_WINDOWS.modelUsableSessionExchangeTurns)
    .map(normalizeTurn);
}

export function truncateInternalSession(session) {
  return {
    ...session,
    contextTurns: internalRuntimeTurnsFromSession(session)
  };
}

export function redactSensitiveTurnText(turn) {
  return normalizeTurn(turn);
}

export function extractSessionEntities(internalTurns) {
  return collectPatternIds(asArray(internalTurns), ENTITY_PATTERNS).slice(-12);
}

export function extractSessionWorks(internalTurns) {
  return collectPatternIds(asArray(internalTurns), WORK_PATTERNS).slice(-12);
}

export function extractSessionDomains(internalTurns) {
  return collectPatternIds(asArray(internalTurns), DOMAIN_PATTERNS).slice(-8);
}

export function extractSessionCorrections(internalTurns) {
  return asArray(internalTurns)
    .map((turn, index) => ({ turn_index: index, text: `${turn.question} ${turn.answer}`.trim() }))
    .filter((item) => CORRECTION_PATTERN.test(item.text))
    .map((item) => ({ turn_index: item.turn_index, correction: truncateText(item.text, 220) }))
    .slice(-8);
}

export function extractSessionBoundaries(internalTurns) {
  return asArray(internalTurns)
    .map((turn, index) => ({ turn_index: index, text: `${turn.question} ${turn.answer}`.trim() }))
    .filter((item) => BOUNDARY_PATTERN.test(item.text))
    .map((item) => ({ turn_index: item.turn_index, boundary: truncateText(item.text, 220) }))
    .slice(-8);
}

export function buildInternalSessionMemory(session) {
  let internal_turns = internalRuntimeTurnsFromSession(session);
  const memory = {
    visible_ui_exchange_turns: SESSION_MEMORY_WINDOWS.visibleUiExchangeTurns,
    internal_runtime_exchange_turns: SESSION_MEMORY_WINDOWS.internalRuntimeExchangeTurns,
    model_usable_session_context_exchange_turns: SESSION_MEMORY_WINDOWS.modelUsableSessionExchangeTurns,
    persistent_memory_requires_approval: SESSION_MEMORY_WINDOWS.persistentMemoryRequiresApproval,
    session_scoped: true,
    turn_count_window: internal_turns.length,
    internal_turns,
    model_usable_turns: modelUsableTurnsFromSession(session),
    entities: extractSessionEntities(internal_turns),
    works: extractSessionWorks(internal_turns),
    domains: extractSessionDomains(internal_turns),
    corrections: extractSessionCorrections(internal_turns),
    boundaries: extractSessionBoundaries(internal_turns),
    redaction_count: internal_turns.reduce((sum, turn) => sum + asArray(turn.redactions).length, 0)
  };

  while (byteLength(memory) > SESSION_MEMORY_WINDOWS.maxInternalMemoryBytes && internal_turns.length > 4) {
    internal_turns = internal_turns.slice(1);
    memory.internal_turns = internal_turns;
    memory.model_usable_turns = internal_turns;
    memory.turn_count_window = internal_turns.length;
  }
  return memory;
}

function trimCards(cards, limit) {
  return asArray(cards).slice(0, limit).map((card) => ({ ...card }));
}

export function buildModelRuntimePacket({
  query,
  session,
  compactState,
  cards,
  solvers,
  verifierRules
} = {}) {
  const packet = {
    query: truncateText(query || ""),
    visible_turns: visibleUiTurnsFromSession(session),
    internal_session_memory: buildInternalSessionMemory(session),
    compact_state: compactState || {},
    cards: trimCards(cards, 16),
    solvers: solvers || {},
    verifier_rules: verifierRules || {},
    answer_sla_ms: SESSION_MEMORY_WINDOWS.answerSlaMs
  };

  while (byteLength(packet) > SESSION_MEMORY_WINDOWS.maxRuntimePacketBytes && packet.cards.length > 0) {
    packet.cards.pop();
  }
  while (byteLength(packet) > SESSION_MEMORY_WINDOWS.maxRuntimePacketBytes && packet.internal_session_memory.internal_turns.length > 4) {
    packet.internal_session_memory.internal_turns.shift();
    packet.internal_session_memory.model_usable_turns = packet.internal_session_memory.internal_turns;
    packet.internal_session_memory.turn_count_window = packet.internal_session_memory.internal_turns.length;
  }
  return packet;
}
