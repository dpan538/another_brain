# R31B1 — server-held key, rebus home, keyboard and memory

Status: built and verified locally in `app/`. Nothing is committed or deployed.
No request has ever been made to DeepSeek with a real key from this code.

## 1. The key lives on the server

The owner decided the key belongs on the server: a product that talks as him cannot
ask each visitor for a key. This replaces the R31A0 rule "no API route" with
"exactly one reviewed relay route".

- `app/server/chat_handler.js` — the relay. POST only; the caller's `Origin` must match
  the host (or `EFISH_ALLOWED_ORIGINS`); the body is `{messages}` with roles
  `user`/`assistant` only, last one `user`, ≤12 messages, ≤600 chars each, ≤4000 total.
  The server adds the key, the persona prompt, the model (`deepseek-v4-flash`),
  `max_tokens: 160` and `thinking: disabled`. The caller can choose none of them.
  12 requests/minute and 200/day per address (best effort, per instance).
  The provider's error body is never forwarded; a missing key answers `503 not_configured`.
  Hanging up cancels the upstream generation. Nothing is logged.
- `api/chat.js` (repository root) — the Vercel Edge entry: one call to the handler.
- `app/server/dev_middleware.js` — the same handler under `vite dev` / `vite preview`.
- Client: `src/engine/deepseek_stream.js` sends only `{messages}` to `/api/chat`.
  If the server says `not_configured`, the app falls back to a key stored on the
  device through `/key` (owner's testing path).

Verified locally against a mock upstream: SSE passes through unchanged, cross-origin
→ 403, a smuggled `system` role → 400, persona/model/token budget fixed on the server,
client hang-up propagates. Tests: `app/tests/server.test.mjs` (9).

### Gate change

`scripts/server_proxy_policy.mjs` names the three relay files and holds them to a
stricter contract than BYOK files: no key literal, no client-visible key variable,
no other model host, no lab import, no logging; and positively: key read from `env`,
model and token budget pinned as constants, persona injected on the server, caller
system prompts rejected, origin check, rate limit, missing-key handling, a single
route, and no `process.env`/key name anywhere under `app/src`.
`check_static_local_product_no_backend.mjs` now reports the truth for the tree it
scans (`no_api_route: false`, `server_held_key_single_relay_route: true` when the
relay exists). Tests: `tests/r31a0/server_proxy_policy.test.mjs`, including negative cases.

### To make it live (owner only — the key is never handled by tooling)

1. Local: put `DEEPSEEK_API_KEY=…` in `app/.env.local` (git-ignored), `npm --prefix app run dev`.
2. Vercel: Environment Variable `DEEPSEEK_API_KEY` (Production + Preview). The build is declared in the root `vercel.json` (see R31B2).
   Optional `EFISH_ALLOWED_ORIGINS` for extra domains.
3. Recommended: a Vercel WAF rate rule on `/api/chat`; a prepaid DeepSeek balance is the hard spending cap.

## 2. Home: a rebus in one pinned stage

One sticky stage, 25 pen strokes that are never swapped (`src/ui/scene.js`, pure
geometry, tested), words spelled letter by letter and tied with half-circles:

| act | drawing (owner's references) | words | caption |
|---|---|---|---|
| 0 | a tree with a node graph in its crown | p‿e⁀r‿s⁀o‿n | 是人。 |
| 1 | a lock; its face reads `· 3 [keyhole] 0 ·`, a halo of ticks | m‿e⁀m‿o⁀r‿y | 是记忆。锁在这台设备里，三十天。 |
| 2 | a cloud raining over two doors: blue halftone (water) and black (land), a row of teeth | 湖 ⌒ 沪, hú / hù | 是鳄鱼。家在湖边，在沪边上。 |
| 3 | a loop with arrowheads and ticks | type → write → chat. | 是对话框。 |
| 4 | the loop becomes the chat card's wavy border; "type" lands on the input placeholder; the pieces land left to right as the typing line | | 可以打字。 |

The crown of the tree is the body of the lock is the cloud is the loop is the card
border (stroke 0). The logo is one element for the whole product: large over the
first drawing with `this is efish other, / an other.`, docked top-left as soon as the
page moves.

Navigation: the page never scrolls freely. A wheel turn, a swipe, an arrow key or a
tap on the arrow is one intent; the drawing then plays by itself to the next act
(`STOPS`, ≈3.2 s) and rests. Trackpad coasting is not a new intent; a fresh push
mid-coast is. A gesture that arrives mid-flight continues with an ease-out instead of
restarting. Resizes re-pin the page to its act. The logo, About → `chat`, Home/End
jump directly with a cross-fade instead of replaying the story. Reduced motion: no
intro, no glides, acts change instantly.

## 3. Chat

- `new` (top right of the card) starts another conversation; earlier ones stay in
  IndexedDB until they expire (30 days). Turns carry a conversation id `c`.
- 本地记忆 window (`src/ui/MemorySheet.jsx`, also `/memory`): lists conversations,
  reopens one, forgets one.
- 鳄 works like 中/En: it swaps the letters for a board of six ready-made questions
  (`src/engine/croc_keys.js`), four egg keys, 本地记忆 and return. Entering the chat
  always starts on the letters. Board answers are local and never call the model.
  Two replies are the owner's own sentences; four are factual placeholders waiting
  for him (`owner: false`).
- After sending, the card rests on the answer; typing returns it to the input line.
- Keys: 37×60 px hit cells that tile with no dead zones, 45 px hand-drawn caps (pen
  outlines that do not quite close, slight tilt per key), 19–20 px letters, press preview.
- Pinyin IME v2: whole-sentence composition (`nishishei` → 你是谁), repair of up to
  two neighbour-key slips, fuzzy z/zh c/ch s/sh n/ng. Unigram only: it has no
  context model, so some sentences pick a wrong homophone first.
- OPPO Sans 4.0 is the global face, shipped byte-identical with its licence
  (22.7 MB, ≈16 MB on the wire), loaded in the background after first paint and
  cached; skipped on data-saver.

## 4. Verification

- `npm --prefix app test` — 31 tests (engine 16, server 9, scene/memory/board 6).
- `npm run test:r31a0` 63, `check:hybrid-lab-isolation`, `check:static-local-product`,
  `build:vercel`, `test:r29b2m-r4h` 24 — all pass.
- Browser (375×812): every act, the hand-off into the card, one-intent stepping
  (one wheel gesture with coasting = exactly one act), direct jumps, the 鳄 board,
  `new`, 本地记忆, About.
- Not verified: a live DeepSeek answer, a Vercel deployment, real touch hardware,
  iOS Safari. The legacy site was archived in R31B2 (`docs/r31/R31B2_CUTOVER.md`).
