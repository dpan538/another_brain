# Static LLM Production Admission Policy

R25E may inspect local decoder artifacts, but real model-like files remain
unstaged and uncommitted by default.

Production asset staging requires a marker inside the candidate directory:

```text
static_llm/inbox/<candidate>/APPROVE_STATIC_LLM_PRODUCTION_ADMISSION.json
```

Marker schema:

```json
{
  "approved": true,
  "model_id": "example/model-id",
  "reviewer": "reviewer name",
  "date": "YYYY-MM-DD",
  "scope": "inspect_only",
  "notes": "No private paths or secrets."
}
```

Scopes:

- `inspect_only`: inspect and dry-run only; no weights staged.
- `stage_assets`: assets may be copied to ignored staging, but not committed.
- `commit_assets`: required before real model-like files may be staged for git.

The marker is necessary but not sufficient. Production admission also requires
reviewed metadata, license/provenance, same-origin manifest paths, real sha256
hashes, Pro static budget fit, a no-backend/no-storage pass, no private data,
and green R24/R25 gates.

No remote download, server inference, Vercel Function inference, external model
API, or external storage product is allowed.
