# Model Card: R28M1 q4 Browser Model

## Summary

R28M1 is the committed static q4 browser model package used by efishother's
local preview runtime. Its training lineage is a 96M-parameter project model,
packaged for same-origin static delivery and loaded inside the browser with an
exact runtime tokenizer, manifest checks, shard checks, and q4 forward warmup
diagnostics.

## Intended Use

- local browser-side answer drafting experiments
- retrieval-grounded short answer demos
- dashboard-visible runtime verification
- static q4 loading and tokenizer compatibility testing

## Not Intended Use

- product model admission
- browser admission
- release checkpoint admission
- legal, medical, financial, or safety-critical advice
- private data reconstruction
- claims of general reasoning competence without live evidence

## Runtime Package

- Public path: `web/another_brain/model_assets/r28m1/`
- Training lineage: 96M-parameter project model
- Quantization: q4 static browser package
- Shards: 5
- q4 shard bytes: 48,267,968
- Deployment profile: under 100 MB static q4 candidate
- Tokenizer: exact runtime tokenizer
- Inference surface: browser only, no backend or external API

The original training architecture lineage is larger than the committed q4
bytes. The repository intentionally ships only the admitted static browser
runtime package, not raw checkpoints or training artifacts.

## Training And Data

Training and corpus development used approved project-local materials and
public-source/public-library style material summarized by repository training
docs and manifests. The repository does not distribute raw private materials,
raw/clean/processed corpus dumps, tokenizer training artifacts, raw checkpoints,
LoRA adapters, or hidden prompts.

## Known Limitations

- The model can load and run q4 forward, but quality remains experimental.
- Some generated drafts can be mojibake or low-value and must be rejected by the
  verifier.
- Retrieval evidence and rule-based boundaries are still required for useful
  customer-facing answers.
- The dashboard must distinguish asset loading, q4 forward, answer quality, and
  fallback behavior.

## License

The committed R28M1 q4 browser model package is licensed under the MIT License.
See `MODEL_LICENSE.md` for scope and exclusions.
