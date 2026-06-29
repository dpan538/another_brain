# Static Decoder Release Request Pack

This pack tells the project how to prepare a future static decoder release
artifact without Codex downloading remote weights or choosing an external
pretrained model.

For the main product path, place a future self-trained release artifact under:

```text
static_llm/inbox/browser_decoder_candidate_tbd/
```

Include:

- `artifact_metadata.json`
- a release decision record based on
  `static_llm/release_decisions/template.self_trained.json`
- `config.json`
- tokenizer files
- backend-ready model files or converted shards
- `checksums.sha256`
- license and provenance notes
- reviewer and review date

Before artifact intake, compare the release against the R25H capacity
envelope. The release record should declare total bytes, tokenizer/config
bytes, shard count, largest shard size, profile fit, and browser memory/cache
risk.

Before any real model-like file can be committed, the candidate directory also
needs an approval marker with `scope: "commit_assets"`. The marker does not
bypass manifest, budget, no-backend, first-token, or R24/R25 gates.

R25G and R25H do not train, admit weights, or run real first-token inference.
R25I also does not train; it only defines the from-scratch training roadmap.
External artifacts are allowed only as explicitly reviewed baseline or
compatibility inputs.
