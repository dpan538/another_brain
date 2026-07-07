# R28D6 Vercel Preview Instructions

Branch: `r28d6-final-vercel-preview-candidate`

Vercel settings expected for the preview:

- root directory: repository root
- install command: project default
- build command: `npm run build:vercel`
- output directory: `web`
- runtime: static files only

Preview validation checklist:

1. Confirm the preview deployment SHA matches the R28D6 branch commit.
2. Open `/another_brain_chat/`.
3. Confirm the page shows `Local only` and `No backend inference`.
4. Confirm runtime mode is visible as `static_q4_experimental`.
5. Confirm decode status, generated token count, fallback reason, and release blockers are visible.
6. Run a normal chat prompt.
7. Run a RAG evidence prompt.
8. Run insufficient-evidence and malicious-evidence prompts.
9. Import plain text context and JSON context, then clear imported context.
10. Use Clear chat and Abort generation controls.
11. Test narrow mobile layout.
12. Inspect network requests and confirm there is no backend inference, external LLM, Doubao, or hosted vector-store request.
13. Confirm static bundle remains under 100MB.

If preview fails, collect:

- branch and SHA
- first failing command
- build logs
- output directory
- static file count
- bundle size
- asset manifest path and checksum failures, if any

R28D6 does not mark Vercel preview as passed locally. The preview result must be recorded by a later manual or CI-backed validation step.
