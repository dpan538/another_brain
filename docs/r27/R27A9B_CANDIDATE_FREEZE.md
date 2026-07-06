# R27A9B Candidate Freeze

R27A9B is the A-line closeout after R27A8B. It inventories A8B, A7R2, A7, and A6 evidence, ranks only safety-clean candidates, and freezes one engineering checkpoint for B-line browser evaluation.

R27A9B does not run long training. Micro recovery is skipped by default and may only run once under the 1h / 2M optimizer-token cap if a future freeze decision explicitly requires it.

The selected checkpoint must be the best safe checkpoint, not a worse final checkpoint. If no safe checkpoint passes hard rejection, R27A9B writes `BLOCK_NO_CANDIDATE`.

This freeze is not product training, not formal decoder training, not phase_4, not product model admission, not browser admission, and not a release checkpoint.
