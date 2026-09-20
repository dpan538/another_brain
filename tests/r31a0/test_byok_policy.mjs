// R31A0 — BYOK contract enforcement.
//
// Mutation tests: each case feeds the policy a violation and requires it to
// fail. A gate that only says yes to the current tree proves nothing.

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const {
  BYOK_PRODUCT_FILES,
  byokContractFailures,
  byokFileFailures,
  importsServerLab,
  isByokProductPath,
  ALLOWED_REMOTE_HOST
} = await import(new URL("../../scripts/byok_product_policy.mjs", import.meta.url).href);

const { checkStaticLocalProduct } = await import(new URL("../../scripts/check_static_local_product_no_backend.mjs", import.meta.url).href);
const { checkHybridLabIsolation } = await import(new URL("../../scripts/check_hybrid_lab_isolation.mjs", import.meta.url).href);

const BYOK_FILE = "archive/legacy_site/web/another_brain_chat/deepseek_browser_adapter.js";

test("the repository's current tree satisfies both production gates", async () => {
  const staticReport = await checkStaticLocalProduct({ root: ROOT });
  assert.deepEqual(staticReport.failures, []);
  assert.equal(staticReport.ok, true);

  const labReport = await checkHybridLabIsolation({ root: ROOT });
  assert.deepEqual(labReport.failures, []);
  assert.equal(labReport.ok, true);
});

test("a committed key literal in a BYOK file is refused", () => {
  const failures = byokFileFailures(BYOK_FILE, 'const key = "sk-abcdefghijklmnopqrst";');
  assert.ok(failures.some((failure) => failure.code === "byok_file_contains_secret_material"));
});

test("a build-time key reference in a BYOK file is refused", () => {
  const failures = byokFileFailures(BYOK_FILE, "const key = process.env.DEEPSEEK_API_KEY;");
  assert.ok(failures.some((failure) => failure.code === "byok_file_contains_secret_material"));
});

test("a hardcoded bearer header is refused", () => {
  const failures = byokFileFailures(BYOK_FILE, 'headers: { Authorization: "Bearer abc123def456" }');
  assert.ok(failures.some((failure) => failure.code === "byok_file_contains_secret_material"));
});

test("any other model host is refused even inside a BYOK file", () => {
  for (const host of ["https://api.openai.com/v1/chat", "https://api.anthropic.com/v1", "https://groq.com/openai", "https://generativelanguage.googleapis.com/v1"]) {
    const failures = byokFileFailures(BYOK_FILE, `fetch("${host}")`);
    assert.ok(
      failures.some((failure) => failure.code === "byok_file_references_other_model_host"),
      `${host} must be refused`
    );
  }
});

test("importing the server-side lab from production is refused", () => {
  const samples = [
    'import { x } from "../../src/hybrid_runtime/hybrid_orchestrator.ts";',
    'const m = require("../src/hybrid_runtime/deepseek_adapter.ts");',
    'const m = await import("./src/hybrid_runtime/signal_provider.ts");'
  ];
  for (const sample of samples) {
    assert.equal(importsServerLab(sample), true, sample);
    assert.ok(byokFileFailures(BYOK_FILE, sample).some((failure) => failure.code === "byok_file_imports_server_lab"));
  }
});

test("a provenance comment naming the lab is not treated as an import", () => {
  const comment = "// Ported from src/hybrid_runtime/style_policy_compiler.ts so behaviour matches.";
  assert.equal(importsServerLab(comment), false);
  assert.deepEqual(byokFileFailures(BYOK_FILE, comment), []);
});

test("the allow-list is closed: an unlisted web file gets no exemption", () => {
  assert.equal(isByokProductPath("archive/legacy_site/web/another_brain_chat/runtime_worker.js"), false);
  assert.equal(isByokProductPath("web/app.js"), false);
  assert.equal(isByokProductPath("api/answer.ts"), false);
  for (const listed of BYOK_PRODUCT_FILES) assert.equal(isByokProductPath(listed), true);
});

test("the contract check fails when the key store loses its runtime scoping", () => {
  const byPath = new Map([
    ["archive/legacy_site/web/another_brain_chat/deepseek_key_store.js", "export function readKey() { return BUILD_KEY; } redactKeyMaterial"],
    ["archive/legacy_site/web/another_brain_chat/deepseek_browser_adapter.js", `${ALLOWED_REMOTE_HOST} redactKeyMaterial`],
    ["archive/legacy_site/web/another_brain_chat/deepseek_answer_path.js", "SpendingGuard"]
  ]);
  const failures = byokContractFailures(byPath);
  assert.ok(failures.some((failure) => failure.code === "byok_key_store_not_runtime_scoped"));
});

test("the contract check fails when redaction or the spending guard disappears", () => {
  const noRedaction = new Map([
    ["archive/legacy_site/web/another_brain_chat/deepseek_key_store.js", "localStorage"],
    ["archive/legacy_site/web/another_brain_chat/deepseek_browser_adapter.js", ALLOWED_REMOTE_HOST],
    ["archive/legacy_site/web/another_brain_chat/deepseek_answer_path.js", "SpendingGuard"]
  ]);
  const failures = byokContractFailures(noRedaction);
  assert.ok(failures.some((failure) => failure.code === "byok_key_redaction_missing"));
  assert.ok(failures.some((failure) => failure.code === "byok_adapter_redaction_missing"));

  const noGuard = new Map([
    ["archive/legacy_site/web/another_brain_chat/deepseek_key_store.js", "localStorage redactKeyMaterial"],
    ["archive/legacy_site/web/another_brain_chat/deepseek_browser_adapter.js", `${ALLOWED_REMOTE_HOST} redactKeyMaterial`],
    ["archive/legacy_site/web/another_brain_chat/deepseek_answer_path.js", "no guard here"]
  ]);
  assert.ok(byokContractFailures(noGuard).some((failure) => failure.code === "byok_spending_guard_missing"));
});

// R31B2: the owner moved the key to the server and archived the legacy static site.
// Production is now the built app plus exactly one reviewed relay route.
test("production serves the built app and declares nothing beyond the reviewed relay", async () => {
  const vercel = JSON.parse(await readFile(join(ROOT, "vercel.json"), "utf8"));
  assert.equal(vercel.outputDirectory, "app/dist");
  assert.ok(!("functions" in vercel));
  assert.ok(!("rewrites" in vercel));
  const report = await checkStaticLocalProduct({ root: ROOT });
  assert.equal(report.policy.server_held_key_single_relay_route, true);
  assert.equal(report.policy.no_backend_inference, true);
});

test("no shipped web file carries key material", async () => {
  const report = await checkStaticLocalProduct({ root: ROOT });
  assert.ok(!report.failures.some((failure) => String(failure.code).includes("secret")));
  assert.equal(report.policy.no_committed_browser_key, true);
  assert.equal(report.policy.no_backend_inference, true);
  assert.equal(report.policy.browser_byok_remote_answer, true);
});
