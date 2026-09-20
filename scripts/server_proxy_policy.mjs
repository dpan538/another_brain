// R31B1 — server-held key, relayed through one reviewed route.
//
// Until R31B0 the product had no backend at all: the visitor supplied a key in the
// browser (BYOK). The owner has since decided that the key belongs on the server,
// because a product that talks as him cannot ask every visitor for a key. That is a
// deliberate change to the "no API route" rule, and this module is where it is
// written down, so the release gates keep refusing everything else.
//
// What is allowed: exactly one relay route, implemented by the files below. It does
// no inference and stores nothing. It adds the owner's key and the persona prompt on
// the server and streams DeepSeek's answer back.
//
// What stays forbidden, in these files and everywhere else:
//   - a key literal in the repository, in any form;
//   - the key in a client-visible variable (VITE_*, NEXT_PUBLIC_*), the bundle, a log,
//     a response body or an error message;
//   - any other model host, any second route, any import of the server-side lab;
//   - a relay that lets the caller choose the model, the token budget or the system prompt.

import { normalizeRepoPath } from "./static_llm_policy.mjs";

export const SERVER_PROXY_FILES = Object.freeze([
  "api/chat.js",                  // the Vercel Edge entry at the repository root: one line that calls the handler
  "app/server/chat_handler.js",   // the relay itself
  "app/server/dev_middleware.js"  // the same handler mounted in `vite dev` / `vite preview`
]);
// Files that have to NAME the environment variable without ever holding its value:
// the relay's tests inject it, and the README tells the owner where to put it.
export const SERVER_PROXY_TEST_FILES = Object.freeze(["app/tests/server.test.mjs", "app/README.md"]);

const FILES = new Set(SERVER_PROXY_FILES);
const TESTS = new Set(SERVER_PROXY_TEST_FILES);
export const isServerProxyPath = (path) => FILES.has(normalizeRepoPath(path));
export const isServerProxyTestPath = (path) => TESTS.has(normalizeRepoPath(path));

const KEY_LITERAL = /\bsk-[A-Za-z0-9_-]{12,}|Authorization\s*[:=]\s*["'`]Bearer\s+[A-Za-z0-9]/;
const CLIENT_VISIBLE_KEY = /(?:VITE_|NEXT_PUBLIC_|PUBLIC_|REACT_APP_)[A-Z0-9_]*(?:KEY|SECRET|TOKEN)/;
const OTHER_MODEL_HOSTS = /api\.openai\.com|openai\.com\/v1|anthropic\.com|replicate\.com|huggingface\.co|together\.ai|groq\.com|generativelanguage\.googleapis\.com/i;
const LAB_IMPORT = /(?:import|export)\s[^\n;]*from\s*["'][^"']*hybrid_runtime\/|require\s*\(\s*["'][^"']*hybrid_runtime\/|import\s*\(\s*["'][^"']*hybrid_runtime\//;

export function serverProxyFileFailures(path, text) {
  const rel = normalizeRepoPath(path); const failures = [];
  if (KEY_LITERAL.test(text)) failures.push({ code: "server_proxy_contains_key_literal", path: rel });
  if (CLIENT_VISIBLE_KEY.test(text)) failures.push({ code: "server_proxy_key_in_client_visible_variable", path: rel });
  if (OTHER_MODEL_HOSTS.test(text)) failures.push({ code: "server_proxy_references_other_model_host", path: rel });
  if (LAB_IMPORT.test(text)) failures.push({ code: "server_proxy_imports_server_lab", path: rel });
  if (!TESTS.has(rel) && /\bconsole\.(?:log|info|debug|warn|error)\s*\(/.test(text)) failures.push({ code: "server_proxy_logs", path: rel });
  return failures;
}

// Asserted positively, so the guarantees cannot rot silently.
export function serverProxyContractFailures(byPath) {
  const failures = []; const fail = (code) => failures.push({ code });
  const handler = byPath.get("app/server/chat_handler.js");
  if (handler == null) return failures;                       // no relay in this tree: nothing to hold to the contract
  if (!/env\??\.DEEPSEEK_API_KEY/.test(handler)) fail("server_proxy_key_not_read_from_env");
  if (!/api\.deepseek\.com/.test(handler)) fail("server_proxy_host_missing");
  if (!/const MODEL\s*=\s*["']deepseek-[a-z0-9.-]+["']/.test(handler)) fail("server_proxy_model_not_pinned");
  if (!/const MAX_TOKENS\s*=\s*\d+/.test(handler)) fail("server_proxy_token_budget_not_pinned");
  if (!/buildPersonaSystemPrompt\s*\(/.test(handler)) fail("server_proxy_persona_not_injected_on_server");
  if (!/role\s*!==\s*["']user["']|["']system["']/.test(handler) || !/validateMessages/.test(handler)) fail("server_proxy_accepts_caller_system_prompt");
  if (!/origin/i.test(handler) || !/403/.test(handler)) fail("server_proxy_origin_check_missing");
  if (!/rateLimited/.test(handler) || !/429/.test(handler)) fail("server_proxy_rate_limit_missing");
  if (!/not_configured/.test(handler) || !/503/.test(handler)) fail("server_proxy_missing_key_not_handled");
  if (/upstream\.text\(\)|await\s+\w+\.text\(\)\s*[,)}]/.test(handler) && /JSON\.stringify\([^)]*upstream/.test(handler)) fail("server_proxy_forwards_provider_error_body");

  const entry = byPath.get("api/chat.js") || "";
  if (!/handleChat\s*\(/.test(entry)) fail("server_proxy_entry_bypasses_handler");
  if (/fetch\s*\(/.test(entry)) fail("server_proxy_entry_calls_out_by_itself");

  // the key must never be reachable from the bundle
  for (const [path, text] of byPath) {
    if (/^app\/src\//.test(path) && /DEEPSEEK_API_KEY|process\.env/.test(text)) failures.push({ code: "client_bundle_reads_server_environment", path });
  }
  // and there is exactly one route
  const routes = [...byPath.keys()].filter((p) => /^(?:api|app\/api|pages\/api|functions)\//.test(p));
  for (const p of routes) if (p !== "api/chat.js") failures.push({ code: "unreviewed_api_route", path: p });
  return failures;
}
