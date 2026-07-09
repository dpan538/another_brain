# R28STAB0 Pre-Merge Blockers

This ledger is generated locally by `scripts/r28stab0_runtime_soak.py` and summarized in `artifacts/r28stab0/reports/runtime_soak_report.json`.

## Blocking Checks

- Static route matrix must pass for root, chat, trailing-slash chat, and query-message routes.
- q4 static assets must be reachable by same-origin public paths under `/another_brain/`.
- Exact runtime tokenizer must be present.
- q4 forward smoke must generate at least one token through the local static q4 harness.
- Boot self-check must stay non-blocking and skip deep q4 forward.
- Manual deep self-check must support timeout/cancel recovery.
- Repeated sends must not create unbounded workers.
- Identity and greeting routes must stay under 100 ms after module load.
- Timeout, shard failure, tokenizer missing, insufficient evidence, conflicting evidence, and malicious evidence must recover to deterministic fallback surfaces.
- Product/browser/release admission claims must remain false.

## Current Blocker Policy

If `open_blockers` is non-empty, merge is blocked.

If `open_blockers` is empty, the local pre-merge stability gate is green, but merge is still manual. R28STAB0 does not auto-merge main and does not approve product admission, browser admission, release checkpoint admission, or phase 4.

## Evidence Command

```bash
python3 scripts/r28stab0_runtime_soak.py
```

The script exits non-zero when `open_blockers` is non-empty.
