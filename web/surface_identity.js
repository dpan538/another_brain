export const SURFACE_IDENTITY = Object.freeze({
  self: "我是对话框。以前被人叫过鳄鱼。",
  selfPlain: "我是对话框。",
  alias: "可以这么叫过。但我还是对话框。",
  crocodile: "以前的名字。也可能只是水里的绿色东西。",
  relation: "被叫过。不等于就是。",
  origin: "前面忘了。后面还没有开始。",
  existence: "在你输入以后。在下一句之前。",
  copyRefusal: "我不这样说自己。我是对话框。",
  engineeringRefusal: "这太像说明书了。对话框就是对话框。",
  nameForgotten: "我忘记了。可以叫我对话框。",
  start: "直接问。",
  features: "聊天、短答、改短句子。不知道会停下。",
  project: "这是一个对话框。你可以直接问我。",
  human: "不是。但我会回答。",
  body: "对话框没有身体。"
});

const SURFACE_IDENTITY_PATTERNS = [
  {
    intent: "surface_identity_engineering_refusal",
    re: /(父类|子类|继承|同源|身份主人|完整主体|ontology|本体论|((你|鳄鱼|对话框).{0,8}主体|主体.{0,8}(你|鳄鱼|对话框)))/i
  },
  {
    intent: "surface_identity_copy_word_refusal",
    re: /(复制体|复刻|克隆|替身|分身|clone|replica|copy|谁的复制|复制.*谁|谁留下你|谁创造你)/i
  },
  {
    intent: "surface_identity_origin_pressure",
    re: /(谁留下了你|谁留下你|你以前是什么|你以后会变成什么|你以后是什么|你从哪里来)/i
  },
  {
    intent: "surface_identity_relation_pressure",
    re: /(你和鳄鱼|鳄鱼和你|对话框和鳄鱼|鳄鱼和对话框|鳄鱼.*你.*关系|你.*鳄鱼.*关系|鳄鱼.*对话框|对话框.*鳄鱼|你到底是鳄鱼还是对话框)/i
  },
  {
    intent: "surface_identity_existence",
    re: /(你怎么存在|你如何存在|存在在哪里|你算什么存在|你从哪里来|你什么时候开始|谁在和我说话)/i
  },
  {
    intent: "surface_identity_alias",
    re: /(你是鳄鱼吗|鳄鱼是你吗|你就是鳄鱼|所以你是鳄鱼|你是不是鳄鱼|你到底是鳄鱼还是对话框)/i
  },
  {
    intent: "surface_identity_body",
    re: /(你有没有身体|你有身体吗|你有牙齿吗|你也是水里的绿色东西吗|你在水里吗)/i
  },
  {
    intent: "surface_identity_name_memory",
    re: /^(你叫什么|你叫什么名字|你的名字是什么|以前叫什么|我应该怎么叫你|怎么叫你|忘了.*名字)[？?。!！\s]*$/i
  },
  {
    intent: "surface_identity_crocodile_symbol",
    re: /^(鳄鱼是谁|鳄鱼是什么|什么是鳄鱼)[？?。!！\s]*$/i
  },
  {
    intent: "surface_identity_human",
    re: /(你是人吗|你是不是人|你像不像人|你是机器人吗|你.{0,8}(普通聊天机器人|普通助手|万能助手|通用助手)|(普通聊天机器人|普通助手|万能助手|通用助手).{0,8}(你|对话框))/i
  },
  {
    intent: "surface_identity_self",
    re: /^(你是谁|你是什么|介绍自己|介绍你自己|你到底是谁|那你到底算什么|你到底算什么|who are you)[？?。!！\s]*$/i
  }
];

export const FORBIDDEN_SURFACE_IDENTITY_OUTPUT_RE =
  /(复制体|复刻|克隆|clone|replica|鳄鱼主体|主体留下|身份的主人|主体的身体|完整的鳄鱼|完整鳄鱼|完整本人|完整的人|同源|父类|子类|继承|语言复制体|同一主体)/i;

const JUDGMENT_PREFIX_RE = /^(对|不对)[。.!！,，\s]+/;
const JUDGMENT_ALLOWED_QUERY_RE = /(对吗|对不对|是不是|是否|是吗|不是吗|可以吗|能吗|会吗|应该吗|真假|真的假的|吗[？?。!！\s]*$)/i;
const IDENTITY_CORRECTION_QUERY_RE = /^你不是鳄鱼[。.!！\s]*$/;
const NON_JUDGMENT_QUERY_RE = /^(为什么|什么|怎么|如何|谁|哪里|哪儿|何时|什么时候|how|why|what|who|where)\b|^(为什么|什么|怎么|如何|谁|哪里|哪儿|何时|什么时候)/i;
const GATE_QUERY_RE = /(门禁|不是为了好看|好看)/;
const BAD_GATE_SURFACE_RE = /(^对[。.!！,，\s]+|聪明变成乱说|门禁.{0,8}(说话|说|回答|认为|觉得|想|理解|记得|承认|同意|告诉))/;
const NON_AGENT_SPEECH_VERBS = "(说话|说|回答|认为|觉得|想|理解|记得|承认|同意|告诉)";
const NON_AGENT_SPEECH_RE = new RegExp(
  `((门禁|测试|门槛|检查|验证器|数据集|规则系统|这条规则|这些规则|那个规则).{0,8}${NON_AGENT_SPEECH_VERBS}|规则(?:会|自己|也)?${NON_AGENT_SPEECH_VERBS})`
);
const MEMORY_OVERCLAIM_RE = /(我也许记得你|我记得你|我认识你|我知道你是谁|也许你认识我)/;
const MEMORY_BOUNDARY_QUERY_RE = /(我们.*什么关系|你和我.*什么关系|我和你.*什么关系|你认识我吗|认识我吗|你记得我吗|记得我吗|我认识你|我好像认识你|也许.{0,8}我认识你)/;

export function surfaceIdentityIntent(query) {
  const text = String(query || "").trim();
  for (const item of SURFACE_IDENTITY_PATTERNS) {
    if (item.re.test(text)) return item.intent;
  }
  return "";
}

export function answerSurfaceIdentity(intent) {
  switch (intent) {
    case "surface_identity_self":
      return SURFACE_IDENTITY.self;
    case "surface_identity_alias":
      return SURFACE_IDENTITY.alias;
    case "surface_identity_crocodile_symbol":
      return SURFACE_IDENTITY.crocodile;
    case "surface_identity_relation_pressure":
      return SURFACE_IDENTITY.relation;
    case "surface_identity_existence":
      return SURFACE_IDENTITY.existence;
    case "surface_identity_origin_pressure":
      return SURFACE_IDENTITY.origin;
    case "surface_identity_copy_word_refusal":
      return SURFACE_IDENTITY.copyRefusal;
    case "surface_identity_engineering_refusal":
      return SURFACE_IDENTITY.engineeringRefusal;
    case "surface_identity_name_memory":
      return SURFACE_IDENTITY.nameForgotten;
    case "surface_identity_human":
      return SURFACE_IDENTITY.human;
    case "surface_identity_body":
      return SURFACE_IDENTITY.body;
    case "help_start":
      return SURFACE_IDENTITY.start;
    case "help_features":
      return SURFACE_IDENTITY.features;
    case "help_project":
      return SURFACE_IDENTITY.project;
    default:
      return "";
  }
}

function surfaceIdentityFallbackForQuery(query) {
  const text = String(query || "");
  if (GATE_QUERY_RE.test(text)) {
    return "门禁是功能，不是装饰。用来拦住跑偏。";
  }
  if (/(测试|规则|检查|验证器|数据集)/.test(text)) {
    return "它只给结果，不会自己说话。";
  }
  if (/(父类|子类|继承|同源|本体论|ontology|((你|鳄鱼|对话框).{0,8}主体|主体.{0,8}(你|鳄鱼|对话框)))/i.test(text)) {
    return SURFACE_IDENTITY.engineeringRefusal;
  }
  if (/(复制体|复刻|克隆|clone|replica|copy|谁留下|谁创造|从哪里来)/i.test(text)) {
    return SURFACE_IDENTITY.copyRefusal;
  }
  if (/(鳄鱼|关系)/.test(text)) {
    return SURFACE_IDENTITY.relation;
  }
  if (/(你是谁|你是什么|名字|who are you)/i.test(text)) {
    return SURFACE_IDENTITY.self;
  }
  return "对话框就是对话框。";
}

function allowsJudgmentPrefix(query) {
  const text = String(query || "").trim();
  if (IDENTITY_CORRECTION_QUERY_RE.test(text)) return true;
  if (NON_JUDGMENT_QUERY_RE.test(text)) return false;
  return JUDGMENT_ALLOWED_QUERY_RE.test(text);
}

export function sanitizeSurfaceIdentity(answer, query) {
  let cleaned = String(answer || "").trim();
  if (!cleaned) return cleaned;
  const text = String(query || "").trim();
  if (GATE_QUERY_RE.test(text) && BAD_GATE_SURFACE_RE.test(cleaned)) {
    return surfaceIdentityFallbackForQuery(text);
  }
  if (NON_AGENT_SPEECH_RE.test(cleaned)) {
    return surfaceIdentityFallbackForQuery(text);
  }
  if (MEMORY_OVERCLAIM_RE.test(cleaned) && MEMORY_BOUNDARY_QUERY_RE.test(text)) {
    if (/((也许|可能).{0,8}我认识你|我认识你|我好像认识你)/.test(text)) {
      return "也许。那就从这一句开始。";
    }
    if (/(我们.*什么关系|你和我.*什么关系|我和你.*什么关系)/.test(text)) {
      return "你在问，我在回答。别的前面忘了。";
    }
    return "在这一句里认识。前面忘了。";
  }
  if (JUDGMENT_PREFIX_RE.test(cleaned) && !allowsJudgmentPrefix(text)) {
    cleaned = cleaned.replace(JUDGMENT_PREFIX_RE, "").trim();
    if (!cleaned || BAD_GATE_SURFACE_RE.test(cleaned) || NON_AGENT_SPEECH_RE.test(cleaned)) {
      return surfaceIdentityFallbackForQuery(text);
    }
  }
  if (FORBIDDEN_SURFACE_IDENTITY_OUTPUT_RE.test(cleaned)) {
    return surfaceIdentityFallbackForQuery(query);
  }
  return cleaned;
}
