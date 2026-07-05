# R27B0 Static-Only Runtime

R27B0 keeps the product shell static-only for Vercel.

Static-only contract:

- Vercel output directory remains `web`
- no API inference route
- no Vercel Function or Edge inference
- no external LLM endpoint
- no hosted vector store config
- no Blob runtime dependency
- no remote model URL
- same-origin asset manifest references only

`scripts/r27b0_check_static_only.py` checks the contract without reading training artifacts, root DOCX/PDF files, or `data/public_ingestion`.

The browser shell is intentionally a mock runtime. It prepares interfaces for future local retrieval, browser decoder, verifier, finalizer, and fallback components without admitting any real model.
