# R28TOK0 Tokenizer Discovery

R28TOK0 discovery checks for an exact tokenizer source without touching training worktrees or committing training artifacts.

## Discovery Order

1. A12 handoff tokenizer path, if present.
2. Existing R28M1 runtime tokenizer asset.
3. Preserved R27 tokenizer artifacts under ignored `artifacts/`.
4. Committed R28M1 tokenizer metadata.
5. Blocker: `exact_tokenizer_artifact_missing`.

## Result

- Exact tokenizer found: yes.
- Source used for first preparation: `/Users/jarlgiovanni/Desktop/another_brain/artifacts/r27a4/model_lab/tokenizer/tokenizer.json`
- Source type: HuggingFace BPE tokenizer JSON.
- Vocab size: `16000`.
- Merge count: `15791`.
- Commit-safe runtime asset: yes, after stripping to runtime-only fields.

## Boundary

The source artifact was read only. R28TOK0 commits only the runtime tokenizer asset required for browser/static encode and decode. It does not commit tokenizer training inputs, raw corpus, clean corpus, eval prompts, private data, or training metadata.
