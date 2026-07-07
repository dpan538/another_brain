# R27C0 Adapter Packet Contracts

R27C0 defines local packet contracts for future external or peripheral adapters. It does not connect to Gmail, Google Drive, OAuth, a backend, an external LLM, or any remote connector.

## Common envelope

Every R27C0 packet uses the same privacy envelope:

```json
{
  "source_type": "manual_text | manual_json | browser_share | future_connector",
  "source_label": "...",
  "content": "...",
  "evidence": [],
  "privacy_scope": "local_session_only",
  "allowed_for_training": false,
  "created_at_client": "...",
  "provenance": {}
}
```

`privacy_scope` must be exactly `local_session_only`. `allowed_for_training` must be exactly `false`; the importer rejects every other value.

## Packet schemas

The six named contracts are exported from `src/browser_runtime/context_adapter.ts`:

- `InputAdapterPacket`
- `StatePacket`
- `EvidencePacket`
- `MemoryContextPacket`
- `AnswerSurfaceRequest`
- `AnswerSurfaceResponse`

Each schema shares the common envelope and may include `packet_type` with the schema name. The validator accepts only known `source_type` values and rejects missing evidence arrays, missing provenance, non-local privacy, and any training permission.

## RAG bridge

`MemoryContextPacket`, `InputAdapterPacket`, and `EvidencePacket` can become temporary evidence records for the browser RAG runtime. `StatePacket`, `AnswerSurfaceRequest`, and `AnswerSurfaceResponse` are contract/state surfaces and do not become evidence records.

No packet is written to the repository, browser storage, or a training corpus.
