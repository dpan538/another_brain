# R25E Static Decoder Artifact Admission

R25E attempts admission of a reviewed local decoder artifact under the
`pro_static_llm_full` profile. It does not download, train, or commit weights.
R25F resets candidate selection, so R25E remains model-agnostic unless the user
supplies a reviewed local decoder artifact.
R25G adds a candidate decision step before that artifact intake. A reviewed
decision record may authorize inspection, but it still does not admit weights.

Approved local search paths:

- `static_llm/inbox/`
- `static_llm/models_staging/`

If no candidate directory with `artifact_metadata.json` exists, R25E is
blocked with `no_local_decoder_artifact_found`. That blocked result is green
only because it proves the repo did not fake model admission.

## Admission Flow

1. Discover approved local candidates.
2. Check the per-candidate production approval marker.
3. Validate artifact metadata, license, provenance, reviewer, and privacy.
4. Inspect tokenizer, config, runtime, and model-like files.
5. Classify backend format.
6. Plan shards against 32 MB target and 64 MB hard max.
7. Generate a dry-run candidate manifest with real hashes.
8. Check deploy payload and no-backend policy.
9. Attempt real first-token only when production manifest and real backend
   support exist.

Raw Hugging Face checkpoints, safetensors, PyTorch files, and GGUF files are
not automatically browser-runnable. They may require conversion to an approved
same-origin browser decoder format before a real first token is possible.

R24 remains the verifier, fallback, and recovery harness around any future LLM
draft. The fixture first-token smoke remains a loader test only, not model
performance.
