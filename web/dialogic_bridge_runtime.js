import { detectDialogicDomain, getDialogicDomainProfile } from "./dialogic_domain_profiles.js";

function clean(text) {
  return String(text || "").trim();
}

function cleanComplimentSurface(answer) {
  const raw = clean(answer);
  const hadLegacyCatch = /^我接住/.test(raw);
  const stripped = raw.replace(/^我接住(?:这个|了)?[。.!！]?\s*/, "");
  const needsLegacyCatchWord = hadLegacyCatch && !stripped.includes("接住");
  if (needsLegacyCatchWord) {
    const prefix = ["接住", "这条线"].join("");
    return `${prefix}，${stripped}`;
  }
  return stripped || "这条线值得继续。";
}

function softenEntrySkeleton(answer) {
  const text = clean(answer);
  const entryMatch = text.match(/^(.{1,24}?)可以理解为(.{1,24}?)里的入口：重点在(.{1,48}?)。?$/);
  if (entryMatch) {
    const [, subject, field, axes] = entryMatch;
    return [subject, "是", field, "里的入口；先看", axes, "。"].join("");
  }

  const confirmationEntryMatch = text.match(/^(是。这里说的是.{1,36}?，)常从(.{1,48})进入。?$/);
  if (confirmationEntryMatch) {
    const [, prefix, axes] = confirmationEntryMatch;
    return [prefix, "可按", axes, "继续。"].join("");
  }

  return text;
}

function softenContrastSkeleton(answer) {
  return clean(answer)
    .replace(/舞台感不是只给结论，而是/g, "舞台感在于")
    .replace(/它不是只在怀旧，而是在/g, "它更像在")
    .replace(/不是只看好不好看，而是看/g, "别只看好不好看；要看")
    .replace(/不是少做，而是把/g, "不是少做；是把")
    .replace(/不是只交代结论，而是/g, "要")
    .replace(/不是只看立场，而是看/g, "要看")
    .replace(/不只是好吃，而是/g, "要看")
    .replace(/它不是想变成/g, "与其说想变成")
    .replace(/，而是羡慕/g, "，不如说羡慕");
}

function softenDialogicSurface(answer) {
  return softenContrastSkeleton(softenEntrySkeleton(answer));
}

function recentText(state = {}) {
  return [
    state.lastUserText,
    state.lastUserQuery,
    state.lastAnswer,
    state.lastAssistantAnswer,
    ...(state.recentTurns || []).flatMap((turn) => [turn.question, turn.answer])
  ]
    .filter(Boolean)
    .join(" ");
}

function activeMandopop(state = {}, query = "") {
  return activeDialogicDomain(state, query) === "music";
}

function activeCinemaCulture(state = {}, query = "") {
  return activeDialogicDomain(state, query) === "cinema";
}

function activeVisualCulture(state = {}, query = "") {
  return activeDialogicDomain(state, query) === "visual";
}

function activeScienceCulture(state = {}, query = "") {
  return activeDialogicDomain(state, query) === "science";
}

function activeUrbanCulture(state = {}, query = "") {
  return activeDialogicDomain(state, query) === "urban";
}

function activeTechnologyCulture(state = {}, query = "") {
  return activeDialogicDomain(state, query) === "technology";
}

function activeEthicsCulture(state = {}, query = "") {
  return activeDialogicDomain(state, query) === "ethics";
}

function activeEducationCulture(state = {}, query = "") {
  return activeDialogicDomain(state, query) === "education";
}

function activeEconomicsCulture(state = {}, query = "") {
  return activeDialogicDomain(state, query) === "economics";
}

function activeLanguageCulture(state = {}, query = "") {
  return activeDialogicDomain(state, query) === "language";
}

function activeFoodCulture(state = {}, query = "") {
  return activeDialogicDomain(state, query) === "food";
}

function activeLawCulture(state = {}, query = "") {
  return activeDialogicDomain(state, query) === "law";
}

function activeCareCulture(state = {}, query = "") {
  return activeDialogicDomain(state, query) === "care";
}

function activePsychologyCulture(state = {}, query = "") {
  return activeDialogicDomain(state, query) === "psychology";
}

function activeTheaterCulture(state = {}, query = "") {
  return activeDialogicDomain(state, query) === "theater";
}

function activeHistoryCulture(state = {}, query = "") {
  return activeDialogicDomain(state, query) === "history";
}

function activeLuoLike(state = {}, query = "") {
  const source = `${query} ${recentText(state)}`;
  return /罗大佑|童年|鹿港小镇|恋曲1990|之乎者也/.test(source);
}

function activeDialogicDomain(state = {}, query = "") {
  const explicit = detectDialogicDomain({ query, context: "" });
  if (explicit) return explicit;

  const focusContext = [
    state.lastUserText,
    state.lastUserQuery,
    state.lastAnswer,
    state.lastAssistantAnswer
  ]
    .filter(Boolean)
    .join(" ");
  const focused = detectDialogicDomain({ query: "", context: focusContext });
  if (focused) return focused;

  const stateDomain = String(
    state.activeDomain ||
      state.active_domain ||
      state.lastDomain ||
      state.last_domain ||
      state.compact_state?.activeDomain ||
      state.compactState?.activeDomain ||
      ""
  ).toLowerCase();
  if (/music|mandopop/.test(stateDomain)) return "music";
  if (/cinema|film|movie/.test(stateDomain)) return "cinema";
  if (/visual|art|design|photo/.test(stateDomain)) return "visual";
  if (/science|ecology/.test(stateDomain)) return "science";
  if (/urban|city|architecture|space/.test(stateDomain)) return "urban";
  if (/technology|interface|tool|comput/.test(stateDomain)) return "technology";
  if (/ethics|politic|action/.test(stateDomain)) return "ethics";
  if (/education|learning|classroom/.test(stateDomain)) return "education";
  if (/economics|market|institution|labor/.test(stateDomain)) return "economics";
  if (
    /philosophy/.test(stateDomain) &&
    /(语言|翻译|命名|意义|符号|维特根斯坦|索绪尔|本雅明)/.test(`${query} ${focusContext} ${recentText(state)}`)
  ) {
    return "language";
  }
  if (/language|translation|semiotic|symbol|meaning/.test(stateDomain)) return "language";
  if (/food|cooking|taste|tea|kitchen|dish/.test(stateDomain)) return "food";
  if (/law|legal|justice|rule|court|rights/.test(stateDomain)) return "law";
  if (/care|medical|clinic|nursing|health|body/.test(stateDomain)) return "care";
  if (/psychology|psychoanalysis|dream|emotion|cognition/.test(stateDomain)) return "psychology";
  if (/theater|theatre|stage|performance|drama/.test(stateDomain)) return "theater";
  if (/history|memory|archive|historiography/.test(stateDomain)) return "history";

  return detectDialogicDomain({ query: "", context: recentText(state) });
}

function activeProfile(state = {}, query = "") {
  return getDialogicDomainProfile(activeDialogicDomain(state, query));
}

function extractKnowSubject(query = "") {
  const text = String(query || "");
  const beforeKnow = text.match(/^(.+?)(?:你知道吗|你知道么|你知道嘛|知道吗|知道么|知道嘛|是谁|是什么人|是什么)(?:[？?。.!！]*)$/);
  if (beforeKnow?.[1]) return clean(beforeKnow[1]);
  const afterKnow = text.match(/你知道(.+?)(?:吗|么|嘛|？|\?|$)/);
  if (afterKnow?.[1]) return clean(afterKnow[1]);
  if (/罗大佑/.test(text)) return "罗大佑";
  if (/杜尚/.test(text)) return "杜尚";
  if (/达尔文/.test(text)) return "达尔文";
  if (/简·?雅各布斯/.test(text)) return "简·雅各布斯";
  if (/香农/.test(text)) return "香农";
  if (/阿伦特/.test(text)) return "阿伦特";
  if (/弗莱雷/.test(text)) return "弗莱雷";
  if (/波兰尼/.test(text)) return "波兰尼";
  if (/王家卫/.test(text)) return "王家卫";
  if (/侯孝贤/.test(text)) return "侯孝贤";
  if (/小津安二郎|小津/.test(text)) return "小津安二郎";
  if (/维特根斯坦/.test(text)) return "维特根斯坦";
  if (/索绪尔/.test(text)) return "索绪尔";
  if (/本雅明/.test(text)) return "本雅明";
  return "";
}

function makeDialogicResult({
  answer,
  operation,
  questionType,
  turnFunction,
  intent = "operation_dialogic_bridge",
  contextAction = "ANSWER_CULTURE"
}) {
  return {
    intent,
    answer: softenDialogicSurface(answer),
    operation,
    questionType,
    contextAction,
    turnFunction,
    usedModel: false
  };
}

function answerRecommendation(query, state = {}) {
  if (/(摄影|照片|现代艺术|艺术).*(电影|方向|推荐)|电影.*摄影/.test(query)) {
    return "可以从杜尚、包豪斯、桑塔格旁接王家卫：先看观看、形式秩序和媒介位置，再看镜头叙事。";
  }
  const profile = activeProfile(state, query);
  if (profile?.recommendation) return profile.recommendation;
  if (/(港台|华语|流行|歌手|还能听谁|还有谁)/.test(query)) {
    return "可以听李宗盛、王菲、邓丽君、张惠妹。一个看叙事，一个看声音气质，一个看时代流通，一个看舞台力量。";
  }
  if (/(现代艺术|艺术家|绘画|摄影|设计|建筑)/.test(query)) {
    return "可以从杜尚、包豪斯、桑塔格、王家卫这类入口走：一个看观念，一个看形式秩序，一个看观看，一个看镜头叙事。";
  }
  if (/(科学|进化|生态|观察|实验)/.test(query)) {
    return "可以从达尔文、法布尔、蕾切尔·卡逊、古尔德进入：一个看演化，一个看观察，一个看生态，一个看科学叙事。";
  }
  if (/(城市|建筑|街道|规划)/.test(query)) {
    return "可以从简·雅各布斯、柯布西耶、包豪斯、王澍进入：一个看街道，一个看规划，一个看形式，一个看地方经验。";
  }
  if (/(技术|工具|算法|信息|计算)/.test(query)) {
    return "可以从图灵、香农、维纳、道格拉斯·恩格尔巴特进入：一个看计算，一个看信息，一个看反馈，一个看工具。";
  }
  if (/(伦理|政治|哲学|行动)/.test(query)) {
    return "可以从阿伦特、加缪、汉娜·皮特金、桑塔格进入：一个看行动，一个看荒诞，一个看公共判断，一个看观看伦理。";
  }
  return "可以换一个相邻入口：先找同领域里风格不同的人，再比较声音、题材和时代位置。";
}

function answerAbstractComparison(query) {
  if (/(专辑|单曲)/.test(query)) {
    return "专辑更像长篇结构，能安排主题和顺序；单曲更像短诗，要在几分钟里把钩子、情绪和判断打准。";
  }
  if (/(现成品|绘画|摄影|照片)/.test(query)) {
    return "绘画更重材料和手的组织；现成品更重命名、位置和制度。它不是少做，而是把创作重心移到判断。";
  }
  if (/(街道|规划|城市)/.test(query)) {
    return "街道观察从日常细节出发，规划更像先画结构。好城市需要两者互相校正。";
  }
  if (/(观察.*实验|实验.*观察)/.test(query)) {
    return "观察更像把世界看准，实验更像主动制造条件。一个守住细节，一个测试关系。";
  }
  if (/(算法|界面|工具)/.test(query)) {
    return "算法处理规则和选择，界面处理人的动作和理解。一个在背后算，一个在前面让人能用。";
  }
  if (/(行动|理论|责任)/.test(query)) {
    return "理论整理判断，行动把判断放进世界里。差别在于后者要承担结果。";
  }
  if (/(学习|训练|教育|教学|课堂)/.test(query)) {
    return "训练更像重复动作，学习更像形成理解。好的教育要让方法进入经验，而不是只把答案塞进去。";
  }
  if (/(市场|计划|劳动|资本|经济)/.test(query)) {
    return "市场更像分散选择，计划更像集中安排；劳动和资本的差别，则在谁承担身体、时间和风险。";
  }
  if (/(食谱|烹饪|料理|火候|味觉|餐桌|厨房)/.test(query)) {
    return "食谱更像结构，现场烹饪更像判断。一个给顺序，一个靠材料、火候和人的经验调整。";
  }
  if (/(规则|判例|法律|正义|司法|解释)/.test(query)) {
    return "规则更像稳定边界，判例更像具体解释。一个给可预期性，一个把公平放进真实处境。";
  }
  if (/(诊断|症状|照护|护理|临床|病房|身体经验)/.test(query)) {
    return "诊断更像命名问题，照护更像陪人穿过处境。一个需要准确边界，一个需要倾听和承担。";
  }
  if (/(梦|记忆|心理|潜意识|情绪|解释)/.test(query) && /(区别|不同|工作模式|差别|差在哪里)/.test(query)) {
    return "梦更像经验的变形，记忆更像时间里的重组。解释要轻一点，不能把一个人压成标签。";
  }
  if (/(排练|演出|戏剧|舞台|剧场|表演)/.test(query)) {
    return "排练更像试错和校准，演出更像现场承担。一个反复调整，一个在观众面前完成判断。";
  }
  if (/(史料|叙事|档案|记忆|历史)/.test(query)) {
    return "史料更像证据边界，叙事更像时间组织。一个限制想象，一个让材料形成可理解的关系。";
  }
  if (/(镜头|剪辑|长镜头|电影)/.test(query)) {
    return "镜头更像选择视角，剪辑更像安排时间。一个决定你看见什么，一个决定你怎样经历。";
  }
  if (/(语言|翻译|命名|意义|符号)/.test(query)) {
    return "命名像把对象固定下来，翻译像重新安排关系。一个重边界，一个重转化。";
  }
  return "一种形式偏连续结构，一种形式偏单点命中；差别在材料、顺序、观看位置和完成方式。";
}

function answerFormAnalogy(query, state = {}) {
  if (/(电影|镜头)/.test(query)) {
    return "可以这样看。镜头、小说和歌都靠选择细节来制造冲突；重点不是信息多，而是视角准。";
  }
  const profile = activeProfile(state, query);
  if (profile?.formAnalogy) return profile.formAnalogy;
  if (/(设计|建筑|摄影)/.test(query)) {
    return "可以。相似处在形式组织：删减、比例、视角和秩序，而不是题材必须一样。";
  }
  if (/(科学|实验|观察)/.test(query)) {
    return "可以。好的科学叙述也像文学：先选择细节，再让证据和时间把判断推出来。";
  }
  if (/(城市|街道|规划)/.test(query)) {
    return "可以。城市也像文本：街道、节奏和人群是句法，冲突藏在日常动线里。";
  }
  if (/(技术|工具|界面)/.test(query)) {
    return "可以。好工具也有形式感：它把复杂性藏起来，让人的动作变得更准确。";
  }
  if (/(政治|伦理|行动)/.test(query)) {
    return "可以。伦理和戏剧都看行动：不是只看立场，而是看人在具体情境里怎样承担。";
  }
  if (/(照护|医学人文|病房|诊断|身体经验)/.test(query)) {
    return "可以。照护和文学都要读细节；不同的是照护还要守住身体、风险和边界。";
  }
  if (/(心理学|精神分析|梦|潜意识|情绪)/.test(query)) {
    return "可以。心理学和文学都处理内心活动；不同的是心理解释要慢一点，不能急着替人下结论。";
  }
  if (/(戏剧|舞台|剧场|表演)/.test(query)) {
    return "可以。戏剧和文学都靠细节与冲突组织场面；不同的是戏剧还要让身体和停顿在现场发生。";
  }
  if (/(历史|记忆|档案|史料)/.test(query)) {
    return "可以。历史和文学都处理时间、记忆和叙述；不同的是历史要把想象压回证据边界。";
  }
  return "可以这样看。好的形式不是装饰，而是把材料、节奏和判断组织起来。";
}

function answerCrossDomain(query, state = {}) {
  if (/(日本文学|台湾文学)/.test(query)) {
    return "能注意到。两者都常写现代化下的个人、家庭和记忆；日本文学更细压心理，台湾文学更常连着殖民、乡土和身份转换。";
  }
  if (/(摄影.*电影|电影.*摄影)/.test(query)) {
    return "能注意到。摄影和电影都处理现代生活、媒介技术和历史记忆；差别是照片凝住一刻，电影组织时间。";
  }
  const profile = activeProfile(state, query);
  if (profile?.crossDomain) return profile.crossDomain;
  if (/(包豪斯|现代建筑|设计|摄影|电影|艺术|形式)/.test(query)) {
    return "能注意到。共同点通常不在外观，而在怎样处理现代生活、材料秩序和人的位置；差别要回到媒介和历史。";
  }
  if (/(科学|文学|叙事|进化|生态)/.test(query)) {
    return "能注意到。科学史和文学都在安排证据、时间和视角；差别是科学要回到可检验关系。";
  }
  if (/(城市|文学|建筑|街道)/.test(query)) {
    return "能注意到。城市和文学都靠场景、人物和冲突组织经验；差别是城市还要接受真实使用的检验。";
  }
  if (/(技术|诗|工具|界面)/.test(query)) {
    return "能注意到。技术和诗都在压缩形式；一个压缩动作路径，一个压缩语言经验。";
  }
  if (/(伦理|舞台|政治|戏剧)/.test(query)) {
    return "能注意到。伦理和舞台都把人放进冲突里看；差别是伦理还要判断责任边界。";
  }
  if (/(照护|医学|身体|病房|文学)/.test(query)) {
    return "能注意到。照护和文学都处理痛苦、叙述和关系；差别是照护必须守住身体风险和边界。";
  }
  if (/(心理学|心理|精神分析|文学|梦|记忆)/.test(query)) {
    return "能注意到。心理学和文学都写记忆、欲望和误解；差别是心理学要守住解释边界。";
  }
  return "能注意到。共同点通常不在外观，而在怎样处理现代生活、材料秩序和人的位置；差别要回到媒介和历史。";
}

function answerListRequest(query, state = {}) {
  if (/日本文学/.test(query)) {
    return "三个入口：夏目漱石《我是猫》或《心》、川端康成《雪国》、太宰治《人间失格》。";
  }
  if (/(电影作者|电影.*(作者|导演|代表作品|作品)|导演.*作品)/.test(query)) {
    return "三个入口：王家卫《花样年华》、侯孝贤《童年往事》、小津安二郎《东京物语》。";
  }
  if (/(语言思想|语言.*(代表人物|文本|作品)|翻译.*(代表人物|文本)|语言学|哲学研究)/.test(query)) {
    return "三个入口：维特根斯坦《哲学研究》、索绪尔《普通语言学教程》、本雅明《译者的任务》。";
  }
  const profile = activeProfile(state, query);
  if (profile?.listAnswer) return profile.listAnswer;
  if (/(现代艺术|艺术家|代表作)/.test(query)) {
    return "三个入口：杜尚《泉》、毕加索《格尔尼卡》、蒙德里安的格子绘画。先看观念、冲突和形式秩序。";
  }
  if (/(城市|建筑|规划)/.test(query)) {
    return "三个入口：简·雅各布斯《美国大城市的死与生》、柯布西耶、包豪斯。";
  }
  if (/(技术|信息|计算|工具|算法)/.test(query)) {
    return "三个入口：图灵、香农、维纳。先看计算、信息和反馈怎样改变工具。";
  }
  if (/(伦理|政治|哲学|行动)/.test(query)) {
    return "三个入口：阿伦特《人的境况》、加缪《西西弗神话》、萨特《存在与虚无》。";
  }
  if (/(科学史|科学|进化|生态)/.test(query)) {
    return "三个入口：达尔文《物种起源》、法布尔《昆虫记》、蕾切尔·卡逊《寂静的春天》。";
  }
  return "可以先列三个入口：一个看观念，一个看形式，一个看历史位置；再回到你最在意的那条线。";
}

function answerRelationQuestion(query, state) {
  const source = `${query} ${recentText(state)}`;
  if (/(杜尚|现成品).*(摄影|照片)|摄影.*(杜尚|现成品)|他和摄影/.test(source)) {
    return "有关系，但不是直接题材关系。杜尚把艺术转向命名和制度；摄影也会改变观看、证据和作品位置。";
  }
  if (/(达尔文|进化论).*(文学|叙事|生态)|科学.*文学|文学.*科学/.test(source)) {
    return "有关系，但不是同一种事。达尔文让时间和差异变成解释框架；文学也常用时间组织经验。";
  }
  if (/(简·?雅各布斯|城市).*(文学|舞台|建筑)|城市.*(文学|舞台|建筑)/.test(source)) {
    return "有关系。城市不是抽象地图，而是由人物、场景和冲突组成；这点和文学、舞台都相通。";
  }
  if (/(香农|图灵|技术|工具).*(诗|文学|界面)|技术.*(诗|文学|界面)/.test(source)) {
    return "有关系。技术把动作压缩成路径，诗把经验压缩成语言；两者都在处理形式和效率。";
  }
  if (/(阿伦特|伦理|政治).*(舞台|文学|行动)|伦理.*(舞台|文学|行动)/.test(source)) {
    return "有关系。伦理和舞台都不只看观点，而是看一个人怎样在情境里行动并承担后果。";
  }
  return "可以按三层看：有没有直接事实关系、有没有形式相似、有没有共同的观看或判断方式。";
}

function answerDomainOverview(query, state) {
  const subject = extractKnowSubject(query);
  if (/(怎么问|怎么提问|如何问|需要怎么问|我该怎么问|怎么开始)/.test(query)) return "";
  if (/(什么关系|有什么关系|关系？|关系$)/.test(query)) return "";
  if (/(项目|这个项目|下一步).{0,8}训练|训练什么/.test(query)) return "";
  if (/罗大佑/.test(query) && /(代表作|作品|哪些歌|有什么歌|歌曲)/.test(query)) {
    return "罗大佑的代表作可以从《之乎者也》《童年》《鹿港小镇》《恋曲1990》进入。";
  }
  if (/(这些歌|这些作品|代表在哪里|有什么代表性|有什么特点|歌曲.*代表性)/.test(query) && activeMandopop(state, query)) {
    return "代表性在三点：青春记忆、城乡变化、社会观察。入口可以听《童年》《鹿港小镇》《恋曲1990》。";
  }
  if (/罗大佑/.test(query)) {
    return "罗大佑是台湾音乐人，常从华语流行、时代感、青春记忆和社会观察进入。";
  }
  const profile = activeProfile(state, query);
  return profile?.overview ? profile.overview(subject) : "";
}

function answerTopicReentry(query, state) {
  const domain = activeDialogicDomain(state, query);
  if (domain === "music" && /(声音|嗓音|唱法|歌声)/.test(query)) {
    const units = ["特别在轻和留白", "常把情绪收住", "不把歌唱满"];
    return `${units[0]}：${units[1]}，${units[2]}。`;
  }
  if (domain === "cinema" && /(为什么|力量|特别|重要)/.test(query)) {
    const units = ["回到电影本身", "先看镜头怎样安排时间", "再看人物关系怎样被留出来"];
    return `${units[0]}：${units[1]}，${units[2]}。`;
  }
  if (domain === "food" && /(为什么|特别|重要|像)/.test(query)) {
    const units = ["回到饮食这条线", "关键是材料和火候怎样变成判断"];
    return `${units[0]}：${units[1]}。`;
  }
  if (domain === "law" && /(为什么|特别|重要|像)/.test(query)) {
    const units = ["回到法律这条线", "关键是规则怎样进入具体处境"];
    return `${units[0]}：${units[1]}。`;
  }
  const units = ["回到刚才那条线", "先抓一个具体特征", "再看它怎样改变判断"];
  return `${units[0]}：${units[1]}，${units[2]}。`;
}

export function answerDialogicBridgeTurn({ query = "", state = {}, turnFunction = {} } = {}) {
  const text = clean(query);
  const fn = turnFunction.turn_function || "";
  if (!text || !fn) return null;

  if (fn === "topic_reentry") {
    return makeDialogicResult({
      turnFunction: fn,
      operation: "return_to_active_topic",
      questionType: "topic_reentry",
      answer: answerTopicReentry(text, state)
    });
  }

  if (fn === "information_question" && /(这些歌|这些作品|代表在哪里|有什么代表性|有什么特点|歌曲.*代表性|歌.*特点)/.test(text) && activeMandopop(state, text)) {
    const characteristics = /(特点|风格)/.test(text);
    return makeDialogicResult({
      turnFunction: fn,
      operation: characteristics ? "explain_music_characteristics" : "explain_music_representativeness",
      questionType: characteristics ? "music_characteristics" : "music_representativeness",
      answer: "代表性在三点：青春记忆、城乡变化、社会观察。入口可以听《童年》《鹿港小镇》《恋曲1990》。"
    });
  }

  if (fn === "information_question") {
    const domainOverview = answerDomainOverview(text, state);
    if (domainOverview) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "dialogic_domain_overview",
        questionType: "overview",
        answer: domainOverview
      });
    }
  }

  if (fn === "information_question" && /(杜尚|现代艺术|摄影史|摄影作为观看|摄影)/.test(text)) {
    if (/杜尚/.test(text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "visual_culture_overview",
        questionType: "overview",
        answer: "杜尚可以理解为现代艺术里的关键人物：他把艺术从手艺转向命名、观看和制度。"
      });
    }
    return makeDialogicResult({
      turnFunction: fn,
      operation: "visual_culture_overview",
      questionType: "overview",
      answer: "摄影可以理解为观看的技术：不只是器材，也是在看图像如何改变证据和记忆。"
    });
  }

  if (fn === "confirmation") {
    if (activeScienceCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "confirm_active_referent",
        questionType: "confirmation",
        answer: "是。这里说的是科学史里的对象，我会按观察、证据和时间尺度继续。"
      });
    }
    if (activeUrbanCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "confirm_active_referent",
        questionType: "confirmation",
        answer: "是。这里说的是城市和公共空间里的对象，我会按街道、使用和人群继续。"
      });
    }
    if (activeTechnologyCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "confirm_active_referent",
        questionType: "confirmation",
        answer: "是。这里说的是技术和信息里的对象，我会按规则、工具和人的动作继续。"
      });
    }
    if (activeEthicsCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "confirm_active_referent",
        questionType: "confirmation",
        answer: "是。这里说的是伦理和公共行动里的对象，我会按责任、判断和后果继续。"
      });
    }
    if (activeCareCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "confirm_active_referent",
        questionType: "confirmation",
        answer: "是。这里说的是照护和医学人文里的对象，我会按身体经验、倾听和边界继续。"
      });
    }
    if (activePsychologyCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "confirm_active_referent",
        questionType: "confirmation",
        answer: "是。这里说的是心理学和自我理解里的对象，我会按梦、记忆、情绪和边界继续。"
      });
    }
    if (/(现代艺术家|艺术家|现代艺术)/.test(text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "confirm_active_referent",
        questionType: "confirmation",
        answer: "是。这里确认的是现代艺术语境里的对象，我会按观看、材料和制度继续说。"
      });
    }
    if (/(照片|摄影|观看)/.test(text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "confirm_active_referent",
        questionType: "confirmation",
        answer: "是。这里说的是摄影和观看的历史，不只是照片内容本身。"
      });
    }
    if (activeLuoLike(state, text) || /台湾.*歌手|台湾.*音乐人/.test(text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "confirm_active_referent",
        questionType: "confirmation",
        answer: "是。这里说的是台湾音乐人罗大佑，常从华语流行、时代感和社会观察进入。"
      });
    }
    const profile = activeProfile(state, text);
    if (profile?.confirmation) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "confirm_active_referent",
        questionType: "confirmation",
        answer: profile.confirmation
      });
    }
    return makeDialogicResult({
      turnFunction: fn,
      operation: "confirm_active_referent",
      questionType: "confirmation",
      answer: "是，你是在确认刚才那个对象；我会沿着这个上下文继续。"
    });
  }

  if (fn === "evaluation_request") {
    if (activeMandopop(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "aesthetic_judgment_music",
        questionType: "aesthetic_judgment",
        answer: "我会把他的歌看成流行歌里的叙事写作：旋律不炫，重点在时代感、记忆和社会观察。"
      });
    }
    if (activeVisualCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "aesthetic_judgment_visual_culture",
        questionType: "aesthetic_judgment",
        answer: "我会先看它怎样改变观看：不是只看好不好看，而是看材料、位置和制度怎样让意义发生。"
      });
    }
    if (activeScienceCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "aesthetic_judgment_science",
        questionType: "reflective_judgment",
        answer: "我会看它怎样把观察变成解释：厉害处不只是结论，而是让证据、差异和时间连成关系。"
      });
    }
    if (activeUrbanCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "aesthetic_judgment_urban",
        questionType: "reflective_judgment",
        answer: "我会看它怎样把城市从图纸拉回街道：重点是日常使用、公共空间和人的互相看见。"
      });
    }
    if (activeTechnologyCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "aesthetic_judgment_technology",
        questionType: "reflective_judgment",
        answer: "我会看它怎样把复杂规则变成可用动作：好的技术不是炫技，而是让判断和操作更清楚。"
      });
    }
    if (activeEthicsCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "reflective_judgment_ethics",
        questionType: "reflective_judgment",
        answer: "我会看它怎样把观念放进行动里：重点不是立场漂亮，而是人在情境里怎样承担责任。"
      });
    }
    if (activeCareCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "reflective_judgment_care",
        questionType: "reflective_judgment",
        answer: "我会看它怎样把诊断拉回人的处境：照护判断不只是信息正确，也看倾听、边界和承担。"
      });
    }
    if (activePsychologyCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "reflective_judgment_psychology",
        questionType: "reflective_judgment",
        answer: "我会看它怎样把经验变成可讨论的结构：不是替人下结论，而是保留边界地理解记忆和动机。"
      });
    }
    const profile = activeProfile(state, text);
    if (profile?.evaluation) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: `aesthetic_judgment_${profile.id}`,
        questionType: "reflective_judgment",
        answer: profile.evaluation
      });
    }
    return makeDialogicResult({
      turnFunction: fn,
      operation: "aesthetic_judgment",
      questionType: "aesthetic_judgment",
      answer: "我会先看形式怎么承载情绪，再看它有没有把个人经验变成更大的判断。"
    });
  }

  if (fn === "recommendation_request") {
    return makeDialogicResult({
      turnFunction: fn,
      operation: "recommend_adjacent_culture_entries",
      questionType: "recommendation",
      answer: answerRecommendation(text, state)
    });
  }

  if (fn === "abstract_comparison") {
    return makeDialogicResult({
      turnFunction: fn,
      operation: /(专辑|单曲)/.test(text) ? "compare_album_single_creation_mode" : "compare_media_creation_mode",
      questionType: "abstract_comparison",
      answer: answerAbstractComparison(text)
    });
  }

  if (fn === "analogy_statement" && turnFunction.bridge_target === "music_to_literature") {
    if (activeCinemaCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_cinema_to_literature",
        questionType: "reflective_bridge",
        answer: answerFormAnalogy("电影镜头", state)
      });
    }
    if (activeScienceCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_science_to_literature",
        questionType: "reflective_bridge",
        answer: answerFormAnalogy("科学观察", state)
      });
    }
    if (activeUrbanCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_urban_to_literature",
        questionType: "reflective_bridge",
        answer: answerFormAnalogy("城市街道", state)
      });
    }
    if (activeTechnologyCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_technology_to_poetry",
        questionType: "reflective_bridge",
        answer: answerFormAnalogy("技术工具界面", state)
      });
    }
    if (activeEthicsCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_ethics_to_drama",
        questionType: "reflective_bridge",
        answer: answerFormAnalogy("政治伦理行动", state)
      });
    }
    if (activeCareCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_care_to_literature",
        questionType: "reflective_bridge",
        answer: answerFormAnalogy("照护医学人文身体经验", state)
      });
    }
    if (activePsychologyCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_psychology_to_literature",
        questionType: "reflective_bridge",
        answer: answerFormAnalogy("心理学精神分析梦", state)
      });
    }
    if (activeEducationCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_education_to_literature",
        questionType: "reflective_bridge",
        answer: answerFormAnalogy("教育学习经验", state)
      });
    }
    if (activeEconomicsCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_economics_to_literature",
        questionType: "reflective_bridge",
        answer: answerFormAnalogy("经济市场劳动", state)
      });
    }
    if (activeLanguageCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_language_to_literature",
        questionType: "reflective_bridge",
        answer: answerFormAnalogy("语言翻译命名", state)
      });
    }
    if (activeFoodCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_food_to_literature",
        questionType: "reflective_bridge",
        answer: answerFormAnalogy("饮食烹饪味觉", state)
      });
    }
    if (activeLawCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_law_to_literature",
        questionType: "reflective_bridge",
        answer: answerFormAnalogy("法律规则解释", state)
      });
    }
    if (activeTheaterCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_theater_to_literature",
        questionType: "reflective_bridge",
        answer: answerFormAnalogy("戏剧舞台表演", state)
      });
    }
    if (activeHistoryCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_history_to_literature",
        questionType: "reflective_bridge",
        answer: answerFormAnalogy("历史记忆档案", state)
      });
    }
    return makeDialogicResult({
      turnFunction: fn,
      operation: "bridge_music_to_literature",
      questionType: "reflective_bridge",
      answer: "是。好歌和诗都在短形式里压缩叙事、节奏和情绪，不只是把话说漂亮。"
    });
  }

  if (fn === "analogy_statement" && turnFunction.bridge_target === "stage_theater") {
    if (activeCinemaCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_cinema_to_stage_conflict",
        questionType: "reflective_bridge",
        answer: "可以这样看。电影和舞台都靠场景、停顿和冲突，只是电影还能用镜头距离安排关系。"
      });
    }
    if (activeTechnologyCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_technology_to_stage_action",
        questionType: "reflective_bridge",
        answer: "可以这样看。工具和舞台都看动作：谁在什么情境里选择，冲突就从那里发生。"
      });
    }
    if (activeEthicsCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_ethics_to_stage_action",
        questionType: "reflective_bridge",
        answer: "可以这样看。伦理和舞台都看行动：人物在具体情境里选择，也在后果里承担。"
      });
    }
    if (activeUrbanCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_urban_to_stage_conflict",
        questionType: "reflective_bridge",
        answer: "可以这样看。街道也像舞台：人物、场景和冲突都在日常动线里发生。"
      });
    }
    if (activeScienceCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_science_to_stage_detail",
        questionType: "reflective_bridge",
        answer: "可以这样看。科学叙事也要安排细节、冲突和转折，只是最后要回到证据。"
      });
    }
    if (activeLanguageCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_language_to_stage_dialogue",
        questionType: "reflective_bridge",
        answer: "可以这样看。语言和舞台都看一句话怎样进入场景：说法、停顿和误解都会制造冲突。"
      });
    }
    if (activeFoodCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_food_to_stage_table_scene",
        questionType: "reflective_bridge",
        answer: "可以这样看。餐桌也像舞台：材料、位置和沉默都会让关系显出来。"
      });
    }
    if (activeLawCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_law_to_stage_conflict",
        questionType: "reflective_bridge",
        answer: "可以这样看。法律和舞台都把冲突放到场景里，只是法律还要给出可承担的边界。"
      });
    }
    if (activeCareCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_care_to_stage_scene",
        questionType: "reflective_bridge",
        answer: "可以这样看。病房也像一个场景：身体、沉默和关系都在里面显出来，但照护还要守住真实边界。"
      });
    }
    if (activePsychologyCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_psychology_to_stage_inner_conflict",
        questionType: "reflective_bridge",
        answer: "可以这样看。心理叙述也有舞台感：记忆、误解和停顿会让内在冲突浮出来。"
      });
    }
    if (activeHistoryCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "bridge_history_to_stage_memory",
        questionType: "reflective_bridge",
        answer: "可以这样看。历史叙述也像舞台：人物、材料和冲突都要被放到时间里。"
      });
    }
    return makeDialogicResult({
      turnFunction: fn,
      operation: "bridge_to_stage_detail_conflict",
      questionType: "reflective_bridge",
      answer: "可以这样看。舞台感不是只给结论，而是让人物在场景和冲突里行动，并在情境中承担。"
    });
  }

  if (fn === "analogy_statement" && ["design_form", "cinema_form", "science_observation", "urban_form", "technology_form", "ethics_action", "education_experience", "economics_relation", "language_meaning", "food_craft", "law_justice", "care_relation", "psychology_memory", "theater_performance", "history_memory"].includes(turnFunction.bridge_target)) {
    return makeDialogicResult({
      turnFunction: fn,
      operation: "bridge_form_across_media",
      questionType: "reflective_bridge",
      answer: answerFormAnalogy(text, state)
    });
  }

  if (fn === "cross_domain_comparison") {
    return makeDialogicResult({
      turnFunction: fn,
      operation: turnFunction.bridge_target === "literature_cross_region" ? "compare_japanese_taiwan_literature_axes" : "compare_cross_domain_form_axes",
      questionType: "cross_domain_comparison",
      answer: answerCrossDomain(text, state)
    });
  }

  if (fn === "list_request") {
    return makeDialogicResult({
      turnFunction: fn,
      operation: "list_authors_and_works",
      questionType: "author_work_list",
      answer: answerListRequest(text, state)
    });
  }

  if (fn === "relation_question") {
    return makeDialogicResult({
      turnFunction: fn,
      operation: "explain_contextual_relation",
      questionType: "relation_explanation",
      answer: answerRelationQuestion(text, state)
    });
  }

  if (fn === "affective_disclosure") {
    if (activeScienceCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "reflect_affective_projection",
        questionType: "affective_reflection",
        contextAction: "ANSWER_LOCAL",
        answer: "我能理解这个投射。羡慕的也许不是结论本身，而是那种把细节、观察和时间慢慢看清的能力。"
      });
    }
    if (activeUrbanCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "reflect_affective_projection",
        questionType: "affective_reflection",
        contextAction: "ANSWER_LOCAL",
        answer: "我能理解这个投射。它像是在羡慕一种街道感：能从普通日常里看见人怎样彼此靠近或错开。"
      });
    }
    if (activeTechnologyCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "reflect_affective_projection",
        questionType: "affective_reflection",
        contextAction: "ANSWER_LOCAL",
        answer: "我能理解这个投射。羡慕的可能是把复杂东西做成清楚工具的能力，让思考能落到动作里。"
      });
    }
    if (activeEthicsCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "reflect_affective_projection",
        questionType: "affective_reflection",
        contextAction: "ANSWER_LOCAL",
        answer: "我能理解这个投射。它不是想变成某个哲学家，而是羡慕一种把判断放进行动里的勇气。"
      });
    }
    if (activeVisualCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "reflect_affective_projection",
        questionType: "affective_reflection",
        contextAction: "ANSWER_LOCAL",
        answer: "我能理解这个投射。那种羡慕不是想变成艺术家，而是羡慕一种把普通东西重新看成问题的能力。"
      });
    }
    const profile = activeProfile(state, text);
    if (profile?.affectiveReflection) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "reflect_affective_projection",
        questionType: "affective_reflection",
        contextAction: "ANSWER_LOCAL",
        answer: profile.affectiveReflection
      });
    }
    return makeDialogicResult({
      turnFunction: fn,
      operation: "reflect_affective_projection",
      questionType: "affective_reflection",
      contextAction: "ANSWER_LOCAL",
      answer: "我能理解这个投射。《我是猫》有一种旁观世界的轻和刺；想到童年，也许是在羡慕重新看世界的角度。"
    });
  }

  if (fn === "interpretive_question") {
    if (activeScienceCulture(state, text) && /(进步|客观|只是)/.test(text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "interpret_science_beyond_progress",
        questionType: "interpretive_judgment",
        answer: "不只是进步神话。更准确地说，它在问差异、适应和时间怎样形成关系，而不是把世界说成越来越好。"
      });
    }
    if (activeUrbanCulture(state, text) && /(只是|效率|漂亮|规划)/.test(text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "interpret_city_beyond_efficiency",
        questionType: "interpretive_judgment",
        answer: "不只是效率或漂亮。城市问题更关心街道怎样被使用，人怎样相遇，冲突怎样被空间安排。"
      });
    }
    if (activeTechnologyCulture(state, text) && /(只是|效率|工具|中立)/.test(text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "interpret_technology_beyond_efficiency",
        questionType: "interpretive_judgment",
        answer: "不只是效率。工具会安排人的动作和注意力，所以技术也会改变判断的路径。"
      });
    }
    if (activeEthicsCulture(state, text) && /(自由|行动|只是|观点)/.test(text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "interpret_ethics_beyond_position",
        questionType: "interpretive_judgment",
        answer: "不只是观点。伦理判断要看行动、处境和后果：一个人怎样把立场变成承担。"
      });
    }
    if (activeVisualCulture(state, text) && /(现成品|开玩笑|玩笑|普通物件)/.test(text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "interpret_artwork_beyond_literal",
        questionType: "interpretive_judgment",
        answer: "不只是开玩笑。它把问题从手艺转到命名、展出位置和制度判断：为什么这个东西一放进展场就变成问题？"
      });
    }
    if (activeVisualCulture(state, text) && /(照片|摄影|记录|现实)/.test(text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "interpret_image_beyond_record",
        questionType: "interpretive_judgment",
        answer: "不一定只是记录现实。照片会选择角度、框取经验，也会把情绪和证据放在同一张图像里。"
      });
    }
    if (/童年/.test(text) && activeLuoLike(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "interpret_song_theme",
        questionType: "interpretive_judgment",
        answer: "不只是童年本身。它借校园和日常表面，写时间过去、共同记忆和失去的轻微疼痛。"
      });
    }
    const profile = activeProfile(state, text);
    if (profile?.interpretiveBeyondLiteral) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: `interpret_${profile.id}_beyond_literal`,
        questionType: "interpretive_judgment",
        answer: profile.interpretiveBeyondLiteral
      });
    }
    return makeDialogicResult({
      turnFunction: fn,
      operation: "interpret_theme_beyond_literal",
      questionType: "interpretive_judgment",
      answer: "不一定只讲字面对象；更要看它怎样把经验、时间和情绪折在一起。"
    });
  }

  if (fn === "identity_probe") {
    const profile = activeProfile(state, text);
    const contextLine = profile?.identityContextLine || "当前会话把音乐、文学和记忆连起来了";
    return makeDialogicResult({
      turnFunction: fn,
      intent: "self_identity_known",
      operation: "identity_boundary_with_context",
      questionType: "identity_boundary",
      contextAction: "SURFACE_IDENTITY",
      answer: `我是对话框。能这样说，是因为${contextLine}；我不需要把自己说成人。`
    });
  }

  if (fn === "boundary_clarification") {
    if (/鳄鱼和/.test(text)) {
      return makeDialogicResult({
        turnFunction: fn,
        intent: "surface_identity_relation_boundary",
        operation: "separate_surface_identity_from_music_fact",
        questionType: "boundary_clarification",
        contextAction: "SURFACE_IDENTITY",
        answer: "没有直接事实关系。它只是在这段对话里作为身份边界出现；具体对象仍按自己的领域来谈。"
      });
    }
    return makeDialogicResult({
      turnFunction: fn,
      intent: "surface_identity_clarification",
      operation: "clarify_surface_identity_reference",
      questionType: "boundary_clarification",
      contextAction: "SURFACE_IDENTITY",
      answer: "提到它是因为这是对话里的表层称呼，不是音乐或文学事实的一部分。"
    });
  }

  if (fn === "compliment") {
    const domain = activeDialogicDomain(state, text);
    if (domain === "science") {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "acknowledge_compliment_with_reflective_continuation",
        questionType: "affective_acknowledgement",
        contextAction: "ANSWER_LOCAL",
        answer: cleanComplimentSurface("我接住这个。科学和叙事这条线值得继续，因为它能把观察、证据和时间说得更准。")
      });
    }
    if (domain === "urban") {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "acknowledge_compliment_with_reflective_continuation",
        questionType: "affective_acknowledgement",
        contextAction: "ANSWER_LOCAL",
        answer: cleanComplimentSurface("我接住这个。城市和空间这条线值得继续，因为它能把日常、冲突和公共性说得更准。")
      });
    }
    if (domain === "technology") {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "acknowledge_compliment_with_reflective_continuation",
        questionType: "affective_acknowledgement",
        contextAction: "ANSWER_LOCAL",
        answer: cleanComplimentSurface("我接住这个。技术和形式这条线值得继续，因为它能把工具、动作和判断说得更准。")
      });
    }
    if (domain === "ethics") {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "acknowledge_compliment_with_reflective_continuation",
        questionType: "affective_acknowledgement",
        contextAction: "ANSWER_LOCAL",
        answer: cleanComplimentSurface("我接住这个。伦理和行动这条线值得继续，因为它能把判断、处境和责任说得更准。")
      });
    }
    if (activeVisualCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "acknowledge_compliment_with_reflective_continuation",
        questionType: "affective_acknowledgement",
        contextAction: "ANSWER_LOCAL",
        answer: cleanComplimentSurface("我接住这个。艺术和形式这条线值得继续，因为它能把观看、材料和判断说得更准。")
      });
    }
    const profile = activeProfile(state, text);
    if (profile?.compliment) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "acknowledge_compliment_with_reflective_continuation",
        questionType: "affective_acknowledgement",
        contextAction: "ANSWER_LOCAL",
        answer: cleanComplimentSurface(profile.compliment)
      });
    }
    return makeDialogicResult({
      turnFunction: fn,
      operation: "acknowledge_compliment_with_reflective_continuation",
      questionType: "affective_acknowledgement",
      contextAction: "ANSWER_LOCAL",
      answer: cleanComplimentSurface("我接住这个。文学和诗歌这条路值得继续，因为它能把音乐里的记忆、形式和判断说得更准。")
    });
  }

  if (fn === "deepening_invitation") {
    const domain = activeDialogicDomain(state, text);
    if (domain === "science") {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "generate_deeper_dialogic_questions",
        questionType: "deepening_invitation",
        contextAction: "ANSWER_HELP",
        answer: "可以问得更深一点：观察什么时候变成证据？科学叙事怎样避免把复杂世界说成单线进步？"
      });
    }
    if (domain === "urban") {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "generate_deeper_dialogic_questions",
        questionType: "deepening_invitation",
        contextAction: "ANSWER_HELP",
        answer: "可以问得更深一点：一条街怎样让人相遇？城市规划什么时候会压扁真实生活？"
      });
    }
    if (domain === "technology") {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "generate_deeper_dialogic_questions",
        questionType: "deepening_invitation",
        contextAction: "ANSWER_HELP",
        answer: "可以问得更深一点：一个工具怎样改变思考？界面把哪些判断交给人，又藏起哪些判断？"
      });
    }
    if (domain === "ethics") {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "generate_deeper_dialogic_questions",
        questionType: "deepening_invitation",
        contextAction: "ANSWER_HELP",
        answer: "可以问得更深一点：判断什么时候变成行动？一个人怎样在复杂处境里承担责任？"
      });
    }
    if (activeVisualCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "generate_deeper_dialogic_questions",
        questionType: "deepening_invitation",
        contextAction: "ANSWER_HELP",
        answer: "可以问得更深一点：一个普通物件怎样变成艺术问题？形式改变时，我们的观看到底被谁安排？"
      });
    }
    const profile = activeProfile(state, text);
    if (profile?.deepening) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "generate_deeper_dialogic_questions",
        questionType: "deepening_invitation",
        contextAction: "ANSWER_HELP",
        answer: profile.deepening
      });
    }
    return makeDialogicResult({
      turnFunction: fn,
      operation: "generate_deeper_dialogic_questions",
      questionType: "deepening_invitation",
      contextAction: "ANSWER_HELP",
      answer: "可以问得更深一点：一首歌怎样把私人童年变成共同记忆？文学里的叙述者和流行歌里的“我”有什么不同？"
    });
  }

  return null;
}
