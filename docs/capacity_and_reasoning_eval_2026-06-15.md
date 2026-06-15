# Capacity And Reasoning Evaluation, 2026-06-15

## Summary

This evaluation checks three questions:

1. How far the current tiny router storage shape can scale.
2. How large the static knowledge base is, and how far it can reasonably expand.
3. Whether the current runtime has active reasoning ability.

The short answer:

- The classifier itself is not the bottleneck. Route classification stays around `0.004-0.006 ms` even in synthetic 20MB and 40MB router profiles.
- The current `answerIndex` lookup shape is the bottleneck. Exact lookup is still acceptable at 40MB, but near-match scans become expensive.
- Knowledge lookup is fast at the current 55k-card scale: local p99 was `0.365 ms` over 20,000 iterations.
- Current reasoning is bounded routing/template reasoning, not general problem solving. It fails simple arithmetic and symbolic deduction probes.

## Current Artifacts

Measured from the current repo state:

| Artifact | Current value |
| --- | ---: |
| `web/tiny_router_model.generated.js` | `4,349,201 bytes` |
| `artifacts/tiny_router_model.json` | `9,041,992 bytes` |
| `answerIndex` entries | `809` |
| classifier features | `18,000` |
| action labels | `27` |
| `web/knowledge_base.generated.js` | `7,645,757 bytes` |
| knowledge cards | `55,151` |
| knowledge answer fields | `58,975` |
| specific fact cards | `1,016` |
| knowledge domains | `72` |
| knowledge shards | `43` |
| max shard bytes | `180,000` |

## Tiny Router Capacity Test

Command:

```bash
node scripts/eval_capacity_limits.mjs --targets-mb 20,40 --iterations 700 --near-iterations 80 --route-iterations 5000
```

Report:

```text
artifacts/training_os/capacity_limits_report.json
```

The synthetic profiles expand `answerIndex` with short generated prompt/answer pairs. This measures loaded-page runtime only, not network cold-start.

| Profile | Web size | Answer entries | Route p95 | Exact tail p95 | Miss p95 | Near-match p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| current | `4.15 MB` | `809` | `0.012 ms` | `0.008 ms` | `0.269 ms` | `0.639 ms` |
| synthetic 20MB | `20.12 MB` | `53,809` | `0.004 ms` | `0.739 ms` | `1.182 ms` | `184.685 ms` |
| synthetic 40MB | `40.01 MB` | `119,809` | `0.004 ms` | `1.877 ms` | `2.359 ms` | `447.281 ms` |

The same benchmark includes a projected exact lookup using `Map`:

| Profile | Exact tail Map p95 | Exact miss Map p95 |
| --- | ---: | ---: |
| current | `0.0003 ms` | `0.0006 ms` |
| synthetic 20MB | `0.0009 ms` | `0.0005 ms` |
| synthetic 40MB | `0.0009 ms` | `0.0005 ms` |

## Interpretation

The current 20MB/40MB profile can still answer within the public `1500 ms` loaded-page budget, but the current linear near-match design burns too much of that budget:

- `20MB near-match p95 ~= 185 ms`
- `40MB near-match p95 ~= 447 ms`

This is acceptable for a rare fallback, but it is not a good default for mobile Safari. Before using a 20MB or 40MB router in production, the router should be restructured:

1. Build an exact `Map` from normalized key to answer.
2. Build label buckets so near-match only scans entries for the predicted label.
3. Add a candidate cap for near-match, or a cheap lexical prefilter.
4. For larger profiles, shard the answer index by label or domain.

With exact `Map`, exact Q&A storage is not the issue. Near-match scanning is the issue.

## Knowledge Base Capacity

Current knowledge density is roughly:

```text
55,151 cards / 7.65 MB ~= 7,564 cards per MB
```

At the same density:

| Knowledge asset size | Estimated cards |
| ---: | ---: |
| `20 MB` | `~151,273 cards` |
| `40 MB` | `~302,546 cards` |

Current deterministic knowledge lookup benchmark:

```bash
python3 scripts/bench_knowledge_runtime.py 20000
```

Result:

| Metric | Value |
| --- | ---: |
| iterations | `20,000` |
| query count | `110` |
| avg | `0.118 ms` |
| p50 | `0.107 ms` |
| p95 | `0.240 ms` |
| p99 | `0.365 ms` |

Knowledge can expand substantially if it remains sharded and deterministic. The practical limit is less about lookup speed and more about:

- cold-start asset load,
- mobile memory,
- stale or low-quality generated cards,
- copyright and privacy boundaries,
- whether the knowledge is actually useful for dialog.

## Reasoning Probe

Command:

```bash
node scripts/dialog_probe.mjs \
  --prompt '小明有3个苹果，又买了2个，吃掉1个，还剩几个？' \
  --prompt '如果所有会飞的都不是鱼，小鸟会飞，小鸟是鱼吗？' \
  --prompt 'A比B高，B比C高，谁最高？' \
  --prompt '如果门禁是为了不让聪明变成乱说，那为什么不能只让模型自由发挥？' \
  --prompt '布里斯班和内蒙有什么关系？' \
  --prompt '如果我问罗大佑和日本文学有什么共同点，你怎么推理？' \
  --prompt '一张照片没有失败，只有人会演绎失败情绪，这句话是什么意思？' \
  --text
```

Results:

| Prompt type | Observed answer | Assessment |
| --- | --- | --- |
| simple arithmetic | `你需要提问。` | fails active arithmetic |
| syllogism | `你要问哪一边？` | fails symbolic deduction |
| transitive comparison | `你需要提问。` | fails simple relation reasoning |
| gate reasoning | `门禁是功能，不是装饰。用来拦住跑偏。` | passes bounded policy reasoning |
| arbitrary relation | `你应该去问百度。` | conservative, but not inferential |
| culture comparison | answers only Luo Dayou | route-level miss; no comparative reasoning |
| photo statement | repeats calibrated answer | style memory, not explanation |

Current conclusion:

```text
The runtime has bounded policy/routing reasoning.
It does not yet have active general reasoning.
```

It can choose some routes, apply some gates, and refuse or stop. It cannot reliably solve math, syllogisms, transitive comparisons, or cross-domain analogies.

## Can We Train Reasoning?

Yes, but it should be controlled reasoning, not free generation.

The next viable architecture is a `10MB controlled reasoning gate`:

```text
query + compact state + draft answer
  -> referent
  -> question type
  -> predicate
  -> answer policy
  -> risk / reject label
  -> template id
```

This should not generate long natural language. It should decide whether the draft answer is allowed, wrong-referent, too broad, too certain, private, or should ask a clarifying question.

Reasoning training data should include:

- arithmetic and symbolic minimal pairs,
- relation/transitive comparison cases,
- culture comparison cases,
- referent ambiguity cases,
- stop-boundary cases,
- wrong-answer hard negatives,
- trace labels, not just final answers.

## Expansion Plan

### R9: Capacity Hardening

- Replace linear exact lookup with `Map`.
- Build `answerIndexByLabel` buckets.
- Add a capacity benchmark gate for current, 20MB, and 40MB profiles.
- Target:
  - exact p95 `< 10 ms`,
  - near-match p95 `< 100 ms` at 40MB,
  - loaded-page answer `< 1500 ms`.

### R10: Culture And Knowledge Growth

- Add curated culture cards in batches:
  - Japanese literature,
  - Japanese culture,
  - Chinese folklore,
  - art history,
  - Luo Dayou and Chinese-language music without lyrics.
- Add evaluation before expansion.
- Keep copyrighted lyrics out of runtime answers.

### R11: Controlled Reasoning Gate

- Add trace schema:
  - `referent`,
  - `question_type`,
  - `predicate`,
  - `answer_policy`,
  - `risk_label`.
- Train a compact classifier/verifier, not a free generator.
- Add hard-negative evaluation.

### R12: Browser Profiles

- Keep profiles:
  - `lite`: current router,
  - `standard`: optimized 20MB router,
  - `full`: optimized 40MB router + reasoning gate.
- Safari mobile should decide the default profile.
