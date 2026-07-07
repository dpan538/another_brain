# R28M1 Full Bundle Budget

R28M1 keeps the deployable static bundle under `100,000,000` bytes after adding q4 shards.

The budget gate checks:

- Deployable `web/` bytes are under `100,000,000`.
- Preferred margin is at least `10,000,000` bytes.
- No file is larger than `25,000,000` bytes.
- No file is larger than `50MiB`.
- No file is larger than `100MiB`.
- Declared asset bytes match actual files.
- Model assets are only under `web/another_brain/model_assets/r28m1/`.
- No tracked `artifacts/` path is introduced.

Current R28M1 gate result:

- `full_bundle_bytes=68,977,656`
- `total_model_asset_bytes=48,267,968`
- `tokenizer_asset_bytes=938`
- `static_file_count=167`
- `max_file_bytes=12,000,000`
- `margin_bytes=31,022,344`
- `preferred_margin_ok=true`

If the full bundle exceeds the cap, R28M1 must not commit the generated static assets. The blocker report is written under ignored `artifacts/r28m1/reports/`.
