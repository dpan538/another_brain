# R25AQ High-Loss Family Review

R25AQ does not train, rerun R25AO, or generate a dataset. It reviews aggregate R25AO heldout buckets only; per-row loss is not faked.

## High-Loss Task Families

- Chinese_project_decision: loss 8.1009, sequences 2
- constraint_preservation: loss 8.0087, sequences 3
- draft_answer: loss 7.9233, sequences 1
- release_packaging_boundary: loss 7.8877, sequences 2
- no_backend_policy: loss 7.7922, sequences 4
- verify_draft: loss 7.5364, sequences 1
- retrieval_grounded_answer: loss 7.2252, sequences 1

## Personal Target Buckets

- local_first_static_browser_reasoning: loss 6.1930, sequences 17
- bounded_judgment: loss 5.9051, sequences 49
- tool_status_honesty: loss 5.7193, sequences 34
- project_continuation: loss 5.4602, sequences 45
- style_preference: loss 5.3952, sequences 38
- repair_after_weak_answer: loss 5.3539, sequences 58

## Structural Risks

- Train task-family counts are dominated by `unknown`, so source/task family labeling is still a risk.
- Several high-loss buckets have low sequence counts, making them fragile but still important as warning signals.
- Mixed/en weakness overlaps with technical boundary tasks, so repairing mixed coverage is higher priority than generic English fluency.

## Recommendation

R25AR should not repeat R25AO unchanged. It should use a lower-intensity repaired sampler with explicit mixed coverage and source/task-family diversity checks. R25AR remains inert design only; future training requires fresh approval, phase_4 remains blocked, and no weights or artifacts are committed.
