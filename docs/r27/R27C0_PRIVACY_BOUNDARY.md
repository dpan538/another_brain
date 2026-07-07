# R27C0 Privacy Boundary

R27C0 is a local-session packet bridge only. Imported text and JSON are not source material for training and are not saved to the repository.

## Hard boundary

- No Gmail API
- No Google Drive API
- No OAuth
- No backend route
- No external LLM
- No remote fetch for adapter payloads
- No parsing root DOCX or PDF files
- No parsing `data/public_ingestion`
- No private raw training ingestion
- No adapter payload commits

## Enforcement

The validator rejects any packet where `privacy_scope` is not `local_session_only` or `allowed_for_training` is not `false`.

The bridge keeps imported packets in memory only. `.gitignore` also blocks local packet scratch files such as `adapter_payloads/`, `context_payloads/`, and `*.adapter-packet.json`.

`npm run test:r27c0` checks the contract, local import behavior, no remote send, no OAuth config, no backend route, no storage/write calls, no private raw training paths, and RAG evidence integration.
