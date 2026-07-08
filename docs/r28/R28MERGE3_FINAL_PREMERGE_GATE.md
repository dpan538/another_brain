# R28MERGE3 Final Premerge Gate

R28MERGE3 combines the SHIP0 q4 mount path, SURF4 natural daily surfaces, and the UX7-style minimal Chat/Loading/Dashboard presentation into a final preview PR candidate.

## Label

`preview_ready_not_merge_ready`

The branch is preview-ready because the local static gates pass and q4 assets are admitted/fetchable. It is not merge-ready because product admission, browser admission, and release checkpoint admission remain intentionally false.

## Integrated

- SHIP0 q4 asset path, loading state, Plan B retry, and runtime truth visibility
- UX7 loading screen, Chat/Dashboard split, small q4 status, mobile-first CSS hooks
- SURF4 short daily answer surfaces and deterministic narrow variation

## Non-Claims

- no training
- no model weight changes
- no q4 shard changes
- no product model admission
- no browser admission
- no release checkpoint
- no backend inference
- no external LLM API
- no Doubao
- no hosted vector store
