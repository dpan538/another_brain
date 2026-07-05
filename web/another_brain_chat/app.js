import { BrowserChatRuntime } from "./browser_runtime.js";

const runtime = new BrowserChatRuntime({ mode: "synthetic_tiny" });

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
  const evidenceStatus = packet.evidence_packet?.evidence_status || "unknown";
  retrievalStatus.textContent = `${packet.retrieved_evidence.length} evidence / ${evidenceStatus}`;
  verifierStatus.textContent = packet.verifier_result.passed ? "Passed" : "Blocked";
  fallbackStatus.textContent = packet.fallback_used ? "Used" : "Unused";
}

function setPipelineStatus(status) {
  const labels = {
    loading_model: ["Loading", "Pending", "Pending", "Unused"],
    retrieving_local_memory: ["Loaded", "Retrieving", "Pending", "Unused"],
    drafting: ["Loaded", "Ready", "Drafting", "Unused"],
    verifying: ["Loaded", "Ready", "Verifying", "Unused"],
    final: ["Loaded", "Ready", "Passed", "Unused"],
    fallback: ["Loaded", "Ready", "Blocked", "Used"]
  };
  const [model, retrieval, verifier, fallback] = labels[status] || labels.final;
  modelStatus.textContent = model;
  retrievalStatus.textContent = retrieval;
  verifierStatus.textContent = verifier;
  fallbackStatus.textContent = fallback;
}

async function boot() {
  const loadResult = await runtime.load();
  modelStatus.textContent = `${loadResult.mode} loaded`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  appendMessage("user", text);
  input.value = "";
  input.focus();

  const packet = await runtime.run(text, { onStatus: setPipelineStatus });
  lastPacket = packet;
  appendMessage("assistant", packet.final_answer);
  updateStatus(packet);
  renderDebug();
});

debugToggle.addEventListener("change", renderDebug);

boot();
