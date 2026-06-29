# R25E Real First-Token Gate

`npm run eval:static-llm-first-token` still passes in fixture/blocked mode when
no production manifest is admitted.

Strict real-token mode is:

```bash
npm run eval:static-llm-first-token -- --candidate <candidate_id> --require-production
```

Strict mode must fail unless all of these are true:

- a production manifest is admitted
- the manifest points only to same-origin static files
- tokenizer and config load locally
- required assets verify with real sha256 hashes
- backend format is supported by a real browser backend, not an R25D stub
- the first observed token comes from the real backend, not the fixture

The report records backend, model id, tokenizer status, loaded bytes, cache
status, generated token preview, and first-token latency. It must not expose
hidden prompts, chain-of-thought, private memory, or server capability claims.

When no reviewed local artifact exists, the correct result is skipped real
first-token with reason `no_admitted_static_llm_manifest`.
