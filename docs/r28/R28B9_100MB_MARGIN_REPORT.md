# R28B9 100MB Margin Report

Run:

```bash
python3 scripts/r28b9_budget_margin_report.py
```

The report writes:

```text
artifacts/r28b9/reports/budget_margin_report.json
```

R28B9 uses the A12 full static estimate of `98385593` bytes as the starting point. The new estimate subtracts only measured deployable static bundle savings from this branch.

Measured result:

- Before deployable bundle: `22227048` bytes.
- After deployable bundle: `19613136` bytes.
- Bytes saved: `2613912`.
- Original A12 full static estimate: `98385593` bytes.
- New full estimate for 96M: `95771681` bytes.
- New 100MB margin: `4228319` bytes.
- Margin greater than 3MB: yes.
- Margin greater than 5MB: no.

Interpretation:

- If margin is greater than 3MB, the 96M candidate has a safer prelaunch budget than R28P0B.
- If margin is greater than 5MB, the margin is materially safer for product-path iteration.
- Passing this report does not admit real model assets and does not approve product, browser, or release checkpoint admission.
