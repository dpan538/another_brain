# R31A3 — Vercel Pro Budget Correction

The project deploys from GitHub to Vercel on the Pro plan. Two numbers in
this repository were wrong, and one architectural option is now closed.

## The 100 MB cap was the Hobby limit

| | Hobby | Pro |
| --- | ---: | ---: |
| Static file uploads | 100 MB | 1 GB |
| Included Fast Data Transfer | 100 GB/mo | 1 TB/mo |

`MAX_TOTAL_STATIC_BYTES = 100_000_000` matched the Hobby ceiling. The gate now
carries two separate numbers: `PLATFORM_MAX_STATIC_BYTES` at 1 GB, which is what
Vercel accepts, and `COLD_START_BUDGET_BYTES`, which is what a phone will sit
through. Only the second one governs the product.

## The gate was under-reporting the deployment by 48.3 MB

`deployable_web_files()` filtered by `.vercelignore`, which lists `*.bin`, so the
five q4 model shards were excluded from every budget number it produced. They are
served in production:

```
HEAD /another_brain/model_assets/r28m1/shards/model-q4-00001.bin
  HTTP/2 200, content-length: 12000000
Range 0-0 on shards 1 and 5 -> HTTP 206
```

`.vercelignore` filters a CLI source upload. This project deploys from a Git
connection, where the repository is cloned instead, so the pattern never applied.
The gate reported 21.7 MB against a real payload of 71.0 MB. It now measures
git-tracked content under `web/`, which is what the deployment receives.

## What a first visit actually costs

Production transfer was measured at about 209 KB/s in R29LOAD1.

| First-visit payload | Size | Time | Cold visits per 1 TB |
| --- | ---: | ---: | ---: |
| Today | 71.0 MB | 5.7 min | 14,094 |
| Legacy surface removed | 50.4 MB | 4.0 min | 19,857 |
| Legacy and q4 both removed | 1.1 MB | 5 s | 948,448 |
| A 120 MB browser encoder added | 170.4 MB | 13.6 min | 5,870 |

## A browser-side multilingual encoder is closed

The knowledge base is bilingual, so query-time embedding needs a multilingual
model. The smallest useful ones carry a large vocabulary table and land near
120 MB after int8 quantization. Vercel Pro would accept that, and 1 TB of
transfer would still cover roughly 8,300 cold visits a month. It is ruled out
because a first visit would take about ten minutes on the transfer rate this
project actually measures. The limit that binds is the phone, not the platform.

Query embedding therefore has to happen somewhere other than the visitor's
browser. Corpus vectors stay precomputed and static; at a few thousand cards
they are well under a megabyte.

## Current gate state: failing, deliberately, and not blocking deploys

`check:r27b0-static-budget` reports `cold_start_budget_exceeded:70954349>60000000`.
That is a true statement about the deployment. The gate is not part of
`build:vercel`, so nothing is blocked while the two levers below are decided.

## Lever one: the legacy surface is unreachable and still deployed

`web/index.html` is a byte-identical copy of the chat shell and loads only
`/another_brain_chat/app.js`, `/another_brain_chat/styles.css` and `/favicon.png`.
The old Answer Machine entry point no longer exists. Its assets are referenced
zero times from the chat surface or its manifests, and are still served.

140 files, 20.6 MB:

```
   5.20 MB  web/culture_cards.generated.js
   4.35 MB  web/tiny_router_model.generated.js
   1.40 MB  web/knowledge_shards/routing.json
   0.82 MB  web/context_stress_cases.json
   0.21 MB  web/model_inference_cases.json
   0.18 MB  web/knowledge_shards/shard_017.json
   0.18 MB  web/knowledge_shards/shard_003.json
   0.18 MB  web/knowledge_shards/shard_023.json
   0.18 MB  web/knowledge_shards/shard_011.json
   0.18 MB  web/knowledge_shards/shard_032.json
   0.18 MB  web/knowledge_shards/shard_027.json
   0.18 MB  web/knowledge_shards/shard_031.json
...and 128 smaller files
```

Removing them is safe on reference-counting grounds. It was not done in this
change: a bulk removal of tracked files needs an explicit decision, and
`check:knowledge-runtime`, which runs inside `build:vercel`, reads
`web/knowledge_shards/`. That gate has to be retired in the same change.

## Lever two: the q4 model

The five shards plus the runtime tokenizer are 49.3 MB, most of the payload.
The model fails every dialogue behaviour family under a correct forward
(R29B2M-R3), and the browser worker attends over one token, so what ships cannot
do contextual generation. DeepSeek now answers. Keeping the shards deployed costs
about 3.9 minutes of every cold visit for an artifact the product does not use.

This is a product decision rather than a technical one. The README presents
efishv1 as the project's core public artifact, so removing it from the deployment
changes what the site claims to be. Nothing is deleted either way: the shards stay
in git history and in the training lineage.
