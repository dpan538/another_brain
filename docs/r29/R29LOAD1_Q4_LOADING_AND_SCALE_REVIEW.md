# R29LOAD1 q4 loading and scale review

## Decision

- Highest priority: repair the existing 96M q4 fetch/mount path.
- Current result: the loading-chain repair is implemented and locally verified.
- Next training target: keep the 96M architecture and run a bounded, mask-corrected debug microcycle only after the browser forward path and evaluation contract are corrected.
- 300M status: feasible as a research architecture, but **not ready to train or ship on the current machine/runtime path**.
- This change does not run training, replace model assets, admit a product model, or commit checkpoints.

## Loading-chain root cause

The production q4 package contains five same-origin shards totaling `48,267,968` bytes. The worker downloaded them sequentially under one `180,000 ms` deadline.

A measured 1 MiB production range request transferred at approximately `208,919 B/s`. At that rate, a cold 48.3 MB transfer needs roughly 231 seconds before checksum and forward work. The previous 180-second total download budget was therefore structurally too short for a cold load.

The retry label `normalized_absolute` did not change worker asset URLs. A successful second attempt was consistent with reuse of browser HTTP cache populated by the first attempt, not with path normalization.

Two secondary defects obscured the diagnosis:

- worker byte/speed progress was discarded by the self-check report adapter, leaving the UI at a coarse stage percentage;
- an open question awaited the active q4 mount, so chat could appear hung while the background mount owned the worker.

## Repair

- Set the default download budget to `285,000 ms`, leaving 15 seconds inside the 300-second outer self-check window for checksum and one-token forward.
- Allow up to `345,000 ms` when the caller provides a 360-second outer window.
- Resume interrupted whole-shard streams from the received byte with a same-origin Range request.
- Keep hard total-download timeout behavior and terminate timed-out workers so later attempts cannot receive stale worker messages.
- Preserve byte counts, shard counts, transfer rate, timeout, and strategy through the browser progress adapter.
- Rename the misleading retry label to `reuse_http_cache`.
- Return an immediate explicit `q4_mount_in_progress` fallback for open questions instead of awaiting the background mount.

## Verification

- `npm run test:r29load1`: 4 passed.
- `npm run test:r28livefix0`: 26 TypeScript and 5 Python tests passed.
- `npm run test:r28ship0`: 14 TypeScript and 2 Python tests passed.
- `npm run test:r28load0`: 16 passed.
- `npm run test:r28hotfix4`: 29 TypeScript and 1 Python test passed.
- `npm run build:vercel`: passed.
- `npm run check:r27b0-static-only`: passed.
- `npm run check:r27b0-static-budget`: passed.
- `git diff --check`: passed.
- Local in-app browser: first `primary` attempt reached q4 ready with 5/5 shards, exact tokenizer, and one-token forward in 422 ms from the local static server; no console warnings or errors.
- Local open-question check: q4 generation started, first token arrived in 114 ms, and generation completed in 2,602 ms. The output was rejected by the existing quality gate, correctly separating model quality from model loading.

## 300M feasibility

The current selected model has `96,363,008` parameters and a `48,267,968` byte q4 package. A 300M q4 model is approximately `150,000,000` bytes before the rest of the static application.

Using the existing full-bundle accounting, the estimated static package is about `200,204,089` bytes. It cannot satisfy the current 100 MB profile, although it can fit the repository's planning-only Pro static profile.

At the measured production transfer rate, a 150 MB q4 cold load takes about 718 seconds (12 minutes) before verification and forward work. The current worker also rejects tensor stores over 100 MB.

Training constraints are stronger:

- fp32 parameters alone are about 1.2 GB;
- a conventional fp32 parameter/gradient/Adam-state floor is about 4.8 GB before activations and framework overhead;
- the machine is an Apple M1 with 16 GB unified memory and currently has about 15 GB disk free;
- six 300M fp32 checkpoints alone would consume roughly 7.2 GB, before optimizer state, reports, temporary files, and safety reserve.

The existing browser q4 runtime is also only a forward-smoke implementation: generation reads `token_emb.weight`, `pos_emb.weight`, and `lm_head.weight`; it does not execute the transformer blocks. Increasing parameter count would therefore increase download and training cost without making the current browser generator use the added transformer capacity.

Conclusion: 300M is a later research track, not the next training run. It requires a real transformer forward implementation, a >100 MB delivery profile, persistent cache/startup work, a measured 300M MPS smoke, and at least 25-30 GB free disk before approval.

## Recommended next training target

Keep 96M and treat the next run as a causal debug experiment.

1. First implement and validate the real transformer forward path, or explicitly keep the browser path classified as smoke-only.
2. Correct SFT loss masking from `full_next_token` to assistant-answer-only tokens, with explicit EOS and role-token handling.
3. Expand heldout evaluation with unseen paraphrases and cross-category confusion checks before adding training tokens.
4. Run one fixed-seed 96M microcycle from the R27A12 best checkpoint:
   - learning rate: `5e-6`;
   - optimizer-token cap: `300,000`;
   - checkpoint/evaluation interval: `50,000` optimizer tokens;
   - no hyperparameter sweep;
   - stop immediately on heldout or cross-category regression.
5. Promotion gates:
   - zero `用户:` / assistant-role prefix leakage;
   - no forbidden/private/eval leakage;
   - no cross-question answer substitution in the core probe set;
   - average probe score at least `0.80`, with every core category at least `0.70`;
   - heldout loss does not regress from the best checkpoint;
   - browser output is produced by the real q4 forward and passes the existing verifier.

The R28A13 run improved its narrow heldout loss and average probe score, but its quality gate still failed with role-prefix leakage and cross-question answer substitution. More parameters or more repetitions should not be used to hide those defects.
