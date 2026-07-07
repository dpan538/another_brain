# R28UX4 Cache Busting

R28UX4 adds a static UI version:

- `ui_version`: `r28ux4-visible-preview-ui`
- `ui_build_marker`: `R28UX4`

The version appears in:

- root route source
- chat HTML
- `web/another_brain/runtime_mode.json`
- `web/another_brain/asset_manifest.json`
- cache-busted script/style URLs
- browser runtime cache-version logic

The browser runtime checks a local cache-version key. If the UI version changes, it attempts to delete the same-origin model shard cache named `another-brain-model-shards`, then records the new version. This invalidates stale local browser cache without removing the committed model assets or weakening static gates.

No service worker, backend, Vercel Function, Edge Function, or external cache service is introduced.
