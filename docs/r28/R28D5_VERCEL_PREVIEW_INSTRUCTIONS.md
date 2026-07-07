# R28D5 Vercel Preview Instructions

Create the PR manually with:

- base: `main`
- head: `r28d5-final-prelaunch-pr`

Preview validation checklist:

1. Confirm Vercel uses `npm run build:vercel`.
2. Confirm output directory is `web`.
3. Confirm the preview serves `web/another_brain_chat/index.html`.
4. Confirm `web/another_brain/runtime_mode.json` is reachable.
5. Confirm `web/another_brain/asset_manifest.json` is reachable.
6. Confirm model asset shard paths are same-origin relative paths.
7. Confirm no Function, Edge Function, backend inference route, external LLM endpoint, Doubao endpoint, or hosted vector store is configured.
8. Confirm bundle stays below 100,000,000 bytes.
9. Confirm UI still displays engineering-candidate and non-product warnings.

If preview fails, collect the branch, SHA, first failing command, build logs, output directory, Node version, dashboard overrides, environment variables, static file count, bundle size, and asset manifest status before changing code.
