# R28TOK1 Tokenizer Discovery

R28TOK1 discovery order:

1. A12 handoff tokenizer path from `artifacts/r27a12/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json`.
2. `artifacts/r27a12/model_lab/tokenizer/`.
3. `artifacts/r27a11/model_lab/tokenizer/`.
4. `artifacts/r27a7/model_lab/tokenizer/`.
5. `artifacts/r27a4/model_lab/tokenizer/tokenizer.json`.
6. committed tokenizer metadata under `web/another_brain/model_assets/r28m1/tokenizer/`.
7. blocker if no exact tokenizer exists.

Discovery result on this machine:

- exact tokenizer found: yes
- source path: `/Users/jarlgiovanni/Desktop/another_brain/artifacts/r27a4/model_lab/tokenizer/tokenizer.json`
- source kind: `r27a4_model_lab_tokenizer`
- tokenizer type: `BPE`
- vocab size: `16000`
- merge count: `15791`
- encode available: yes
- decode available: yes
- can commit runtime asset: yes
- blocker: none

The source artifact is read-only and ignored. R28TOK1 commits only the stripped runtime tokenizer asset required by the browser static runtime.
