# R27A10 A8B/A9B Intake

R27A10 is audit and repair-selection work only. It is not product training, not formal decoder training, not phase_4, not product admission, and not browser admission.

## A8B Evidence

- Selected model/device/context: `new_100m` / `mps` / `256`
- Wall clock: `43208.896` seconds
- Optimizer tokens: `10576128` of minimum `15000000`
- Stop reason: `wall_clock_cap_reached`
- Final train/dev/heldout loss: `0.24599352478981018` / `5.301941096782684` / `3.82134909927845`
- Best dev loss: `4.954038664698601` at segment `9`
- Dialogue readiness: `not_ready`
- Previous q4 total estimate: `95000192` bytes

## A9B Handoff

- Selected candidate: `r27a8b_best_product_probe`
- Decision: `FREEZE_ENGINEERING_CANDIDATE`
- Handoff status: `engineering_candidate_weak_not_product_ready`
- Dialogue readiness label: `not_ready`
- Previous fits_100mb: `True`
- Micro recovery ran: `False`

## B4 Bundle Source

- B4 static bundle bytes used for full-budget audit: `22204089`
- Source: `user_supplied_r27a10_known_b4_actual`

## Intake Conclusion

A10 must not treat the A9B handoff as product-path ready. The A8B checkpoint can remain an engineering/research reference, but the loss gap and full static bundle budget have to be calibrated before any further product-path claim.
