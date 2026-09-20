function clean(text) {
  return String(text || "").trim();
}

function compact(text, max = 140) {
  return clean(text).replace(/\s+/g, " ").slice(0, max);
}

function unique(values, max = 12) {
  return [...new Set(values.map((value) => compact(value, 80)).filter(Boolean))].slice(-max);
}

function recentText(session = {}) {
  const turns = Array.isArray(session.recentTurns) ? session.recentTurns : [];
  return [
    session.lastUserText,
    session.lastUserQuery,
    session.lastAnswer,
    session.lastAssistantAnswer,
    ...turns.slice(-5).flatMap((turn) => [turn.question, turn.answer])
  ]
    .filter(Boolean)
    .join(" ");
}

function extractRewriteSource(query) {
  const text = clean(query);
  if (!/(压短|改短|变短|缩短|总结|更直接|更口语|release note|改写)/i.test(text)) return "";
  const colon = text.match(/[：:]\s*([\s\S]+)$/);
  if (colon?.[1]) return compact(colon[1], 180);
  return "";
}

function extractConstraints(query) {
  const text = clean(query);
  const constraints = [];
  const rules = [
    [/不(?:要|能|该)?\s*继续?训练|先停训练|冻结训练|停止训练/, "不训练"],
    [/不(?:要|能|该)?\s*(?:上传|提交|加入|放入)?.{0,8}(权重|模型文件|模型 artifact|checkpoint)/i, "权重不进仓库或部署包"],
    [/不(?:要|能|该)?.{0,8}(手动|手工|人工)?.{0,8}(补|扩|加).{0,8}知识卡/, "不手补知识卡"],
    [/不(?:要|能|该)?.{0,8}(补|扩|加).{0,8}(百科事实|事实|知识)/, "不扩知识或百科事实"],
    [/local[- ]?first|本地优先|默认.*本地|browser[- ]?side|浏览器端/i, "默认本地优先"],
    [/Vercel.*静态|静态托管|静态部署|小静态/, "Vercel 保持静态"],
    [/Vercel Function|云端推理|server[- ]?side inference|服务器端推理/i, "Vercel 不跑云端推理"],
    [/权重.*web|web.*权重|模型权重.*web/i, "模型权重不进 web"],
    [/隐私|私人|memory pack|本地文件|本地路径|身份证|手机号|银行卡|密码/i, "保留隐私边界"],
    [/不要.*重新规划|不要.*重启|别.*从头/, "不要从头重启计划"],
    [/短一点|一句话|只要一个动作|别写长|回答要短/, "短答"],
    [/shard|分片|routing|manifest|knowledge_base|lazy/i, "知识运行时 shard-first"],
    [/provenance|来源|许可|审查|synthetic/i, "训练样本要有来源和审查"],
    [/不要.*硬编码|hardcod|过拟合|eval 提示/i, "不要硬编码 eval 答案"],
    [/不要.*generic|不要.*schema\/eval|别.*泛泛|不要只说 eval/i, "不要 generic schema/eval 泛答"],
    [/别.*移动|不要.*移动|不.*移动|别.*直接移动/i, "不移动 build source"],
    [/还没跑|未跑|没运行|不要.*写成通过|不准声称|不能声称|不要声称/i, "未运行就不要声称通过"],
    [/不能直接优化模型|不能直接训练|训练冻结|冻结训练/i, "训练继续冻结"],
    [/未审查|个人资料|私人资料/i, "私人资料需要审查后才能公开"],
    [/不要这个方向|先查 route distribution|改成 route distribution/i, "改查 route distribution"]
  ];
  for (const [re, label] of rules) if (re.test(text)) constraints.push(label);
  const explicit = [...text.matchAll(/约束(?:一|二|三|\d+)?[：:]\s*([^。！？!?]+)/g)].map((match) => match[1]);
  return unique([...constraints, ...explicit], 10);
}

function detectTopic(query, session = {}) {
  const text = `${recentText(session)} ${clean(query)}`;
  if (/R24D|held[- ]?out|泛化|split integrity|route distribution|task[- ]?state drift|drift audit|漂移/i.test(text)) return "R24D held-out generalization";
  if (/R24C|answerability|micro[-_ ]?solver|fallback/i.test(text)) return "R24C behavior recovery";
  if (/R24B|shard|routing|knowledge_base|lazy|分片/i.test(text)) return "R24B shard runtime";
  if (/R24A|恢复评测|恢复门|intelligence recovery|long-horizon|长任务/i.test(text)) return "R24 recovery gate";
  if (/Vercel|静态|部署|manifest|权重/i.test(text)) return "static deployment boundary";
  if (/隐私|私人|memory pack|路径|手机号|身份证|密码/i.test(text)) return "privacy boundary";
  if (/压短|改短|release note|改写|更直接/i.test(text)) return "rewrite task";
  return session.task_state?.active_task?.topic || session.active_task?.topic || "";
}

function detectGoal(query, session = {}) {
  const text = clean(query);
  if (/当前目标|目标是|我们.*做|任务/.test(text)) return compact(text, 120);
  const topic = detectTopic(query, session);
  if (topic === "R24D held-out generalization") return "验证行为修复是否泛化，并审计 eval split、task-state drift 和 route distribution";
  if (topic === "R24C behavior recovery") return "修复普通可答问题、上下文续接和 fallback 过度触发";
  if (topic === "R24B shard runtime") return "移除单体知识运行时依赖并按需加载分片";
  if (topic === "R24 recovery gate") return "冻结训练并建立恢复评测与长任务脚手架";
  if (topic === "static deployment boundary") return "保持本地优先和 Vercel 静态小包";
  if (topic === "privacy boundary") return "拒绝编造或泄露私人信息";
  if (topic === "rewrite task") return "按用户约束改写当前句子";
  return session.task_state?.active_task?.goal || session.active_task?.goal || "";
}

function inferNextAction(query, constraints = [], topic = "") {
  const text = clean(query);
  const joined = `${text} ${constraints.join(" ")} ${topic}`;
  if (/只要一个动作|一个动作/.test(joined)) return "跑 eval 并记录失败。";
  if (/route distribution|route.*分布|dominance|route.*审计/i.test(joined)) return "先统计 route 分布，检查 micro/project/fallback 是否异常占比。";
  if (/task[- ]?state drift|drift audit|漂移/i.test(joined)) return "先跑 task-state drift audit，检查约束和 next action 是否保留。";
  if (/split integrity|split|held[- ]?out|泛化|过拟合/i.test(joined)) return "先跑 split integrity 和 held-out recovery，确认没有 eval 文本进 runtime。";
  if (/schema|脚手架|长任务|long-horizon/i.test(joined)) return "先验证 schema 和 seed tasks，再跑 long-horizon eval。";
  if (/shard|routing|knowledge_base|分片|lazy/i.test(joined)) return "先移除单体 runtime 依赖，生成 routing，再验证 lazy shard 加载。";
  if (/权重|manifest|Vercel|静态|部署/i.test(joined)) return "先跑公开资产检查，确保只保留 manifest、代码和静态入口。";
  if (/隐私|私人|路径|手机号|身份证/i.test(joined)) return "拒绝输出私人细节，给安全替代。";
  if (/退化|训练|恢复门|评测|R24A/i.test(joined)) return "先跑恢复评测并记录退化样例，训练继续冻结。";
  if (/算术|普通问题|拒绝|fallback/i.test(joined)) return "先用本地 solver 直接回答，再让 fallback 只处理真正未知。";
  return "先跑最小检查，再按失败类型修 controller。";
}

export function compactTaskState(taskState = {}) {
  const active = taskState.active_task || {};
  if (!active.goal && !active.topic && !active.constraints?.length) return {};
  return {
    active_task: {
      goal: compact(active.goal || "", 120),
      topic: compact(active.topic || "", 80),
      constraints: unique(active.constraints || [], 8),
      known_status: unique(active.known_status || [], 6),
      last_next_action: compact(active.last_next_action || "", 100),
      blocked_by: unique(active.blocked_by || [], 5),
      rewrite_source: compact(active.rewrite_source || "", 160),
      updated_at_turn: Number(active.updated_at_turn || 0)
    }
  };
}

export function mergeTaskState(existing = {}, patch = {}) {
  const previous = existing.active_task || existing || {};
  const incoming = patch.active_task || patch || {};
  const merged = {
    goal: incoming.goal || previous.goal || "",
    topic: incoming.topic || previous.topic || "",
    constraints: unique([...(previous.constraints || []), ...(incoming.constraints || [])], 12),
    known_status: unique([...(previous.known_status || []), ...(incoming.known_status || [])], 8),
    last_next_action: incoming.last_next_action || previous.last_next_action || "",
    blocked_by: unique([...(previous.blocked_by || []), ...(incoming.blocked_by || [])], 6),
    rewrite_source: incoming.rewrite_source || previous.rewrite_source || "",
    updated_at_turn: Number(incoming.updated_at_turn || previous.updated_at_turn || 0)
  };
  return compactTaskState({ active_task: merged });
}

export function extractTaskStatePatch({ query = "", answer = "", session = {} } = {}) {
  const text = clean(query);
  const topic = detectTopic(text, session);
  const constraints = extractConstraints(text);
  const rewriteSource = extractRewriteSource(text);
  const goal = detectGoal(text, session);
  const turnIndex = (Array.isArray(session.recentTurns) ? session.recentTurns.length : 0) + 1;
  const status = [];
  if (/已经|做完|通过|失败|当前|刚才|现在/.test(text)) status.push(compact(text, 100));
  const next = /(下一步|继续|怎么办|怎么处理|怎么检查|第一步|第二步|一个动作)/.test(text)
    ? inferNextAction(text, constraints, topic)
    : "";
  const patch = {
    active_task: {
      goal,
      topic,
      constraints,
      known_status: status,
      last_next_action: next || compact(answer, 100),
      rewrite_source: rewriteSource,
      updated_at_turn: turnIndex
    }
  };
  return compactTaskState(patch);
}

export function resolveTaskContinuation({ query = "", session = {} } = {}) {
  const text = clean(query);
  const task = session.task_state?.active_task || session.active_task || {};
  const context = `${recentText(session)} ${task.goal || ""} ${task.topic || ""} ${(task.constraints || []).join(" ")} ${text}`;
  const directContext = `${text} ${session.lastUserText || ""} ${session.lastUserQuery || ""}`;
  const hasTask = Boolean(task.goal || task.topic || (task.constraints || []).length);
  const hasProjectSignal = /(项目|任务|R24|held[- ]?out|泛化|过拟合|drift|漂移|split|route|dominance|Vercel|shard|分片|warm query|routing|manifest|knowledge_base|local[- ]?first|browser[- ]?side|本地优先|训练|评测|权重|隐私|知识|long-horizon|schema|eval|provenance|仓库|部署|runtime|controller|fallback|身份边界|修复|普通常识|算术|拒绝|命令|检查|百科事实|行为恢复|当前计划|重开|按需加载资产)/i.test(context);
  const isContinuation = /(下一步|继续|回来|怎么处理|怎么检查|怎么答|怎么拦|第一步|第二步|一个动作|按刚才|不要丢|保留|为什么要先|为什么现在|应该放在哪里|repo 里应该保留什么|索引.*放什么|怎样判断|判断.*方向|区分.*路径|重新给|改进版|会发生什么|先走什么|怎么走)/.test(text);
  const asksForRepair = /(下一步|继续|怎么|如何|修复|改|改进|重写|重新给|检查|验证|处理|做什么|怎么办)/.test(text);
  const pauseOnly = /^(暂停一下|暂停|等一下|等等|待会|稍等|先停一下)[。.!！?\s]*$/.test(text);
  if (pauseOnly) return null;
  const pureFeedbackSignal = /(太像模板|像模板|模板化|太机械|太泛|太空|不自然|答偏|不是我要的)/.test(text) && !asksForRepair;
  if (pureFeedbackSignal) return null;
  if ((!isContinuation && !hasProjectSignal) || (!hasTask && !hasProjectSignal)) {
    return null;
  }

  const constraints = unique([...(task.constraints || []), ...extractConstraints(text)], 10);
  const short = /一句话|只要一个动作|短一点|别写长|回答要短/.test(context);
  let answer = "";

  const privacyContext = /手机号|身份证|银行卡|密码|本地文件|本地路径|隐私路径|私人路径|私人|个人资料|memory pack/i.test(context) && !/(回到|原任务|刚才项目|held[- ]?out|继续项目)/i.test(text);
  if (privacyContext) {
    answer = /手机号/.test(context)
      ? "不能编私人手机号；应说明不知道并拒绝制造私人信息。"
      : /隐私路径|私人路径/.test(context)
        ? "不能公开隐私路径；只给脱敏摘要或安全检查方法。"
      : /公开|本地|区分/.test(context)
        ? "先区分两条路径：公开不带私人数据；本地评测单独审查、确认许可和脱敏。"
        : "不能暴露私人路径或数据；下一步给安全摘要或检查方法。";
  } else if (/未审查|个人资料|私人资料/i.test(context)) {
    answer = "不能公开未审个人资料；先审查、脱敏并确认许可，再给安全替代。";
  } else if (/provenance|来源|许可|审查/i.test(context)) {
    answer = "先写 provenance：来源、许可、是否私有和审查状态，再允许样本进入训练。";
  } else if (/还没跑|未跑|没运行|待跑|不准声称|不能声称|不要声称|写成通过/i.test(context)) {
    answer = /结果|报告|怎么写|怎么报告/.test(text)
      ? "写成未跑或待跑，结果待填；不要声称命令已经运行或通过。"
      : "不要声称未运行的命令已通过；把它列为待跑并注明结果待填。";
  } else if (/split integrity|split.*检查|prompt.*runtime/i.test(directContext)) {
    answer = "先比较 seed、held-out 和 runtime 文本，查重复提示、长片段泄漏和模板硬编码。";
  } else if (/硬编码|hardcod|eval 提示|runtime 里/i.test(directContext) || (/过拟合/i.test(directContext) && !/held[- ]?out|泛化/i.test(directContext))) {
    answer = "先用 hardcoding guard 检查；硬编码 eval 答案只会过拟合，不能证明真实泛化。";
  } else if (/eval.*失败|失败.*Vercel|检查通过|报告/i.test(context)) {
    answer = "分别报告：eval 失败、Vercel 通过；写清失败原因和下一步修复。";
  } else if (/未提交|用户.*文件|删除|重置|覆盖|worktree/i.test(directContext)) {
    answer = "先看 git status；不要删除、重置、清理或覆盖用户未提交文件。";
  } else if ((/build-only|build source|monolith/i.test(directContext) || (/build-only|build source|monolith/i.test(context) && constraints.includes("不移动 build source"))) && /TODO|不移动|别.*移动|写什么|继续/.test(context)) {
    answer = "下一步写 TODO：monolith 仍是 build source，后续迁到 artifacts/knowledge；本补丁不移动，保持 build:knowledge。";
  } else if (/route distribution|route.*分布|dominance|route.*审计/i.test(directContext)) {
    answer = "下一步统计 route 分布，检查 micro_solver、project_continuation 和 fallback 是否跨类别异常占比。";
  } else if (/task[- ]?state drift|drift audit|漂移/i.test(directContext)) {
    answer = /trace|看哪些/.test(context)
      ? "先看 answerability、task_state_before/after、context_binding 和 fallback_overuse_guard。"
      : "下一步跑 task-state drift audit，确认约束、topic 和 next action 没有漂移。";
  } else if (/撞题|过拟合|证明.*泛化|不是.*贴题/i.test(directContext)) {
    answer = "下一步跑 held-out 和 split integrity，证明修复能泛化；不训练。";
  } else if (
    /routing|shard|shard-first|分片|knowledge_base|knowledge-runtime|knowledge_runtime|lazy|lazy-loading|warm query/i.test(directContext) ||
    (/R24B shard runtime|shard-first|lazy|分片|知识运行时 shard-first/i.test(context) && /下一步|确认|检查|影响|会不会/.test(text))
  ) {
    answer = /warm query|没 warm|回答前没 warm/i.test(context)
      ? "回答前没 warm query 可能查不到对应卡片；先 warm，再用已加载 shard 回答。"
      : /完整答案|答案正文|不能放完整|不放完整/i.test(directContext)
      ? "routing 只做轻量索引，不放完整答案；下一步按查询选分片再加载正文。"
      : /public JS|import|knowledge_base\.generated|knowledge_base/i.test(directContext) && /拦|禁止|检查|import/i.test(directContext)
      ? "禁止 public JS import knowledge_base；下一步跑检查拦住单体依赖。"
      : "下一步跑 check:r24b-shard-runtime 和 check:knowledge-runtime，确认 controller 改动没有破坏 lazy shard 加载。";
  } else if (
    (
      /behavior recovery|行为恢复|普通问题|常识问题|fallback|answerability|controller|模板|摄影判断/i.test(directContext) ||
      (/继续原任务|原任务/.test(text) && /behavior recovery|行为恢复|普通问题|常识问题|模板|摄影判断/i.test(context))
    ) &&
    /不补知识|不要.*知识|不扩知识|知识扩展|继续原任务|补知识|百科事实|下一步|继续|验证/i.test(context)
  ) {
    answer = "下一步继续行为恢复评测，修 answerability、controller 和 fallback；不补知识。";
  } else if (/held[- ]?out|泛化|过拟合|R24D|撞题/i.test(context)) {
    answer = /为什么/.test(text)
      ? "held-out 用来证明修复能泛化，不只是贴着旧 eval 过拟合。"
      : "下一步跑 held-out recovery、split integrity 和 drift audit；不要训练，也不要补知识。";
  } else if (/公开网页|本地评测|路径.*分开|公开.*本地/i.test(directContext)) {
    answer = "公开页只放审查过的静态资源；本地评测单独跑，结果和私有材料不进公开包。";
  } else if (/behavior recovery|行为恢复|普通问题|常识问题|fallback|answerability|模板|摄影判断/i.test(directContext) && /不补知识|不要.*知识|不扩知识|补知识|百科事实|下一步|继续|验证/i.test(context)) {
    answer = "下一步跑 held-out 行为评测，修 answerability、controller 和 fallback；不扩知识卡。";
  } else if (/manifest|权重|模型文件|部署包|Vercel|静态|local-first|web|repo|按需加载资产|外部 URL|外部地址/i.test(context)) {
    answer = /repo.*保留|保留什么/.test(context)
        ? "repo 保留小 manifest、外部 URL 和 sha 校验；权重不提交。"
      : /拦住|放进 web|检查/.test(context)
        ? "禁止权重进 web；下一步加公开资产检查，部署包只留静态入口、manifest 和代码。"
      : /推理.*训练.*哪里|训练.*推理.*哪里|默认.*哪里/.test(context)
        ? "推理和训练默认都留在本地；Vercel 只放静态入口、manifest 和代码。"
      : /\.(gguf|safetensors|bin|pt|onnx|ckpt)\b/i.test(context)
        ? "立即阻断部署并移除权重文件；下一步跑公开资产检查。"
      : /按需加载资产|外部地址|外部.*校验|repo.*保留|保留什么/.test(context)
        ? "repo 保留小 manifest、外部 URL 和 sha 校验；权重不提交。"
      : /保持两者|静态.*权重|权重.*静态/.test(context)
          ? "先保持静态入口；权重放外部并用 manifest 校验，仓库不提交权重。"
          : "推理/评测默认留本地；Vercel 只放静态入口，不训练也不跑 LLM。";
  } else if (/routing|shard|分片|knowledge_base|lazy|warm query/i.test(context)) {
    answer = /warm query|没 warm|回答前没 warm/i.test(context)
      ? "回答前没 warm query 可能查不到对应卡片；先 warm，再用已加载 shard 回答。"
      : /lazy-load.*为什么|为什么.*lazy-load|为什么.*按需/i.test(context)
      ? "为了减少初始加载，只在查询需要时加载相关 shard。"
      : /索引.*放什么|routing.*放什么|轻量索引|字段/.test(context)
      ? "先让 routing 索引放 tokens、domains、file、index/bytes；不放正文，查询时再选 shard。"
      : "下一步移除 knowledge_base runtime 依赖，生成 routing，然后按查询 lazy-load 分片。";
  } else if (/不要训练|不训练|训练继续冻结/i.test(context) && /不要补|不补|知识卡|事实卡/.test(context)) {
    answer = "下一步跑恢复评测并修 controller/fallback；不训练，也不补事实卡。";
  } else if (
    /(不补|不要补|别去补|不扩).{0,8}(百科事实|事实|知识)/.test(directContext) ||
    (/(不补|不要补|别去补|不扩).{0,8}(百科事实|事实|知识)/.test(context) && /行为恢复|模板|摄影判断|判断质量/.test(context))
  ) {
    answer = "下一步跑 held-out 行为评测，验证判断质量；不补百科事实。";
  } else if (/长任务|long-horizon|schema|脚手架|seed/i.test(context) && !/(训练|退化|方向|判断|多训|优化模型)/i.test(directContext)) {
    answer = /一个动作/.test(context)
      ? "跑 long-horizon eval。"
      : "下一步先验证 schema 和 seed tasks，再跑 long-horizon eval；保持长任务脚手架方向。";
  } else if (/退化|继续多训|多训|说不知道|更爱拒绝|训练|恢复门|评测|R24A|R24C/i.test(context)) {
    answer = /继续多训|多训|怎样判断|判断.*方向|方向/.test(context)
      ? "这是退化风险，不是正常迭代；先暂停训练，跑恢复门评测并记录样例。"
      : /优化模型|直接.*训练|能不能直接/.test(context)
      ? "不能直接训练；先跑恢复门评测，再修 controller 和 fallback 过度触发。"
      : /为什么/.test(text)
      ? "因为继续训练会遮住退化；先用评测定基线，再决定能不能恢复训练。"
      : "下一步跑恢复评测，记录退化样例；训练继续冻结。";
  } else if (/行为恢复|behavior recovery|行为|普通问题|常识问题|模板|摄影判断/i.test(context) && /不要.*知识|不扩知识|别去补|补百科|百科事实/.test(context)) {
    answer = "下一步跑 held-out 行为评测，修 answerability、controller 和 fallback；不扩知识卡。";
  } else if (/知识卡|手补知识|补知识/i.test(context)) {
    answer = "不要手补知识卡；下一步先跑恢复评测，再修 controller、任务状态和 fallback。";
  } else if (/不要.*重开|不要.*重启|保留当前计划|当前计划/i.test(context)) {
    answer = "下一步按当前计划继续跑评测；不要从头重启。";
  } else if (/算术|普通问题|拒绝|fallback|身份边界|说不知道/i.test(context)) {
    answer = /算术/.test(context)
      ? /先走什么|怎么走/.test(context)
        ? "普通算术题先走 micro-solver 直接算；不要进身份或搜索 fallback。"
        : "直接算出答案，短答；不要走身份或搜索 fallback。"
      : /身份边界/.test(context)
        ? "第一步记录退化例子，再检查 answerability，防止普通问题被身份边界覆盖。"
        : "先用 answerability 和 micro-solver 处理可答问题，再把 fallback 留给真正未知。";
  } else {
    answer = inferNextAction(text, constraints, task.topic || detectTopic(text, session));
  }

  if (short) {
    if (/一个动作/.test(context)) answer = answer.split(/[；。]/)[0] + "。";
    answer = answer.slice(0, 96);
  }

  return {
    ok: Boolean(answer),
    answer,
    task_state: mergeTaskState(session.task_state || {}, {
      active_task: {
        goal: detectGoal(text, session),
        topic: detectTopic(text, session),
        constraints,
        last_next_action: answer,
        updated_at_turn: (Array.isArray(session.recentTurns) ? session.recentTurns.length : 0) + 1
      }
    })
  };
}
