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
  const tokenRe = new RegExp(`(${n})|(加上|再加|加|减去|减|乘以|乘|除以|除)`, "g");
  const tokens = [...source.matchAll(tokenRe)].map((match) => match[0]);
  if (tokens.length < 3) return null;
  let cursor = 0;
  let total = parseNumber(tokens[cursor++]);
  if (!Number.isFinite(total)) return null;
  while (cursor < tokens.length) {
    const op = tokens[cursor++];
    const value = parseNumber(tokens[cursor++]);
    if (!Number.isFinite(value)) return null;
    if (/加/.test(op)) total += value;
    else if (/减/.test(op)) total -= value;
    else if (/乘/.test(op)) total *= value;
    else if (/除/.test(op)) total /= value;
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

  const initial = source.match(new RegExp(`(?:有|原来有)(${n})个`));
  if (initial && /(还剩|剩几个|剩多少)/.test(source)) {
    let total = parseNumber(initial[1]);
    const preferChinese = /[零一二两三四五六七八九十]/.test(initial[1]);
    if (!Number.isFinite(total)) return fail("invalid_initial_number");
    const opRe = new RegExp(`(又买了|买了|得到|增加|拿走|吃掉|用掉|卖掉|失去|再拿走)(${n})个`, "g");
    for (const match of source.matchAll(opRe)) {
      const amount = parseNumber(match[2]);
      if (!Number.isFinite(amount)) return fail("invalid_operation_number");
      if (/(拿走|吃掉|用掉|卖掉|失去)/.test(match[1])) total -= amount;
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
  if (/(最矮|最小|最轻|最短|最薄|最慢|谁最后|哪.*最后)/.test(tail)) return "min";
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
  const suffix = /(最高)/.test(query) ? "最高" : /(最大)/.test(query) ? "最大" : /(最重)/.test(query) ? "最重" : /(最轻)/.test(query) ? "最轻" : /(最慢)/.test(query) ? "最慢" : /(最后)/.test(query) ? "最后" : /(最厚)/.test(query) ? "最厚" : "符合条件";
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
