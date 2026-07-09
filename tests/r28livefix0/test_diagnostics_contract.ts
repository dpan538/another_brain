import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BrowserChatRuntime, verifyDraft } from "../../web/another_brain_chat/browser_runtime.js";

test("browser diagnostics exposes branch marker, shard probes, forward status, and merge runtime readiness", async () => {
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  assert.ok(app.includes("window.__anotherBrainDiagnostics"));
  assert.ok(app.includes("branch_marker"));
  assert.ok(app.includes("asset_manifest"));
  assert.ok(app.includes("q4_shards"));
  assert.ok(app.includes("bytes_read"));
  assert.ok(app.includes("q4_forward"));
  assert.ok(app.includes("q4_quality"));
  assert.ok(app.includes("mount_runtime_ready"));
  assert.ok(app.includes("merge_runtime_ready"));
  assert.ok(app.includes("q4Shards.length === 5"));
  assert.ok(app.includes("assetsOk && tokenizerOk && forwardOk && q4QualityAccepted"));
});

test("UI and static entries expose R28LIVEFIX0 marker on root and chat routes", async () => {
  for (const path of [
    "../../web/another_brain_chat/index.html",
    "../../web/index.html",
    "../../web/another_brain_chat.html"
  ]) {
    const html = await readFile(new URL(path, import.meta.url), "utf8");
    assert.ok(html.includes("R28LIVEFIX0"), path);
    assert.ok(html.includes("r28livefix0-live-q4-mount"), path);
    assert.ok(html.includes("another-brain-commit-short"), path);
  }
});

test("loading panel exposes unambiguous completed q4 progress instead of skeleton-only pass state", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../../web/another_brain_chat/styles.css", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");

  assert.ok(html.includes("model-loading-summary"));
  assert.ok(css.includes(".loading-skeleton.is-complete"));
  for (const expected of [
    "summarizeLoadingProgress",
    "完成 100%",
    "q4 forward=",
    "tokens=",
    "shards=",
    "加载完成：q4 已可用",
    "loadingSkeleton?.classList.toggle"
  ]) {
    assert.ok(app.includes(expected), expected);
  }
});

test("mojibake q4 drafts are rejected before reaching the chat surface", async () => {
  const app = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  const draft = "� plant buy如果命题P� really•ания。";
  const verifier = verifyDraft(draft, {
    evidence_status: "sufficient",
    retrieved_evidence: [{ title: "local", text: "生与死问题的本地证据", source_id: "local" }]
  });

  assert.equal(verifier.passed, false);
  assert.ok(verifier.failures.includes("mojibake_output"));
  assert.ok(verifier.fallback_recommended);
  assert.ok(app.includes("model_gibberish_fallback"));
  assert.ok(app.includes("mojibake_output"));
});

test("q4 forward with rejected mojibake is quality-blocked and uses visible RAG-grounded fallback", async () => {
  const runtime = new BrowserChatRuntime({
    mode: "static_q4_experimental",
    deliveryConfig: { model_mode: "static_q4_experimental", delivery_mode: "demo_static", rag_mode: "static_profile_pack" }
  });
  runtime.memoryRecords = [{
    source_id: "local-aesthetic-card",
    title: "Local aesthetic boundary",
    text: "Aesthetic judgment should look at structure, restraint, risk, and expressive accuracy instead of flattening taste into a vote.",
    trust_level: "high",
    license_or_origin: "approved_anchor_summary",
    can_answer: true,
    keywords: ["审美", "美学", "美", "aesthetic", "structure", "restraint"],
    metadata: { card_kind: "aesthetic", provenance: "approved_anchor_summary" }
  }];
  runtime.worker = {};
  runtime.isQ4ReadyForGeneration = () => true;
  runtime.load = async () => ({ ok: true });
  runtime.draftWithWorker = async () => {
    runtime.lastRuntimeStats = {
      tokens_generated: 1,
      elapsed_ms: 9,
      total_generation_ms: 9,
      first_token_ms: 3,
      runtime_mode: "static_q4_experimental",
      decoded_text_available: true,
      decode_status: "exact_runtime_tokenizer",
      generation_status: "completed",
      q4_attempted: true,
      generation_started: true,
      generation_finished: true,
      q4_ready_at_request: true,
      assets_verified: true,
      fallback_used: false
    };
    return "� plant buy如果命题P� really•ания。";
  };

  const packet = await runtime.run("你怎么看待美学");

  assert.equal(packet.runtime_stats.tokens_generated, 1);
  assert.equal(packet.process_trace.model.q4_forward_ran, true);
  assert.equal(packet.process_trace.model.q4_quality_accepted, false);
  assert.equal(packet.answer_source_label, "q4_forward_rejected_quality_blocker");
  assert.equal(packet.process_trace.runtime_truth_table.ok, false);
  assert.ok(packet.process_trace.runtime_truth_table.failures.includes("q4_forward_quality_not_admitted"));
  assert.match(packet.final_answer, /q4 草稿未被采纳|不能把这次输出说成模型思考/);
  assert.match(packet.final_answer, /本地检索实际命中/);
  assert.match(packet.final_answer, /Local aesthetic boundary/);
});
