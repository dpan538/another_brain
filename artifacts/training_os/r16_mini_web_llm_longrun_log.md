# R16 Mini Web-LLM Long-Run Log

Started: 2026-06-16 00:08:19 AEST

## Checkpoint 2026-06-16 00:08

- elapsed effective time: initial
- current phase: short-context correction completed, entering R16 Phase A
- files changed: short-context contract files were committed in `e99bafe`
- commands run: `git checkout main`, `git pull --ff-only origin main`, `npm run check:short-context`, `npm run eval:r9-regression:strict`, `npm run eval:r10-culture`, `npm run eval:r11-reasoning`, `npm run eval:r13-coverage`, `npm run check:persona-privacy`, `npm run check:persona-overfit`, `npm run check:personal-facts`, `npm run check:release`, `npm run check`
- failures: none in the short-context correction
- data added: 30 R16 short-context contract eval cases
- training/eval rows added: eval contract rows only; no model training rows yet
- model/gate metrics: no controlled gate training yet
- decisions: work continues directly on `main`; untracked PDF/docx files remain local and must not be committed
- next action: run training-depth audit and mini Web-LLM readiness baseline

## Checkpoint 2026-06-16 00:16

- elapsed effective time: short-context correction plus R16 audit baseline
- current phase: R16 Phase A/B baseline complete
- files changed: `docs/training_depth_audit.md`, `scripts/audit_training_depth.mjs`, `docs/mini_web_llm_readiness.md`, `scripts/eval_mini_web_llm_readiness.mjs`, `package.json`
- commands run: `npm run audit:training-depth`, `npm run eval:mini-web-llm-readiness`
- failures: none
- data added: audit reports only; no external data imported
- training/eval rows added: none in Phase A/B
- model/gate metrics: no controlled gate training yet
- decisions: training-depth verdict is `data_expansion`; readiness verdict is `hybrid_runtime_with_missing_training_or_browser_profile`
- next action: commit Phase A/B audit baseline, then start open dataset discovery and license gate
