// R31A0 — DeepSeek product answer path tests.
// Runs entirely against a mock fetch. No live request, no API key required.

import assert from "node:assert/strict";
import test from "node:test";

const CHAT = new URL("../../archive/legacy_site/web/another_brain_chat/", import.meta.url);
const mod = (name) => import(new URL(name, CHAT).href);

const { createDeepSeekAnswerPath, SpendingGuard, describeFailure } = await mod("deepseek_answer_path.js");
const { buildDeepSeekRequest, SseFrameDecoder, DeepSeekError } = await mod("deepseek_browser_adapter.js");
const { redactKeyMaterial, isWellFormedKey, maskKey } = await mod("deepseek_key_store.js");
const { deterministicLengthPolicy } = await mod("deterministic_length_policy.js");
const { HeuristicSignalProvider, assertPacketGrounded } = await mod("local_signal_provider.js");

const FAKE_KEY = "sk-testtesttesttesttest1234";

function sseBody(frames) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    }
  });
}

function chunk(content, finish = null) {
  const delta = content === null ? {} : { content };
  const choice = { delta, index: 0 };
  if (finish) choice.finish_reason = finish;
  return `data: ${JSON.stringify({ choices: [choice] })}\n\n`;
}

const USAGE_FRAME = `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 40, prompt_cache_hit_tokens: 20 } })}\n\n`;
const DONE_FRAME = "data: [DONE]\n\n";

function okFetch(frames, capture = {}) {
  return async (url, init) => {
    capture.url = url;
    capture.init = init;
    capture.body = JSON.parse(init.body);
    capture.headers = init.headers;
    return { ok: true, status: 200, body: sseBody(frames) };
  };
}

function statusFetch(status, counter = { calls: 0 }) {
  return async () => {
    counter.calls += 1;
    return { ok: false, status, body: null };
  };
}

function path(extra = {}) {
  return createDeepSeekAnswerPath({
    getKey: () => FAKE_KEY,
    keyPresent: () => true,
    ...extra
  });
}

test("streams content and returns a trimmed answer", async () => {
  const capture = {};
  const streamed = [];
  const p = path({ fetchImpl: okFetch([chunk("今天"), chunk("先休息"), chunk(null, "stop"), USAGE_FRAME, DONE_FRAME], capture) });
  const result = await p.answer({ userText: "今天好累", onToken: (delta) => streamed.push(delta) });

  assert.equal(result.ok, true);
  assert.equal(result.text, "今天先休息");
  assert.equal(result.source, "deepseek_remote");
  assert.equal(result.finish_reason, "stop");
  assert.deepEqual(streamed, ["今天", "先休息"]);
  assert.equal(result.usage.input_tokens, 120);
  assert.equal(result.usage.output_tokens, 40);
});

test("sends the key only as a bearer header to the DeepSeek origin", async () => {
  const capture = {};
  const p = path({ fetchImpl: okFetch([chunk("好"), DONE_FRAME], capture) });
  await p.answer({ userText: "在吗" });

  assert.equal(capture.url, "https://api.deepseek.com/chat/completions");
  assert.equal(capture.headers.Authorization, `Bearer ${FAKE_KEY}`);
  assert.ok(!JSON.stringify(capture.body).includes(FAKE_KEY), "key must never appear in the request body");
  assert.equal(capture.init.referrerPolicy, "no-referrer");
});

test("never leaks key material into telemetry or failure text", async () => {
  const p = path({
    fetchImpl: async () => {
      throw new Error(`boom with ${FAKE_KEY} and Authorization: Bearer ${FAKE_KEY}`);
    }
  });
  const result = await p.answer({ userText: "你好" });

  assert.equal(result.ok, false);
  const serialized = JSON.stringify({ result, telemetry: p.telemetry });
  assert.ok(!serialized.includes(FAKE_KEY), "redaction must strip the key everywhere");
  assert.ok(serialized.includes("[redacted]") || !serialized.includes("sk-"));
});

test("absent key yields a fallback cue rather than a request", async () => {
  let called = false;
  const p = createDeepSeekAnswerPath({
    getKey: () => "",
    keyPresent: () => false,
    fetchImpl: async () => {
      called = true;
      return { ok: true, status: 200, body: sseBody([DONE_FRAME]) };
    }
  });
  const result = await p.answer({ userText: "你好" });

  assert.equal(result.ok, false);
  assert.equal(result.category, "auth_rejected");
  assert.equal(result.reason, "deepseek_api_key_absent");
  assert.equal(called, false, "no request may be made without a key");
  assert.equal(p.available(), false);
});

test("401 is not retried; 429 before the first token is retried once", async () => {
  const authCounter = { calls: 0 };
  const authResult = await path({ fetchImpl: statusFetch(401, authCounter) }).answer({ userText: "你好" });
  assert.equal(authResult.ok, false);
  assert.equal(authResult.category, "auth_rejected");
  assert.equal(authCounter.calls, 1);

  const rateCounter = { calls: 0 };
  const rateResult = await path({ fetchImpl: statusFetch(429, rateCounter) }).answer({ userText: "你好" });
  assert.equal(rateResult.ok, false);
  assert.equal(rateResult.category, "rate_limited");
  assert.equal(rateCounter.calls, 2, "one retry only, before any token is shown");
});

test("rejects an unexpected tool call", async () => {
  const toolFrame = `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ id: "x" }] }, index: 0 }] })}\n\n`;
  const result = await path({ fetchImpl: okFetch([toolFrame, DONE_FRAME]) }).answer({ userText: "你好" });
  assert.equal(result.ok, false);
  assert.equal(result.category, "tool_calls");
});

test("rejects malformed and unterminated streams", async () => {
  const bad = await path({ fetchImpl: okFetch(["data: {not json\n\n"]) }).answer({ userText: "你好" });
  assert.equal(bad.category, "malformed_stream");

  const noDone = await path({ fetchImpl: okFetch([chunk("半句")]) }).answer({ userText: "你好" });
  assert.equal(noDone.ok, false);
  assert.equal(noDone.category, "malformed_stream");
});

test("spending guard stops the session at its request limit", async () => {
  const p = path({ fetchImpl: okFetch([chunk("好"), DONE_FRAME]), limits: { requests: 2, concurrency: 1 } });
  assert.equal((await p.answer({ userText: "一" })).ok, true);
  assert.equal((await p.answer({ userText: "二" })).ok, true);
  const third = await p.answer({ userText: "三" });
  assert.equal(third.ok, false);
  assert.equal(third.category, "spending_guard");
  assert.equal(p.spending.requests, 2);
});

test("guard accumulates reported usage", () => {
  const guard = new SpendingGuard({ requests: 5 });
  guard.recordUsage({ input_tokens: 100, output_tokens: 30 });
  guard.recordUsage({ input_tokens: 50, output_tokens: 10 });
  assert.equal(guard.snapshot().input_tokens, 150);
  assert.equal(guard.snapshot().output_tokens, 40);
});

test("local signal injection is off by default and adds no second system message", async () => {
  const capture = {};
  const p = path({ fetchImpl: okFetch([chunk("好"), DONE_FRAME], capture) });
  const result = await p.answer({ userText: "今天好累" });

  const systemMessages = capture.body.messages.filter((message) => message.role === "system");
  assert.equal(systemMessages.length, 1, "default path carries only the frozen contract");
  assert.equal(result.local_signal.used, false);
  assert.equal(p.localSignalEnabled, false);
});

test("enabling the seam adds exactly one advisory system message", async () => {
  const capture = {};
  const p = path({ fetchImpl: okFetch([chunk("好"), DONE_FRAME], capture), localSignalEnabled: true });
  const result = await p.answer({ userText: "今天好累" });

  const systemMessages = capture.body.messages.filter((message) => message.role === "system");
  assert.equal(systemMessages.length, 2);
  assert.match(systemMessages[1].content, /LOCAL SIGNAL — advisory, not factual/);
  assert.equal(result.local_signal.used, true);
});

test("a signal provider failure degrades to the default path instead of blocking", async () => {
  const capture = {};
  const broken = {
    providerType: "broken_test_provider",
    async ready() { return true; },
    async analyze() { throw new Error("provider exploded"); },
    async cancel() {}
  };
  const p = path({ fetchImpl: okFetch([chunk("好"), DONE_FRAME], capture), localSignalEnabled: true, signalProvider: broken });
  const result = await p.answer({ userText: "今天好累" });

  assert.equal(result.ok, true);
  assert.equal(result.local_signal.used, false);
  assert.equal(capture.body.messages.filter((m) => m.role === "system").length, 1);
});

test("length class drives the token budget", async () => {
  const ordinary = {};
  await path({ fetchImpl: okFetch([chunk("好"), DONE_FRAME], ordinary) }).answer({ userText: "在吗" });
  const philosophy = {};
  await path({ fetchImpl: okFetch([chunk("好"), DONE_FRAME], philosophy) }).answer({ userText: "自由到底意味着什么" });

  // Both are clamped by the 3.5 s answer-latency budget: a philosophy turn wants
  // 400 tokens and is cut to the 234 that still projects inside it.
  assert.equal(ordinary.body.max_tokens, 220);
  assert.equal(philosophy.body.max_tokens, 234);
  assert.ok(philosophy.body.max_tokens < 400, "latency budget must bite");
  assert.ok(philosophy.body.messages[0].content.includes("180"));
});

test("request shape matches the frozen contract", async () => {
  const capture = {};
  await path({ fetchImpl: okFetch([chunk("好"), DONE_FRAME], capture) }).answer({
    userText: "现在呢",
    conversation: [{ role: "user", content: "之前" }, { role: "assistant", content: "回答" }]
  });

  assert.deepEqual(capture.body.thinking, { type: "disabled" });
  assert.equal(capture.body.stream, true);
  assert.deepEqual(capture.body.stream_options, { include_usage: true });
  assert.equal(capture.body.model, "deepseek-v4-flash");
  const roles = capture.body.messages.map((m) => m.role);
  assert.deepEqual(roles.slice(-3), ["user", "assistant", "user"]);
  assert.equal(capture.body.messages.at(-1).content, "现在呢");
});

test("conversation history is capped", async () => {
  const capture = {};
  const long = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }));
  await path({ fetchImpl: okFetch([chunk("好"), DONE_FRAME], capture) }).answer({ userText: "最后", conversation: long });
  const nonSystem = capture.body.messages.filter((m) => m.role !== "system");
  assert.equal(nonSystem.length, 12);
});

test("cancellation stops the turn", async () => {
  const controller = new AbortController();
  const p = path({
    fetchImpl: async (url, init) => {
      controller.abort();
      if (init.signal?.aborted) {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }
      return { ok: true, status: 200, body: sseBody([DONE_FRAME]) };
    }
  });
  const result = await p.answer({ userText: "你好", signal: controller.signal });
  assert.equal(result.ok, false);
  assert.equal(result.category, "user_cancel");
});

test("SSE decoder handles split frames and CRLF", () => {
  const decoder = new SseFrameDecoder();
  assert.deepEqual(decoder.push("data: {\"a\":1}\r\n\r\ndata: {\"b\""), [{ a: 1 }]);
  assert.deepEqual(decoder.push(":2}\n\n"), [{ b: 2 }]);
  assert.deepEqual(decoder.push("data: [DONE]\n\n"), [{ done: true }]);
});

test("key store helpers validate shape, mask, and redact", () => {
  assert.equal(isWellFormedKey(FAKE_KEY), true);
  assert.equal(isWellFormedKey("nope"), false);
  assert.equal(isWellFormedKey("sk-short"), false);
  assert.equal(maskKey(FAKE_KEY), "sk-****1234");
  assert.equal(redactKeyMaterial(`a ${FAKE_KEY} b`), "a sk-[redacted] b");
});

test("heuristic packets stay anchored in the user's own words", async () => {
  const provider = new HeuristicSignalProvider();
  for (const text of ["今天好累", "自由是什么", "帮我总结一下"]) {
    const packet = await provider.analyze({ turnId: "t", currentUserMessage: text });
    assert.doesNotThrow(() => assertPacketGrounded(packet, text));
    assert.ok(text.includes(packet.anchors[0].text));
  }
});

test("an ungrounded anchor is rejected", async () => {
  const provider = new HeuristicSignalProvider();
  const packet = await provider.analyze({ turnId: "t", currentUserMessage: "今天好累" });
  packet.anchors[0].text = "完全没说过的话";
  assert.throws(() => assertPacketGrounded(packet, "今天好累"), /anchor_not_grounded/);
});

test("length policy classes match the frozen classifier", () => {
  assert.equal(deterministicLengthPolicy("你是谁").dialogue_class, "boundary");
  assert.equal(deterministicLengthPolicy("帮我压成一句话").dialogue_class, "rewrite_summary");
  assert.equal(deterministicLengthPolicy("如果下雨就不去，能推出什么").dialogue_class, "logic");
  assert.equal(deterministicLengthPolicy("冰箱怎么减轻味道").dialogue_class, "practical");
  assert.equal(deterministicLengthPolicy("在吗").dialogue_class, "ordinary");
  assert.equal(deterministicLengthPolicy("帮我压成一句话").maximum_chinese_characters, null);
});

test("every failure category has a user-facing explanation", () => {
  for (const category of ["auth_rejected", "insufficient_balance", "rate_limited", "spending_guard", "user_cancel", "request_rejected", "empty_content", "tool_calls", "malformed_stream", "network_timeout"]) {
    const text = describeFailure(category);
    assert.ok(text && text.length >= 3, `${category} needs an explanation`);
  }
  assert.match(describeFailure("auth_rejected", "deepseek_api_key_absent"), /本地静态回答/);
});

test("buildDeepSeekRequest omits an absent optional temperature", () => {
  const request = buildDeepSeekRequest({ systemPrompt: "s", conversation: [{ role: "user", content: "u" }] });
  assert.ok(!("temperature" in request));
  const fixed = buildDeepSeekRequest({ systemPrompt: "s", conversation: [], temperature: 0 });
  assert.equal(fixed.temperature, 0);
});

test("DeepSeekError redacts its own message", () => {
  const error = new DeepSeekError("network_timeout", true, `failed ${FAKE_KEY}`);
  assert.ok(!error.message.includes(FAKE_KEY));
});
