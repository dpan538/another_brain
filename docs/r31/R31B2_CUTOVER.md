# R31B2 — cutover: the legacy site is archived, production is the new app

Owner's instruction (2026-09-20): push the frontend to main, archive the old site,
replace it completely with the new one.

## What changed

| | before | after |
|---|---|---|
| production build | `npm run build:vercel` → legacy static site in `web/` | `npm --prefix app ci && npm --prefix app run build` → `app/dist` |
| server routes | none | one reviewed Edge relay, `api/chat.js` → `app/server/chat_handler.js` |
| legacy site | `web/` (196 tracked files, ≈68 MB incl. the q4 bundle) | `archive/legacy_site/web/`, kept byte-for-byte, not deployed |
| root `vercel.json` | `outputDirectory: web` | `installCommand` / `buildCommand` / `outputDirectory: app/dist` + headers |
| first visit | ≈49.8 MB of model shards | 1.9 MB install; OPPO Sans (22.7 MB) fetched later in the background |

Nothing was deleted: `git mv web archive/legacy_site/web`. The R31A0 browser-key
modules of the old chat surface moved with it and stay under their contract
(`scripts/byok_product_policy.mjs`, `tests/r31a0`).

## Checks that describe the new production

- `npm run test:app` — the app's 31 tests (engine, relay, scene/memory/board).
- `npm run test:r31a0` — 63 policy and module tests, incl. the relay contract.
- `npm run check:static-local-product`, `npm run check:hybrid-lab-isolation`.
- `npm run check:app-budget` — install ≤ 10 MB, service worker and manifest present.
- `npm run test:r29b2m-r4h` — the lab added no route; the only route is the reviewed relay.

## Retired with the site

The R27–R30 suites that build, audit or byte-freeze `web/` (`legacy:build:vercel`,
`check:vercel-build`, `r27b0_static_asset_budget.py`, the R27D/R28 route and
readiness audits, …) described the legacy runtime. They are left in place for the
record and are not expected to run from the repository root any more. They were
not edited to pass.

## Owner actions (cannot be done by tooling)

1. Vercel → Project → Settings → Environment Variables: add `DEEPSEEK_API_KEY`
   (Production and Preview), then redeploy. Until then `/api/chat` answers
   `503 not_configured`: the drawing, the 鳄 board and the easter eggs work, model
   answers do not.
2. If the project's Root Directory was ever changed from the repository root, set
   it back to the root: the build and the route are declared in the root `vercel.json`
   and `api/`.
3. Recommended: a WAF rate-limit rule on `/api/chat`; a prepaid DeepSeek balance is
   the hard spending cap.

## Not verified

A live DeepSeek answer; the Vercel build itself before the push (simulated locally
from a clean checkout with the same commands); iOS/macOS Safari on real WebKit
(the simulator could not be driven on this machine); physical touch hardware.
