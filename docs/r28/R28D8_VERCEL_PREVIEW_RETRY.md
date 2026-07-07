# R28D8 Vercel Preview Retry

This commit should trigger a new Vercel preview on PR #2.

Expected improvement:

- `npm run build:vercel` should no longer see `admittedStaticLlmAssets: 0` in Vercel fresh deployment.
- The R28M1 q4 shard `.bin` files should be present in Vercel's source upload because `.vercelignore` now re-includes `web/another_brain/model_assets/r28m1/**`.

If preview fails again:

1. Open the failed Vercel deployment details.
2. Copy the first failing command.
3. Copy 30 log lines before the first failing command.
4. Copy the exit code.
5. Copy any `staticLlmManifestsChecked` and `admittedStaticLlmAssets` values.

Do not merge until preview passes.
