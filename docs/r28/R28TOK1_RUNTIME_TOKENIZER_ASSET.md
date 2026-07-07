# R28TOK1 Runtime Tokenizer Asset

Committed runtime asset:

- `web/another_brain/model_assets/r28m1/tokenizer/runtime_tokenizer.json`

Asset properties:

- schema: `r28tok1.exact_runtime_tokenizer.v1`
- tokenizer kind: `exact_runtime_bpe`
- vocab size: `16000`
- merge count: `15791`
- bytes: `997450`
- sha256: `a61b7aecc96d699be421b7d8b220e5d5cf04df3da6da5943715388a95bea115b`
- same-origin path: yes
- product model: false
- product admission: false
- browser admission: false
- release checkpoint admission: false
- phase 4: false

Manifest updates:

- `web/another_brain/model_assets/r28m1/checksums.sha256.json`
- `web/another_brain/asset_manifest.json`
- `web/another_brain/runtime_mode.json`
- `static_llm/manifests/r28m1_new_96m_q4.admitted.json`

The runtime tokenizer asset strips training-only context and does not include raw corpus text, eval prompts, private data, or old question-pack rows.
