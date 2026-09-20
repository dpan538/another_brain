// R31A0 — product performance budget.
// warm-up ≤ 5 s, answer latency ≤ 3.5 s.

import assert from "node:assert/strict";
import test from "node:test";

const CHAT = new URL("../../archive/legacy_site/web/another_brain_chat/", import.meta.url);
const mod = (n) => import(new URL(n, CHAT).href);

const B = await mod("product_performance_budget.js");
const L = await mod("deterministic_length_policy.js");
const { createDeepSeekAnswerPath } = await mod("deepseek_answer_path.js");

test("the two product requirements are the stated ones", () => {
  assert.equal(B.WARMUP_BUDGET_MS, 5_000);
  assert.equal(B.ANSWER_LATENCY_BUDGET_MS, 3_500);
});

test("a 10 MB payload warms up inside the budget on the measured CDN rate", () => {
  assert.equal(B.COLD_PAYLOAD_BUDGET_BYTES, 10_000_000);
  assert.ok(B.fitsWarmupBudget(10_000_000));
  assert.ok(B.projectedWarmupMs(10_000_000) <= B.WARMUP_BUDGET_MS);
});

test("today's payload and the legacy-only cleanup both miss the warm-up budget", () => {
  assert.equal(B.fitsWarmupBudget(71_000_000), false, "71 MB cannot warm up in 5 s");
  assert.equal(B.fitsWarmupBudget(50_400_000), false, "removing only the legacy surface is not enough");
  assert.ok(B.fitsWarmupBudget(1_100_000), "dropping the q4 package does meet it");
});

test("the slow-link projection is kept visible rather than hidden", () => {
  const d = B.describeBudget();
  assert.ok(d.projected_warmup_on_slow_link_ms > B.WARMUP_BUDGET_MS);
  assert.ok(B.SEQUENTIAL_SHARD_BYTES_PER_SECOND < B.CDN_TRANSFER_BYTES_PER_SECOND);
});

test("the remote call is budgeted against the measured 192-token reference", () => {
  assert.equal(B.REFERENCE_MAX_TOKENS, 192);
  assert.equal(B.projectedCompletionP95Ms(192), B.REFERENCE_COMPLETION_P95_MS);
  assert.ok(B.fitsAnswerBudget(192));
  assert.equal(B.fitsAnswerBudget(512), false);
  assert.equal(B.fitsAnswerBudget(400), false);
});

test("every length class is clamped inside the answer budget", () => {
  for (const cls of ["ordinary", "practical", "logic", "philosophy", "rewrite_summary", "boundary"]) {
    const n = L.maxTokensForClass(cls);
    assert.ok(n <= B.MAX_TOKENS_WITHIN_BUDGET, `${cls} exceeds the budget ceiling`);
    assert.ok(B.fitsAnswerBudget(n), `${cls} projects past the remote-call budget`);
  }
});

test("classes that wanted more room report that the cap bit", () => {
  assert.equal(L.lengthClassWasClamped("rewrite_summary"), true);
  assert.equal(L.lengthClassWasClamped("logic"), true);
  assert.equal(L.lengthClassWasClamped("ordinary"), false);
});

test("the answer path sends a token count inside the budget", async () => {
  const seen = {};
  const fetchImpl = async (_url, init) => {
    seen.body = JSON.parse(init.body);
    const enc = new TextEncoder();
    return {
      ok: true, status: 200,
      body: new ReadableStream({
        start(c) {
          c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "好" }, index: 0 }] })}\n\n`));
          c.enqueue(enc.encode("data: [DONE]\n\n"));
          c.close();
        }
      })
    };
  };
  const p = createDeepSeekAnswerPath({ getKey: () => "sk-testtesttesttesttest1234", keyPresent: () => true, fetchImpl });
  for (const q of ["在吗", "自由到底意味着什么", "帮我把这段压成一句话"]) {
    const r = await p.answer({ userText: q });
    assert.equal(r.ok, true);
    assert.ok(seen.body.max_tokens <= B.MAX_TOKENS_WITHIN_BUDGET, `${q} -> ${seen.body.max_tokens}`);
    assert.ok(B.fitsAnswerBudget(seen.body.max_tokens));
  }
});

test("local work on the answer path is held well under its slice", async () => {
  const fetchImpl = async () => {
    const enc = new TextEncoder();
    return {
      ok: true, status: 200,
      body: new ReadableStream({
        start(c) {
          c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "好" }, index: 0 }] })}\n\n`));
          c.enqueue(enc.encode("data: [DONE]\n\n"));
          c.close();
        }
      })
    };
  };
  const p = createDeepSeekAnswerPath({ getKey: () => "sk-testtesttesttesttest1234", keyPresent: () => true, fetchImpl });
  const started = Date.now();
  await p.answer({ userText: "今天好累" });
  assert.ok(Date.now() - started < B.LOCAL_WORK_BUDGET_MS, "local path must stay inside its budget slice");
});

test("cache priming sends one cheap request and only once", async () => {
  const calls = [];
  const enc = new TextEncoder();
  const fetchImpl = async (_u, init) => {
    calls.push(JSON.parse(init.body));
    return {
      ok: true, status: 200,
      body: new ReadableStream({
        start(c) {
          c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "." }, index: 0 }] })}\n\n`));
          c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 12000, completion_tokens: 1, prompt_cache_hit_tokens: 0 } })}\n\n`));
          c.enqueue(enc.encode("data: [DONE]\n\n"));
          c.close();
        }
      })
    };
  };
  const p = createDeepSeekAnswerPath({ getKey: () => "sk-testtesttesttesttest1234", keyPresent: () => true, fetchImpl });

  const first = await p.primeCache();
  assert.equal(first.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].max_tokens, 1, "priming must ask for the cheapest possible completion");

  const second = await p.primeCache();
  assert.equal(second.skipped, "already_primed");
  assert.equal(calls.length, 1, "priming must not repeat within a session");

  assert.ok(p.telemetry.some((t) => t.kind === "cache_prime"));
});

test("priming without a key makes no request", async () => {
  let called = false;
  const p = createDeepSeekAnswerPath({
    getKey: () => "", keyPresent: () => false,
    fetchImpl: async () => { called = true; }
  });
  const r = await p.primeCache();
  assert.equal(r.ok, false);
  assert.equal(r.reason, "deepseek_api_key_absent");
  assert.equal(called, false);
});

test("a priming failure never blocks the next answer", async () => {
  const enc = new TextEncoder();
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    if (n === 1) throw new Error("prime exploded");
    return {
      ok: true, status: 200,
      body: new ReadableStream({
        start(c) {
          c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "在" }, index: 0 }] })}\n\n`));
          c.enqueue(enc.encode("data: [DONE]\n\n"));
          c.close();
        }
      })
    };
  };
  const p = createDeepSeekAnswerPath({ getKey: () => "sk-testtesttesttesttest1234", keyPresent: () => true, fetchImpl });
  const primeResult = await p.primeCache();
  assert.equal(primeResult.ok, false);
  const answer = await p.answer({ userText: "在吗" });
  assert.equal(answer.ok, true);
  assert.equal(answer.text, "在");
});
