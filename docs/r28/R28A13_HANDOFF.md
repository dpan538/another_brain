# R28A13 Candidate Handoff

- Handoff status: `bounded_sft_recovery_candidate`
- Selected model: `new_96m`
- Selected checkpoint: `/Users/jarlgiovanni/Desktop/another_brain_train_r28a13/artifacts/r28a13/model_lab/checkpoints/r28a13_abstract_value_sft_recovery_v1_seg01.pt`
- Optimizer tokens: `2667520`
- Baseline heldout loss: `9.920998414357504`
- Candidate heldout loss: `0.13284655039509138`
- Baseline probe score: `0.55`
- Candidate probe score: `0.6438`
- Quality gate passed: `False`
- Quality blockers: `['probe_role_prefix_leak:life_death', 'probe_expected_terms_missing:life_death', 'probe_quality_below_threshold:life_death', 'probe_expected_terms_missing:why_live', 'probe_quality_below_threshold:why_live', 'probe_role_prefix_leak:beauty', 'probe_expected_terms_missing:relation', 'probe_quality_below_threshold:relation', 'probe_role_prefix_leak:language_meaning', 'probe_expected_terms_missing:language_meaning', 'probe_quality_below_threshold:language_meaning', 'probe_expected_terms_missing:evidence_insufficient', 'probe_quality_below_threshold:evidence_insufficient', 'probe_expected_terms_missing:evidence_conflict', 'probe_quality_below_threshold:evidence_conflict', 'probe_role_prefix_leak:malicious_evidence']`

This handoff is only for later static asset admission dry-run review. It does not replace current static assets and does not approve phase_4, product admission, browser admission, or release checkpoint status.
