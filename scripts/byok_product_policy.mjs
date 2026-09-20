// R31A0 — browser BYOK product policy.
//
// The static product now answers with DeepSeek. There is still no backend, no
// API route, no Vercel or Netlify Function, no Edge inference, and no hosted
// vector store. The call is made by the page itself, and the key is supplied at
// runtime by the person using the browser.
//
// This module names the exact production files allowed to reference the
// DeepSeek host, so the release gates can keep refusing every other path. What
// stays forbidden everywhere, including in these files:
//
//   - a key literal committed to the repository;
//   - a DEEPSEEK_API_KEY build-time or environment reference in the web bundle;
//   - a serverless or edge inference route;
//   - fetching model weights from a third-party host;
//   - a hosted vector store or external storage for model loading.

import { normalizeRepoPath } from "./static_llm_policy.mjs";
import { isServerProxyPath, isServerProxyTestPath } from "./server_proxy_policy.mjs";

export const BYOK_PRODUCT_FILES = Object.freeze([
  "web/another_brain_chat/deepseek_answer_path.js",
  "web/another_brain_chat/deepseek_browser_adapter.js",
  "web/another_brain_chat/deepseek_key_store.js",
  "web/another_brain_chat/deepseek_system_prompt.js",
  "web/another_brain_chat/deterministic_length_policy.js",
  "web/another_brain_chat/local_signal_provider.js",
  "web/another_brain_chat/style_policy_compiler.js",
  "web/another_brain_chat/app.js",
  "web/another_brain_chat/index.html",
  // Build outputs: prepare_vercel_static_build copies the chat shell to the
  // site root and to the legacy chat path.
  "web/index.html",
  "web/another_brain_chat.html"
]);

const BYOK_SET = new Set(BYOK_PRODUCT_FILES);

// R31B: the rebuilt product lives in app/. Its source and tests are held to the
// same contract as the files above: they may name the DeepSeek host, and they
// may never carry a secret, name another model host, or import the server lab.
const BYOK_APP_PATH = /^app\/(?:src|tests|scripts)\/|^app\/(?:vite\.config\.js|index\.html|package\.json|README\.md)$/;

export function isByokProductPath(path) {
  const rel = normalizeRepoPath(path);
  // R31B1: the relay and its tests answer to server_proxy_policy.mjs instead
  if (isServerProxyPath(rel) || isServerProxyTestPath(rel)) return false;
  return BYOK_SET.has(rel) || BYOK_APP_PATH.test(rel);
}

// Only this one remote host may appear in a BYOK product file.
export const ALLOWED_REMOTE_HOST = "api.deepseek.com";

const OTHER_MODEL_HOSTS = /api\.openai\.com|openai\.com\/v1|anthropic\.com|replicate\.com|huggingface\.co|together\.ai|groq\.com|generativelanguage\.googleapis\.com/i;

// A committed secret, in any production file. No exemption.
const SECRET_LITERAL = /\bsk-[A-Za-z0-9_-]{12,}|DEEPSEEK_API_KEY|Authorization\s*[:=]\s*["'`]Bearer\s+[A-Za-z0-9]/;

// Real code coupling to the server-side lab, as opposed to a provenance comment.
const LAB_IMPORT = /(?:^|\s)(?:import|export)\s[^\n;]*from\s*["'][^"']*hybrid_runtime\/[^"']*["']|require\s*\(\s*["'][^"']*hybrid_runtime\/[^"']*["']\s*\)|import\s*\(\s*["'][^"']*hybrid_runtime\/[^"']*["']\s*\)/m;

export function byokFileFailures(path, text) {
  const rel = normalizeRepoPath(path);
  const failures = [];
  if (SECRET_LITERAL.test(text)) failures.push({ code: "byok_file_contains_secret_material", path: rel });
  if (OTHER_MODEL_HOSTS.test(text)) failures.push({ code: "byok_file_references_other_model_host", path: rel });
  if (LAB_IMPORT.test(text)) failures.push({ code: "byok_file_imports_server_lab", path: rel });
  return failures;
}

export function importsServerLab(text) {
  return LAB_IMPORT.test(text);
}

// The BYOK path must read its key from the runtime store, never from a build
// constant. This is asserted positively so the guarantee cannot rot silently.
export function byokContractFailures(byPath) {
  const failures = [];
  const keyStore = byPath.get("web/another_brain_chat/deepseek_key_store.js") || "";
  if (!keyStore) {
    failures.push({ code: "byok_key_store_missing" });
    return failures;
  }
  if (!/localStorage/.test(keyStore)) failures.push({ code: "byok_key_store_not_runtime_scoped" });
  if (!/redactKeyMaterial/.test(keyStore)) failures.push({ code: "byok_key_redaction_missing" });

  const adapter = byPath.get("web/another_brain_chat/deepseek_browser_adapter.js") || "";
  if (!adapter) {
    failures.push({ code: "byok_adapter_missing" });
    return failures;
  }
  if (!new RegExp(ALLOWED_REMOTE_HOST.replace(".", "\\.")).test(adapter)) {
    failures.push({ code: "byok_adapter_host_missing" });
  }
  if (!/redactKeyMaterial/.test(adapter)) failures.push({ code: "byok_adapter_redaction_missing" });

  const answerPath = byPath.get("web/another_brain_chat/deepseek_answer_path.js") || "";
  if (!/SpendingGuard/.test(answerPath)) failures.push({ code: "byok_spending_guard_missing" });

  return failures;
}
