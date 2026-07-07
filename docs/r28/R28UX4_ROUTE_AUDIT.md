# R28UX4 Route Audit

R28UX4 audits these static routes:

- `/` from `web/index.html`
- `/another_brain_chat/` from `web/another_brain_chat/index.html`

The root route was the old simple Answer Machine shell. R28UX4 replaces it with a static entry page that redirects to the process-transparent chat route and contains visible R28UX4 markers for smoke tests.

The chat route remains the canonical app surface. It loads:

- `styles.css?v=r28ux4-visible-preview-ui`
- `app.js?v=r28ux4-visible-preview-ui`
- `browser_runtime.js?v=r28ux4-visible-preview-ui`

The audit script is `scripts/r28ux4_route_audit.py`. It writes `artifacts/r28ux4/reports/route_audit.json` when run, and the report is not tracked.
