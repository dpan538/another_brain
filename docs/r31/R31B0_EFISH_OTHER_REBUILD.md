# R31B0 — efish other: rebuilt surface, persona and keyboard

R31B0 rebuilds the product surface from nothing in `app/` (React, Vite, PWA) and
moves the answer contract from a generic prompt to a persona compiled from the
owner's own writing. `web/` and the live deployment are untouched; cutover is a
separate, explicit step.

## Round scope, as set by the owner

1. DeepSeek answers in the owner's value-logic.
2. Branding and chat window are rebuilt.

Cards, vectors and a query encoder are deferred. "Answer like me" is a values
problem, and values fit in a cached system prompt; retrieval is for facts and is
a later layer.

## Persona

`private_sources/derived/values_logic_profile_v0.4.md` is the working document;
`app/src/engine/persona_prompt.js` is its compiled form. Sources: 101 answered
questions, the 北上 essay, every IN_PRAISE_OF_TIME text, Church, the 72-page
poetry collection, eleven 鳄鱼的美食屋 articles, six English essays and the
statements on daipan.art — 490 source items, about 10,700 owner-written Chinese
characters.

Rules the owner fixed on 2026-09-20:

- Identity is simultaneous, not broader: person, memory, crocodile, dialog box.
  The crocodile is amphibious; home is by the lake (湖) and by Shanghai (沪).
- Never more than two sentences. Enforced on the text by `sentence_limit.js`,
  which also cancels the stream when the second sentence closes.
- Sharp with everyone, not only when provoked.
- Where there is no material, the model answers from its own knowledge in his
  voice. One guard is kept: no invented facts about the owner himself.
- References (物哀, Schopenhauer, 易经…) appear naturally, unexplained.

Only already-public sentences are quoted in the prompt, and nothing that
IN_PRAISE_OF_TIME protects (address, coordinates, timestamps) appears in it; a
test asserts both.

## Surface

- Home: `this is efish other, another.` on a tilted wavy-framed sheet, blue dots,
  date stamp; scroll down for the chat.
- Chat: one wavy-framed card of pages after the reference page (`p.N` top left,
  centred text). The user types in the typewriter face, efish writes in bold.
  Page and card share one bright paper white.
- Keyboard: the system keyboard is never raised. Keys are thin outlined squares,
  circles and rounded squares; space is an open bracket with a dashed floor.
  Because the system IME is unavailable, the keyboard carries a pinyin input
  method (47,480 keys, 1.15 MB, built from MIT-licensed jieba and pypinyin).
  A hardware keyboard drives the same keys.
- Easter eggs: `？`, a lone space, `null`, `鳄`, `够了`, `～`, `□`, `…`, and
  "你肯定错了" answer locally with sentences the owner wrote.
- About: one screen. Logo top-left returns home without clearing memory.
- Memory: IndexedDB on the device, pruned at 30 days. `/forget` clears it.
- Marks: every underline, the close circle and the arrow are hand-drawn SVG.
- Logo: E f i s h in five unrelated faces, the `i` on a cut-out patch, a neon
  marker scribble through the word.

## Budget

Precache is 1.6 MB including the pinyin dictionary, against a 10 MB first-load
budget. Two sentences need about 60–120 tokens, a third of the 192 the 3.5 s
latency figures were measured at.

## OPPO Sans 4.0

Referenced with `local()` for CJK ranges only, never shipped. Its licence says
"YOU may not make any modifications", which rules out subsetting, and the
unmodified file is 22 MB.

## Gates

The BYOK contract in `scripts/byok_product_policy.mjs` now covers `app/`. It
caught this change's own test file for carrying a key-shaped literal; the test
now assembles its fake key at runtime.

## Open decisions

1. **Where the key lives.** The product talks to other people, and visitors do
   not have a DeepSeek key. `direct` mode (key on the device, `/key`) only suits
   the owner. Public use needs `proxy` mode: a same-origin endpoint holding the
   key, which means one Vercel Function and a revision of the no-backend rule.
   The transport already supports both; nothing else changes.
2. **About copy** is a draft for the owner to rewrite. It says two models sit
   behind efish and that the small one is "still learning to speak", because the
   96M transformer is not in the answer path today.
3. **Cutover**: pointing Vercel at `app/dist`, retiring `web/` and the q4 assets.

## Non-claims

No live DeepSeek request was made with a real key. Answer quality under the
persona is unmeasured until the owner talks to it. No training ran. Nothing was
deployed.
