# R28B9 Bundle Size Breakdown

R28B9 is a static bundle diet round. It does not train, add model assets, add tokenizer artifacts, add shards, connect a backend, or claim a product model.

Run:

```bash
python3 scripts/r28b9_bundle_size_breakdown.py
```

The script compares deployable `web/` files from `origin/r28p0b-prelaunch-integration` against the current branch after `.vercelignore` rules are applied. It writes the local report to:

```text
artifacts/r28b9/reports/bundle_size_breakdown.json
```

Breakdown categories include:

- JS runtime.
- Chat shell.
- Docs/static copied files.
- Demo RAG assets.
- CSS.
- Source maps.
- Unused test/demo assets.
- Manifest overhead.
- Knowledge shards.
- Generated runtime data.

Safe reductions in this branch:

- `web/culture_cards.generated.js` is regenerated as compact JS by `scripts/build_culture_cards.mjs`; the card data is preserved while pretty-print whitespace is removed.
- Production static upload excludes local eval/demo harness files: context stress cases, model inference cases, model gate page/script, bench page/script, WebGPU bench page/script, and source maps if they appear.

Measured result:

- Before deployable bundle: `22227048` bytes.
- After deployable bundle: `19613136` bytes.
- Bytes saved: `2613912`.
- Compact generated runtime data saved: `1560873` bytes.
- Ignored eval/demo assets saved: `1053039` bytes.
- Source maps found: none.

Largest remaining deployable categories:

- Generated runtime data: `9552034` bytes.
- Knowledge shards: `9046423` bytes.
- JS runtime: `909983` bytes.
- Chat shell: `57293` bytes.

The root runtime, `/another_brain_chat/`, adapter bridge, asset cache, static RAG demo, non-product warnings, and acceptance harness source remain in the repository.
