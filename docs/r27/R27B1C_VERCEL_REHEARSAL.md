# R27B1C Vercel Rehearsal

The rehearsal target is a static Vercel deployment with `vercel.json` configured for `framework: null`, `outputDirectory: web`, and `buildCommand: npm run build:vercel`.

The route under rehearsal is `/another_brain_chat/`. It opens the B0 chat shell, uses the B1B browser runtime wrapper, and runs with mock or synthetic local generation only.

Checks are provided by `scripts/r27b1c_verify_deploy_bundle.py` and `scripts/r27b1c_vercel_rehearsal.py`. They verify static bundle size, static file count, route markers, no API or function inference surface, no external model URL, no hosted vector store config, no server-side LLM dependency, no tracked artifacts, and a local route smoke when the local Python HTTP server is available.

The rehearsal is deployment-path evidence only. It is not model quality evidence, product admission, or a release checkpoint.
