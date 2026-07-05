import { R27B0MockRuntime } from "./mock_runtime.js";

const runtime = new R27B0MockRuntime();

const form = document.querySelector("#chat-form");
const input = document.querySelector("#chat-input");
const messageList = document.querySelector("#message-list");
const modelStatus = document.querySelector("#model-status");
const retrievalStatus = document.querySelector("#retrieval-status");
const verifierStatus = document.querySelector("#verifier-status");
const fallbackStatus = document.querySelector("#fallback-status");
const debugToggle = document.querySelector("#debug-toggle");
const debugOutput = document.querySelector("#debug-output");

let lastPacket = null;

function appendMessage(role, text) {
  const article = document.createElement("article");
  article.className = `message message-${role}`;

  const roleNode = document.createElement("div");
  roleNode.className = "message-role";
  roleNode.textContent = role === "user" ? "you" : "another_brain";

  const body = document.createElement("p");
  body.textContent = text;

  article.append(roleNode, body);
  messageList.append(article);
  messageList.scrollTop = messageList.scrollHeight;
}

function renderDebug() {
  debugOutput.hidden = !debugToggle.checked;
  debugOutput.textContent = JSON.stringify(lastPacket || {}, null, 2);
}

function updateStatus(packet) {
  retrievalStatus.textContent = `${packet.retrieved_evidence.length} mock items`;
  verifierStatus.textContent = packet.verifier_result.passed ? "Passed" : "Blocked";
  fallbackStatus.textContent = packet.fallback_used ? "Used" : "Unused";
}

async function boot() {
  const loadResult = await runtime.model.load();
  modelStatus.textContent = loadResult.status.replaceAll("_", " ");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  appendMessage("user", text);
  input.value = "";
  input.focus();

  const packet = await runtime.run(text);
  lastPacket = packet;
  appendMessage("assistant", packet.final_answer);
  updateStatus(packet);
  renderDebug();
});

debugToggle.addEventListener("change", renderDebug);

boot();
