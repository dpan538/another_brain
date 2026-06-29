# R25C Local Artifact Review

No reviewed local decoder artifact was found in `static_llm/inbox/` or
`static_llm/models_staging/` during this R25C patch.

Result:

- real model admitted: false
- real weights committed: false
- training run: false
- remote download: false
- external model API call: false
- manifest admission status: no production manifest admitted
- runtime draft path: disabled until a future admitted artifact exists

The next artifact review should place a local candidate under an approved inbox
path with `artifact_metadata.json`, then run:

```bash
npm run inspect:static-llm-artifact -- --dir static_llm/inbox/<candidate> --write-report
npm run plan:static-llm-shards -- --dir static_llm/inbox/<candidate>
npm run create:static-llm-manifest -- --from-artifact static_llm/inbox/<candidate> --profile pro_static_llm_full --dry-run
```

R25D should bind an actual browser inference backend and run a first-token smoke
only after a local decoder artifact is admitted.
