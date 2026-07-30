# R27A2 Distillation Intake Policy

Distillation is now a required training pillar, but R27A2 does not call live teachers, external LLM APIs, or Doubao. Teacher output is never runtime truth and never defines personal voice.

Future teacher payloads must be final-answer-only, no chain-of-thought, no hidden prompts, no secrets, no private data, no eval prompt copies, and no old `question_pack_001` rows 51-100. Teacher candidates default to `review_status=pending` and `training_allowed=false` until a later reviewed promotion step.

The interface lives in `src/training/distillation/teacher_interface.py` and rejects CoT-looking, private-looking, eval-copy-looking, and excluded-row payloads.
