# Static Decoder Candidate Request Pack

This model-agnostic pack tells the user how to supply a future local decoder
artifact without Codex downloading remote weights or choosing a model.

Place the future local artifact under:

```text
static_llm/inbox/browser_decoder_candidate_tbd/
```

Include:

- `artifact_metadata.json`
- a candidate decision record based on `candidate_decision.template.json`
- `config.json`
- tokenizer files
- backend-ready model files or converted shards
- `checksums.sha256`
- license and provenance notes
- reviewer and review date

Before artifact intake, compare the candidate against the R25H capacity
envelope. The decision record should declare total bytes, tokenizer/config
bytes, shard count, largest shard size, profile fit, and browser memory/cache
risk.

Before any real model-like file can be committed, the candidate directory also
needs an approval marker with `scope: "commit_assets"`. The marker does not
bypass manifest, budget, no-backend, first-token, or R24/R25 gates.

R25G and R25H do not train, admit weights, or run real first-token inference.
