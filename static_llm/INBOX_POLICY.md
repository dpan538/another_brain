# Static LLM Inbox Policy

R25C introduces local intake directories for reviewed decoder artifacts without
committing real weights by default.

Approved local inbox paths:

- `static_llm/inbox/`
- `static_llm/models_staging/`

These directories may contain tracked README files, `.gitkeep` files, metadata
templates, and small review notes. Real model files in these directories are
ignored by default and must remain unstaged unless a later explicit user
approval marker and all R25C/R25E admission gates pass.

Rules:

- Do not download model weights into these paths from R25C scripts.
- Do not train or convert a model in this patch.
- Do not stage `.safetensors`, `.gguf`, `.bin`, `.pt`, `.pth`, `.onnx`,
  `.mlmodel`, `.mlpackage`, or `.ckpt` files by default.
- Production admission requires reviewed metadata, license/provenance, real
  hashes, static budget pass, same-origin manifest paths, and no backend or
  external storage dependency.
- R25E production asset staging requires
  `APPROVE_STATIC_LLM_PRODUCTION_ADMISSION.json` inside the candidate
  directory. `scope: "commit_assets"` is required before model-like files can
  be staged for git.
- If no local artifact is present, the R25C gate should still pass with no
  admitted model and the static LLM draft path disabled.
