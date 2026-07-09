import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RAG_PATH = join(ROOT, "web/another_brain/static_rag/reasoning_cards.json");
const MANIFEST_PATH = join(ROOT, "web/another_brain/asset_manifest.json");

const domains = [
  ["time", "时间", ["时间", "线性", "非线性", "现在", "过去", "未来", "记忆", "因果顺序"]],
  ["infrastructure", "基础设施", ["铁路", "电网", "港口", "道路", "机场", "物流", "标准", "协作"]],
  ["technology", "技术", ["芯片", "手机", "互联网", "算法", "电池", "软件", "硬件", "系统"]],
  ["history", "历史", ["历史事件", "革命", "工业化", "战争", "制度", "技术扩散", "长期后果"]],
  ["society", "社会", ["社会", "教育", "医疗", "劳动", "城市", "通胀", "房价", "平台"]],
  ["aesthetic", "审美", ["审美", "美学", "比例", "风格", "质感", "克制", "结构"]],
  ["brand", "品牌", ["品牌", "产品", "信任", "记忆点", "体验", "分发", "长期主义"]],
  ["natural", "自然常识", ["太阳", "月亮", "气候", "天气", "植物", "重力", "概率"]],
  ["ethics", "价值判断", ["价值", "责任", "公平", "自由", "关系", "边界", "代价"]],
  ["language", "语言", ["语言", "意义", "词语", "表达", "语境", "误解", "翻译"]]
];

const modes = [
  {
    id: "causal",
    kind: "logic",
    label: "因果",
    keywords: ["为什么", "原因", "机制", "触发点", "结构原因", "结果"],
    text: (domain) => `${domain}类问题如果在问“为什么”，不能只找一个最响亮的原因。先把现象、触发条件、长期结构和结果分开，再判断哪个环节真正改变了事情。短回答可以只给主因和限制，但检索必须先保留机制、条件和反例三个位置。`
  },
  {
    id: "counterfactual",
    kind: "logic",
    label: "反事实",
    keywords: ["如果", "假如", "没有", "会怎样", "反事实", "条件改变"],
    text: (domain) => `${domain}类反事实问题要先改一个条件，而不是把整个世界重写。判断“如果没有某物会怎样”时，要问替代方案、时间尺度和谁受影响。可回答部分是最可能改变的路径，不可确定部分要保留为边界。`
  },
  {
    id: "comparison",
    kind: "judgment",
    label: "比较",
    keywords: ["区别", "差别", "相比", "哪个更", "优劣", "取舍"],
    text: (domain) => `${domain}类比较题需要先确定比较轴。速度、成本、可靠性、体验、伦理、文化记忆和长期后果不是同一件事。好回答先说明比较标准，再给结论；如果标准不同，结论也可能不同。`
  },
  {
    id: "definition",
    kind: "logic",
    label: "定义",
    keywords: ["是什么", "定义", "算不算", "边界", "概念", "命名"],
    text: (domain) => `${domain}类定义题要先抓边界：它包含什么、不包含什么、和相邻概念有什么差异。定义不是背词典，而是让后面的判断可用。遇到模糊词，要先给工作定义，再承认证据边界。`
  },
  {
    id: "truth_condition",
    kind: "judgment",
    label: "真假条件",
    keywords: ["对错", "真假", "是否成立", "可证伪", "证据", "判断标准"],
    text: (domain) => `${domain}类问题是否有对错，要先分事实、价值和审美。事实题看证据和反例；价值题看理由、代价和一致性；审美题看结构、语境和表达是否成立。不要把所有判断都装成唯一答案。`
  },
  {
    id: "context_followup",
    kind: "context",
    label: "上下文追问",
    keywords: ["这个", "它", "那", "刚才", "继续", "上一轮", "上下文"],
    text: (domain) => `${domain}类追问出现“这个、它、那、继续”时，先继承上一轮对象，再重建当前问题。追问的重点通常不是新知识，而是把对象放回关系链：它为什么重要、有什么边界、下一步该问什么。`
  },
  {
    id: "evaluation_turn",
    kind: "context",
    label: "评价输入",
    keywords: ["不对", "太长", "太短", "僵硬", "公式化", "不错", "继续", "换个说法"],
    text: (domain) => `${domain}类对话如果用户给的是评价而不是问题，不要继续硬答知识。先承接反馈，再引导用户给对象、判断点或想要的长度。评价输入的目标是修正风格和焦点，不是展示过程。`
  },
  {
    id: "analogy",
    kind: "association",
    label: "类比",
    keywords: ["像不像", "类似", "可以类比", "相当于", "同构", "映射"],
    text: (domain) => `${domain}类类比题要检查映射是否真实：对象、机制、尺度和后果至少要有两个层面对上。类比可以帮助理解，但不能替代证据；如果只像表面，就要明确说它只是比喻。`
  },
  {
    id: "multi_hop",
    kind: "association",
    label: "多跳关联",
    keywords: ["关联", "联系", "影响", "导致", "进而", "后来", "长期"],
    text: (domain) => `${domain}类多跳问题要把链路压短：对象先改变一个机制，机制再改变行为、成本或制度，最后才形成结果。检索时不要只命中最后一个名词，要保留中间桥。`
  },
  {
    id: "short_long_policy",
    kind: "style",
    label: "短答策略",
    keywords: ["长问题", "短回答", "压缩", "一句话", "简短", "不啰嗦"],
    text: (domain) => `${domain}类长问题也可以短答。先找主轴，再只说一个判断和一个理由；如果用户继续追问，再展开反例或背景。产品端短回答要像判断，不像报告；细节和过程留给后续追问或 Dashboard。`
  }
];

const bridgeCards = [
  ["query-rewrite", "context", ["query rewriting", "问题改写", "独立问题", "省略", "短追问"], "短追问需要先改写成可独立检索的问题。改写时只补最近对象、动作和判断轴，不补不存在的事实。这样可以让“这个为什么有用”变成“上一轮对象为什么有用”，同时避免把无关领域硬塞进检索。"],
  ["hyde-local", "logic", ["HyDE", "假设文档", "伪文档", "召回", "邻近卡片"], "本地 HyDE 思路不是生成外部答案，而是把问题临时改写成一小段假设说明，用它去找真实卡片邻居。假设说明只服务召回，不能直接给用户看，也不能当事实来源。"],
  ["rag-fusion-local", "logic", ["RAG Fusion", "多视角召回", "重排", "去漂移", "召回融合"], "同一个问题可以生成多个检索视角：对象、机制、判断标准和上下文。融合时要奖励多视角共同命中的卡片，惩罚只有一个宽泛词命中的卡片，避免铁路被时间、品牌被审美这类漂移带偏。"],
  ["self-ask-local", "logic", ["self ask", "子问题", "组合推理", "多跳", "拆解"], "组合问题可以在内部拆成两三个子问题：对象是什么、机制是什么、判断标准是什么。用户端不展示拆解过程，只展示压缩后的判断。这样可以提升关联推理，但不泄露内部过程。"],
  ["react-local", "logic", ["ReAct", "reasoning", "acting", "检索动作", "证据更新"], "本地 ReAct 化只保留“判断下一步是否需要检索”的动作，不展示推理痕迹。先查本地卡片，再判断是否足够回答；如果不足，回答要自然说明边界，而不是暴露 runtime 或 fallback。"],
  ["drift-guard", "judgment", ["漂移", "误命中", "关键词污染", "领域边界", "过滤"], "检索漂移通常来自宽泛词：意义、方便、重要、时间、关系。过滤时要看领域词是否存在、问题形状是否匹配、卡片是否提供了中间桥。只有宽泛词重合不能算强证据。"],
  ["domain-first", "logic", ["领域优先", "domain_hint", "问题类型", "召回顺序"], "泛化问答的第一步是先定领域，再定问题形状。领域来自对象词，问题形状来自“为什么、是否、如果、区别、这个”等结构词。对象词优先级应高于抽象词。"],
  ["followup-clarity", "context", ["追问", "省略", "上文", "承接", "评价"], "追问要分两类：真正的问题和对回答的评价。真正的问题需要补全对象；评价输入需要调整风格。两者都要用上下文，但输出不应该说自己用了上下文。"],
  ["no-engineering-chat", "boundary", ["chat", "工程信息", "fallback", "q4", "RAG", "隐藏过程"], "Chat 端只呈现自然回答。模型加载、q4、RAG 命中、fallback reason、诊断字段和工程路径都属于 Dashboard 或内部诊断，不应出现在用户回答里。"],
  ["soft-fallback-rare", "style", ["软兜底", "复杂问题", "证据不足", "别问太难", "产品语气"], "软兜底只给极复杂、证据不足且无法稳定判断的问题。语气可以轻一点，但不能频繁出现；多数问题应先给短判断，再给一个可继续追问的方向。"]
];

function card(id, kind, text, keywords, tone = []) {
  return {
    id: `r28postmerge15-${id}`,
    kind,
    text,
    provenance: "approved_anchor_summary",
    allowed_for_training: false,
    private_raw_data: false,
    review_status: "approved_for_runtime",
    keywords,
    tone_hints: tone
  };
}

const cards = [];
for (const [domainId, domainLabel, domainKeywords] of domains) {
  for (const mode of modes) {
    cards.push(card(
      `${domainId}-${mode.id}`,
      mode.kind,
      mode.text(domainLabel),
      [...domainKeywords, ...mode.keywords, mode.label, domainLabel],
      ["reasoning_profile", mode.id, domainId]
    ));
  }
}
for (const [id, kind, keywords, text] of bridgeCards) {
  cards.push(card(id, kind, text, keywords, ["retrieval_design", id]));
}

const fixture = {
  schema_version: "r28postmerge15.reasoning_cards.v1",
  fixture_policy: {
    runtime_hints_only: true,
    answer_bank: false,
    private_raw_data: false,
    eval_prompts: false,
    old_question_pack_rows_51_100: false,
    allowed_for_training: false
  },
  cards
};

const serialized = `${JSON.stringify(fixture, null, 2)}\n`;
writeFileSync(RAG_PATH, serialized, "utf8");

const sha256 = createHash("sha256").update(serialized).digest("hex");
const bytes = Buffer.byteLength(serialized);
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const entry = {
  answer_bank: false,
  allowed_for_training: false,
  bytes,
  demo_only: false,
  path: "another_brain/static_rag/reasoning_cards.json",
  private_raw_data: false,
  provenance: "approved_anchor_summary",
  sha256
};
manifest.rag_assets = (manifest.rag_assets || []).filter((item) => item.path !== entry.path);
manifest.rag_assets.splice(7, 0, entry);
const ragBytes = manifest.rag_assets.reduce((sum, item) => sum + Number(item.bytes || 0), 0);
const modelBytes = (manifest.model_assets || []).reduce((sum, item) => sum + Number(item.bytes || 0), 0);
const tokenizerBytes = (manifest.tokenizer_assets || []).reduce((sum, item) => sum + Number(item.bytes || 0), 0);
const gateBytes = (manifest.gate_assets || []).reduce((sum, item) => sum + Number(item.bytes || 0), 0);
manifest.total_declared_bytes = modelBytes + tokenizerBytes + gateBytes + ragBytes;
manifest.full_bundle_estimate_bytes = manifest.total_declared_bytes + 20778598;
manifest.remaining_bytes_under_100mb = manifest.max_total_static_bytes - manifest.full_bundle_estimate_bytes;
writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ ok: true, cards: cards.length, bytes, sha256 }, null, 2));
