# R28D5 Final Prelaunch PR

Manual PR target:

- base: `main`
- head: `r28d5-final-prelaunch-pr`
- URL: `https://github.com/dpan538/another_brain/pull/new/r28d5-final-prelaunch-pr`

Selected base:

1. `origin/r28rt1-real-q4-forward` because RT1 passed real q4 token-id forward smoke.
2. `origin/r28rt0-browser-q4-runtime-smoke` remains fallback only if RT1 is unavailable.
3. `origin/r28m1-static-model-asset-admission` remains fallback only if RT0/RT1 are unavailable.

This PR keeps the R28M1 same-origin q4 static assets and the RT1 experimental browser runtime path. It also keeps the static chat shell, RAG demo evidence path, local adapter bridge, same-origin asset cache, fallback path, and non-product warnings.

This is a prelaunch PR candidate only. It is not product admission, browser admission, release checkpoint admission, or phase 4 approval.
