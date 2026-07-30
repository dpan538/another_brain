# R27A5 Distillation And SFT Workflow

Public instruction rows enter an ignored candidate queue first. Candidates are pending by default and require no-CoT, hidden-prompt, private-data, eval-leakage, old-excluded-row, generic-style, model-identity, quality, language, license, unsafe-instruction, and answer-as-user compatibility filters before engineering promotion.

Live teacher probes are disabled by default and require both `--execute-live-teacher` and `R27A5_ALLOW_LIVE_TEACHER=1`. Teacher output is training-time candidate data only, final-answer-only, and never a runtime dependency or personal voice authority.
