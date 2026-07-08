# R28SHIP0 Branch Integration

Base branch:

- `origin/r28ux5-chat-dashboard-split`

Already present in UX5 lineage:

- HOTFIX3 q4 asset path normalization
- HOTFIX2 non-blocking self-check shell
- ROUT1 fuzzy intent surfaces
- minimal Chat/Dashboard UI

Integrated in R28SHIP0:

- LOAD0-style loading states through `src/browser_runtime/loading/q4_mount_controller.ts`.
- Plan B retry schema through `src/browser_runtime/loading/q4_retry_plan.ts`.
- worker lifecycle restart-once guard through `src/browser_runtime/loading/q4_worker_lifecycle.ts`.
- runtime status consistency through `src/browser_runtime/runtime_truth_table.ts`.
- actual browser bundle wiring in `web/another_brain_chat/browser_runtime.js` and `web/another_brain_chat/app.js`.

R28SHIP0 intentionally avoids broad branch merges that would delete UX5 UI files or replace the minimal Chat/Dashboard shell.
