# R27C0 Local Import Bridge

The R27C0 bridge is a manual, browser-local adapter rehearsal. It provides:

- copy/paste context packet import
- manual evidence packet import
- JSON `StatePacket` export and import
- plain-text context import
- explicit session clear

The bridge is implemented in `web/another_brain_chat/context_bridge.js` and wired into `web/another_brain_chat/app.js` and `browser_runtime.js`.

## Runtime behavior

Imported packets live only in a JavaScript variable for the open page session. The bridge does not use `localStorage`, `sessionStorage`, IndexedDB, cookies, filesystem writes, or network sends.

When a valid context or evidence packet is present, its evidence records are merged with the same-origin static RAG records for the next browser runtime turn. The merge is temporary and in-memory. Clearing the bridge drops every imported packet.

## State import/export

The current runtime `state_packet` can be exported as a R27C0 `StatePacket`. Export places JSON into the import textarea only; it does not persist the JSON. Re-importing that packet attaches the parsed state to later local state packets as `imported_state_packets`.

## Validation

JSON imports are schema checked before they are admitted. Plain text imports are wrapped as a `MemoryContextPacket` with `source_type: "manual_text"`, `privacy_scope: "local_session_only"`, and `allowed_for_training: false`.
