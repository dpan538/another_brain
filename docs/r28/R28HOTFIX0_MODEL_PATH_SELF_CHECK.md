# R28HOTFIX0 Model Path Self-Check

The UI exposes a visible `检查本地模型路径` button and also runs the same check during boot.

## Checked Items

- Manifest: `web/another_brain/asset_manifest.json`
- Runtime mode: `web/another_brain/runtime_mode.json`
- q4 manifest: `web/another_brain/model_assets/r28m1/quantization.manifest.json`
- Checksums: `web/another_brain/model_assets/r28m1/checksums.sha256.json`
- Tokenizer: `web/another_brain/model_assets/r28m1/tokenizer/runtime_tokenizer.json`
- q4 shards: `web/another_brain/model_assets/r28m1/shards/*.bin`
- q4 forward smoke through the static worker.

## UI Output

The self-check panel shows:

- `manifest: pass/fail`
- `q4 shards: pass/fail`
- `exact tokenizer: pass/fail`
- `q4 forward: pass/fail`
- `q4_forward_ran=true/false`
- `tokens_generated`
- `runtime mode`
- `answer source`
- `fallback reason`

## Local Smoke Result

Local same-origin q4 smoke generated one token from committed static q4 assets:

- `runtime_mode=static_q4_experimental`
- `q4_forward_ran=true`
- `tokens_generated=1`
- `decode_status=exact_runtime_tokenizer`
- `quality_status=quality_weak_q4_forward_smoke`

This is process-path verification only. It is not product model admission.
