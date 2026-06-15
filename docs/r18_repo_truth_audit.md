# R18 Repo Truth Audit

R18 starts from a deliberately skeptical position: earlier green evals may have measured path coverage, scaffold health, or deterministic gate hardening rather than proof of real training scale.

The audit script `scripts/audit_repo_truth_r18.mjs` checks the actual repository state instead of trusting prior reports. It inspects recent commits, package scripts, training rows, split metadata, source registries, controlled-gate artifacts, WebGPU reports, internal-session-memory code, and forbidden tracked files.

The audit distinguishes:

- `path_coverage_only`: evals or routes were added, but no meaningful training rows, splits, metrics, or artifacts exist.
- `scaffold_heavy`: useful docs/scripts exist, but proof of data scale or runtime use is weak.
- `partial_real_training`: controlled training rows and local gate artifacts exist, but external data scale, browser proof, or runtime export remains incomplete.
- `controlled_training`: a gate/verifier/classifier was trained with splits and metrics, without free generation.
- `mini_web_llm_progress`: external knowledge scale, controlled training, browser profile proof, and safe runtime artifacts all support a mini Web-LLM profile.
- `inconsistent_claims`: reports contradict code, scripts, or tracked artifacts.

R18 should not claim completion unless the proof-of-work completion gate also passes. If network, browser, license, or local hardware constraints block a threshold, the correct verdict is `safe_partial`, not completion.

