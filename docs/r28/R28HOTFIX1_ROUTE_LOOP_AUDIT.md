# R28HOTFIX1 Route Loop Audit

`scripts/r28hotfix1_route_loop_audit.py` checks static route-loop risk.

## Audit Coverage

- `vercel.json` redirects and trailing slash settings.
- Root entry file.
- `/another_brain_chat` entry file.
- `/another_brain_chat/` entry file.
- Client-side redirect code.
- `location.href`, `location.replace`, and `history.replaceState`.
- Query route behavior.
- Whether every route shares the HOTFIX1 app version.
- Whether q4 runtime markers remain visible.

## Latest Local Result

- `ok=true`
- explicit Vercel redirects: `[]`
- route model: `direct_static_entries_no_client_redirect`
- `/` redirect count: `0`
- `/another_brain_chat` redirect count: `0`
- `/another_brain_chat/` redirect count: `0`
- `/another_brain_chat?message=你是谁` redirect count: `0`
- `/another_brain_chat/?message=你是谁` redirect count: `0`

The JSON report is written to `artifacts/r28hotfix1/reports/route_loop_audit.json` and is not tracked.
