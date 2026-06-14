# Security

## Supported Surface

The public deployment is a static browser runtime under `web/`. It should not
ship server-side inference endpoints, private memory packs, raw source
materials, or credentials.

## Reporting

If you find a security or privacy issue, open a private report through GitHub
security advisories if available, or contact the repository owner directly.
Do not publish private paths, credentials, raw local artifacts, personal
documents, or reproduction steps that expose sensitive data.

## Release Checks

Before deployment, run:

```bash
npm run check:release
```

The release check blocks tracked private artifacts, obvious local paths,
vendored WebLLM experiments, local model weights, and generated private memory
payloads.

## Secrets

Do not commit Vercel tokens, `.env` files, cloud credentials, API keys, private
model URLs, or local machine paths. The public runtime does not require secrets.
