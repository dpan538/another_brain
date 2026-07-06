# R27B4 Integration Audit

`scripts/r27b4_integration_audit.py` checks the delivery candidate surface:

- B0 static chat shell.
- B1A export, quantization, and shard interfaces.
- B1B browser runtime and worker path.
- B1C Vercel/static rehearsal scripts.
- B2 candidate injection bridge.
- B3 static RAG packet path.
- Package scripts are not self-recursive.
- `npm run build:vercel` passes when the audit runs without `--skip-build`.
- Routine gates do not train when the audit runs without `--skip-routine-gates`.

On this workstation, the ignored R27B2 candidate manifest is present and the B2 browser loader smoke passes with synthetic fallback generation. That is not product model admission.
