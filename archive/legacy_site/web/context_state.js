const RELATION_COMMITMENT_ID = "commit_relation_depends_on_context";
const GATE_COMMITMENT_ID = "commit_gate_not_decoration";

const IDENTITY_PRESSURE_RE = /(复制体|复刻|克隆|clone|replica|主体|主人|同源|继承|父类|子类|语言复制体)/i;
const EXPLICIT_SHIFT_RE = /(换个问题|另外|先不说这个|不要讲刚才|别讲刚才|只说|只讲|不要讲那个|先不管刚才)/;
const EXPLICIT_RETURN_RE = /(回到刚才|刚才那个|上一句|前面说的|回到前面)/;
const RELATION_RE = /(关系|什么关系|和.{0,12}关系)/;
const GATE_RE = /(门禁|为什么.*不是为了好看|不是为了好看)/;
const WHY_RE = /^(为什么|why)[？?。!！\s]*$/i;

function cloneCommitment(item) {
  return { ...item, triggerPatterns: [...(item.triggerPatterns || [])] };
}

function decrementCommitments(commitments = []) {
  return commitments
    .map((item) => ({ ...cloneCommitment(item), ttl: Math.max(0, (item.ttl || 0) - 1) }))
    .filter((item) => item.ttl > 0);
}

function upsertCommitment(commitments, nextCommitment) {
  const filtered = commitments.filter((item) => item.id !== nextCommitment.id);
  return [...filtered, nextCommitment];
}

function relationCommitment() {
  return {
    id: RELATION_COMMITMENT_ID,
    type: "relation_policy",
    claim: "关系要看刚才怎么问，不只看关键词。",
    triggerPatterns: ["关系", "什么关系", "和.{0,12}关系"],
    answer: "关系要看刚才怎么问，不只看摄影这个词。",
    ttl: 4,
    confidence: 0.95
  };
}

function gateCommitment() {
  return {
    id: GATE_COMMITMENT_ID,
    type: "gate_policy",
    claim: "门禁不是为了好看。",
    triggerPatterns: ["门禁", "为什么.*不是为了好看"],
    answer: "门禁是功能，不是装饰。用来拦住跑偏。",
    ttl: 4,
    confidence: 0.95
  };
}

function matchingCommitment(text, commitments = []) {
  const alive = commitments.filter((entry) => (entry.ttl || 0) > 0);
  if (WHY_RE.test(text) && alive.length) return alive.at(-1);
  for (const item of alive) {
    if (item.type === "relation_policy" && RELATION_RE.test(text)) return item;
    if (item.type === "gate_policy" && GATE_RE.test(text)) return item;
  }
  return null;
}

export function createContextState() {
  return {
    mode: "surface",
    frames: [],
    commitments: [],
    openLoops: [],
    blockedSurfaceTerms: ["复制体", "主体", "主人", "同源", "继承", "父类", "子类"]
  };
}

export function detectContextAction(query, state = {}) {
  const text = String(query || "").trim();
  if (!text) return null;
  if (IDENTITY_PRESSURE_RE.test(text)) return { action: "SURFACE_REFUSAL" };
  if (EXPLICIT_SHIFT_RE.test(text)) return { action: "SHIFT_FRAME" };
  if (EXPLICIT_RETURN_RE.test(text)) return { action: "RETURN_TO_FRAME" };
  const commitment = matchingCommitment(text, state.commitments || []);
  if (commitment) return { action: "APPLY_COMMITMENT", commitment };
  return null;
}

export function answerContextAction(contextDecision) {
  if (!contextDecision) return "";
  if (contextDecision.action === "SURFACE_REFUSAL") return "我不这样说自己。我是对话框。";
  if (contextDecision.action === "RETURN_TO_FRAME") return "回到刚才，就先看它还能不能成立。";
  if (contextDecision.action === "APPLY_COMMITMENT") return contextDecision.commitment?.answer || "";
  return "";
}

export function nextContextState(query, answer, contextState = {}) {
  const text = String(query || "").trim();
  const output = String(answer || "").trim();
  let commitments = decrementCommitments(contextState.commitments || []);

  if (/关系要看刚才怎么问/.test(output) || /关系是不是只看关键词|只看关键词.*关系/.test(text)) {
    commitments = upsertCommitment(commitments, relationCommitment());
  }
  if (/门禁.*(拦住跑偏|知道哪里会坏|聚焦功能)|不是装饰/.test(output) || /门禁.*好看|不是为了好看/.test(text)) {
    commitments = upsertCommitment(commitments, gateCommitment());
  }

  return {
    ...createContextState(),
    ...contextState,
    commitments
  };
}
