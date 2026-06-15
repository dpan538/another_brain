# Personal Mini Web-LLM Training Objective

R17 training is not a free long-generation objective. The near-term objective is a controlled local profile that improves routing, memory policy, retrieval, verification, and short bounded answers without storing private raw data in weights.

## Trainable Heads

- domain
- task_type
- question_type
- operation
- answer_policy
- risk_label
- coverage_requirement
- verifier_label
- memory_policy
- runtime_profile
- backend_preference
- template_id

## Non-Objectives

- no author-style imitation;
- no raw PDF/docx memorization;
- no lyrics or long copyrighted text;
- no source framing;
- no private facts in public runtime;
- no cloud inference;
- no final-answer long generation objective.

## Data Inputs

- internal reasoning trace rows;
- external reasoning traces with verified license;
- external public metadata cards and relation graph;
- 16-turn internal session memory policy rows;
- persona/method rows that separate style from factual correctness;
- verifier rejection negatives.

## Output Contract

The model may advise the planner and verifier. It does not override solvers, privacy/copyright/source guards, coverage gates, or direct approved PersonalFactCard policy.
