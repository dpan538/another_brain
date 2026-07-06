# R27A12 Disk Reclaim

R27A12 may reclaim only ignored artifact outputs. It does not delete tracked files, root documents, `data/public_ingestion`, private sources, or B-line source files.

## Disk

- Free: `43.103` GB
- Repo size: `0.111` GB

## Largest Artifact Rounds

- `/Users/jarlgiovanni/Desktop/another_brain_train_r27a11/artifacts/r27a7`: 0.747 GB
- `/Users/jarlgiovanni/Desktop/another_brain_train_r27a8b/artifacts/r27a8b`: 0.425 GB
- `/Users/jarlgiovanni/Desktop/another_brain/artifacts/r27a6`: 0.218 GB
- `/Users/jarlgiovanni/Desktop/another_brain_train_r27a7r2/artifacts/r27a6`: 0.218 GB
- `/Users/jarlgiovanni/Desktop/another_brain/artifacts/r27a5`: 0.071 GB
- `/Users/jarlgiovanni/Desktop/another_brain/artifacts/r27a7`: 0.03 GB
- `/Users/jarlgiovanni/Desktop/another_brain_train_r27a7r/artifacts/r27a7`: 0.03 GB
- `/Users/jarlgiovanni/Desktop/another_brain/artifacts/r27a4`: 0.014 GB
- `/Users/jarlgiovanni/Desktop/another_brain_train_r27a7r2/artifacts/r27a4`: 0.014 GB
- `/Users/jarlgiovanni/Desktop/another_brain_train_r27a10/artifacts/r27a4`: 0.001 GB
- `/Users/jarlgiovanni/Desktop/another_brain_train_r27a11/artifacts/r27a4`: 0.001 GB
- `/Users/jarlgiovanni/Desktop/another_brain_train_r27a7r/artifacts/r27a4`: 0.001 GB

## Reclaim

- Execute: `True`
- Free before: `6.85` GB
- Free after: `43.103` GB
- Deleted entries: `104`
- Blockers: `[]`

Latest handoffs and the R27A11 tokenizer/stream sources needed by A12 are preserved. No weights or artifacts are committed.
