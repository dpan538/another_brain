# efish other

**this is efish other, an other.** — live at [efishother.com](https://www.efishother.com)

一个只做对话的 PWA：它以一个人的"另一个"来回答，最多两句话。
它背后不是一层 API 外壳，而是一段研究：一个从零训练的 96M 中文 transformer、一套盲测与放行纪律、
几个被如实记录的否定结论、一份从本人写作里整理出来的人格契约，以及为它专门做的键盘、输入法和首页。

efish other is a chat-only PWA that answers as one person's *other* — a person, a memory, an
efish (鳄鱼: the owner's alligator, which in this project is simply called *efish*) and a dialog box
at once — in two sentences at most. This repository is the research
behind it as much as the product: most of what is here is evidence about what did **not** work,
kept because it decided what the product became.

## The research, in order

**1. A small model, trained from nothing.** *efishv1* is a 96M-parameter Chinese decoder trained
on one laptop, with its own tokenizer, packaged as a 4-bit browser artifact (5 shards,
48,267,968 bytes) with an exact runtime tokenizer and a static, no-backend runtime. It is released
under MIT and documented in `MODEL_CARD.md` and `DATA_CARD.md`. The runtime that shipped it is kept
byte-for-byte in `archive/legacy_site/`.

**2. An evaluation discipline that was allowed to say no.** Blind prompts split by session,
semantic, source and event family; assistant-response-only masking; no prompt-specific routing;
no editing of frozen thresholds to make a candidate pass; release gates that fail closed. Lower
loss was never accepted as proof of dialogue ability. The gates live in `scripts/` and the
contracts in `docs/`.

**3. Negative results, recorded with their numbers.**

| Question | Test | Result |
|---|---|---|
| Can the 96M weights hold a dialogue after SFT? | R29B2M-R3: response-only SFT to 239,048 optimizer tokens | validation loss 4.82; **0 of 5 on all twelve** generated-dialogue behaviour families → `BLOCKED_DIALOGUE_QUALITY_WITH_EVIDENCE` |
| Was the browser forward ever contextual? | code audit of the q4 runtime | no: attention ran over one token, without a KV cache — the shipped model never ran a correct multi-token forward in a browser |
| Can the small model *steer* a large one? | R29B2M-R4H-R3: temperature- and structure-controlled replay, 24 blind pairs, oracle signal | preference 50.0 % (needed ≥ 55), factual non-regression **79.2 %** (needed ≥ 95), **7** unsupported facts (needed 0) → architecture rejected |
| Can it at least *select* among candidates? | R29P0 pairwise oracle, 20 live pairs | 0 % safe equivalent headroom → stopped before batch 2 |

See `docs/R29B2M_R4H_R3_CONTROLLED_CAUSAL_CRITIC_HYBRID.md`, `docs/R29P0_EQUIVALENCE_PAIRWISE_ORACLE.md`,
`docs/r29/` and `docs/r31/R31A0_DEEPSEEK_PRODUCT_PATH.md`.

**4. A persona that is compiled, not prompted into being.** R30J set out a method for excavating a
person's judgment from their own writing (`docs/R30J0_*`, `docs/R30J1*`). The persona contract in
`app/src/engine/persona_prompt.js` is compiled from a private value-logic profile of the owner's
essays, poems, published posts and answered questions, and then tuned against live answers with
him. What that tuning established is part of the research:

- vivid source material placed in a prompt is *lifted* by the model as imagery — only judgments go in, never images, and a test keeps them out;
- the model invents memories and creeds unless told exactly what may be said — the owner's positions are used verbatim and nothing beyond them is asserted for him;
- his syntax is measurable (short comma-split phrases, about ten characters a clause) and is tuned with a tool that reports it (`npm --prefix app run ask`);
- an answer must not arrive in the same instant as the question — the rhythm of thinking and writing is part of the voice.

**5. Where the small model stands today.** It is not in the answer loop. Generation is
DeepSeek-V4.1-Flash behind one reviewed relay; the 96M model and its training stack remain the
project's own line of work. The open questions are a bilingual vector knowledge base over the
owner's corpus with retrieval into the conversation, and retraining the small model for a design
in which a large model exists — the previous one was trained before that was true.

## The product

| | |
|---|---|
| Home | one pinned stage; 25 pen strokes reused across four drawings (a tree, a lock, a cloud over two doors, a loop) that end as the chat window's border; words are spelled letter by letter and tied with half-circles; one gesture plays one act (`app/src/ui/scene.js`, pure geometry, tested) |
| Chat | a two-sided conversation, never more than two sentences (enforced in code while streaming), paced: the question lands, efish thinks, then writes |
| Keyboard | the system keyboard is never raised; a hand-drawn keyboard with a sentence-level pinyin IME (47k-key dictionary built from jieba + pypinyin, Viterbi composition, repair of neighbour-key slips, fuzzy initials and finals) and a board of preset questions |
| Memory | conversations stay on the device (IndexedDB) for thirty days; "new" starts another, 本地记忆 reopens old ones; about twenty exchanges travel as context |
| Key | held on the server; one Edge route, `api/chat.js` → `app/server/chat_handler.js`, pins the model, the token budget and the persona, checks the origin, rate-limits, never logs; its contract is written down in `scripts/server_proxy_policy.mjs` and enforced by the release gates |
| PWA | React 19 + Vite + Workbox; 1.9 MB install; OPPO Sans shipped unmodified under its own licence and loaded after first paint |

Round-by-round records: `docs/r31/`.

## Repository map

```
app/                   the product (React PWA), its relay handler, tests and tools
api/chat.js            the only server route: a one-line Edge entry into the relay
archive/legacy_site/   the static runtime that shipped efishv1 (q4 shards, worker, dashboard)
src/, training/        model lab, training and corpus tooling for the 96M line
docs/                  contracts, methods and results for every round (R25 … R31)
scripts/, tests/       release gates, policies and their tests
MODEL_CARD.md  DATA_CARD.md  MODEL_LICENSE.md  PRIVACY.md  SECURITY.md
```

## Running it

```bash
npm --prefix app ci
npm --prefix app run key      # store a DeepSeek key locally (hidden input → app/.env.local)
npm --prefix app run dev      # http://localhost:5190
npm --prefix app run ask -- "你是谁？"          # question the relay from a terminal; --prod for the live site
```

Checks that describe the current product:

```bash
npm run test:app                      # engine, relay, scene, memory
npm run test:r31a0                    # policies, incl. the relay contract
npm run check:static-local-product
npm run check:hybrid-lab-isolation
npm run check:app-budget              # install ≤ 10 MB, service worker and manifest present
npm run test:r29b2m-r4h               # the lab added no route; the only route is the reviewed relay
```

The R27–R30 suites that build or byte-freeze the legacy site describe the archived runtime and
are kept for the record (`docs/r31/R31B2_CUTOVER.md`).

## What is not distributed

Raw private materials, the owner's value-logic profile and source writing, raw/clean/processed
corpus dumps, checkpoints, optimizer states, adapters, tokenizer-training artifacts, private
calibration data, hidden prompts and any API key. See `PRIVACY.md`.

## License

The repository source code is MIT licensed. See `LICENSE`.

The committed R28M1 q4 browser model package, published here as efishv1, is also released under
MIT as a static model artifact package. See `MODEL_LICENSE.md` and `MODEL_CARD.md`.

This license grant covers committed source and committed public runtime model assets only. It does
not grant rights to uncommitted private files, raw source materials, ignored artifacts, raw
checkpoints, LoRA/adapters, tokenizer training artifacts, private calibration data, or external
third-party materials. OPPO Sans 4.0 is distributed unmodified under its own licence
(`app/public/fonts/oppo-sans/LICENSE.txt`).
