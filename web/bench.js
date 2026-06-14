import { WEB_SLM_PROFILE } from "./config.js?v=3";
import { OBJECT_TABLE } from "./object_table.js?v=6";
import {
  createDialogState,
  detectIntent,
  directAnswerForObjectQuery,
  directAnswerForIntent,
  fallbackForIntent,
  nextDialogState
} from "./dialog_rules.js?v=52";
import { tinyDirectAnswer, tinyIntentHint, TINY_ROUTER_STATS } from "./tiny_router.js?v=15";

const output = document.querySelector("#output");
const params = new URLSearchParams(location.search);
const prompt = params.get("prompt") || "你是谁？";
const turnPrompts = (() => {
  const raw = params.get("turns");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
})();
let dialogState = createDialogState();

const result = {
  runtime: {
    mode: "tiny_router_web_slm",
    model: WEB_SLM_PROFILE,
    tinyRouter: TINY_ROUTER_STATS
  },
  prompt,
  turns: [],
  intent: detectIntent(prompt, dialogState),
  timingsMs: {},
  output: ""
};

function now() {
  return performance.now();
}

function render() {
  window.__anotherBrainBenchmark = result;
  output.textContent = JSON.stringify(result, null, 2);
}

function directAnswer(promptText, state, intent) {
  const objectAnswer = intent === "knowledge_unknown" ? directAnswerForObjectQuery(OBJECT_TABLE, promptText) : "";
  return objectAnswer || directAnswerForIntent(intent, promptText, state) || directAnswerForObjectQuery(OBJECT_TABLE, promptText);
}

function tinyAnswer(promptText, state) {
  const exactOrNear = tinyDirectAnswer(promptText);
  if (exactOrNear?.answer) {
    return {
      output: exactOrNear.answer,
      source: "tiny_router",
      tiny: exactOrNear,
      intent: exactOrNear.label === "rewrite_short" ? "rewrite_short" : `tiny_${exactOrNear.label}`
    };
  }

  const hint = tinyIntentHint(promptText);
  if (!hint?.intent) return null;
  const answer =
    hint.intent === "knowledge_unknown"
      ? directAnswerForObjectQuery(OBJECT_TABLE, promptText)
      : directAnswer(promptText, state, hint.intent) || fallbackForIntent(hint.intent, promptText);
  if (!answer) return null;
  return {
    output: answer,
    source: "tiny_router",
    intent: hint.intent,
    tiny: {
      label: hint.route.label,
      confidence: hint.route.confidence,
      margin: hint.route.margin,
      mode: "route"
    }
  };
}

function answerPrompt(promptText, state) {
  const started = now();
  const intent = detectIntent(promptText, state);
  const direct = directAnswer(promptText, state, intent);
  if (direct) {
    return {
      prompt: promptText,
      intent,
      output: direct,
      outputChars: direct.length,
      source: "direct",
      usedModel: false,
      timingsMs: { total: Math.round(now() - started) }
    };
  }

  const tiny = tinyAnswer(promptText, state);
  if (tiny) {
    return {
      prompt: promptText,
      ...tiny,
      outputChars: tiny.output.length,
      usedModel: true,
      modelKind: "tiny_router_web_slm",
      timingsMs: { total: Math.round(now() - started) }
    };
  }

  const fallback = fallbackForIntent(intent, promptText);
  return {
    prompt: promptText,
    intent,
    output: fallback,
    outputChars: fallback.length,
    source: "fallback",
    usedModel: false,
    timingsMs: { total: Math.round(now() - started) }
  };
}

function run() {
  try {
    const prompts = turnPrompts.length ? turnPrompts : [prompt];
    const started = now();
    for (const turnPrompt of prompts) {
      const turn = answerPrompt(turnPrompt, dialogState);
      result.turns.push(turn);
      dialogState = nextDialogState(turnPrompt, turn.output, turn.intent, dialogState);
      render();
    }
    result.output = result.turns.at(-1)?.output || "";
    result.outputChars = result.output.length;
    result.usedModel = result.turns.some((turn) => turn.usedModel);
    result.timingsMs.total = Math.round(now() - started);
    render();
  } catch (error) {
    result.error = error?.stack || String(error);
    render();
  }
}

render();
run();
