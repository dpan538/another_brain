# Vercel Deploy Contract

This repo deploys `web/` as a static public runtime. Vercel is a publication
surface, not a training or evaluation runner.

## Build Boundary

Vercel must run:

```bash
npm run build:vercel
```

The command may:

- stamp `web/runtime_version.js` with the current deployment commit;
- update the top-level `app.js?v=` cache-busting token;
- verify that the static public runtime is safe to publish.

The command must not:

- run long endpoint/training loops;
- build or commit model weights;
- run browser/WebGPU benchmarks as an authority gate;
- generate private memory artifacts;
- deploy raw `.docx`, PDF, corpus, local path, or private data.

## Local Release Boundary

Before pushing `main`, local release checks remain responsible for product
quality:

```bash
npm run check:release
npm run check
```

Those checks may be slower because they validate endpoint behavior,
anti-lobotomy invariants, R21 typed-control gates, WebGPU contracts, privacy,
copyright, and source boundaries.

## Cache Boundary

Public JavaScript must not be served as immutable unless every imported module
URL is content-addressed. The current app uses query-versioned modules, so
Vercel serves JavaScript with:

```text
Cache-Control: public, max-age=0, must-revalidate
```

This keeps Git push deployments observable on the real mobile browser path.

## Freshness Probe

Deployment parity should compare:

- local `git rev-parse HEAD`;
- deployed `web/runtime_version.js` commit;
- deployed `app.js?v=` token;
- deployed asset hashes and response headers.

If the deployed commit does not match local `main`, the report must say stale
deployment rather than claiming browser parity.
