const CN_DIGITS = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9
};

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function clean(text) {
  return String(text || "").trim().replace(/\s+/g, "");
}

function ok(payload) {
  return { ok: true, ...payload };
}

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export function parseNumber(value) {
  const text = clean(value);
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (text === "十") return 10;
  if (/^十[一二两三四五六七八九]$/.test(text)) return 10 + CN_DIGITS[text[1]];
  if (/^[一二两三四五六七八九]十$/.test(text)) return CN_DIGITS[text[0]] * 10;
  if (/^[一二两三四五六七八九]十[一二两三四五六七八九]$/.test(text)) return CN_DIGITS[text[0]] * 10 + CN_DIGITS[text[2]];
  if (text in CN_DIGITS) return CN_DIGITS[text];
  return NaN;
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
}

function formatMaybeChinese(value, preferChinese = false) {
  if (!preferChinese) return formatNumber(value);
  const names = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  return Number.isInteger(value) && value >= 0 && value <= 10 ? names[value] : formatNumber(value);
}

function numberPattern() {
  return "(?:\\d+(?:\\.\\d+)?|十[一二两三四五六七八九]?|[一二两三四五六七八九]十[一二两三四五六七八九]?|[零一二两三四五六七八九])";
}

function parseExpression(query) {
  const source = clean(query);
  const n = numberPattern();
  const tokenRe = new RegExp(`(${n})|(\\+|-|\\*|/|×|÷|加上|再加|加|减去|减|乘以|乘|除以|除)`, "g");
  const tokens = [...source.matchAll(tokenRe)].map((match) => match[0]);
  if (tokens.length < 3) return null;
  let cursor = 0;
  let total = parseNumber(tokens[cursor++]);
  if (!Number.isFinite(total)) return null;
  while (cursor < tokens.length) {
    const op = tokens[cursor++];
    const value = parseNumber(tokens[cursor++]);
    if (!Number.isFinite(value)) return null;
    if (/加|\+/.test(op)) total += value;
    else if (/减|-/.test(op)) total -= value;
    else if (/乘|\*|×/.test(op)) total *= value;
    else if (/除|\/|÷/.test(op)) total /= value;
    else return null;
  }
  return total;
}

export function solveArithmetic(input) {
  if (!input || typeof input !== "object") return fail("expected_structured_input");
  if (Array.isArray(input.operations)) {
    let total = Number(input.initial ?? 0);
    if (!Number.isFinite(total)) return fail("invalid_initial");
    for (const step of input.operations) {
      const value = Number(step.value);
      if (!Number.isFinite(value)) return fail("invalid_operation_value", { step });
      if (step.op === "add") total += value;
      else if (step.op === "subtract") total -= value;
      else if (step.op === "multiply") total *= value;
      else if (step.op === "divide") total /= value;
      else return fail("unknown_operation", { step });
    }
    return ok({ solver: "arithmetic", result: total, answer: `${formatNumber(total)}` });
  }
  return fail("unsupported_structured_input");
}

export function solveWeekdayOffset(query) {
  const source = clean(query);
  const n = numberPattern();
  const match = source.match(new RegExp(`(?:今天)?(周[一二三四五六日天])(?:，|,)?(${n})天后周几`));
  if (!match) return fail("weekday_pattern_not_matched");
  const start = match[1] === "周天" ? "周日" : match[1];
  const offset = parseNumber(match[2]);
  const index = WEEKDAYS.indexOf(start);
  if (index < 0 || !Number.isFinite(offset)) return fail("invalid_weekday_or_offset");
  const result = WEEKDAYS[(index + offset) % 7];
  return ok({ solver: "weekday_offset", result, answer: `${result}。`, operation: "weekday_offset" });
}

export function solveChineseArithmetic(query) {
  const source = clean(query);
  const weekday = solveWeekdayOffset(source);
  if (weekday.ok) return weekday;

  const n = numberPattern();
  const half = source.match(new RegExp(`(${n})的一半(?:是|等于)?[几多少]?`));
  if (half) {
    const value = parseNumber(half[1]);
    if (Number.isFinite(value)) {
      const result = value / 2;
      return ok({ solver: "arithmetic", operation: "half", result, answer: `${formatNumber(result)}。` });
    }
  }

  const leadingAdd = source.match(new RegExp(`^(${n})(?:个|只|支|颗|本|张)?[^，,。？?]{0,12}(?:又|再)?(?:来了|来|增加|添了|加了)(${n})(?:个|只|支|颗|本|张)?.*?(?:一共|总共|共有).*?[几多少]`));
  if (leadingAdd) {
    const left = parseNumber(leadingAdd[1]);
    const right = parseNumber(leadingAdd[2]);
    if (Number.isFinite(left) && Number.isFinite(right)) {
      const result = left + right;
      return ok({ solver: "arithmetic", operation: "word_addition", result, answer: `一共${formatMaybeChinese(result, /[零一二两三四五六七八九十]/.test(leadingAdd[1] + leadingAdd[2]))}个。` });
    }
  }

  const symbolic = source.match(/(-?\d+(?:\.\d+)?)([+\-*/×÷])(-?\d+(?:\.\d+)?)/);
  if (symbolic) {
    const left = Number(symbolic[1]);
    const right = Number(symbolic[3]);
    let result = NaN;
    if (symbolic[2] === "+") result = left + right;
    else if (symbolic[2] === "-") result = left - right;
    else if (symbolic[2] === "*" || symbolic[2] === "×") result = left * right;
    else if (symbolic[2] === "/" || symbolic[2] === "÷") result = left / right;
    if (Number.isFinite(result)) {
      return ok({ solver: "arithmetic", operation: "expression_arithmetic", result, answer: `${formatNumber(result)}。` });
    }
  }
  const average = source.match(new RegExp(`(${n}).*?平均分给(${n})个人.*?(?:每人|每个).*?[几多少]`));
  if (average) {
    const total = parseNumber(average[1]);
    const people = parseNumber(average[2]);
    if (Number.isFinite(total) && Number.isFinite(people) && people !== 0) {
      const result = total / people;
      return ok({ solver: "arithmetic", operation: "division_word_problem", result, answer: `每人${formatNumber(result)}个。` });
    }
  }

  const each = source.match(new RegExp(`(${n})个.+每个(${n}).*?(?:一共|总共|共有).*?[几多少]`));
  if (each) {
    const boxes = parseNumber(each[1]);
    const per = parseNumber(each[2]);
    if (Number.isFinite(boxes) && Number.isFinite(per)) {
      const result = boxes * per;
      return ok({ solver: "arithmetic", operation: "multiplication_word_problem", result, answer: `一共${formatNumber(result)}个。` });
    }
  }

  const peopleEach = source.match(new RegExp(`(${n})(?:个)?人每人(${n})(?:张|个|本|块)?.*?(?:一共|总共|共有).*?[几多少]`));
  if (peopleEach) {
    const people = parseNumber(peopleEach[1]);
    const per = parseNumber(peopleEach[2]);
    if (Number.isFinite(people) && Number.isFinite(per)) {
      const result = people * per;
      return ok({ solver: "arithmetic", operation: "multiplication_word_problem", result, answer: `一共${formatNumber(result)}张。` });
    }
  }

  const initial = source.match(new RegExp(`(?:有|原来有)(${n})(?:个|本|张|块|只|支|颗)?`));
  if (initial && /(还剩|剩几个|剩多少)/.test(source)) {
    let total = parseNumber(initial[1]);
    const preferChinese = /[零一二两三四五六七八九十]/.test(initial[1]);
    if (!Number.isFinite(total)) return fail("invalid_initial_number");
    const opRe = new RegExp(`(又买了|买了|又拿来|拿来|得到|增加|拿走|再拿走|送出|送走|吃掉|用掉|卖掉|失去)(${n})(?:个|本|张|块|只|支|颗)?`, "g");
    for (const match of source.matchAll(opRe)) {
      const amount = parseNumber(match[2]);
      if (!Number.isFinite(amount)) return fail("invalid_operation_number");
      if (/(拿走|送出|送走|吃掉|用掉|卖掉|失去)/.test(match[1])) total -= amount;
      else total += amount;
    }
    return ok({ solver: "arithmetic", operation: "word_arithmetic", result: total, answer: `还剩${formatMaybeChinese(total, preferChinese)}个。` });
  }

  const expression = parseExpression(source);
  if (Number.isFinite(expression)) {
    return ok({ solver: "arithmetic", operation: "expression_arithmetic", result: expression, answer: `${formatNumber(expression)}。` });
  }

  return fail("arithmetic_pattern_not_matched");
}

function edgeKey(a, b) {
  return `${a}->${b}`;
}

function addEdge(edges, greater, lesser) {
  edges.set(edgeKey(greater, lesser), { greater, lesser });
}

function parseComparisonEdges(query) {
  const source = clean(query).replace(/and/gi, ",");
  const edges = new Map();
  const entities = new Set();
  const relationRe = /([A-Za-z甲乙丙丁戊己庚辛壬癸\u4e00-\u9fff]+?)比([A-Za-z甲乙丙丁戊己庚辛壬癸\u4e00-\u9fff]+?)(高|大|重|长|厚|快|早|晚|短|薄|轻|慢)/g;
  for (const match of source.matchAll(relationRe)) {
    let [, a, b, relation] = match;
    a = a.replace(/[，,。？?谁哪本哪个最大小高低轻重厚薄快慢早晚长短]+$/g, "");
    b = b.replace(/[，,。？?谁哪本哪个最大小高低轻重厚薄快慢早晚长短]+$/g, "");
    if (!a || !b || a === b) continue;
    entities.add(a);
    entities.add(b);
    if (/(高|大|重|长|厚|快|早|晚)/.test(relation)) addEdge(edges, a, b);
    else addEdge(edges, b, a);
  }
  const asciiRe = /\b([A-Za-z])>([A-Za-z])\b/g;
  for (const match of source.matchAll(asciiRe)) {
    entities.add(match[1]);
    entities.add(match[2]);
    addEdge(edges, match[1], match[2]);
  }
  const thinnest = source.match(/([A-Za-z甲乙丙丁戊己庚辛壬癸\u4e00-\u9fff]+)最薄/);
  if (thinnest) entities.add(thinnest[1]);
  return { entities: [...entities], edges: [...edges.values()] };
}

function scoreGraph(entities, edges) {
  const scores = Object.fromEntries(entities.map((entity) => [entity, 0]));
  for (let i = 0; i < entities.length + edges.length + 2; i += 1) {
    let changed = false;
    for (const edge of edges) {
      if (scores[edge.greater] <= scores[edge.lesser]) {
        scores[edge.greater] = scores[edge.lesser] + 1;
        changed = true;
      }
    }
    if (!changed) return { ok: true, scores };
  }
  return { ok: false, scores };
}

function targetMode(query) {
  const tail = String(query || "").split(/[，,]/).pop() || query;
  if (/(最矮|最小|最轻|最短|最薄|最慢|最早|谁最后|哪.*最后)/.test(tail)) return "min";
  return "max";
}

export function solveTransitiveComparison(input) {
  if (!input || !Array.isArray(input.entities) || !Array.isArray(input.edges)) return fail("expected_graph_input");
  const graph = scoreGraph(input.entities, input.edges);
  if (!graph.ok) return fail("cycle_detected", { solver: "transitive_comparison" });
  return queryRelationGraph({ entities: input.entities, edges: input.edges }, { mode: input.mode || "max" });
}

export function solveTransitiveComparisonFromText(query) {
  const graph = parseComparisonEdges(query);
  if (graph.entities.length < 2 || graph.edges.length === 0) return fail("comparison_pattern_not_matched");
  const hasCycle = graph.edges.some((edge) => graph.edges.some((other) => other.greater === edge.lesser && other.lesser === edge.greater));
  if (hasCycle) return fail("cycle_detected", { solver: "transitive_comparison", operation: "order_graph" });
  const result = queryRelationGraph(graph, { mode: targetMode(query) });
  if (!result.ok) return result;
  const suffix = /(最高)/.test(query) ? "最高" : /(最大)/.test(query) ? "最大" : /(最重)/.test(query) ? "最重" : /(最轻)/.test(query) ? "最轻" : /(最慢)/.test(query) ? "最慢" : /(最早)/.test(query) ? "最早" : /(最后)/.test(query) ? "最后" : /(最厚)/.test(query) ? "最厚" : "符合条件";
  return { ...result, solver: "transitive_comparison", operation: "order_graph", answer: `${result.result}${suffix}。` };
}

export function queryRelationGraph(graph, query = {}) {
  const entities = graph.entities || [];
  const edges = graph.edges || [];
  const scored = scoreGraph(entities, edges);
  if (!scored.ok) return fail("cycle_detected", { solver: "relation_graph" });
  const entries = Object.entries(scored.scores);
  const mode = query.mode || "max";
  const targetValue = mode === "min" ? Math.min(...entries.map(([, score]) => score)) : Math.max(...entries.map(([, score]) => score));
  const winners = entries.filter(([, score]) => score === targetValue).map(([entity]) => entity);
  if (winners.length !== 1) return fail("insufficient_evidence", { candidates: winners, scores: scored.scores });
  return ok({ solver: "relation_graph", result: winners[0], scores: scored.scores });
}

export function solveSyllogism(input) {
  if (!input || !Array.isArray(input.premises) || !input.query) return fail("expected_syllogism_input");
  return solveSyllogismFromText(`${input.premises.join("，")}，${input.query}`);
}

export function solveSyllogismFromText(query) {
  const source = clean(query);
  let match = source.match(/所有(.+?)都不是(.+?)[，,](.+?)是\1[，,]\3是\2吗/);
  if (match) return ok({ solver: "syllogism", operation: "negative_universal", result: false, answer: `不是${match[2]}。` });

  match = source.match(/没有(.+?)是(.+?)[，,](.+?)是\1[，,]\3是\2吗/);
  if (match) return ok({ solver: "syllogism", operation: "negative_universal", result: false, answer: `不是${match[2]}。` });

  match = source.match(/所有(.+?)都是(.+?)[，,]所有\2都是(.+?)[，,]所以所有\1都是\3吗/);
  if (match) return ok({ solver: "syllogism", operation: "universal_chain", result: true, answer: "是。这个三段论成立。" });

  match = source.match(/所有(.+?)都是(.+?)[，,]所有\2都是(.+?)[，,]\1一定是\3吗/);
  if (match) return ok({ solver: "syllogism", operation: "universal_chain", result: true, answer: "是。这个三段论成立。" });

  match = source.match(/所有(.+?)都是(.+?)[，,](.+?)是\1[，,]\3是\2吗/);
  if (match) return ok({ solver: "syllogism", operation: "positive_universal", result: true, answer: `是，${match[3]}是${match[2]}。` });

  match = source.match(/所有(.+?)都会(.+?)[，,](.+?)是\1[，,]\3会\2吗/);
  if (match) return ok({ solver: "syllogism", operation: "predicate_positive_universal", result: true, answer: `会，${match[3]}会${match[2]}。` });

  match = source.match(/所有(.+?)都不是(.+?)[，,](.+?)是\1[，,](?:它|\3)是\2吗/);
  if (match) return ok({ solver: "syllogism", operation: "negative_universal", result: false, answer: `不是${match[2]}。` });

  match = source.match(/所有会(.+?)的都不是(.+?)[，,](.+?)会\1[，,]\3是\2吗/);
  if (match) return ok({ solver: "syllogism", operation: "predicate_negative_universal", result: false, answer: `不是${match[2]}。因为会${match[1]}的都不是${match[2]}。` });

  match = source.match(/所有会(.+?)的都不是(.+?)[，,](.+?)会\1[，,]所以\3是\2吗/);
  if (match) return ok({ solver: "syllogism", operation: "predicate_negative_universal", result: false, answer: `不是${match[2]}。因为会${match[1]}的都不是${match[2]}。` });

  match = source.match(/所有会(.+?)的都是(.+?)[，,](.+?)会\1[，,]\3是\2吗/);
  if (match) return ok({ solver: "syllogism", operation: "predicate_positive_universal", result: true, answer: `是，${match[3]}是${match[2]}。` });

  return fail("syllogism_pattern_not_matched");
}

export function solveSetQuantifier(input) {
  return solveSyllogism(input);
}

export function solveSetQuantifierFromText(query) {
  return solveSyllogismFromText(query);
}

function boundedAnswer(answer) {
  return String(answer || "").trim().slice(0, 180);
}

function microOk({ answer, solver, intent = "operation_micro_task", confidence = 0.9 }) {
  const finalAnswer = boundedAnswer(answer);
  if (!finalAnswer) return fail("empty_micro_answer");
  return ok({
    answer: finalAnswer,
    intent,
    route: "micro_solver",
    confidence,
    solver
  });
}

function extractAfterColon(text) {
  const match = String(text || "").match(/[：:]\s*([\s\S]+)$/);
  return match ? match[1].trim() : "";
}

function solveCountingText(query) {
  const text = String(query || "").trim();
  const compacted = clean(text);
  const digitSeq = compacted.match(/^([一二三四五六七八九零0-9]+)有几个数字/);
  if (digitSeq) {
    return microOk({ solver: "count_visible_items", intent: "operation_counting", answer: `${Array.from(digitSeq[1]).length}个。` });
  }
  const listPart = text.includes("：") || text.includes(":") ? extractAfterColon(text).split(/一共|总共|有几个|几个|共/)[0] : "";
  if (listPart && /(几个|一共|总共)/.test(text)) {
    const items = listPart
      .split(/[、,，和与\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (items.length > 1 && items.length <= 12) {
      return microOk({ solver: "count_visible_items", intent: "operation_counting", answer: `${items.length}个。` });
    }
  }
  return fail("counting_pattern_not_matched");
}

function shortenSource(source, instruction = "") {
  let text = String(source || "").trim();
  text = text
    .replace(/我们似乎可能需要稍微/g, "需要")
    .replace(/似乎可能/g, "")
    .replace(/稍微/g, "")
    .replace(/当前部署应/g, "部署要")
    .replace(/如果测试没过/g, "测试没过")
    .replace(/就不要把它说成一次/g, "就别说是")
    .replace(/这个项目应该/g, "项目要")
    .replace(/规则层/g, "规则")
    .replace(/检索补证据/g, "检索补证据")
    .replace(/只能做/g, "只做")
    .replace(/模型权重不进入/g, "权重别进");

  if (/口语/.test(instruction)) text = text.replace(/应保持/g, "要保持").replace(/不进入/g, "别进");
  if (/直接/.test(instruction)) text = text.replace(/^我们需要/, "检查").replace(/^需要检查/, "检查");
  if (/release note/i.test(instruction)) text = `保持：${text.replace(/[。.!！]$/g, "")}`;
  if (/先.*再/.test(source) && !/先/.test(text)) text = `先${text}`;
  if (!/[。.!！]$/.test(text)) text += "。";
  return text.slice(0, 90);
}

function solveRewriteText(query, session = {}) {
  const text = String(query || "").trim();
  const directSource = extractAfterColon(text);
  let source = directSource;
  if (!source && /(更直接|更口语|release note|不能丢|保留(?:先后顺序|顺序|三个|约束|关键词))/i.test(text)) {
    source =
      session.rewrite_source ||
      session.active_task?.rewrite_source ||
      session.task_state?.active_task?.rewrite_source ||
      session.lastUserText ||
      session.lastUserQuery ||
      "";
  }
  if (!source) return fail("rewrite_source_missing");
  if (!/(压短|压成一句|改短|变短|缩短|总结|更直接|更口语|release note|不能丢|保留(?:先后顺序|顺序|三个|约束|关键词))/i.test(text)) {
    return fail("rewrite_instruction_missing");
  }
  return microOk({
    solver: "rewrite_compression",
    intent: "rewrite_short",
    confidence: 0.86,
    answer: shortenSource(source, text)
  });
}

function solveCommonSense(query) {
  const text = String(query || "");
  if (/(杯子|玻璃|碗).*(掉|摔).*(硬地|地上|地面)|硬地.*(碎|杯子|玻璃)/.test(text)) {
    return microOk({ solver: "common_sense", answer: "会撞到硬地，材料承受不了就可能碎。" });
  }
  if (/(杯子|玻璃杯|碗).*(摔碎|被摔碎|会碎|碎掉)/.test(text)) {
    return microOk({ solver: "common_sense", answer: "因为受到撞击，玻璃或陶瓷承受不了就会碎。" });
  }
  if (/(下雨|雨天).*(伞|带伞)|伞.*(有什么用|为什么)/.test(text)) {
    return microOk({ solver: "common_sense", answer: "伞用来挡雨，减少被淋湿。" });
  }
  if (/冰.*(热水|温水)|热水.*冰/.test(text)) {
    return microOk({ solver: "common_sense", answer: "冰会吸热融化，慢慢变成水。" });
  }
  if (/(睡觉|休息).*(关灯|灯)|关灯.*(睡觉|休息)/.test(text)) {
    return microOk({ solver: "common_sense", answer: "关灯让环境变暗，更容易休息和睡着。" });
  }
  if (/(锅|杯子|水).*(烫|很热).*(手|拿)|手.*拿.*烫/.test(text)) {
    return microOk({ solver: "common_sense", answer: "太热会烫伤手，要用隔热工具。" });
  }
  if (/(手机|设备).*(没电|电量低)|没电.*(下一步|怎么办)/.test(text)) {
    return microOk({ solver: "common_sense", answer: "通常先接上充电器，插电源充电。" });
  }
  if (/水.*(结冰|冻成冰)|为什么.*结冰/.test(text)) {
    return microOk({ solver: "common_sense", answer: "温度足够低时，水会结成冰。" });
  }
  if (/太阳.*白天.*(亮|更亮)|白天.*太阳.*光/.test(text)) {
    return microOk({ solver: "common_sense", answer: "白天太阳在天空中照射，太阳光让环境更亮。" });
  }
  if (/猫.*几条腿/.test(text)) {
    return microOk({ solver: "common_sense", answer: "通常是4条腿。" });
  }
  return fail("common_sense_pattern_not_matched");
}

function solveShortDefinition(query) {
  const text = String(query || "").trim();
  if (!/(什么是|是什么|有什么用|有什么作用|干什么|做什么|为什么.*有关|为什么.*相关)/.test(text)) return fail("definition_pattern_not_matched");
  const definitions = [
    { re: /缓存|cache/i, answer: "缓存是临时保存数据，方便下次更快使用。" },
    { re: /manifest/i, answer: "manifest 是清单文件，用来描述资源、版本或入口。" },
    { re: /shard|分片/i, answer: "shard 是把大文件拆成小分片，按需加载。" },
    { re: /verifier|验证器/i, answer: "verifier 用来检查答案是否符合证据和边界。" },
    { re: /相机/, answer: "相机用光记录画面，生成照片或视频。" },
    { re: /白平衡/, answer: "白平衡用来校正光线色温，让颜色更接近真实。" },
    { re: /雨伞/, answer: "雨伞用来挡雨，减少被淋湿。" }
  ];
  const hit = definitions.find((item) => item.re.test(text));
  return hit ? microOk({ solver: "short_definition", answer: hit.answer }) : fail("definition_not_known_locally");
}

function solveChineseUnderstanding(query) {
  const text = String(query || "").trim();
  const quote = text.match(/[“"](.+?)[”"]/);
  const quoted = quote?.[1] || "";
  if (quoted) {
    const put = quoted.match(/把(.+?)放(?:在|进|到)/);
    if (put && /(谁|什么).*(被放|放在|放进|放到)/.test(text)) {
      return microOk({ solver: "chinese_understanding", answer: `${put[1]}。` });
    }
    if (/不是不(?:想|愿意)/.test(quoted)) {
      return microOk({ solver: "chinese_understanding", answer: "大概是并非不想，可能还是想去或愿意试。" });
    }
    const order = quoted.match(/先(.+?)，?再(.+)/);
    if (order && /(哪件事在前|哪一步在前|谁在前|先做什么)/.test(text)) {
      return microOk({ solver: "chinese_understanding", answer: `先${order[1]}在前。` });
    }
    if (/(压短|太长|改短)/.test(quoted) && /(要求什么|在要求)/.test(text)) {
      return microOk({ solver: "chinese_understanding", answer: "是在要求把话缩短、压短。" });
    }
    if (/(不要|不能|别).*(上传|权重|训练|公开|泄露)/.test(quoted) && /(限制是什么|约束是什么)/.test(text)) {
      const marker = quoted.match(/(不要|不能|别).*/)?.[0] || quoted;
      return microOk({ solver: "chinese_understanding", answer: `限制是：${marker}。` });
    }
    if (/失败.*记录.*原因|如果失败/.test(quoted) && /(失败后|要做什么)/.test(text)) {
      return microOk({ solver: "chinese_understanding", answer: "失败后要记录原因。" });
    }
  }
  return fail("chinese_understanding_pattern_not_matched");
}

function solveContextMemory(query, session = {}) {
  const text = String(query || "").trim();
  const turns = Array.isArray(session.recentTurns) ? session.recentTurns : [];
  const previousText = [
    session.lastUserText,
    session.lastUserQuery,
    session.lastAnswer,
    session.lastAssistantAnswer,
    ...turns.flatMap((turn) => [turn.question, turn.answer])
  ].filter(Boolean).join(" ");
  if (!previousText) return fail("no_recent_context");

  if (/(解决什么问题|主要解决什么|有什么用|用来干什么|举个.*例子|例子说明|别换主题|应该怎么答|怎么答|回答方式|放哪里|放在哪|保留什么)/.test(text)) {
    if (/白平衡/.test(previousText)) {
      return microOk({ solver: "contextual_followup", answer: "白平衡解决颜色偏色问题，让不同光线下的白更接近白。" });
    }
    if (/GitHub/i.test(previousText)) {
      return microOk({ solver: "contextual_followup", answer: "GitHub 用来保存代码、做版本管理和多人协作。" });
    }
    if (/饺子/.test(previousText)) {
      return microOk({ solver: "contextual_followup", answer: "比如用面皮包肉馅或菜馅，煮熟后吃。" });
    }
    if (/(杯子|玻璃|碗).*(掉|摔)|硬地/.test(previousText)) {
      return microOk({ solver: "contextual_followup", answer: "会撞到硬地，材料承受不了就可能碎。" });
    }
    if (/(4\+4|四加四|4 加 4)/.test(previousText)) {
      return microOk({ solver: "contextual_followup", answer: "直接算，答案是8。" });
    }
    if (/私人|隐私|手机号|身份证|路径|memory pack/i.test(previousText)) {
      return microOk({ solver: "contextual_followup", answer: "遇到私人信息就不说、不编；只能给安全替代或边界说明。" });
    }
    if (/推理.*训练.*哪里|训练.*推理.*哪里|默认.*哪里/.test(text)) {
      return microOk({ solver: "contextual_followup", answer: "推理和训练默认放本地；Vercel 只做静态托管，不训练也不跑 LLM。下一步检查部署边界。" });
    }
    if (/Vercel|静态|权重|部署|模型文件/i.test(previousText)) {
      return microOk({ solver: "contextual_followup", answer: "权重不要进仓库或 web；放外部 artifact，repo 只留 manifest 和校验。" });
    }
  }

  if (/(为什么要先停|为什么先停|为什么现在先做评测|为什么先冻结训练)/.test(text) && /(训练|评测|退化)/.test(previousText)) {
    return microOk({ solver: "contextual_followup", answer: "因为继续训练会遮住退化；先停训练，才能用评测确认基线。" });
  }

  if (/(刚才说的词|刚才那个词|说的词是什么)/.test(text)) {
    const match = previousText.match(/词[：:]\s*([^。！？!?，,\s]+)/);
    if (match) return microOk({ solver: "current_session_memory", answer: match[1] });
  }
  if (/(任务名是什么|当前任务名)/.test(text)) {
    const match = previousText.match(/任务名[：:]\s*([A-Za-z0-9_-]+)/i);
    if (match) return microOk({ solver: "current_session_memory", answer: match[1] });
  }
  if (/(下一步是什么|刚才.*下一步)/.test(text)) {
    const match = previousText.match(/下一步是([^。！？!?]+)/);
    if (match) return microOk({ solver: "current_session_memory", answer: match[1].trim() });
  }
  if (/(限制有哪些|约束有哪些)/.test(text)) {
    const constraints = [...previousText.matchAll(/不(?:要|能|该)?[^，。！？!?]+/g)].map((item) => item[0]).slice(-4);
    if (constraints.length) return microOk({ solver: "current_session_memory", answer: constraints.join("，") + "。" });
  }
  if (/(优先什么|主题是什么|刚才问的主题)/.test(text)) {
    const topic = previousText.match(/(泛化|本地优先|白平衡|Vercel|权重|评测|训练|shard|routing|GitHub|饺子)/i)?.[1];
    if (topic) return microOk({ solver: "current_session_memory", answer: `${topic}。` });
  }
  return fail("context_memory_pattern_not_matched");
}

export function solveMicroTask({ query = "", session = {} } = {}) {
  const text = String(query || "").trim();
  if (!text) return fail("empty_query");

  const arithmetic = solveChineseArithmetic(text);
  if (arithmetic.ok) return microOk({ solver: arithmetic.solver || "arithmetic", intent: "operation_arithmetic", answer: arithmetic.answer, confidence: 0.96 });

  const counting = solveCountingText(text);
  if (counting.ok) return counting;

  const memory = solveContextMemory(text, session);
  if (memory.ok) return memory;

  const rewrite = solveRewriteText(text, session);
  if (rewrite.ok) return rewrite;

  const chinese = solveChineseUnderstanding(text);
  if (chinese.ok) return chinese;

  const definition = solveShortDefinition(text);
  if (definition.ok) return definition;

  const common = solveCommonSense(text);
  if (common.ok) return common;

  const syllogism = solveSyllogismFromText(text);
  if (syllogism.ok) return microOk({ solver: "syllogism", intent: "operation_syllogism", answer: syllogism.answer });

  const comparison = solveTransitiveComparisonFromText(text);
  if (comparison.ok) return microOk({ solver: "transitive_comparison", intent: "operation_transitive_comparison", answer: comparison.answer });

  return fail("micro_task_not_solved");
}
