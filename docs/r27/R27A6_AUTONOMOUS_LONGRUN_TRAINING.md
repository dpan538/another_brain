# R27A6 Autonomous Longrun Training

R27A6 exists because R27A5 proved that the R27A4 mini_8m checkpoint and 16k tokenizer can be resumed safely, but also showed that a single sustained CPU segment is not enough to judge dialogue-product readiness.

R27A6 is a bounded autonomous engineering campaign. It may run multiple segments under one consumed marker, evaluate after each segment, keep best-checkpoint metadata, and stop on regression. It is not open-ended training and not a hyperparameter sweep.

Hard caps are 30,000 steps, 50,000,000 train tokens, 10 segments, 4,000 steps per segment, 8,000,000 tokens per segment, and 12 checkpoints on CPU. Accelerator caps remain policy metadata only unless a stable accelerator is detected.

Early-stop rules include NaN loss, repeated dev-loss regression without probe gain, safety probe failure, generic assistant collapse, RAG honesty regression, eval/private/old-row leakage, artifact-safety failure, or hard-cap exhaustion.

Best checkpoints are metadata only. Checkpoint files remain ignored under `artifacts/r27a6/model_lab/checkpoints/`.

R27A6 does not admit a product model, does not approve phase_4, does not release a checkpoint, and does not commit weights or tokenizer artifacts.
