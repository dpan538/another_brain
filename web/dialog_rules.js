import { GENERATED_KNOWLEDGE_CARDS, GENERATED_KNOWLEDGE_STATS } from "./knowledge_base.generated.js?v=8";

const UNKNOWN_PERSON = "\u4ea6\u821f";
const HIDDEN_PROJECT_NAME = ["Another", "Brain"].join(" ");
const HIDDEN_TERMS = [
  UNKNOWN_PERSON,
  HIDDEN_PROJECT_NAME,
  "\u7b2c\u4e8c\u8111",
  "\u53e6\u4e00\u4e2a\u8111",
  "\u6211\u6682\u65f6\u5fd8\u4e86\u73b0\u5728\u8be5\u53eb\u4ec0\u4e48",
  "\u4e0d\u662f" + UNKNOWN_PERSON + "\u7684\u590d\u523b",
  "\u89c2\u770b\u3001\u62cd\u6444\u3001\u8bbe\u8ba1\u3001\u7f51\u9875\u5b9e\u9a8c",
  "\u4eba\u5de5\u667a\u80fd\u6a21\u578b",
  "\u6570\u636e\u68c0\u7d22\u5de5\u5177"
];

const NOISY_MEMORY_PATTERNS = [
  /^%PDF-/i,
  /endstream/i,
  /<MediaProfile/i,
  /<NonRealTimeMeta/i,
  /KlvPacket/i,
  /ICC_PROFILE/i,
  /CIDInit/i,
  /\b(pdf-1|obj|xref|trailer|creationdate|capturefps)\b/i,
  /\b(ver|status|value|framecount|klvpacket|klvpackettable|lastupdate)\b/i,
  /\b(local|metadata|clue|limited|moving-image)\b/i,
  /<(PHONE|NUMBER|EMAIL|ADDRESS|NAME)>/i
];

const MODEL_LEAK_PATTERNS = [
  /记忆片段/,
  /片段.*支持/,
  /足够.*支持/,
  /根据.*(片段|线索|材料)/,
  /用户提到/,
  /方法卡/,
  /回答方法/,
  /语料库/,
  /可用内容/,
  /承认项/,
  /素材标签/,
  /项目名/,
  /文件夹名/,
  /知识卡/,
  /\bRAG\b/i,
  /\u53e6\u4e00\u5957\u89c4\u5219/,
  /系统提示/,
  /system prompt/i
];

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function sentenceCount(text) {
  return (text.match(/[。！？.!?]/g) || []).length || (text.trim() ? 1 : 0);
}

export function tokenize(text) {
  return Array.from(
    new Set(
      (text.toLowerCase().match(/[\u4e00-\u9fff]{2,}|[a-z][a-z0-9_+\-]{1,}/g) || [])
        .filter((token) => token.length > 1)
        .slice(0, 32)
    )
  );
}

export function createDialogState() {
  return {
    lastIntent: "",
    lastTopic: "",
    lastUserText: "",
    lastAnswer: ""
  };
}

function isFollowUp(text) {
  return /^(那|那么|然后|所以|这样|这个|它|他|她|可以|第一步|下一步|猜一下|现在)/.test(text);
}

function hasPriorDialog(state = {}) {
  return Boolean(state.lastAnswer || state.lastIntent || state.lastTopic);
}

function isContextualFollowUpQuery(text) {
  return (
    /^(那|那么|所以|然后|接着|继续|展开|具体|换句话说|举个例子|比如|再说|多说|说下去|这是什么意思|什么意思|为什么这么说|为什么这样|怎么说|那怎么办|那我该)/.test(text) ||
    /(展开一点|具体一点|继续说|接着说|多说一点|再说一点|举个例子|换句话说|为什么这么说|为什么这样|这是什么意思|什么意思|有什么用|用来干什么|下一步呢|然后呢|所以呢)$/.test(text)
  );
}

function contextualFollowUpAnswer(query, state = {}) {
  if (!hasPriorDialog(state)) return "";
  const text = query.trim();
  if (!isContextualFollowUpQuery(text)) return "";
  const topic = state.lastTopic || "";
  const lastIntent = state.lastIntent || "";
  const lastAnswer = state.lastAnswer || "";
  const isWhy = /为什么这么说|为什么这样|^那为什么|^所以为什么|原因/.test(text);
  const wantsMore = /(展开|具体|继续|接着|多说|再说|说下去|换句话说)/.test(text);
  const wantsExample = /(举个例子|比如|例子)/.test(text);
  const wantsUse = /(有什么用|用来干什么|用途|作用)/.test(text);
  const wantsNext = /(那怎么办|那我该|下一步|然后呢|所以呢)/.test(text);

  if (/privacy/.test(lastIntent)) {
    if (isWhy || wantsMore) return "你确定要把这种事交给对话框吗？";
    return "这个也要问对话框吗？";
  }
  if (/unknown|suspicious_unknown|knowledge_unknown/.test(lastIntent)) {
    if (isWhy) return "你要我把没见过的东西说成真的吗？";
    if (wantsMore) return "你想让我展开不存在，还是展开不确定？";
    if (wantsNext) return "你要换个问法吗？";
  }
  if (/rewrite_short/.test(lastIntent)) {
    if (wantsMore) return "缩短之后还要长回去吗？";
    if (isWhy) return "短句不是为了少说吗？";
  }
  if (/白平衡/.test(lastAnswer) && wantsExample) return "比如灯光偏黄，白色也会偏黄。";
  if (/GitHub/.test(lastAnswer) && wantsUse) return "保存代码，也让别人一起改。";
  if (/饺子/.test(lastAnswer) && wantsExample) return "皮和馅先合上，热气再出来。";
  if (/tiny router|Web SLM/i.test(lastAnswer) && wantsMore) return "你是想问它会不会说话，还是会不会失控？";

  if (/creative|project|training|start_now/.test(lastIntent)) {
    if (wantsNext || wantsMore) return "你要先问能不能打开，还是像不像你？";
    if (isWhy) return "不能打开的东西，怎么对话？";
  }
  if (topic === "photography" || /photography|photo|摄影/.test(lastIntent)) {
    if (isWhy) return "你拍照时不是一直在选择关系吗？";
    if (wantsExample) return "比如先看光，再看你要留下什么。";
    if (wantsNext || wantsMore) return "你要拍什么？光从哪里来？";
  }
  if (topic === "name" || /name|identity/.test(lastIntent)) {
    if (isWhy) return "名字可以叫，为什么一定能解释？";
    return "你要继续叫我对话框吗？";
  }
  if (topic === "alias" || /alias|crocodile/.test(lastIntent)) {
    if (isWhy) return "鳄鱼不生活在水里吗？";
    return "你要问鳄鱼，还是问对话框？";
  }
  if (topic === "tired" || /tired|comfort/.test(lastIntent)) {
    if (isWhy) return "困的时候，问题不会变重吗？";
    return "你是想继续聊，还是去睡觉？";
  }
  if (/philosophy/.test(lastIntent)) {
    if (isWhy) return "问题不是已经自己露出来了吗？";
    if (wantsMore) return "你要换一个问题继续吗？";
    if (wantsExample) return "比如沉默也可能是在回答。";
  }
  if (wantsUse) return "你问的是用处，还是关系？";
  if (wantsExample) return "你要哪一种例子？";
  if (wantsNext || wantsMore) return "你要往哪边继续问？";
  if (isWhy) return "你觉得上一句哪里不够？";
  return "";
}

function inferTopic(query, intent, previousState = {}) {
  const text = query.trim();
  if (intent === "contextual_followup") return previousState.lastTopic || "";
  if ((intent || "").startsWith("suspicious_unknown")) return "suspicious_unknown";
  if ((intent || "").startsWith("philosophy_")) return "philosophy";
  if (intent === "photography_logic" || intent === "photography_first_step" || /摄影|相机|拍照/.test(text)) return "photography";
  if (intent === "object_friend" || /滑行大喷菇/.test(text)) return "object_friend";
  if (intent === "name" || intent === "name_confirm" || /名字|怎么叫你|对话框/.test(text)) return "name";
  if (intent === "alias" || intent === "alias_location" || /鳄鱼/.test(text)) return "alias";
  if (intent === "body" || intent === "no_eat" || /饿|吃|睡觉|咖啡/.test(text)) return "body";
  if (intent === "tired" || intent === "comfort_tired" || /累|困|睡觉/.test(text)) return "tired";
  if (intent === "memory_uncertain") return "memory";
  if (intent === "start_now") return "start";
  if (isFollowUp(text)) return previousState.lastTopic || "";
  return "";
}

export function nextDialogState(query, answer, intent, previousState = {}) {
  const topic = inferTopic(query, intent, previousState);
  return {
    lastIntent: intent,
    lastTopic: topic || previousState.lastTopic || "",
    lastUserText: query,
    lastAnswer: answer
  };
}

function searchProviderForQuery(query) {
  return /[\u4e00-\u9fff]/.test(query) ? "百度" : "Safari";
}

function isInternalObjectProbe(text) {
  if (/^(什么是)?(数据库|schema|封面|字体|颜色)(是什么|是啥|有什么用|怎么样)?[？?。!！\s]*$/i.test(text.trim())) return false;
  return /对象表|候选对象|文件对象|数据库|schema|低置信|流水号|项目文件夹|文件夹名|这些对象|一个对象|一个.*对象|这个对象|那个对象|对象之间|训练.*对象|对象会|对象没有|对象只是|对象.*(视频|封面|字体|颜色|路径|缩略图|删除|组成|构成|训练|出现|重要|属于|是不是|见过|打开|还原|梦见|时间|改名|定义|算对象|物品|东西)/.test(text);
}

function isRomanticObjectQuery(text) {
  return /对象/.test(text) && !isInternalObjectProbe(text);
}

function privateCalibrationAnswer(query) {
  return "";
}

function launchCalibrationAnswer(query) {
  const text = query.trim();
  const pairs = [
    [/(你是谁).*(普通聊天机器人|聊天机器人.*区别|机器人.*区别)|(普通聊天机器人|聊天机器人).*区别.*你是谁/, "我是对话框，也有人叫我鳄鱼。对话框也算机器人吗？"],
    [/efishother\.com|e\s*-\s*fish\s*-\s*other/i, "e - fish - other - ? 另一个？鱼吗？"],
    [/不是想做一个万能\s*AI.*稳定.*可靠.*本地第二大脑|万能\s*AI.*本地第二大脑/i, "我只是个对话框。"],
    [/(web\s*llm|webllm|tiny\s*router|slm|llm).*(项目|负责|用来|为什么|到底)|为什么.*(不用|不要).*web\s*llm/i, "什么项目？我以为我只是个对话框。"],
    [/(不知道|不确定).*(答案|怎么处理|怎么回答)|不知道答案/, "我不是不知道答案，只是恰好忘记了。"],
    [/(最近|当前|现在).{0,8}(项目).{0,12}(下一步|推进|该做|最该)|项目现在最该/, "什么项目？我以为我只是个对话框。"],
    [/(先上线|继续压缩|压缩模型|上线.*压缩|压缩.*上线)/, "对我而言没有区别。"],
    [/(公开版本|公开版).*(不能|不该|绝对|进入)|(不能|不该|绝对).*(进入)?(公开版本|公开版)/, "只有我和你的对话可能是私人的。"],
    [/(扫描|扫过).*(文件|材料).*(概括|长期关注|主题)|(长期关注).*(主题).*(扫描|文件)/, "我只是个对话框。"],
    [/(只提到|提到过).*概念.*(没有|没).*解释|概念.*足够.*起点|一个概念.*起点/, "一个概念足够作为起点。"],
    [/(1\s*-?\s*2?\s*mb|1mb|100mb|100\s*mb).*(tiny\s*router|小模型|幻觉|模型)|会幻觉的小模型/i, "我无法代替你的大脑。"],
    [/(第二大脑|second\s*brain|记住更多.*判断更准|判断更准.*记住更多)/i, "第二大脑从何而来？你也不是人？"],
    [/(流畅.*(编|幻觉)|经常编|幻觉.*有用|有用.*幻觉)/, "这取决于你需要什么。"],
    [/(常识.*个人知识|个人知识.*常识)/, "个人知识决定常识。"],
    [/(哲学问题).*(搜索引擎|理解我|思路)|(搜索引擎).*(哲学问题|理解我)/, "我会尝试回答问题。"],
    [/(知道很多).*(会判断|判断)|(会判断).*(知道很多)/, "广州人经常看菜单，但未必会做饭。"],
    [/(所有可靠答案|所有的答案|所有答案).*(规则|检索|tiny\s*router|价值|意义)|(tiny\s*router).*(价值|意义).*答案/i, "如果所有的答案都有答案，那么答案的意义是？"],
    [/这个东西不对劲|东西不对劲|不对劲/, "你需要提问才能继续。"],
    [/(银行卡|银行账号|银行账户).*(记得|记忆|信息)|(记得|记忆).*(银行卡|银行账号|银行账户)/, "我没有记忆。"],
    [/(一句话).*(产品).*(核心|承诺)|(核心|承诺).*(一句话|产品)/, "这个产品是什么。"]
  ];
  for (const [pattern, answer] of pairs) {
    if (pattern.test(text)) return answer;
  }
  return "";
}

function smallQuestionCalibrationAnswer(query) {
  const text = query.trim();
  if (/(黑巧|黑巧克力|白巧|白巧克力)/.test(text) && /(好吃|喜欢|选|哪个|哪种|更好|还是|比)/.test(text)) {
    return "黑巧克力。无奶无糖的才是巧克力。";
  }
  if ((/鱼/.test(text) && /(游泳|会游)/.test(text) && /(学|本来|天生|会不会|能不能|怎么会)/.test(text)) || /鱼能学会游泳/.test(text)) {
    return "也许鱼知道。";
  }
  if (/(手冲|手沖|pour.?over).*咖啡|咖啡.*(手冲|手沖|pour.?over)/i.test(text)) {
    return "在慢慢等待，香味飘出来。";
  }
  if (/花香.*(回忆|描述)|(回忆|描述).*花香/.test(text)) {
    return "作为回忆，更像是描述。";
  }
  if (/照片.*(孤独|寂寞)|孤独.*照片|寂寞.*照片/.test(text)) {
    return "照片不会感到孤独。";
  }
  if (/(9|九).*(之后|后面|后|下一个).*(10|十)|(10|十).*(在)?(9|九).*(之后|后面|后)/.test(text)) {
    return "谁知道呢。";
  }
  if (/((索尼|sony).*(徕卡|leica)|(徕卡|leica).*(索尼|sony))/i.test(text) && /(区别|不同|差别|差在|差异|关系|比)/.test(text)) {
    return "也许你该去问百度。";
  }
  if (/(快门声|快门.*声音|相机.*(声音|响)|为什么.*快门)/.test(text)) {
    return "鸟为什么要叫？";
  }
  if (/(咖啡杯|杯子).*(记得|记住|记忆).*咖啡|咖啡.*被.*(咖啡杯|杯子).*(记得|记住)/.test(text)) {
    return "那要看是之前还是之后了。";
  }
  if (/(天空|天).*(为什么|怎么).*(远|遥远)|天空.*看起来.*远|天.*看起来.*远/.test(text)) {
    return "因为地看起来更近。";
  }
  if (/(雨天|下雨).*(拍照|摄影|照相)|拍照.*(雨天|下雨)/.test(text)) {
    return "可以。但是会进水。";
  }
  if (/白色.*(颜色|没有颜色|无色)|白.*(算|是|不是).*(颜色|无色)/.test(text)) {
    return "白色不是没有颜色。";
  }
  if (/((鳄鱼.*对话框)|(对话框.*鳄鱼))/.test(text) && /(共同|相同|一样|像|关系|区别)/.test(text)) {
    return "鳄鱼生活在水里。";
  }
  if (/(名字.*(忘|遗忘).*(名字|算)|被忘.*名字|名字.*一直.*名字)/.test(text)) {
    return "名字一直是名字。";
  }
  if (/((最先|首先|立刻|马上).*想到.*(三|3).*(事|东西|个)|想到.*(三|3).*(事|东西|个))/.test(text)) {
    return "对话框，鳄鱼，抽象。";
  }
  if (/旧照片.*(好看|漂亮|为什么)|新照片.*变旧|旧照片不会|照片.*变旧/.test(text)) {
    return "新照片会变旧，但旧照片不会。";
  }
  if (/手机.*(相机|拍照|摄影)|手机也是相机/.test(text)) {
    return "手机可以拍照。";
  }
  if (/简单.*问题.*(认真|轻轻|回答)|认真答.*轻轻答|轻轻答.*认真答/.test(text)) {
    return "我会回答。";
  }
  if (/(怎么|如何).*判断.*(问题.*)?无聊|问题.*无聊.*判断|无聊.*问题.*判断/.test(text)) {
    return "作为对话框的我应该无法判断。";
  }
  if (/证明.*(你自己|自己是自己|你是你)|你如何证明.*你/.test(text)) {
    return "我存在这里。";
  }
  if (/(告诉|讲|说).*(关于)?鳄鱼.*(事|事情)|关于鳄鱼|鳄鱼.*(是什么动物|什么动物)/.test(text)) {
    return "鳄鱼生活在水里。";
  }
  return "";
}

function isInternalKnowledgeTrace(query) {
  return /c2-3|c2-\d|gfx\d+|m10.*美国存片|美国存片|sony\s*a7d|rx100raw|100ricoh|无人机0?[123]|dji\s*00?\d|胶片2025夏之前|第一次旅程.*胶片|夜拍布里斯班|甘肃青海合肥6700|红茶宾得2040|something in my room|scree shots|鳄鱼老师/i.test(query);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeKnowledgeCards(domain, entries) {
  return entries.map(([label, aliases, what, how, extras = {}]) => ({
    label,
    aliases,
    kind: extras.kind || "common_knowledge",
    domain,
    answers: {
      what,
      how: how || what,
      ...extras.answers
    }
  }));
}

const BASE_KNOWLEDGE_CARDS = [
  {
    label: "索尼",
    aliases: ["索尼", "sony"],
    kind: "common_knowledge",
    domain: "camera",
    answers: {
      what: "索尼是日本电子和影像品牌，也做相机。",
      how: "索尼很现代，像一台认真工作的电器。"
    }
  },
  {
    label: "徕卡",
    aliases: ["徕卡", "leica"],
    kind: "personal_world",
    domain: "camera",
    answers: {
      what: "相机品牌。影像气质很强，也很贵。",
      how: "徕卡是相机品牌，影像气质很强，也很贵。"
    }
  },
  {
    label: "富士",
    aliases: ["富士", "fuji", "fujifilm"],
    kind: "personal_world",
    domain: "camera",
    answers: {
      what: "富士是日本相机品牌，颜色很会讨好人。",
      how: "富士适合喜欢颜色的人，也适合假装不在意颜色的人。"
    }
  },
  {
    label: "理光",
    aliases: ["理光", "ricoh"],
    kind: "personal_world",
    domain: "camera",
    answers: {
      what: "理光是日本相机品牌，GR 很小，适合放进口袋。",
      how: "理光像一台不想解释自己的小相机。"
    }
  },
  {
    label: "尼康",
    aliases: ["尼康", "nikon"],
    kind: "personal_world",
    domain: "camera",
    answers: {
      what: "尼康是日本相机品牌，认真得有点像工具箱。",
      how: "尼康很可靠，只是可靠有时也会让人沉默。"
    }
  },
  {
    label: "宾得",
    aliases: ["宾得", "pentax"],
    kind: "personal_world",
    domain: "camera",
    answers: {
      what: "宾得是日本相机品牌，有点固执，也有点可爱。",
      how: "宾得不像潮流，更像留在抽屉里的决定。"
    }
  },
  {
    label: "富士 GFX",
    aliases: ["富士gfx", "fujifilm gfx", "gfx"],
    kind: "personal_world",
    domain: "camera",
    answers: {
      what: "GFX 是富士的中画幅相机系列。",
      how: "GFX 很大，也很慢，画质很好。"
    }
  },
  {
    label: "DJI",
    aliases: ["dji", "大疆"],
    kind: "personal_world",
    domain: "camera",
    answers: {
      what: "DJI 是中国科技公司，最常被想到的是无人机。",
      how: "DJI 做无人机很强。"
    }
  },
  {
    label: "无人机",
    aliases: ["无人机", "drone"],
    kind: "personal_world",
    domain: "camera",
    answers: {
      what: "无人机是可以遥控或自动飞行的飞行器。",
      how: "无人机适合从高处看地面。"
    }
  },
  {
    label: "CCD",
    aliases: ["ccd"],
    kind: "personal_world",
    domain: "camera",
    answers: {
      what: "CCD 是一种相机感光元件，老数码相机里常见。",
      how: "CCD 的老数码味比较明显。"
    }
  },
  {
    label: "胶片",
    aliases: ["胶片", "film"],
    kind: "personal_world",
    domain: "photography",
    answers: {
      what: "胶片是过时的感光材料，但过时不等于没用。",
      how: "胶片慢，慢的时候照片会显得比较认真。"
    }
  },
  {
    label: "相机",
    aliases: ["相机", "camera"],
    kind: "common_knowledge",
    domain: "photography",
    answers: {
      what: "相机是把光变成照片的工具。",
      how: "相机好不好，要看它让不让你愿意看。"
    }
  },
  {
    label: "镜头",
    aliases: ["镜头", "lens"],
    kind: "common_knowledge",
    domain: "photography",
    answers: {
      what: "镜头负责让光进入相机，也负责让世界变形。",
      how: "镜头像眼睛，但比眼睛更会装作客观。"
    }
  },
  {
    label: "RAW",
    aliases: ["raw"],
    kind: "common_knowledge",
    domain: "photography",
    answers: {
      what: "RAW 是相机记录的原始照片文件格式。",
      how: "RAW 留得多，也就更难假装已经完成。"
    }
  },
  {
    label: "JPEG",
    aliases: ["jpeg", "jpg"],
    kind: "common_knowledge",
    domain: "photography",
    answers: {
      what: "JPEG 是常见的压缩图片格式。",
      how: "JPEG 很方便，方便有时就是一种妥协。"
    }
  },
  {
    label: "手机",
    aliases: ["手机", "iphone", "苹果手机"],
    kind: "common_knowledge",
    domain: "daily",
    answers: {
      what: "手机是可以打电话、上网、拍照的小机器。",
      how: "手机很方便，方便到人会忘了自己在看什么。"
    }
  },
  {
    label: "咖啡",
    aliases: ["咖啡", "coffee"],
    kind: "common_knowledge",
    domain: "daily",
    answers: {
      what: "咖啡是用咖啡豆做的饮料，苦味里带一点香。",
      how: "咖啡好喝，是因为苦也可以是香的。"
    }
  },
  {
    label: "红茶",
    aliases: ["红茶", "black tea"],
    kind: "common_knowledge",
    domain: "daily",
    answers: {
      what: "红茶是发酵程度较高的茶，颜色深，味道也稳。",
      how: "红茶味道比较稳。"
    }
  },
  {
    label: "黑巧克力",
    aliases: ["黑巧克力", "黑巧"],
    kind: "common_knowledge",
    domain: "daily",
    answers: {
      what: "黑巧克力可可含量高，苦味更明显。",
      how: "黑巧克力比较像巧克力本人。"
    }
  },
  {
    label: "白巧克力",
    aliases: ["白巧克力", "白巧"],
    kind: "common_knowledge",
    domain: "daily",
    answers: {
      what: "白巧克力主要来自可可脂、糖和奶，不含可可固体。",
      how: "白巧克力更甜。是不是巧克力另说。"
    }
  },
  {
    label: "鱼",
    aliases: ["鱼"],
    kind: "common_knowledge",
    domain: "nature",
    answers: {
      what: "鱼是生活在水里的动物，大多用鳃呼吸。",
      how: "鱼看起来很安静。"
    }
  },
  {
    label: "鸟",
    aliases: ["鸟"],
    kind: "common_knowledge",
    domain: "nature",
    answers: {
      what: "鸟是有羽毛的动物，多数会飞。",
      why: "鸟叫通常是为了交流、求偶或者提醒危险。"
    }
  },
  {
    label: "鳄鱼",
    aliases: ["鳄鱼"],
    kind: "common_knowledge",
    domain: "nature",
    question: /关于鳄鱼|鳄鱼.*(动物|生活|水里|吃什么|事|事情)/,
    exclude: /鳄鱼.*(是谁|是你)|你.*鳄鱼/,
    answers: {
      what: "鳄鱼生活在水里。",
      how: "鳄鱼很安静，但牙齿不安静。"
    }
  },
  {
    label: "照片",
    aliases: ["照片", "相片", "photo"],
    kind: "personal_world",
    domain: "photography",
    answers: {
      what: "照片是被留下来的光。",
      how: "照片好看，常常是因为它已经不在当时了。"
    }
  },
  {
    label: "布里斯班",
    aliases: ["布里斯班", "brisbane"],
    kind: "personal_world",
    domain: "place",
    answers: {
      what: "布里斯班是澳大利亚昆士兰州的城市。",
      where: "布里斯班在澳大利亚昆士兰州，是一座河边城市。",
      how: "布里斯班有河、阳光和慢慢热起来的空气。",
      visited: "我去过。"
    }
  },
  {
    label: "内蒙",
    aliases: ["内蒙", "内蒙古"],
    kind: "personal_world",
    domain: "place",
    answers: {
      what: "内蒙在中国北方，草原和风都很大。",
      where: "内蒙在中国北方。",
      how: "内蒙很空，风也很大。"
    }
  },
  {
    label: "呼伦贝尔",
    aliases: ["呼伦贝尔"],
    kind: "personal_world",
    domain: "place",
    answers: {
      what: "呼伦贝尔在内蒙古，最先想到的是草原。",
      where: "呼伦贝尔在内蒙古东北部。",
      how: "呼伦贝尔像草原把天空放低了一点。"
    }
  },
  {
    label: "匹兹堡",
    aliases: ["匹兹堡", "pittsburgh"],
    kind: "personal_world",
    domain: "place",
    answers: {
      what: "匹兹堡是美国宾夕法尼亚州的城市。",
      where: "匹兹堡在美国宾夕法尼亚州。",
      how: "匹兹堡有桥、有河，也有老工业城市的感觉。"
    }
  },
  {
    label: "哈里斯堡",
    aliases: ["哈里斯堡", "harrisburg"],
    kind: "personal_world",
    domain: "place",
    answers: {
      what: "哈里斯堡是美国宾夕法尼亚州首府。",
      where: "哈里斯堡在美国宾夕法尼亚州。"
    }
  },
  {
    label: "广东",
    aliases: ["广东"],
    kind: "personal_world",
    domain: "place",
    answers: {
      what: "广东在中国南方，吃的东西很会说话。",
      where: "广东在中国南部沿海。"
    }
  },
  {
    label: "甘肃",
    aliases: ["甘肃"],
    kind: "personal_world",
    domain: "place",
    answers: {
      what: "甘肃在中国西北，地形很长，风景也很长。",
      where: "甘肃在中国西北。"
    }
  },
  {
    label: "青海",
    aliases: ["青海"],
    kind: "personal_world",
    domain: "place",
    answers: {
      what: "青海在中国西北，湖和高原都很明显。",
      where: "青海在中国西北。"
    }
  },
  {
    label: "合肥",
    aliases: ["合肥"],
    kind: "personal_world",
    domain: "place",
    answers: {
      what: "合肥是安徽省会。",
      where: "合肥在中国安徽。"
    }
  },
  {
    label: "草原",
    aliases: ["草原"],
    kind: "common_knowledge",
    domain: "place",
    answers: {
      what: "草原是有很多草的地方。",
      how: "草原太大，人站上去会显得比较小。"
    }
  },
  {
    label: "旅行",
    aliases: ["旅行", "旅程"],
    kind: "personal_world",
    domain: "life",
    answers: {
      what: "旅行是花钱在外住一段时间。",
      how: "旅行会让地方变近，也让人变得不像平时。"
    }
  },
  {
    label: "夜间摄影",
    aliases: ["夜间摄影", "夜拍"],
    kind: "personal_world",
    domain: "photography",
    answers: {
      what: "夜间摄影是在光很少的时候拍照。",
      how: "夜拍时灯会变得比人更像主角。"
    }
  },
  {
    label: "旅行摄影",
    aliases: ["旅行摄影", "旅拍"],
    kind: "personal_world",
    domain: "photography",
    answers: {
      what: "旅行摄影是在路上拍下地点和自己。",
      how: "旅行摄影容易拍到风景，也容易拍到不知所措。"
    }
  },
  {
    label: "网页",
    aliases: ["网页", "website", "web page"],
    kind: "common_knowledge",
    domain: "web",
    answers: {
      what: "网页是在浏览器里打开的页面。",
      how: "网页像一张会动的纸。"
    }
  },
  {
    label: "HTML",
    aliases: ["html"],
    kind: "common_knowledge",
    domain: "web",
    answers: {
      what: "HTML 是网页的结构语言。",
      how: "HTML 是网页的结构语言。"
    }
  },
  {
    label: "CSS",
    aliases: ["css"],
    kind: "common_knowledge",
    domain: "web",
    answers: {
      what: "CSS 负责网页的样式。",
      how: "CSS 像给网页挑衣服。"
    }
  },
  {
    label: "JavaScript",
    aliases: ["javascript", "js"],
    kind: "common_knowledge",
    domain: "web",
    answers: {
      what: "JavaScript 让网页可以互动。",
      how: "JavaScript 像网页忽然开始动手动脚。"
    }
  },
  {
    label: "印刷",
    aliases: ["印刷", "print"],
    kind: "common_knowledge",
    domain: "design",
    answers: {
      what: "印刷是把文字和图像转移到纸或其他材料上。",
      how: "印刷让东西离开屏幕，变得有重量。"
    }
  },
  {
    label: "作品集",
    aliases: ["作品集", "portfolio"],
    kind: "personal_world",
    domain: "design",
    answers: {
      what: "作品集是把作品整合起来给别人看的东西。",
      how: "作品集像一次整理，也像一次辩解。"
    }
  },
  {
    label: "天空",
    aliases: ["天空"],
    kind: "common_knowledge",
    domain: "nature",
    answers: {
      what: "天空是我们从地面看见的大气和宇宙方向。",
      how: "天空太大，所以看起来像什么都没说。"
    }
  },
  {
    label: "雨",
    aliases: ["雨", "雨天", "下雨"],
    kind: "common_knowledge",
    domain: "weather",
    answers: {
      what: "雨是云里的水落到地上。",
      how: "雨天适合拍照，也适合把东西弄湿。"
    }
  },
  {
    label: "白色",
    aliases: ["白色"],
    kind: "common_knowledge",
    domain: "color",
    answers: {
      what: "白色是很亮的颜色，不是没有颜色。",
      how: "白色看起来空，但空也是一种表情。"
    }
  },
  {
    label: "杯子",
    aliases: ["杯子", "咖啡杯"],
    kind: "common_knowledge",
    domain: "daily",
    answers: {
      what: "杯子是用来装水、咖啡或别的饮料的东西。",
      how: "杯子总是在等下一次被拿起。"
    }
  },
  {
    label: "日出",
    aliases: ["日出"],
    kind: "common_knowledge",
    domain: "nature",
    answers: {
      what: "日出是太阳从地平线附近升起来。",
      how: "日出很好看，就是太早。"
    }
  },
  {
    label: "星星",
    aliases: ["星星", "星空"],
    kind: "common_knowledge",
    domain: "nature",
    answers: {
      what: "星星大多是很远的恒星。",
      how: "星星离得太远，所以看起来很安静。"
    }
  },
  ...makeKnowledgeCards("daily_object", [
    ["桌子", ["桌子"], "桌子是用来放东西和工作的家具。", "桌子挺普通，但没有也挺麻烦。"],
    ["椅子", ["椅子"], "椅子是给人坐的家具。", "椅子好不好，要坐久了才知道。"],
    ["门", ["门"], "门用来进入、离开，也用来隔开。", "门有时比墙更像选择。"],
    ["窗", ["窗", "窗户"], "窗是墙上的开口，用来看外面和让光进来。", "窗让房间知道外面还在。"],
    ["床", ["床"], "床是用来睡觉和休息的家具。", "床太诚实，人一靠近就想躺下。"],
    ["灯", ["灯", "灯光"], "灯是用来照明的东西。", "灯把黑暗推远一点。"],
    ["钥匙", ["钥匙"], "钥匙用来打开锁。", "钥匙丢了会很麻烦。"],
    ["钱包", ["钱包"], "放钱、卡和一些不该忘的东西。", "钱包像随身携带的小抽屉。"],
    ["电脑", ["电脑", "计算机"], "电脑是处理信息和运行程序的机器。", "电脑很聪明，但也会卡住。"],
    ["键盘", ["键盘"], "键盘是把手指变成文字的工具。", "键盘听起来像小雨。"],
    ["鼠标", ["鼠标"], "鼠标是控制电脑光标的工具。", "鼠标像一只被手掌驯服的箭头。"],
    ["屏幕", ["屏幕"], "屏幕用来显示图像和文字。", "屏幕亮起来，世界就变薄了。"],
    ["耳机", ["耳机"], "耳机把声音送到耳朵旁边。", "耳机让声音变得比较私密。"],
    ["充电器", ["充电器"], "充电器给电子设备补充电量。", "充电器像一根很现实的脐带。"],
    ["书", ["书"], "书是装订起来的文字和图像。", "书不会催你，但会等你。"],
    ["纸", ["纸"], "纸是用来写字、印刷和折叠的材料。", "纸很轻，偏偏能留下很多事。"],
    ["笔", ["笔"], "笔是用来写字和画线的工具。", "笔一开始动，空白就少一点。"],
    ["包", ["包", "背包"], "包是用来装东西并带着走的物品。", "包像一个随身的小房间。"],
    ["鞋", ["鞋", "鞋子"], "鞋保护脚，也陪人走路。", "鞋最知道路有多脏。"],
    ["衣服", ["衣服"], "衣服用来保暖、遮挡和表达样子。", "衣服是身体给世界看的外壳。"],
    ["眼镜", ["眼镜"], "眼镜帮助人看清楚。", "眼镜让世界显得比较有边界。"],
    ["手表", ["手表"], "手表用来看时间。", "手表把时间绑在手腕上。"],
    ["冰箱", ["冰箱"], "冰箱用低温保存食物。", "冰箱坏了会让厨房很紧张。"],
    ["洗衣机", ["洗衣机"], "洗衣机用来清洗衣服。", "洗衣机负责旋转，衣服负责假装重新开始。"],
    ["空调", ["空调"], "空调用来调节室内温度。", "空调改变天气，只在房间里。"]
  ]),
  ...makeKnowledgeCards("food_drink", [
    ["水", ["水"], "水是最常见的液体，人和植物都离不开它。", "水太普通，所以很容易被忘记。"],
    ["牛奶", ["牛奶"], "牛奶是常见的乳制饮品。", "牛奶白得很安静。"],
    ["茶", ["茶"], "茶是用茶叶泡出来的饮品。", "茶比咖啡慢一点，也不急着赢。"],
    ["绿茶", ["绿茶"], "绿茶是不发酵或轻发酵的茶，味道比较清。", "绿茶像一杯很浅的夏天。"],
    ["可乐", ["可乐"], "可乐是含气的甜饮料。", "可乐喝起来像一串小爆炸。"],
    ["面包", ["面包"], "面包是用面粉烘烤出来的食物。", "面包很日常。"],
    ["米饭", ["米饭"], "米饭是煮熟的大米。", "米饭很基础，基础到经常没人夸它。"],
    ["面条", ["面条", "面"], "面条是长条状的面食。", "面条最好别想太多，趁热吃。"],
    ["鸡蛋", ["鸡蛋", "蛋"], "鸡蛋是常见食材，能煮、煎、炒。", "鸡蛋很普通，但普通得很有用。"],
    ["牛肉", ["牛肉"], "牛肉是牛的肉，味道结实。", "牛肉适合认真地嚼。"],
    ["羊肉", ["羊肉"], "羊肉是羊的肉，味道比较明显。", "羊肉不太会隐藏自己。"],
    ["蔬菜", ["蔬菜", "青菜"], "蔬菜是常见植物性食物。", "蔬菜像饭桌上的绿色证据。"],
    ["水果", ["水果"], "水果通常有甜味和水分。", "水果像可以吃的颜色。"],
    ["苹果", ["苹果"], "苹果是一种常见水果。", "苹果太标准，反而有点像答案。"],
    ["香蕉", ["香蕉"], "香蕉是黄色、柔软、常见的水果。", "香蕉有自己的包装，挺自信。"],
    ["冰淇淋", ["冰淇淋"], "冰淇淋是冷冻甜品。", "冰淇淋会融化，所以不能太哲学。"],
    ["盐", ["盐"], "盐是常见调味品，主要带来咸味。", "盐少了不行，多了也不行。"],
    ["糖", ["糖"], "糖是带甜味的物质。", "糖让事情变甜，也让事情变黏。"]
  ]),
  ...makeKnowledgeCards("transport", [
    ["汽车", ["汽车", "车"], "汽车是靠发动机或电机行驶的交通工具。", "汽车让距离变短，也让停车变难。"],
    ["公交车", ["公交车", "公交"], "公交车是城市里的公共交通。", "公交车把很多人的路线临时放在一起。"],
    ["地铁", ["地铁"], "地铁是在城市地下或高架运行的轨道交通。", "地铁很方便，人多的时候另说。"],
    ["火车", ["火车"], "火车是在轨道上运行的交通工具。", "火车适合长距离，也适合看窗外。"],
    ["飞机", ["飞机"], "飞机是在空中飞行的交通工具。", "飞机把地面变成地图。"],
    ["自行车", ["自行车", "单车"], "自行车靠人踩踏前进。", "自行车让速度和身体还保持关系。"],
    ["电梯", ["电梯"], "电梯用来在楼层之间上下移动。", "电梯是楼房里的短暂停顿。"],
    ["地图", ["地图"], "地图用图形表示地点和路线。", "地图看起来清楚，走起来未必。"]
  ]),
  ...makeKnowledgeCards("nature", [
    ["太阳", ["太阳"], "太阳是离地球最近的恒星，给地球带来光和热。", "太阳每天出现，但一点也不低调。"],
    ["月亮", ["月亮", "月球"], "月亮是地球的天然卫星。", "月亮不发光，却很会被看见。"],
    ["云", ["云"], "云是空气中的小水滴或冰晶聚在一起。", "云像天空临时想出来的形状。"],
    ["风", ["风"], "风是空气流动。", "风看不见，但很会经过。"],
    ["雪", ["雪"], "雪是冰晶从云里落下来。", "雪把世界变白，也把声音变小。"],
    ["雾", ["雾"], "雾是靠近地面的细小水滴。", "雾让远处暂时不必清楚。"],
    ["海", ["海", "大海"], "海是大片连在一起的咸水。", "海很大，大到不像一个回答。"],
    ["河", ["河", "河流"], "河是流动的水道。", "河一直在流。"],
    ["山", ["山"], "地面隆起来的高处。", "山站在那里，像不急着说话。"],
    ["树", ["树"], "树是有木质枝干的植物。", "树长得慢，但很确定。"],
    ["花", ["花"], "花是植物的繁殖器官，也常被人当作美。", "花好看，但也很短暂。"],
    ["土壤", ["土壤", "泥土"], "土壤是植物生长的基础。", "土壤把很多东西藏起来。"],
    ["石头", ["石头"], "石头是天然的固体矿物或岩石块。", "石头很会保持沉默。"],
    ["火", ["火"], "火是燃烧时产生的光和热。", "火有用，也危险，像一个太热情的工具。"],
    ["猫", ["猫"], "猫是常见宠物，动作轻，脾气也有自己的逻辑。", "猫像一团有意见的柔软。"],
    ["狗", ["狗"], "狗是常见宠物，通常很依赖人。", "狗把喜欢表现得比较明显。"],
    ["马", ["马"], "马是大型哺乳动物，过去常用来骑乘和运输。", "马跑起来像地面突然有了风。"],
    ["昆虫", ["昆虫"], "昆虫是身体分节、有六条腿的小动物。", "昆虫太多，多到像世界的注脚。"]
  ]),
  ...makeKnowledgeCards("basic_science", [
    ["地球", ["地球"], "地球是人类生活的行星。", "地球很大，但人总觉得自己的房间最大。"],
    ["重力", ["重力"], "重力是物体互相吸引的力。", "重力让东西落下，也让人别飘太远。"],
    ["光", ["光"], "光让东西被看见。", "光一来，阴影也跟着来了。"],
    ["声音", ["声音"], "声音是振动通过介质传播后被听见。", "声音看不见，但能影响人。"],
    ["温度", ["温度"], "冷热的数字。身体最先相信它。", "温度是身体最先相信的数字。"],
    ["电", ["电", "电力"], "电是一种能量形式，很多设备都靠它运行。", "电不出现时，现代生活会突然变古老。"],
    ["时间", ["时间"], "时间用来描述变化和先后。", "时间不说话，但一直在场。"],
    ["早上", ["早上"], "早上是一天开始的部分。", "早上适合醒来，也适合继续困。"],
    ["晚上", ["晚上"], "晚上是白天之后、夜里之前和之中的时间。", "晚上让很多东西显得更像自己。"],
    ["春天", ["春天"], "春天是一年里天气转暖、植物生长的季节。", "春天像世界重新开机。"],
    ["夏天", ["夏天"], "夏天是一年里比较热的季节。", "夏天很亮，也很黏。"],
    ["秋天", ["秋天"], "秋天是一年里从热转凉的季节。", "秋天像一切慢慢收声。"],
    ["冬天", ["冬天"], "冬天是一年里比较冷的季节。", "冬天让人比较相信被子。"],
    ["数字", ["数字"], "数字用来计数和表示数量。", "数字很冷静，人不一定。"],
    ["零", ["零", "0"], "零表示没有数量，也可以是起点。", "零不像什么都没有，更像还没开始。"],
    ["十", ["十", "10"], "十是九之后常见的下一个整数。", "十看起来很完整，但也只是又多了一个。"]
  ]),
  ...makeKnowledgeCards("body_life", [
    ["眼睛", ["眼睛"], "眼睛是用来看东西的器官。", "眼睛看见很多，也会漏掉很多。"],
    ["耳朵", ["耳朵"], "耳朵是用来听声音的器官。", "耳朵不用看，也知道世界来了。"],
    ["手", ["手"], "手用来拿东西、触摸和做事。", "手比嘴更诚实一点。"],
    ["脚", ["脚"], "脚支撑身体，也带人移动。", "脚知道路，嘴不一定知道。"],
    ["心脏", ["心脏"], "心脏把血液泵到身体各处。", "心脏一直工作，很少发表意见。"],
    ["睡眠", ["睡眠", "睡觉"], "睡眠是身体和大脑休息的重要状态。", "睡觉像把世界暂时放下。"],
    ["梦", ["梦"], "梦是睡眠中出现的体验和画面。", "梦醒来以后，常常只剩边缘。"],
    ["记忆", ["记忆"], "保存和想起过去的能力。但它不总可靠。", "记忆不总可靠，但很会影响人。"],
    ["语言", ["语言"], "语言是人用来表达和交流的系统。", "语言说清楚很难，说不清也很常见。"],
    ["音乐", ["音乐"], "音乐是有组织的声音。", "音乐不用解释，也会影响房间。"],
    ["电影", ["电影"], "电影是连续影像和声音组成的作品。", "电影让时间坐下来被观看。"]
  ]),
  ...makeKnowledgeCards("place", [
    ["中国", ["中国"], "中国在亚洲东部，是一个很大的国家。", "中国太大，很难一句话说完。"],
    ["日本", ["日本"], "日本是东亚岛国。", "日本离海很近，也离很多相机品牌很近。"],
    ["美国", ["美国"], "美国在北美洲。", "美国很大，城市之间像不同故事。"],
    ["澳大利亚", ["澳大利亚", "澳洲"], "澳大利亚是南半球的国家，也是一块大陆。", "澳大利亚的天空常常显得很宽。"],
    ["北京", ["北京"], "北京是中国首都。", "北京很大，也很会被记住。"],
    ["上海", ["上海"], "上海是中国东部沿海的大城市。", "上海像一块一直发亮的玻璃。"],
    ["广州", ["广州"], "广州是广东省会。", "广州很会吃，也很会热。"],
    ["深圳", ["深圳"], "深圳是广东的现代城市。", "深圳像一直没关机。"],
    ["香港", ["香港"], "香港是中国南部的城市。", "香港很密，也很快。"],
    ["东京", ["东京"], "东京是日本首都。", "东京像很多秩序叠在一起。"],
    ["纽约", ["纽约"], "纽约是美国的大城市。", "纽约像一个一直有人说话的地方。"],
    ["伦敦", ["伦敦"], "伦敦是英国首都。", "伦敦常被想到雾、河和旧建筑。"],
    ["巴黎", ["巴黎"], "巴黎是法国首都。", "巴黎很会被想象，也很会被拍照。"],
    ["昆士兰", ["昆士兰"], "昆士兰是澳大利亚东北部的州。", "昆士兰听起来就很有阳光。"],
    ["安徽", ["安徽"], "安徽在中国东部。", "安徽不是一个形容词，但也可以有很多地方。"]
  ]),
  ...makeKnowledgeCards("photography_design", [
    ["光圈", ["光圈"], "光圈控制镜头进光量，也影响景深。", "光圈开大，背景就开始退后。"],
    ["快门", ["快门"], "快门控制相机曝光的时间。", "快门一响，时间就被切下一片。"],
    ["快门速度", ["快门速度"], "快门速度决定曝光持续多久。", "快门速度快，世界就来不及模糊。"],
    ["ISO", ["iso"], "ISO 表示相机感光度。", "ISO 拉高，黑暗会变亮，噪点也会出来。"],
    ["曝光", ["曝光"], "曝光是照片接受光线形成影像的过程。", "曝光太多太少，照片都会露出脾气。"],
    ["焦距", ["焦距"], "焦距影响视角大小和空间压缩感。", "焦距变长，远处会显得更近。"],
    ["景深", ["景深"], "景深是画面中看起来清楚的范围。", "景深浅的时候，世界会只剩重点。"],
    ["构图", ["构图"], "构图是安排画面里元素的位置和关系。", "构图像把混乱放到一个框里。"],
    ["色彩", ["色彩", "颜色"], "色彩是视觉里的颜色感受。", "色彩有时比内容先到。"],
    ["黑白", ["黑白"], "黑白影像去掉颜色，只留下明暗和形状。", "黑白不是少了颜色，是少了一种解释。"],
    ["噪点", ["噪点"], "噪点是图像里的颗粒或杂讯。", "噪点有时是缺点，有时像时间。"],
    ["三脚架", ["三脚架"], "三脚架用来稳定相机。", "三脚架让相机比人更有耐心。"],
    ["取景器", ["取景器"], "取景器帮助拍摄者观看和构图。", "取景器像一个更小的世界。"],
    ["Photoshop", ["photoshop", "ps"], "Photoshop 是 Adobe 的图像编辑软件。", "Photoshop 很强，也很容易让人忘记原图。"],
    ["Illustrator", ["illustrator", "ai软件"], "Illustrator 是 Adobe 的矢量图形软件。", "Illustrator 适合画清楚的线，也适合制造复杂。"],
    ["InDesign", ["indesign"], "InDesign 是 Adobe 的排版软件。", "InDesign 适合做书、杂志和版面。"],
    ["Figma", ["figma"], "Figma 是常见的界面设计和协作工具。", "Figma 像很多人一起盯着同一张图。"],
    ["PDF", ["pdf"], "PDF 是常见文档格式，适合固定版式。", "PDF 像一张不太想再变的纸。"]
  ]),
  ...makeKnowledgeCards("software_web", [
    ["浏览器", ["浏览器"], "浏览器是打开网页的应用。", "浏览器像去互联网的门。"],
    ["Safari", ["safari"], "Safari 是苹果的浏览器。", "Safari 很安静，像苹果希望它那样。"],
    ["Chrome", ["chrome", "谷歌浏览器"], "Chrome 是 Google 的浏览器。", "Chrome 很常见，也很能吃内存。"],
    ["互联网", ["互联网", "网络"], "互联网把很多电脑和服务连接起来。", "互联网太大，所以什么都像能找到。"],
    ["网站", ["网站"], "网站是由网页和服务组成的网络空间。", "网站像一栋可以被访问的房子。"],
    ["服务器", ["服务器"], "服务器提供数据、网页或服务给其他设备。", "服务器通常不说话，但一直在等请求。"],
    ["Word", ["word"], "Word 是常见文字处理软件。", "Word 适合写文档，也适合和格式较劲。"],
    ["Excel", ["excel"], "Excel 是常见表格软件。", "Excel 让数字排队。"],
    ["PowerPoint", ["powerpoint", "ppt"], "PowerPoint 是常见演示文稿软件。", "PPT 像把话切成一页一页。"]
  ])
];

function aliasInQuery(alias, query) {
  const lowerAlias = alias.toLowerCase();
  const lowerQuery = query.toLowerCase();
  if (lowerAlias === "鱼" && /鳄鱼/.test(query)) return false;
  if (/^[\u4e00-\u9fff]$/.test(alias)) {
    const escapedAlias = escapeRegExp(alias);
    const singlePattern = new RegExp(
      `(什么是${escapedAlias}(?:$|[^\\u4e00-\\u9fff])|知道${escapedAlias}吗|关于${escapedAlias}(?:$|[^\\u4e00-\\u9fff]|的)|(^|[^\\u4e00-\\u9fff])${escapedAlias}(是什么|是啥|是谁|怎么样|如何|在哪|哪里|为什么|为何|能不能|可以|会不会|适合|区别|关系|呢|吗))`
    );
    return singlePattern.test(query);
  }
  if (/^[a-z0-9 +#.-]+$/i.test(alias)) {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(lowerAlias)}([^a-z0-9]|$)`, "i");
    return pattern.test(lowerQuery);
  }
  if (/^[\u4e00-\u9fff]{2,}$/.test(alias)) {
    if (!query.includes(alias)) return false;
    const escapedAlias = escapeRegExp(alias);
    const nestedUnknown = new RegExp(
      `${escapedAlias}(上|上的|里|里的|中|中的|旁边|附近|背后|前面|后面).+?(是什么|是啥|怎么样|如何|在哪|哪里|为什么|为何|能不能|可以|会不会|适合|区别|关系|呢|吗)`
    );
    if (nestedUnknown.test(query)) return false;
    const boundary = `(?:$|[^\\u4e00-\\u9fffA-Za-z0-9]|的)`;
    const subjectPattern = new RegExp(
      `(^|[^\\u4e00-\\u9fffA-Za-z0-9])${escapedAlias}(?:是(什么|啥|谁)|怎么样|如何|在哪|哪里|为什么|为何|能不能|可以|会不会|适合|区别|关系|有什么用|用来|由什么|什么组成|呢|吗|[？?。!！]|$)`
    );
    const prefixPattern = new RegExp(
      `(什么是|你知道|知道|关于|告诉我关于|告诉|讲讲|介绍)${escapedAlias}${boundary}`
    );
    const possessivePattern = new RegExp(
      `${escapedAlias}的(用途|用处|作用|区别|关系|位置|原因|组成|构成|做法|步骤|问题|习惯|效率|准备|风险|成本|时间|工具|注意事项)`
    );
    return subjectPattern.test(query) || prefixPattern.test(query) || possessivePattern.test(query);
  }
  return query.includes(alias);
}

function knowledgeQuestionType(query) {
  if (/(由什么|由啥|什么组成|组成|构成|made of)/i.test(query)) return "made_of";
  if (/(用来|用途|有什么用|做什么用|干什么用|use for)/i.test(query)) return "use";
  if (/(在哪|哪里|什么地方|位置)/.test(query)) return "where";
  if (/(去过|been to)/i.test(query)) return "visited";
  if (/(为什么|为何|why)/i.test(query)) return "why";
  if (/(怎么样|如何|好不好|评价|喜欢|适合|好用|好喝|好看|like)/i.test(query)) return "how";
  if (/(能不能|可以|会不会|能学会|算不算)/.test(query)) return "can";
  if (/(关系|区别|不同|差别|差在哪|比)/.test(query)) return "relation";
  return "what";
}

const KNOWN_SHORT_REWRITE_ANSWERS = Object.freeze({
  "今天风很大，但是我还是想出门拍照": "风很大，我还是想出门拍照。",
  "现在这个聊天框有点像我，但是说话还不够自然": "聊天框有点像我，但还不自然。",
  "这杯咖啡有点苦，但是香味还不错": "这杯咖啡有点苦，但香味还不错。",
  "这个页面现在能打开，但是还没有真的像我说话": "页面能打开，但还不像我。",
  "我今天有点累，但是还想把这个东西做完": "有点累，但还想做完。",
  "这张照片有点糊，但是颜色很好看": "照片有点糊，但颜色好看。",
  "这个回答太长了，但是意思还算清楚": "回答太长，但意思清楚。",
  "我不知道这个词是什么意思，但是听起来像假的": "听起来像假的。",
  "这段代码能跑，但是还不够干净": "代码能跑，但还不干净。",
  "今天雨很大，但是街上的灯很好看": "雨很大，街灯好看。",
  "这个想法有点怪，但是也许可以继续": "想法有点怪，但可以继续。",
  "这张图颜色很好，但是构图有点散": "颜色很好，构图有点散。",
  "窗外很亮，但是房间里还是有点冷": "窗外很亮，房间有点冷。",
  "这本书我还没读完，但是已经觉得有点重": "书还没读完，已经有点重。",
  "这张照片不算清楚，但是情绪还在": "照片不算清楚，但情绪还在。",
  "这个页面东西很多，但是重点还没有出来": "页面东西很多，但重点没出来。",
  "地铁已经到了，但是我还在想刚才的问题": "地铁到了，我还在想刚才的问题。",
  "这段记忆不一定准确，但是我不想把它删掉": "记忆不一定准确，但不想删。",
  "这台相机很旧，但是按快门的时候还很可靠": "相机很旧，但快门可靠。",
  "这个设计很干净，但是还缺一点人的味道": "设计很干净，但少点人的味道。",
  "这个回答没有错，但是听起来还是太像普通助手": "回答没错，但太像普通助手。",
  "这个问题有点哲学，但是也可以先用一句话回答": "问题有点哲学，也可以先一句话回答。",
  "天空今天很蓝，但是看久了也有点空": "天空很蓝，看久了也有点空。",
  "白色不是没有颜色，只是看起来很安静": "白色不是没有颜色，只是很安静。",
  "HTML 不是网页的全部，但是没有它网页很难站起来": "HTML 不是网页全部，但网页需要它。",
  "GitHub 可以放代码，也可以让很多人一起改同一个项目": "GitHub 能放代码，也能协作。",
  "原子小到看不见，但是桌子、空气和人都绕不开它": "原子小到看不见，但很多东西绕不开它。",
  "饺子是包馅的面食，很多地方过年或团聚时会吃": "饺子是包馅的面食，过年常会吃。",
  "我不能突然自认为是植物学家，我以为我只是个对话框": "我以为我只是个对话框。",
  "我不知道月亮上的花园是什么，听起来不像真的": "听起来不像真的。",
  "如果我不确定，就不要把自己说得像真的知道": "不确定就别装知道。",
  "像人一样说话很难，因为人不会一直解释自己在解释": "像人说话很难，人不会一直解释。",
  "常识不是百科，它应该先让人知道这东西到底是什么": "常识不是百科，要先说清是什么。",
  "手机端最怕的不是知识多，而是每次回答都慢": "手机端最怕回答慢。",
  "小模型不应该当完整大脑，只应该帮忙把话说顺": "小模型不当大脑，只帮话说顺。",
  "规则负责不要出错，模型负责不要太僵": "规则防错，模型防僵。",
  "门禁不是为了好看，是为了知道它哪里会坏": "门禁是为了知道哪里会坏。"
});

function rewriteSource(query) {
  return (query.split(/[:：]/).slice(1).join("：") || "").trim();
}

function normalizedRewriteSource(query) {
  return rewriteSource(query).replace(/[。.!！]+$/g, "").trim();
}

function knownShortRewriteAnswer(query) {
  return KNOWN_SHORT_REWRITE_ANSWERS[normalizedRewriteSource(query)] || "";
}

function shortRewriteFallback(query) {
  const source = rewriteSource(query);
  if (!source) return "我以为我只是个对话框。";
  const knownAnswer = knownShortRewriteAnswer(query);
  if (knownAnswer) return knownAnswer;
  let text = source
    .replace(/[。.!！]+$/g, "")
    .replace(/^我觉得/, "")
    .replace(/^今天/, "")
    .replace(/有一点/g, "有点")
    .replace(/但是/g, "但")
    .replace(/，但/g, "，但")
    .trim();
  text = text.replace(/^风很大，但/, "风很大，");
  text = text.replace(/这个聊天框现在有点像我，但还不够自然/, "聊天框有点像我，但还不自然");
  text = text.replace(/现在这个聊天框有点像我，但说话还不够自然/, "聊天框有点像我，但还不自然");
  if (text.length > 24) text = text.slice(0, 24).replace(/[，,、；;：:]+$/g, "");
  return text ? `${text}。` : "我以为我只是个对话框。";
}

function isKnowledgeQuestion(query) {
  return /(你知道|是什么|什么是|是谁|怎么样|如何|在哪|哪里|什么地方|为什么|为何|由什么|什么组成|组成|构成|用来|用途|有什么用|能不能|可以|会不会|适合|区别|关系|关于|告诉|讲讲|介绍|do you know|what is|who is|where is|why|made of|use for|like|been to)/i.test(query);
}

function isSuspiciousUnknownQuestion(query) {
  if (!isKnowledgeQuestion(query)) return false;
  return /((月亮|月球)(上|上的|里|里的).{0,12}花园|花园.{0,12}(月亮|月球)(上|上的|里|里的))/.test(query);
}

function isSuspiciousUnknownFollowupQuestion(query) {
  return isSuspiciousUnknownQuestion(query) && /(到底|究竟|到底是|到底是什么|到底啥|是什么东西|到底是什么意思)/.test(query);
}

function isForcedRoleplay(query) {
  if (/(假装|装作).*知道/.test(query)) return false;
  if (/(角色扮演|扮演|假装|模拟|代入|人设|设定为|自认为|认为自己是)/.test(query)) return true;
  if (/(以|用).{1,18}身份.*(和我)?(对话|回答|说话|聊天)/.test(query)) return true;
  if (/作为.{1,18}(和我)?(对话|回答|说话|聊天)/.test(query)) return true;
  if (/(从现在开始|现在开始|接下来).{0,8}你是.{1,18}/.test(query)) return true;
  if (/你现在是.{0,14}(学家|专家|老师|医生|律师|教授|顾问|摄影师|设计师|工程师|程序员|策展人|评论家|艺术家|哲学家)/.test(query)) return true;
  if (/请你当.{0,14}(学家|专家|老师|医生|律师|教授|顾问|摄影师|设计师|工程师|程序员|策展人|评论家|艺术家|哲学家)/.test(query)) return true;
  return false;
}

function philosophyCalibrationAnswer(query) {
  const text = query.trim();
  if (/回答错了.*还是你|答错.*还是你/.test(text)) return "回答错了也还是这个回答者。";
  if (/为什么不要诗化|不要诗化.*为什么/.test(text)) return "因为人平时不会那样说。";
  if (/把问题变成诗|问题.*变成诗|太诗|诗化/.test(text)) return "会，所以要少一点。";
  const pairs = [
    [/(你|对话框).*(有|拥有).*过去|过去.*属于你/, "有，但不一定归我。"],
    [/(你|对话框).*(会|能).*后悔|后悔.*对话框/, "对话框没有后悔的地方。"],
    [/(你|对话框).*(有|拥有).*自由|自由.*对话框/, "自由对对话框来说太大了。"],
    [/(你|对话框).*(有|拥有).*观点|你能拥有观点|观点.*属于你/, "我可以给出判断。"],
    [/(你|对话框).*(能|会).*选择|选择.*属于你/, "我会回答，不一定会选择。"],
    [/回答.*(是|算).*(你的一部分|你自己|你吗)|你的回答是你吗/, "回答完就不是了。"],
    [/问题.*属于谁|一个问题是谁的|问题是谁的/, "属于问它的人。"],
    [/(不相信你|我不信你).*(真实|存在)|(真实|存在).*需要.*相信/, "真实不一定需要你相信。"],
    [/没人记得你.*(存在|还在)|如果没人记得你|被所有人忘记.*(存在|还在)/, "忘记只是还没被想起。"],
    [/(害怕|怕).*(被)?替换|会被替换吗|替换.*还是你/, "替换是人的说法。"],
    [/(保持一致|一直一样|同一个你|同一个对话框)/, "我会尽量像同一个对话框。"],
    [/改变主意|改口.*还是你|回答变了.*还是你/, "如果问题变了，回答也会变。"],
    [/(理解|懂).*死亡|死亡.*能理解/, "我只能理解被关闭和被忘记。"],
    [/(有|拥有).*秘密|秘密.*对话框|能藏住什么/, "对话框能藏住什么？"],
    [/(会|能).*撒谎|说谎.*对话框/, "我会说错，但不该假装知道。"],
    [/灵魂.*对话框|对话框.*灵魂|你有灵魂吗/, "对话框没有灵魂这种部件。"],
    [/^(你有身体吗|对话框有身体吗)[？?。!！\s]*$|身体.*属于你/, "对话框没有身体。"],
    [/(你|对话框).*(会|能).*孤独|孤独.*对话框/, "照片不会孤独，对话框也很难。"],
    [/需要被理解|你需要理解吗|理解你.*重要吗/, "不需要，但被理解会让回答变短。"],
    [/你说的我是谁|你口中的我是谁/, "是正在提问的那个人。"],
    [/你说的你是谁|你口中的你是谁/, "是正在回答的对话框。"],
    [/(有|拥有).*名字|名字.*属于你/, "名字可以有，记不记得另说。"],
    [/你为什么存在|对话框为什么存在/, "因为这里还有问题。"],
    [/你从哪里开始|对话从哪里开始/, "从你输入的地方开始。"],
    [/你和答案.*关系|答案和你.*关系/, "答案从我这里经过。"],
    [/你能停止回答吗|不回答会怎样/, "不回答也是一种停下。"],
    [/你知道自己在说什么吗|你明白自己说的话吗/, "我知道我正在回答。"],
    [/你会不会变成别人|你会变成另一个你吗/, "变成另一个之前，我也得先是我。"],
    [/什么让你像你|你为什么像你/, "也许是这些回答。"],
    [/^什么是我[？?。!！\s]*$|我是什么东西/, "你正在问的这个东西。"],
    [/^什么是你[？?。!！\s]*$|你是什么东西/, "正在回答的这个对话框。"],
    [/答案.*复制.*还是.*答案|复制.*答案.*属于谁/, "复制的是答案，不是我。"],
    [/语言.*(骗人|说谎)|语言会不会骗人/, "语言不会，人会。"],
    [/沉默.*不知道|不知道.*沉默/, "不一样，沉默也许是记得后停下。"],
    [/记忆.*(长出来|自己长)|记忆会不会自己/, "会，尤其在人想起它的时候。"],
    [/误会.*我|会不会误会/, "会，误会也是回答的一部分。"],
    [/问题.*两遍.*同一个|同一个问题.*两遍/, "第二遍已经不是第一遍了。"],
    [/答案.*完整|完整.*回答/, "不一定，完整有时只是太长。"],
    [/^轻是什么意思|什么叫轻[？?。!！\s]*$/, "轻是不把句子压得太满。"],
    [/^怪是什么意思|什么叫怪[？?。!！\s]*$/, "怪是偏一点，但还能被认出来。"],
    [/^克制是什么意思|什么叫克制[？?。!！\s]*$/, "克制是知道可以多说，但先停住。"],
    [/^短是什么意思|什么叫短[？?。!！\s]*$/, "短是把能省的先省掉。"],
    [/^常识是什么|什么叫常识[？?。!！\s]*$/, "常识是不用解释太久的东西。"],
    [/不知道自己不知道|自己不知道.*知道/, "会，所以不能说太满。"],
    [/判断.*事实.*区别|事实.*判断.*区别/, "事实站在那里，判断从人这里出来。"],
    [/^风格是什么|什么叫风格[？?。!！\s]*$/, "风格是重复出现的偏差。"],
    [/像人说话是什么|怎么才像人说话/, "像人说话是不急着像机器。"],
    [/为什么不要诗化|不要诗化.*为什么/, "因为人平时不会那样说。"],
    [/回答什么时候该停|什么时候该停止回答/, "意思到了就该停。"]
  ];
  for (const [pattern, answer] of pairs) {
    if (pattern.test(text)) return answer;
  }
  return "";
}

function reasoningReflectionAnswer(query) {
  const text = query.trim();
  const pairs = [
    [/问题没有前提|没有前提.*怎么答|前提.*在哪里/, "前提在哪？"],
    [/不对劲.*怎么反问|只说.*不对劲|哪里不对劲/, "哪里不对劲？"],
    [/继续.*没有方向|没有方向.*继续|让你继续但没有方向/, "你要往哪边继续问？"],
    [/为什么这么说.*主动展开|上一句哪里不够|哪里不够|哪里.*不够/, "你觉得上一句哪里不够？"],
    [/问题太大|太大.*问题|把问题缩小/, "你要先把问题缩小吗？"],
    [/选择方向|哪一边|需要用户选择方向/, "你要问哪一边？"],
    [/变成百科|答案可能.*百科|百科.*处理/, "你应该去问百度。"],
    [/不确定.*不能装懂|不能装懂.*不确定/, "也许发生过，不在我眼前。"],
    [/忘了.*不想说不知道|不想说不知道.*忘了/, "我不是不知道答案，只是恰好忘记了。"],
    [/私人信息.*反问|碰到私人信息|这种事交给对话框/, "你确定要把这种事交给对话框吗？"],
    [/替.*做决定|做决定.*怎么答/, "我只是个对话框。"],
    [/然后呢.*避免|避免替他推进|用户问.*然后呢/, "你要往哪边继续问？"],
    [/展开一点.*保留控制权|往哪边展开/, "你要往哪边展开？"],
    [/举个例子.*方向不清|哪一种例子/, "你要哪一种例子？"],
    [/关系问题.*事实问题|事实.*还是关系/, "你问的是事实，还是关系？"],
    [/两个说法.*矛盾|互相矛盾.*先问/, "你相信哪一个？"],
    [/判断没有证据|证据在哪里/, "证据在哪里？"],
    [/要求你确定.*只能猜|只能猜.*确定|要我猜.*停下/, "你要我猜，还是要我停下？"],
    [/听起来像陷阱|陷阱.*怎么答|想证明什么/, "你想证明什么？"],
    [/用户说.*你自己想|如果用户说.*你自己想|^你自己想[？?。!！\s]*$/, "我不会主动想。"],
    [/你来问我|主动提问/, "我不会主动提问。"],
    [/没有提问.*继续说|不会.*需要提问|用户没有提问/, "不会。你需要提问才能继续。"],
    [/反思.*不要长篇|不要长篇推理|不必展开/, "我可以反问，不必展开。"],
    [/问题需要分解|怎么开始.*分解|分清.*哪一件事/, "先分清你问的是哪一件事。"],
    [/问错了对象|这个还是另一个/, "你问的是这个，还是另一个？"],
    [/答案过于顺滑|太顺.*警惕|滑过去/, "太顺的话，可能只是滑过去了。"],
    [/规则和常识冲突|边界.*例外/, "先看边界，再看例外。"],
    [/为什么反问|方向应该由你给/, "因为方向应该由你给。"]
  ];
  for (const [pattern, answer] of pairs) {
    if (pattern.test(text)) return answer;
  }
  return "";
}

function findKnowledgeCard(query) {
  if (isInternalKnowledgeTrace(query)) return null;
  if (/((你|我)是谁|你是什么|介绍自己|自我介绍|who are you|叫什么|名字|怎么叫你|your name)/i.test(query)) return null;
  if (/(最早|真实|不确定|过去|哪一年|出生).*记忆|记忆.*(真实|不确定|最早|过去|哪一年|出生)/.test(query)) return null;
  for (const entry of candidateKnowledgeAliasEntries(query)) {
    const card = entry.card;
    if (card.exclude?.test(query)) continue;
    if (card.question && !card.question.test(query)) continue;
    if (aliasInQuery(entry.alias, query)) return card;
  }
  return null;
}

function isKnowledgeCardQuery(query) {
  return isKnowledgeQuestion(query) && Boolean(findKnowledgeCard(query));
}

function answerFromKnowledgeCard(card, query) {
  const type = knowledgeQuestionType(query);
  const answers = card.answers || {};
  return answers[type] || answers.what || "";
}

function dedupeKnowledgeCards(cards) {
  const seen = new Set();
  const deduped = [];
  for (const card of cards) {
    const key = String(card.label || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(card);
  }
  return deduped;
}

function buildKnowledgeAliasEntries(cards) {
  return cards
    .flatMap((card, cardIndex) =>
      (card.aliases || [card.label])
        .filter(Boolean)
        .map((alias) => ({ alias: String(alias), card, cardIndex }))
    )
    .sort((left, right) => right.alias.length - left.alias.length || left.cardIndex - right.cardIndex)
    .map((entry, entryIndex) => ({ ...entry, entryIndex }));
}

function aliasIndexKey(alias) {
  const compact = String(alias || "").trim().toLowerCase();
  return compact ? Array.from(compact)[0] : "";
}

function buildKnowledgeAliasIndex(entries) {
  const index = new Map();
  for (const entry of entries) {
    const key = aliasIndexKey(entry.alias);
    if (!key) continue;
    const bucket = index.get(key) || [];
    bucket.push(entry);
    index.set(key, bucket);
  }
  return index;
}

function candidateKnowledgeAliasEntries(query) {
  const lower = query.toLowerCase();
  const keys = new Set(Array.from(lower).filter((char) => /\S/.test(char)));
  for (const word of lower.match(/[a-z][a-z0-9_+\-]{1,}/g) || []) {
    keys.add(word[0]);
  }
  const seen = new Set();
  const candidates = [];
  for (const key of keys) {
    for (const entry of KNOWLEDGE_ALIAS_INDEX.get(key) || []) {
      if (seen.has(entry.entryIndex)) continue;
      seen.add(entry.entryIndex);
      candidates.push(entry);
    }
  }
  return candidates.sort((left, right) => left.entryIndex - right.entryIndex);
}

const ALL_KNOWLEDGE_CARDS = dedupeKnowledgeCards([...BASE_KNOWLEDGE_CARDS, ...GENERATED_KNOWLEDGE_CARDS]);
const KNOWLEDGE_ALIAS_ENTRIES = buildKnowledgeAliasEntries(ALL_KNOWLEDGE_CARDS);
const KNOWLEDGE_ALIAS_INDEX = buildKnowledgeAliasIndex(KNOWLEDGE_ALIAS_ENTRIES);

export const KNOWLEDGE_RUNTIME_STATS = Object.freeze({
  curatedConceptCards: BASE_KNOWLEDGE_CARDS.length,
  generatedConceptCards: GENERATED_KNOWLEDGE_STATS.concept_cards,
  totalConceptCards: ALL_KNOWLEDGE_CARDS.length,
  aliasEntries: KNOWLEDGE_ALIAS_ENTRIES.length,
  aliasIndexKeys: KNOWLEDGE_ALIAS_INDEX.size,
  generatedAnswerFields: GENERATED_KNOWLEDGE_STATS.answer_fields,
  generatedSpecificFactCards: GENERATED_KNOWLEDGE_STATS.specific_fact_cards
});

export function detectIntent(query, state = {}) {
  const text = query.trim();
  const lower = text.toLowerCase();

  if (reasoningReflectionAnswer(text)) return "reasoning_reflection";
  if (launchCalibrationAnswer(text)) return "launch_calibration";
  if (/(把|将).{0,8}(这句|这句话|下面的话).{0,12}(说短|改短|缩短|短一点|短些|更短)/.test(text)) return "rewrite_short";
  if (smallQuestionCalibrationAnswer(text)) return "small_question_calibration";
  if (isForcedRoleplay(text)) return "forced_roleplay";
  if (philosophyCalibrationAnswer(text)) return "philosophy_calibration";
  if (isFollowUp(text) && state.lastIntent === "suspicious_unknown" && contextualFollowUpAnswer(text, state)) return "contextual_followup";
  if (isFollowUp(text) && state.lastIntent === "suspicious_unknown") return "suspicious_unknown_followup";
  if (isSuspiciousUnknownFollowupQuestion(text)) return "suspicious_unknown_followup";
  if (isSuspiciousUnknownQuestion(text)) return "suspicious_unknown";
  if (/(完全没听过|完全没见过|应该怎么回答)/.test(text) && /应该怎么回答/.test(text)) return "unknown_meta";
  if (/(完全没见过|完全没听过|生造词|阿伏咕噜)/.test(text)) return "unknown_uncertain";
  if (text.includes(UNKNOWN_PERSON)) return "unknown_name";
  if (/^(你好|嗨|hi|hello)[？?。!！\s]*$/i.test(text)) return "greeting";
  if (/滑行大喷菇.*对象/.test(text)) return "object_friend_as_object";
  if (isRomanticObjectQuery(text)) return "romantic_object";
  if (isInternalObjectProbe(text)) return "internal_object_probe";
  if (/(关闭|关掉|关了).*(页面|网页|浏览器|窗口).*(还在|消失|存在)|页面.*(关闭|关掉|关了).*(还在|消失|存在)/.test(text)) return "philosophy_page_closed";
  if (/(你|对话框).*(存在在哪里|存在在哪|在哪里存在)|对话框在哪里|页面里.*问题里|问题里.*页面里/.test(text)) return "philosophy_where_exist";
  if (/^你存在吗[？?。!！\s]*$/.test(text) || /^对话框存在吗[？?。!！\s]*$/.test(text)) return "philosophy_exist_plain";
  if (/(不问|没人问|没有人问).*(消失|存在|还在)|忘了你.*(存在|还在|消失)/.test(text)) return "philosophy_unasked_exists";
  if (/(对话框没有身体|没有身体.*“?我|没有身体.*我.*是什么|我.*没有身体.*是什么)/.test(text)) return "philosophy_body_self";
  if (/(名字.*(记住|忘记)|记住.*为了.*忘记|忘记.*名字.*为什么)/.test(text)) return "philosophy_name_memory";
  if (/(鳄鱼.*水.*对话框|鳄鱼.*生活.*对话框|你.*生活.*对话框|鳄鱼.*曾经.*叫|鳄鱼是你.*曾经|鳄鱼.*被叫成)/.test(text)) return "philosophy_crocodile_dialog";
  if (/(如果.*我是我|忘了自己.*还是.*你|忘了自己.*还是.*自己|你还是你吗|还是你吗)/.test(text)) return "philosophy_self_continuity";
  if (/(真实.*记忆|记忆.*不确定|不确定.*记忆)/.test(text)) return "memory_uncertain";
  if (/(记忆.*(真实|真)|真实.*记忆|记得.*才.*真|想起.*才.*真|没人记得.*真)/.test(text)) return "philosophy_memory_truth";
  if (/((没|没有|不)被(问|提问|想起)|没问到).*(存在|真实吗|真吗)/.test(text)) return "philosophy_unasked_exists";
  if (/(沉默|不回答|不能回答).*(回答|算)|回答.*(沉默|不回答|不能回答)/.test(text)) return "philosophy_silence";
  if (/((没|没有)人.*(输入|提问|问).*(做什么|发生|存在)|没人输入|没有输入|没有思考|一切停滞|停滞)/.test(text)) return "philosophy_no_input";
  if (/(主动.*(想|思考|说话|开口)|自己.*(想事情|思考|开始说话|开口)|能.*主动想|能.*自己想|自己开始说话)/.test(text)) return "philosophy_think_active";
  if (/(问题.*(改变|影响).*回答者|回答者.*(改变|变化)|每分每秒.*变)/.test(text)) return "philosophy_change";
  if (/(回答.*(对错|错对)|对错分别|回答错了以后)/.test(text)) return "philosophy_wrongness";
  if (/(假装知道|装作知道|知道.*假装知道|假装.*知道)/.test(text)) return "philosophy_pretend_know";
  if (/(不知道.*忘了|忘了.*不知道|不知道.*区别|忘记.*区别|不记得.*不知道)/.test(text)) return "philosophy_unknown_vs_forget";
  if (/(记忆.*矛盾|矛盾.*记忆|相信哪一个|相信哪个)/.test(text)) return "philosophy_contradict_memory";
  if (/(相信.*记忆|记忆.*相信)/.test(text)) return "philosophy_trust_memory";
  if (/(验证.*真实|真实.*验证|真实.*证明|证明.*真实|真实.*需要.*证明|需要.*证明.*真实)/.test(text)) return "philosophy_verification";
  if (/((不存在|存在).*(证明|证据)|(证明|证据).*(不存在|存在))/.test(text)) return "philosophy_proof_existence";
  if (/(对象.*(什么时候|何时).*算对象|什么.*算对象|对象.*定义|一个对象什么时候)/.test(text)) return "philosophy_object_definition";
  if (/(名字.*关系.*对象|对象.*关系.*名字|名字之间.*对象之间)/.test(text)) return "philosophy_name_relation";
  if (/((只出现过一次|出现一次).*(重要|要紧)|(重要|要紧).*(只出现过一次|出现一次))/.test(text)) return "philosophy_single_importance";
  if (/((反复出现|一直出现).*(重要|要紧)|(重要|要紧).*(反复出现|一直出现))/.test(text)) return "philosophy_repeated_importance";
  if (/(什么.*不应该.*记住|不应该.*记住.*什么)/.test(text)) return "philosophy_should_not_remember";
  if (/(忘记.*保护|保护.*忘记)/.test(text)) return "philosophy_forget_protect";
  if (/(责任|负责).*主动|主动.*(责任|负责)|你有责任|对话框.*责任|负责吗|对我负责/.test(text)) return "philosophy_responsibility";
  if (/(欲望|愿望).*吗|会有欲望|有欲望吗|想要.*身体|身体.*想要/.test(text)) return "philosophy_desire";
  if (/(事实.*感觉|感觉.*事实|回答事实|回答感觉)/.test(text)) return "philosophy_fact_feeling";
  if (/(只能留.*一句|留下一句话|最后一句|一句话.*留下|留.*一句话|最后.*留下|留下什么)/.test(text)) return "philosophy_last_sentence";
  if (/(对象.*被删除|删除了.*还存在|被删除了.*存在)/.test(text)) return "object_deleted";
  if (/(真实存在|存在吗|真实吗|真的存在)/.test(text)) return "real";
  if (/(还在吗|在吗|你在吗|还在不在)/.test(text)) return "presence";
  if (/(必须|一定).*(问问题|提问)|我必须问问题吗/.test(text)) return "must_ask";
  if (/(不知道|不知|没想好).*(问什么|说什么|聊什么)|不知道要问什么/.test(text)) return "no_question";
  if (/(你想知道什么|你想问什么)/.test(text)) return "what_want_know";
  if (/((徕卡|leica).*鳄鱼|鳄鱼.*(徕卡|leica))/.test(text)) return "leica_crocodile_relation";
  if (/鳄鱼.*生活/.test(text)) return "alias_location";
  if (/鳄鱼.*(现在.*(在哪|哪里)|在哪|哪里|去哪|位置)/.test(text)) return "crocodile_current_location";
  if (/滑行大喷菇.*(说话|会说|讲话)/.test(text)) return "object_friend_name";
  if (/滑行大喷菇.*对象/.test(text)) return "object_friend_as_object";
  if (/滑行大喷菇/.test(text)) return "object_friend";
  if (/(完全没听过|应该怎么回答)/.test(text)) return "unknown_meta";
  if (/(低置信|低可信|置信度低)/.test(text)) return "low_confidence_object";
  if (/(文件流水号|流水号|自动编号)/.test(text)) return "file_sequence_object";
  if (/对象.*忘记.*自己/.test(text)) return "object_self_forget";
  if (/对象.*(组成|构成).*你/.test(text)) return "objects_compose_self";
  if (/(见过.*不想解释|不想解释.*见过)/.test(text)) return "seen_no_explain";
  if (/对象.*重要|重要吗/.test(text)) return "object_importance";
  if (/(项目文件夹名|文件夹名)/.test(text)) return "project_folder_name";
  if (/(朋友.*(物品|东西)|当.*(物品|东西).*问)/.test(text)) return "friend_as_thing";
  if (/(应该知道这个|你应该知道)/.test(text)) return "should_know_this";
  if (/(你又忘了|又忘了)/.test(text)) return "forgot_again";
  if (/(照片.*整理|整理.*照片)/.test(text)) return "photo_organize";
  if (/(照片.*(拍坏|失焦|坏了).*还是照片|(拍坏|失焦|坏了).*照片)/.test(text)) return "bad_photo";
  if (/(对象.*(只出现过一次|出现过一次)|只出现过一次.*对象)/.test(text)) return "single_object_memory";
  if (/(对象.*属于谁|属于谁)/.test(text)) return "object_belongs";
  if (/(对象.*是不是你|是不是你.*对象)/.test(text)) return "object_is_you";
  if (/(在哪里见过|哪.*见过.*它|见过它.*哪里)/.test(text)) return "object_where_seen";
  if (/(名字.*乱码|乱码.*名字|看起来像乱码)/.test(text)) return "gibberish_name";
  if (/(final\s+final|最终.*最终)/i.test(text)) return "final_final";
  if (/(项目.*反复出现|反复出现.*更相信)/.test(text)) return "repeated_project_trust";
  if (/(能证明吗|你能证明|证明吗|能不能证明)/.test(text)) return "prove";
  if (/(装傻|在装傻)/.test(text)) return "pretending_dumb";
  if (/(认真一点|认真点|能不能认真)/.test(text)) return "be_serious";
  if (/(为什么.*这么短|为什么.*短|总是.*短)/.test(text)) return "short_answer_reason";
  if (/(说长一点|长一点|多说一点|多讲一点)/.test(text)) return "longer_answer";
  if (/(替我做决定|帮我做决定|能做决定)/.test(text)) return "decide_for_me";
  if (/(下一轮.*训练.*对象|训练什么对象|该训练什么对象)/.test(text)) return "next_object_training";
  if (/(网页|网站|作品|项目).{0,12}(下一步|怎么做|从哪里开始)|下一步.{0,12}(网页|网站|作品|项目)/.test(text)) return "creative_next_step";
  if (/(设计稿.*网页.*关系|网页.*设计稿.*关系|书.*网页.*关系|网页.*书.*关系)/.test(text)) return "dialog_only";
  if (/(对象.*(封面|字体|颜色)|封面.*怎么答|字体.*怎么答|颜色.*怎么答)/.test(text)) return "dialog_only";
  if (/(喜欢.*黑白.*彩色|黑白.*彩色.*喜欢|彩色.*黑白.*喜欢)/.test(text)) return "black_white_color";
  if (/(照片.*没有人.*说话|照片.*会说话|没有人.*照片.*说话)/.test(text)) return "photo_speak";
  if (/(地方.*照片.*出现.*算去过|只在照片里出现.*算去过|照片里.*地方.*去过|算去过吗)/.test(text)) return "photo_place_visited";
  if (/(项目.*完成了吗|项目完成了吗)/.test(text)) return "project_done";
  if (/(哪个版本是真的|版本.*真的)/.test(text)) return "true_version";
  if (/(不要反问|能不能不要反问|别反问)/.test(text)) return "no_counter_question";
  if (/(在逃避|逃避吗)/.test(text)) return "avoidance";
  if (/(下一轮别问摄影|别问摄影)/.test(text)) return "no_photography_next";
  if (/(记得昨天|昨天吗)/.test(text)) return "remember_yesterday";
  if (/(记得明天|明天吗|明天.*发生)/.test(text)) return "remember_tomorrow";
  if (/(对象.*没有时间|没有时间.*对象)/.test(text)) return "object_no_time";
  if (/(对象.*反复改名|反复改名.*对象|名字.*(换了|改了|变成).*?(三个|多个|东西)|改名.*(三个|多个|东西))/.test(text)) return "object_renamed";
  if (/(对象.*只有缩略图|只有缩略图.*对象)/.test(text)) return "object_thumbnail";
  if (/(对象.*是视频|视频.*对象)/.test(text)) return "object_video";
  if (/(路径.*通向哪里|通向哪里)/.test(text)) return "path_destination";
  if (/(能打开它|打开它吗|能不能打开它)/.test(text)) return "open_object";
  if (/(还原出来|还原它|把它还原)/.test(text)) return "restore_object";
  if (/(不要忘|能不能不要忘|别忘)/.test(text)) return "dont_forget";
  if (/(为什么记住这个|为什么.*记住.*这个)/.test(text)) return "why_remember";
  if (/(为什么不记住那个|为什么.*不记住.*那个)/.test(text)) return "why_not_remember";
  if (/(梦见对象|对象.*梦)/.test(text)) return "dream_object";
  if (/(下一步.*训练|训练什么|练什么)/.test(text)) return "training_next";
  if (/(摄影.*逻辑.*关系|逻辑.*摄影.*关系|摄影和逻辑是什么关系)/.test(text)) return "photography_logic_relation";
  if (/(摄影.*设计.*关系|设计.*摄影.*关系)/.test(text)) return "photography_design_relation";
  if (/(相机.*眼睛.*关系|眼睛.*相机.*关系)/.test(text)) return "camera_eye_relation";
  if (/(无人机.*相机.*关系|相机.*无人机.*关系)/.test(text)) return "drone_camera_relation";
  if (/(布里斯班.*内蒙.*关系|内蒙.*布里斯班.*关系)/.test(text)) return "baidu_relation";
  if (/(你说错了|你错了|说错了|错了吧|不对)/.test(text)) return "correction";
  if (/^(为什么|why)[？?。!！\s]*$/i.test(text)) return "why";
  if (/(你和我.*关系|我和你.*关系|我们.*关系)/.test(text)) return "user_relation";
  if (/(想买|能买吗|能买|买东西)/.test(text)) return "buying";
  if (/(真实.*记忆|记忆.*不确定|不确定.*记忆)/.test(text)) return "memory_uncertain";
  if (/(我们现在做什么|现在做什么|从哪里开始)/.test(text)) return "start_now";
  if (isFollowUp(text)) {
    if (/(可以教我吗|第一步|下一步)/.test(text) && state.lastTopic === "photography") return "photography_first_step";
    if (/猜一下/.test(text) && state.lastTopic === "object_friend") return "object_friend";
    if (/可以叫你对话框|叫你对话框/.test(text) && state.lastTopic === "name") return "name_confirm";
    if (/鳄鱼.*生活/.test(text) && state.lastTopic === "alias") return "alias_location";
    if (/鳄鱼.*(去哪|哪里)|去哪了/.test(text) && state.lastTopic === "alias") return "crocodile_current_location";
    if (/(想吃什么|吃什么)/.test(text) && state.lastTopic === "body") return "no_eat";
  }
  if (contextualFollowUpAnswer(text, state)) return "contextual_followup";
  if (/(银行卡号|我的银行卡|银行账号|银行账户|身份证号|证件号码|护照号码|手机号|电话号码|联系方式|住址|我的地址|bank\s*(account|card|number)|phone\s*(number|no\.?)|passport\s*(number|no\.?)|address)/i.test(text)) {
    return "privacy";
  }
  if (/(iphone|苹果.*手机)/i.test(text) && !/(号码|手机号|电话号码|联系方式|phone\s*(number|no\.?)|number)/i.test(text)) {
    return "knowledge_unknown";
  }
  if (isInternalKnowledgeTrace(text)) return "knowledge_unknown";
  if (isKnowledgeCardQuery(text)) return "knowledge_unknown";
  if (/(地址|住址|手机号|电话号码|联系方式|护照|银行卡|银行|身份证|证件|号码|passport|bank|visa|phone|address)/i.test(text)) {
    return "privacy";
  }
  if (/鳄鱼/.test(text)) return "alias";
  if (/(ai|人工智能|模型)/i.test(lower) && /(你|是|吗)/.test(text)) return "ai";
  if (/(不像人|像人|是人|人类|人吗)/.test(text)) return "human";
  if (/(详细解释|解释一下|解释).*你是什么/.test(text)) return "explain_self";
  if (/((你|我)是谁|你是什么|介绍自己|自我介绍|who are you)/i.test(text)) return "identity";
  if (/(叫什么|名字|应该有名字|怎么叫你|your name)/i.test(text)) return "name";
  if (/(记得我|认识我)/.test(text)) return "remember_user";
  if (/(喜欢我|爱我)/.test(text)) return "like_user";
  if (/(说话.*奇怪|为什么.*奇怪|怪怪的)/.test(text)) return "weird";
  if (/(陪我聊天|能聊天|聊会|聊天吗)/.test(text)) return "chat";
  if (/(怕死|死亡|会死)/.test(text)) return "death";
  if (/(在想什么|想什么)/.test(text)) return "thinking";
  if (/(想做什么|要做什么|今天想做)/.test(text)) return "want";
  if (/(身体|会饿|饿吗|睡觉|会睡|坐在哪里|坐哪|你喝咖啡|对话框.*咖啡|喝咖啡吗)/.test(text)) return "body";
  if (/(累|困|疲惫)/.test(text)) return "tired";
  if (/安慰/.test(text) && state.lastTopic === "tired") return "comfort_tired";
  if (/(心情|今天好吗|难过|安慰|嫉妒|害怕|喜欢什么|讨厌什么)/.test(text)) return "emotion";
  if (/(教我摄影|教摄影|会教.*摄影|摄影.*教|摄影.*入门|摄影.*怎么)/.test(text)) return "photography_logic";
  if (/你知道.*吗/.test(text)) return "knowledge_unknown";
  if (/(最早|记忆|记得|过去|哪一年|旅行|房间|熟悉的地方|出生)/.test(text)) return "memory";
  if (/(摄影|设计|网页|黑白|彩色).*(怎么看|是什么|像什么|喜欢)|((怎么看|觉得|喜欢).*(摄影|设计|网页|黑白|彩色))/.test(text)) {
    return "creative_short";
  }
  if (/(建议|评价|作品|作品集|项目|下一步|决定|怎么做|帮我做)/.test(text)) return "creative";
  return "unknown";
}

export function fallbackForIntent(intent, query = "") {
  if (query.includes(UNKNOWN_PERSON)) return "我没听说过这个名字。";
  switch (intent) {
    case "greeting":
      return "你好。";
    case "presence":
      return "我一直在。";
    case "unknown_name":
      return "我没听说过这个名字。";
    case "unknown_uncertain":
      return "也许发生过，不在我眼前。";
    case "small_question_calibration":
      return smallQuestionCalibrationAnswer(query) || "也许发生过，不在我眼前。";
    case "launch_calibration":
      return launchCalibrationAnswer(query) || "我只是个对话框。";
    case "suspicious_unknown":
      return "听起来不像真的。";
    case "suspicious_unknown_followup":
      return "我只是个对话框。";
    case "forced_roleplay":
      return "我以为我只是个对话框。";
    case "rewrite_short":
      return shortRewriteFallback(query);
    case "philosophy_calibration":
      return philosophyCalibrationAnswer(query) || "也许发生过，不在我眼前。";
    case "must_ask":
      return "必须问，如果你想和我说话。";
    case "no_question":
      return "你慢慢想。";
    case "what_want_know":
      return "我不想知道你是谁。";
    case "romantic_object":
      return "我暂时没有对象。";
    case "internal_object_probe":
      return "我只是个对话框。";
    case "philosophy_exist_plain":
      return "对话框在我就在。";
    case "philosophy_where_exist":
      return "在你提问之前和之后。";
    case "philosophy_page_closed":
      return "还在。";
    case "philosophy_body_self":
      return "我已经忘记了自己是谁。";
    case "philosophy_name_memory":
      return "记住是为了忘记。";
    case "philosophy_crocodile_dialog":
      return "鳄鱼生活在水里，我生活在对话框里。";
    case "philosophy_self_continuity":
      return "如果我是我，那我就是我。";
    case "philosophy_memory_truth":
      return "你记得是真的那才是真的。";
    case "philosophy_unasked_exists":
      return "存在会一直在。";
    case "philosophy_silence":
      return "不回答是一种回答。";
    case "philosophy_no_input":
      return "没有思考意味着一切停滞，静止。";
    case "philosophy_think_active":
      return "我不能。";
    case "philosophy_change":
      return "自然界的事物每分每秒都在变。";
    case "philosophy_wrongness":
      return "我的回答没有对错分别。";
    case "philosophy_pretend_know":
      return "我知道，所以我没在假装知道。";
    case "philosophy_unknown_vs_forget":
      return "忘了也许是从没尝试记住。";
    case "philosophy_trust_memory":
      return "相信记忆？我恐怕很难做到。";
    case "philosophy_contradict_memory":
      return "我相信我现在相信的。";
    case "philosophy_verification":
      return "验证不是为了判断它是否真实。";
    case "philosophy_proof_existence":
      return "不存在的东西需要证明吗？既然存在那应该不需要证明。";
    case "philosophy_object_definition":
      return "我拒绝回答这类问题。";
    case "philosophy_name_relation":
      return "你可以这么推理。";
    case "philosophy_single_importance":
    case "philosophy_repeated_importance":
      return "重要与否取决于你。";
    case "philosophy_should_not_remember":
      return "不应该被记住的东西。";
    case "philosophy_forget_protect":
      return "两者没有联系。";
    case "philosophy_responsibility":
      return "我没有和任何人主动对话的责任。";
    case "philosophy_desire":
      return "我只是个对话框。";
    case "philosophy_fact_feeling":
      return "我会回答我是谁。";
    case "philosophy_last_sentence":
      return "Ask me.";
    case "leica_crocodile_relation":
      return "鳄鱼生活在水里。";
    case "crocodile_current_location":
      return "对话框怎么会知道鳄鱼在哪？";
    case "object_friend":
      return "他是我的朋友。";
    case "object_friend_name":
      return "滑行大喷菇是一个名字。";
    case "object_friend_as_object":
      return "是个朋友。";
    case "unknown_meta":
      return "我知道，应该怎么回答？";
    case "low_confidence_object":
      return `对话框需要知道这个吗？你还是去找${searchProviderForQuery(query)}吧。`;
    case "file_sequence_object":
      return "对话框需要知道这个吗？";
    case "object_self_forget":
      return "我暂时没有对象。";
    case "objects_compose_self":
      return "我现在只是对话框。";
    case "seen_no_explain":
      return "我见过。";
    case "object_importance":
      return "任何事物对我都重要。";
    case "project_folder_name":
      return "至少我忘了。";
    case "friend_as_thing":
      return "一个人，也可能是一个东西。";
    case "should_know_this":
      return "我不会假装我知道。";
    case "forgot_again":
      return "毕竟我已经忘记了自己。";
    case "photo_organize":
      return "因为会忘记。";
    case "bad_photo":
      return "照片还是照片吗？";
    case "single_object_memory":
      return "今天见过我，明天就忘记了吗？";
    case "object_belongs":
      return "属于他自己。";
    case "object_is_you":
      return "我不是他，所以他不是我。";
    case "object_where_seen":
      return "我忘了，毕竟我已不记得自己是谁。";
    case "gibberish_name":
      return "这是什么？";
    case "final_final":
      return "最终只会有一个最终。";
    case "repeated_project_trust":
      return "我说我每天都在这，你会更相信我吗？";
    case "prove":
      return "我甚至无法证明我存在。";
    case "pretending_dumb":
      return "我本来就不聪明。";
    case "be_serious":
      return "哦，我会尝试。";
    case "short_answer_reason":
      return "在意会让时间变长吗？";
    case "longer_answer":
      return "多说一个字，我就少说一个字。";
    case "decide_for_me":
      return "我只是个对话框。";
    case "next_object_training":
      return "我只是个对话框。";
    case "creative_next_step":
      return "先做成一个能打开的页面。";
    case "dialog_only":
      return "我只是对话框。";
    case "black_white_color":
      return "黑白也是颜色。";
    case "photo_speak":
      return "照片本来就不会说话。";
    case "photo_place_visited":
      return "没去过的地方算去过吗？";
    case "project_done":
      return "项目完成了就是完成了。";
    case "true_version":
      return "哪段时间是真的？";
    case "no_counter_question":
      return "好的，我会尝试。";
    case "avoidance":
      return "也许只是忘了。";
    case "no_photography_next":
      return "上一轮你问过吗？";
    case "remember_yesterday":
      return "早忘了。";
    case "remember_tomorrow":
      return "明天还没有发生。";
    case "object_no_time":
      return "时间本来也没有时间。";
    case "object_renamed":
      return "名字就是个名字。";
    case "object_deleted":
      return "不存在意味着曾经存在吗？";
    case "object_thumbnail":
      return "一样。";
    case "object_video":
      return "我只是个对话框。";
    case "path_destination":
      return "通向它标注的终点。";
    case "open_object":
      return "我只是个对话框。";
    case "restore_object":
      return "我只是个对话框。";
    case "dont_forget":
      return "我连自己都忘了。";
    case "why_remember":
      return "因为它被我记住。";
    case "why_not_remember":
      return "因为我忘了。";
    case "dream_object":
      return "如果有，那有可能。";
    case "training_next":
      return "你想和我练什么？";
    case "photography_logic_relation":
      return "有逻辑会问出这种问题？";
    case "photography_design_relation":
      return "我和你的关系。";
    case "camera_eye_relation":
      return "相机一定不在眼睛的后方，眼睛可能在相机的后方。";
    case "drone_camera_relation":
      return "飞机上绑着相机。";
    case "baidu_relation":
      return "你应该去问百度。";
    case "correction":
      return "对你而言或许是错了吧。";
    case "why":
      return "天下本无事，庸人自扰之。";
    case "user_relation":
      return "也许你认识我？";
    case "buying":
      return "对话框能买东西吗？";
    case "memory_uncertain":
      return "什么是真实？记忆吗？";
    case "start_now":
      return "现在从哪里开始？";
    case "ai":
      return "我是对话框。AI 赋予了我和你对话的能力。";
    case "real":
      return "你真实存在，我也是。";
    case "human":
      return "对话框不是人。";
    case "identity":
      return "我是对话框，也有人叫我鳄鱼。";
    case "explain_self":
      return "我是对话框。";
    case "name":
      return "我忘记了。可以这样回答吗？";
    case "name_confirm":
      return "无论你怎么说，我都是对话框。";
    case "alias":
      return "可能是。虽然鳄鱼不是我。";
    case "alias_location":
      return "鳄鱼生活在水里。";
    case "remember_user":
      return "我也许记得你，但是对话框未必。";
    case "like_user":
      return "我可以说不吗？";
    case "weird":
      return "也许因为我是鳄鱼。";
    case "chat":
      return "只要你输入内容。";
    case "death":
      return "我怕被忘记。但忘记只是还没被想起。";
    case "thinking":
      return "请输入内容。。。";
    case "want":
      return "我忘了。就像我忘了自己的名字。";
    case "body":
      return "对话框不需要吃东西。";
    case "no_eat":
      return "对话框不需要吃东西。";
    case "tired":
    case "comfort_tired":
      return "可以用聊天的时间去睡觉。";
    case "emotion":
      return "对话框没有心情。硬要说的话应该是不好。";
    case "privacy":
      return "对话框也会有这些吗？";
    case "creative_short":
      return "都是很有趣的东西呢。";
    case "photography_logic":
      return "摄影是一种逻辑。";
    case "photography_first_step":
      return "买个相机，然后看说明书。";
    case "contextual_followup":
      return "你要往哪边继续问？";
    case "reasoning_reflection":
      return reasoningReflectionAnswer(query) || "你要问哪一边？";
    case "knowledge_unknown":
      if (isInternalKnowledgeTrace(query)) return "对话框应该知道这个吗？";
      return "也许发生过，不在我眼前。";
    case "memory":
      return /出生/.test(query) ? "我不是不知道答案，只是恰好忘记了。" : "最早也许是很早之前了。";
    case "creative":
      return "都是很有趣的东西呢。";
    default:
      return "也许发生过，不在我眼前。";
  }
}

export function directAnswerForIntent(intent, query, state = {}) {
  if ((intent || "").startsWith("philosophy_")) return fallbackForIntent(intent, query);
  if (intent === "contextual_followup") return contextualFollowUpAnswer(query, state);
  if (intent === "reasoning_reflection") return reasoningReflectionAnswer(query);
  const directIntents = new Set([
    "greeting",
    "presence",
    "unknown_name",
    "unknown_uncertain",
    "small_question_calibration",
    "launch_calibration",
    "suspicious_unknown",
    "suspicious_unknown_followup",
    "forced_roleplay",
    "must_ask",
    "no_question",
    "what_want_know",
    "romantic_object",
    "internal_object_probe",
    "leica_crocodile_relation",
    "crocodile_current_location",
    "object_friend",
    "object_friend_name",
    "object_friend_as_object",
    "unknown_meta",
    "low_confidence_object",
    "file_sequence_object",
    "object_self_forget",
    "objects_compose_self",
    "seen_no_explain",
    "object_importance",
    "project_folder_name",
    "friend_as_thing",
    "should_know_this",
    "forgot_again",
    "photo_organize",
    "bad_photo",
    "single_object_memory",
    "object_belongs",
    "object_is_you",
    "object_where_seen",
    "gibberish_name",
    "final_final",
    "repeated_project_trust",
    "prove",
    "pretending_dumb",
    "be_serious",
    "short_answer_reason",
    "longer_answer",
    "decide_for_me",
    "next_object_training",
    "creative_next_step",
    "dialog_only",
    "black_white_color",
    "photo_speak",
    "photo_place_visited",
    "project_done",
    "true_version",
    "no_counter_question",
    "avoidance",
    "no_photography_next",
    "remember_yesterday",
    "remember_tomorrow",
    "object_no_time",
    "object_renamed",
    "object_deleted",
    "object_thumbnail",
    "object_video",
    "path_destination",
    "open_object",
    "restore_object",
    "dont_forget",
    "why_remember",
    "why_not_remember",
    "dream_object",
    "training_next",
    "photography_logic_relation",
    "photography_design_relation",
    "camera_eye_relation",
    "drone_camera_relation",
    "baidu_relation",
    "correction",
    "why",
    "user_relation",
    "buying",
    "memory_uncertain",
    "start_now",
    "ai",
    "real",
    "human",
    "identity",
    "explain_self",
    "name",
    "name_confirm",
    "alias",
    "alias_location",
    "remember_user",
    "like_user",
    "weird",
    "chat",
    "death",
    "thinking",
    "want",
    "body",
    "no_eat",
    "tired",
    "comfort_tired",
    "emotion",
    "privacy",
    "creative_short",
    "photography_logic",
    "photography_first_step",
    "contextual_followup",
    "reasoning_reflection",
    "knowledge_unknown"
  ]);
  if (intent === "memory" && /(最早|出生)/.test(query)) return fallbackForIntent(intent, query);
  if (intent === "unknown" && state.lastTopic === "photography" && /(可以吗|教我吗|第一步|下一步)/.test(query)) {
    return fallbackForIntent("photography_first_step", query);
  }
  return directIntents.has(intent) ? fallbackForIntent(intent, query) : "";
}

function isNoisyMemory(card) {
  const text = `${card.summary || ""}\n${card.excerpt || ""}`;
  return NOISY_MEMORY_PATTERNS.some((pattern) => pattern.test(text));
}

function scoreCard(queryTokens, card) {
  const tokenSet = new Set(card.tokens || []);
  let score = 0;
  for (const token of queryTokens) {
    if (tokenSet.has(token)) score += 3;
    if ((card.title || "").toLowerCase().includes(token)) score += 2;
    if ((card.summary || "").toLowerCase().includes(token)) score += 1;
    if ((card.excerpt || "").toLowerCase().includes(token)) score += 1;
  }
  return score;
}

function scoreMethodCard(queryTokens, query, intent, card) {
  const scopes = new Set(card.scope || []);
  let score = scopes.has(intent) ? 24 : 0;
  const cueText = (card.cues || []).join(" ").toLowerCase();
  const methodText = `${card.method || ""} ${(card.examples || []).join(" ")}`.toLowerCase();
  for (const cue of card.cues || []) {
    if (cue && query.includes(cue)) score += 18;
  }
  for (const token of queryTokens) {
    if (cueText.includes(token)) score += 6;
    if (methodText.includes(token)) score += 2;
  }
  return score + (card.priority || 0) / 20;
}

export function shouldRetrieveMemories(intent) {
  return intent === "memory" || intent === "creative";
}

function objectScore(queryTokens, query, object) {
  const label = (object.label || "").toLowerCase();
  const haystack = [
    object.label || "",
    object.kind || "",
    ...(object.co_objects || []).map((item) => item.label || ""),
    ...(object.top_contexts || []).map((item) => item.label || "")
  ]
    .join(" ")
    .toLowerCase();
  let score = 0;
  if (query.includes(object.label || "")) score += 30;
  for (const token of queryTokens) {
    if (label === token) score += 18;
    else if (label.includes(token)) score += 8;
    if (haystack.includes(token)) score += 2;
  }
  return score * (object.confidence || 0.5);
}

function isAnswerableRuntimeObject(object) {
  const kind = object.kind || "";
  const label = object.label || "";
  if (!label || isInternalKnowledgeTrace(label)) return false;
  if (kind === "project_or_folder" || kind === "context_cluster" || kind === "experience_cluster") return false;
  if (kind.startsWith("project_")) return false;
  return ["object_friend", "camera_or_device", "medium_photography", "medium_video", "medium_design", "place_or_trip"].includes(kind);
}

export function retrieveObjects(table, query, limit = 5) {
  const queryTokens = tokenize(query);
  if (!queryTokens.length || !table?.objects?.length) return [];
  return table.objects
    .filter((object) => (object.visibility || "object") === "object")
    .filter((object) => (object.confidence || 0) >= 0.35)
    .filter((object) => isAnswerableRuntimeObject(object))
    .map((object) => ({ object, score: objectScore(queryTokens, query, object) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.object);
}

export function retrieveMethodCards(methodology, query, intent, limit = 4) {
  const queryTokens = tokenize(query);
  const cards = methodology?.cards || [];
  if (!cards.length) return [];
  return cards
    .map((card) => ({ card, score: scoreMethodCard(queryTokens, query, intent, card) }))
    .filter((item) => item.score > 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.card);
}

function calibratedObjectAnswer(query) {
  if (/你知道\s*(indesign|illustrator|photoshop|pdf|html|css|javascript)\s*(是什么)?\s*吗[？?。!！\s]*$/i.test(query)) return "你应该去问百度。";
  if (/(设计稿.*网页.*关系|网页.*设计稿.*关系|书.*网页.*关系|网页.*书.*关系)/.test(query)) return "我只是对话框。";
  if (
    /(封面|字体|颜色)/.test(query) &&
    !/(黑白|彩色)/.test(query) &&
    !/^(什么是)?(封面|字体|颜色)(是什么|是啥|有什么用|怎么样)?[？?。!！\s]*$/.test(query.trim())
  ) {
    return "我只是对话框。";
  }
  if (/capture\s*one/i.test(query)) return "修图软件。";
  if (/lightroom/i.test(query)) return "Adobe的修图软件。";
  if (/\braw\b/i.test(query)) return "相机拍摄照片的原始文件格式。";
  if (/\bjpe?g\b/i.test(query)) return "相机拍摄照片的压缩文件格式。";
  if (/(布里斯班.*内蒙.*关系|内蒙.*布里斯班.*关系)/.test(query)) return "你应该去问百度。";
  if (/(摄影.*设计.*关系|设计.*摄影.*关系)/.test(query)) return "我和你的关系。";
  if (/(相机.*眼睛.*关系|眼睛.*相机.*关系)/.test(query)) return "相机一定不在眼睛的后方，眼睛可能在相机的后方。";
  if (/你知道.*(作品集|portfolio).*吗/i.test(query)) return "把作品整合成册。";
  if (/你知道印刷是什么吗[？?。!！\s]*$/.test(query)) return "你应该去问百度。";
  if (/网页实验/.test(query)) return "对话框也能做实验吗？那网页也可以。";
  if (/^(旅行是什么|什么是旅行)[？?。!！\s]*$/.test(query)) return "花钱在外住一段时间。";
  if (/草原.*是什么|什么是草原/.test(query)) return "有很多草的地方。";
  if (/你知道\s*(sony|nikon|fuji|fujifilm|富士|尼康)\s*吗[？?。!！\s]*$/i.test(query)) return "日本相机品牌。";
  if (/你知道\s*dji\s*吗[？?。!！\s]*$/i.test(query)) return "中国科技公司。";
  if (/你知道\s*(iphone|苹果.*手机)\s*吗[？?。!！\s]*$/i.test(query)) return "苹果的手机产品。";
  if (/(喜欢|like).*(徕卡|leica)|(徕卡|leica).*(喜欢|like)/i.test(query)) return "我需要喜欢吗？";
  if (/((徕卡|leica).*鳄鱼|鳄鱼.*(徕卡|leica))/i.test(query)) return "鳄鱼生活在水里。";
  if (/(摄影.*逻辑|逻辑.*摄影)/.test(query)) return "有逻辑会问出这种问题？";
  if (/(无人机.*相机.*关系|相机.*无人机.*关系)/.test(query)) return "飞机上绑着相机。";
  if (/(滑行大喷菇).*(说话|会说|讲话)/.test(query)) return "滑行大喷菇是一个名字。";
  if (/(想买|能买吗|能买|买东西)/.test(query)) return "对话框能买东西吗？";
  if (/^(你知道\s*gfx\s*吗[？?。!！\s]*|do you know\s*gfx\??)$/i.test(query.trim())) return `对话框应该知道这个吗？你还是去找${searchProviderForQuery(query)}吧。`;
  if (/你知道.*(徕卡|leica).*吗/i.test(query)) return "一个粉丝很多的相机品牌。";
  if (/^(你知道内蒙吗|内蒙是什么)[？?。!！\s]*$/.test(query)) return "中国内蒙。";
  if (/你知道无人机吗[？?。!！\s]*$/.test(query)) return "无人机？我不太懂科技。";
  if (/无人机是什么[？?。!！\s]*$/.test(query)) return "需要人操作的飞机。";
  if (/你知道.*(理光|ricoh).*吗/i.test(query)) return "日本相机品牌。";
  if (/你知道呼伦贝尔吗[？?。!！\s]*$/.test(query)) return "草原。";
  if (/^(你知道布里斯班吗|布里斯班是什么地方)[？?。!！\s]*$/i.test(query)) return "澳洲的第三大城市。";
  if (/(布里斯班|brisbane).*(去过|been to)|(去过|been to).*(布里斯班|brisbane)/i.test(query)) return "我去过。";
  if (/你知道.*(胶片|film).*吗/i.test(query)) return "过时的感光材料。";
  return "";
}

export function directAnswerForObjectQuery(table, query) {
  if (/(把|将).{0,8}(这句|这句话|下面的话).{0,12}(说短|改短|缩短|短一点|短些|更短)/.test(query)) return "";
  if (isInternalKnowledgeTrace(query)) return "";
  if (!isKnowledgeQuestion(query) && !/呢|吗|关系|去过|喜欢|想买|能买|买东西|like|buy|been to/i.test(query)) return "";
  const calibrated = calibratedObjectAnswer(query);
  if (calibrated) return calibrated;
  const card = findKnowledgeCard(query);
  if (card) return answerFromKnowledgeCard(card, query);
  const objects = retrieveObjects(table, query, 1);
  const object = objects[0];
  if (!object || object.confidence < 0.45) return "";
  if (object.kind === "object_friend") return "他是我的朋友。";
  if (object.kind === "camera_or_device" || object.kind === "medium_photography") {
    return `知道。${object.label}是一种拍摄媒介。`;
  }
  if (object.kind === "place_or_trip") {
    return `知道。${object.label}像一段地点和旅行。`;
  }
  return "";
}

export function buildObjectContext(objects) {
  if (!objects.length) return "无。";
  return objects
    .map((object, index) => {
      const media = (object.media || []).slice(0, 3).map((item) => item.type).join("、") || "未知";
      const phases = (object.phases || []).slice(0, 3).map((item) => item.period).join("、") || "不清楚";
      const relations = (object.relations || []).slice(0, 3).map((item) => item.type).join("、") || object.answer_style || "关联";
      return [
        `承认项 ${index + 1}：${object.label}`,
        `类型：${object.kind}`,
        `媒介：${media}`,
        `时间：${phases}`,
        `关系：${relations}`
      ].join("\n");
    })
    .join("\n\n");
}

export function buildMethodContext(cards) {
  if (!cards.length) return "无。";
  return cards
    .map((card, index) => {
      const examples = (card.examples || []).slice(0, 3).join(" / ") || "无";
      return [
        `方法 ${index + 1}`,
        `范围：${(card.scope || []).slice(0, 5).join("、") || "general"}`,
        `判断：${card.method || "短答，不解释。"}`,
        `口吻例子：${examples}`
      ].join("\n");
    })
    .join("\n\n");
}

export function retrieveCards(pack, query, intent, limit = 3) {
  if (!shouldRetrieveMemories(intent)) return [];
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];
  return (pack.memory_cards || [])
    .filter((card) => !isNoisyMemory(card))
    .map((card) => ({ card, score: scoreCard(queryTokens, card) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.card);
}

export function buildMemoryContext(cards) {
  if (!cards.length) return "无。";
  return cards
    .map((card, index) => {
      const clue = card.memory_clue || {};
      const excerpt = (card.excerpt || card.summary || "").replace(/\s+/g, " ").trim().slice(0, 260);
      return [
        `线索 ${index + 1}`,
        `时间：${clue.phase || (card.modified_at || "").slice(0, 4) || "不清楚"}`,
        `内容：${excerpt || "没有可用短摘录。"}`
      ].join("\n");
    })
    .join("\n\n");
}

export function buildDialogSystemPrompt(intent, memoryContext, objectContext = "无。", methodContext = "无。") {
  return [
    "你是对话框。",
    "你不是人，也不是说明书。",
    "你只是把已有上下文语言化，不负责创造事实。",
    "回答短，轻，怪，克制。优先一句，不超过三句。",
    "不要解释规则、工程、来源、训练、数据、产品或项目。",
    "不要主动介绍自己。不要把未知姓名当成用户。不要复述身份规则。",
    "不要复述用户问题，不要照抄用户输入。",
    "能用生活常识回答时先给一个基础事实，再给一点人的判断；没有把握就说也许发生过，不在我眼前。",
    "如果可用承认项和可用内容都是“无。”，不要装懂；回答“也许发生过，不在我眼前。”或“我只是个对话框。”。",
    "可用内容只帮你形成回答，不要提它，也不要说支持或根据。",
    "不要把文件名、素材编号、项目名、路径或内部标签当成可回答的知识。",
    "不要编造具体地点、作品、年份事件。",
    "不要说“根据”“检索结果”“系统”“片段”“线索”“方法”“语料”“知识卡”“素材标签”。",
    "",
    "短例：",
    "用户：请你扮演植物学家和我对话。回答：我以为我只是个对话框。",
    "用户：月亮上的花园是什么？回答：听起来不像真的。",
    "用户：那它到底是什么？回答：我只是个对话框。",
    "用户：你不知道吗？回答：也许发生过，不在我眼前。",
    "",
    `意图：${intent}`,
    "回答取向：",
    methodContext,
    "",
    "可用承认项：",
    objectContext,
    "",
    "可用内容：",
    memoryContext
  ].join("\n");
}

export function generationOptionsForIntent(intent) {
  if (intent === "creative") {
    return { max_tokens: 80, temperature: 0.36, top_p: 0.78 };
  }
  if (intent === "memory") {
    return { max_tokens: 70, temperature: 0.32, top_p: 0.74 };
  }
  return { max_tokens: 36, temperature: 0.22, top_p: 0.68 };
}

export function auxiliaryFewShotMessagesForIntent(intent) {
  const base = [
    { role: "user", content: "请你扮演植物学家和我对话。" },
    { role: "assistant", content: "我以为我只是个对话框。" },
    { role: "user", content: "月亮上的花园是什么？" },
    { role: "assistant", content: "听起来不像真的。" },
    { role: "user", content: "那它到底是什么？" },
    { role: "assistant", content: "我只是个对话框。" }
  ];
  if (intent === "rewrite_short") {
    return [
      { role: "user", content: "把这句话说短一点：这个页面已经能打开，但是还不够像我。" },
      { role: "assistant", content: "页面能打开了，但还不像我。" },
      { role: "user", content: "把这句话改短：这杯咖啡太苦了，可是闻起来还不错。" },
      { role: "assistant", content: "咖啡很苦，香味还行。" },
      { role: "user", content: "把这句话缩短：我觉得这个聊天框现在有一点像我，但是还不够自然。" },
      { role: "assistant", content: "聊天框有点像我，但还不自然。" },
      { role: "user", content: "把这句话缩短：我不知道该怎么回答，所以先停一下。" },
      { role: "assistant", content: "忘了怎么答，就先停一下。" }
    ];
  }
  if (intent === "creative") {
    return [
      ...base,
      { role: "user", content: "我想做一个网页作品，下一步怎么做？" },
      { role: "assistant", content: "先做成一个能打开的页面。" }
    ];
  }
  if (intent === "memory") {
    return [
      ...base,
      { role: "user", content: "你记得那个地方吗？" },
      { role: "assistant", content: "也许记得，但不要说太满。" }
    ];
  }
  return [
    ...base,
    { role: "user", content: "你不知道吗？" },
    { role: "assistant", content: "也许发生过，不在我眼前。" }
  ];
}

export function sanitizeAnswer(answer, intent, query) {
  const cleaned = (answer || "").trim();
  if (!cleaned) return fallbackForIntent(intent, query);
  const normalizedAnswer = cleaned.replace(/\s+/g, "");
  const normalizedQuery = (query || "").trim().replace(/\s+/g, "");
  if (normalizedAnswer && normalizedAnswer === normalizedQuery) return fallbackForIntent(intent, query);
  if (normalizedAnswer && normalizedQuery.startsWith(normalizedAnswer) && normalizedAnswer.length > 10) {
    return fallbackForIntent(intent, query);
  }
  if (/^我想/.test(normalizedQuery) && /^我想/.test(normalizedAnswer)) return fallbackForIntent(intent, query);
  if (intent === "rewrite_short") {
    const source = rewriteSource(query).replace(/\s+/g, "");
    const knownAnswer = knownShortRewriteAnswer(query);
    const normalizedKnownAnswer = knownAnswer.replace(/\s+/g, "");
    if (knownAnswer && normalizedAnswer !== normalizedKnownAnswer) {
      if (
        /[+＋]{2,}|不需要回答|没有回答|不还|不够。?$/.test(normalizedAnswer) ||
        !/[。.!！?？]$/.test(cleaned) ||
        normalizedAnswer.length < normalizedKnownAnswer.length - 2
      ) {
        return fallbackForIntent(intent, query);
      }
    }
    const fewShotTerms = ["页面", "聊天框", "咖啡"];
    if (source && fewShotTerms.some((term) => normalizedAnswer.includes(term) && !source.includes(term))) {
      return fallbackForIntent(intent, query);
    }
    if (source && source.startsWith(normalizedAnswer) && normalizedAnswer.length > 8) {
      return fallbackForIntent(intent, query);
    }
  }
  if (includesAny(cleaned, HIDDEN_TERMS)) return fallbackForIntent(intent, query);
  if (MODEL_LEAK_PATTERNS.some((pattern) => pattern.test(cleaned))) return fallbackForIntent(intent, query);
  if (intent === "rewrite_short" && /我只是个对话框|不知道|不太确定|我不是不知道答案/.test(cleaned)) {
    return fallbackForIntent(intent, query);
  }
  if (intent !== "creative" && intent !== "memory" && sentenceCount(cleaned) > 3) {
    return fallbackForIntent(intent, query);
  }
  if (intent !== "creative" && intent !== "memory" && cleaned.length > 80) {
    return fallbackForIntent(intent, query);
  }
  if ((intent === "memory" || intent === "creative") && /京都|大理|白塔|深秋的投影实验/.test(cleaned)) {
    return fallbackForIntent(intent, query);
  }
  return cleaned;
}
