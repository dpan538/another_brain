import { OBJECT_TABLE } from "./object_table.js?v=5";
import {
  createDialogState,
  detectIntent,
  directAnswerForObjectQuery,
  directAnswerForIntent,
  fallbackForIntent,
  nextDialogState,
} from "./dialog_rules.js?v=44";
import { tinyDirectAnswer, tinyIntentHint } from "./tiny_router.js?v=7";

const chatHistory = [];
let dialogState = createDialogState();

const els = {
  form: document.querySelector("#chatForm"),
  prompt: document.querySelector("#prompt"),
  answer: document.querySelector("#answer"),
  status: document.querySelector("#status")
};

function setStatus(text) {
  els.status.textContent = text;
}

function setAnswer(text) {
  els.answer.hidden = !text;
  els.answer.textContent = text;
}

function autosize() {
  els.prompt.style.height = "auto";
  els.prompt.style.height = `${Math.min(els.prompt.scrollHeight, 220)}px`;
}

function directAnswerForResolvedIntent(intent, text, state) {
  const objectAnswer = intent === "knowledge_unknown" ? directAnswerForObjectQuery(OBJECT_TABLE, text) : "";
  return objectAnswer || directAnswerForIntent(intent, text, state) || directAnswerForObjectQuery(OBJECT_TABLE, text);
}

function answerWithTinyRouter(text, state) {
  const exactOrNear = tinyDirectAnswer(text);
  if (exactOrNear?.answer) {
    return {
      intent: exactOrNear.label === "rewrite_short" ? "rewrite_short" : `tiny_${exactOrNear.label}`,
      answer: exactOrNear.answer
    };
  }
  const hint = tinyIntentHint(text);
  if (!hint?.intent) return null;
  if (hint.intent === "knowledge_unknown") {
    const objectAnswer = directAnswerForObjectQuery(OBJECT_TABLE, text);
    return objectAnswer ? { intent: hint.intent, answer: objectAnswer } : null;
  }
  const answer = directAnswerForResolvedIntent(hint.intent, text, state) || fallbackForIntent(hint.intent, text);
  return answer ? { intent: hint.intent, answer } : null;
}

async function submitPrompt(event) {
  event.preventDefault();
  const text = els.prompt.value.trim();
  if (!text) return;

  els.prompt.value = "";
  autosize();
  setAnswer("");
  setStatus("Thinking locally...");

  try {
    const intent = detectIntent(text, dialogState);
    const directAnswer = directAnswerForResolvedIntent(intent, text, dialogState);
    if (directAnswer) {
      setAnswer(directAnswer);
      chatHistory.push({ role: "user", content: text }, { role: "assistant", content: directAnswer });
      dialogState = nextDialogState(text, directAnswer, intent, dialogState);
      setStatus("");
      return;
    }

    const tinyAnswer = answerWithTinyRouter(text, dialogState);
    if (tinyAnswer?.answer) {
      setAnswer(tinyAnswer.answer);
      chatHistory.push({ role: "user", content: text }, { role: "assistant", content: tinyAnswer.answer });
      dialogState = nextDialogState(text, tinyAnswer.answer, tinyAnswer.intent, dialogState);
      setStatus("");
      return;
    }

    const answer = fallbackForIntent(intent, text);
    setAnswer(answer);
    chatHistory.push({ role: "user", content: text }, { role: "assistant", content: answer });
    dialogState = nextDialogState(text, answer, intent, dialogState);
    setStatus("");
  } catch (error) {
    console.error(error);
    setAnswer("我卡住了。也许只是恰好忘记了。");
  } finally {
    els.prompt.focus();
  }
}

els.form.addEventListener("submit", submitPrompt);
els.prompt.addEventListener("input", autosize);
els.prompt.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    els.form.requestSubmit();
  }
});

autosize();
