# R27B0 100MB Asset Budget

R27B0 adds `web/another_brain/asset_manifest.json` as the same-origin static asset contract.

Current declared runtime assets:

- model assets: 0 bytes
- tokenizer assets: 0 bytes
- RAG assets: 0 bytes
- gate assets: 0 bytes
- total declared bytes: 0 bytes

Budget gates:

- total deployable static assets must stay under 100,000,000 bytes
- model assets are reserved up to 70,000,000 bytes
- tokenizer assets are reserved up to 5,000,000 bytes
- runtime/app shell assets are reserved up to 15,000,000 bytes
- RAG/gate assets are reserved up to 10,000,000 bytes

`scripts/r27b0_static_asset_budget.py` enforces the manifest contract, deployable `web/` size, tracked weight/artifact exclusions, external model URL rejection, and API/function inference rejection.
