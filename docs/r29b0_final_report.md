# R29B0 final report — blocked with evidence

R29B0 did not pass an engineering candidate. The deployed R28M1 browser
surface was observed to execute a 24-token q4 draft and then replace it with a
fallback after quality rejection. Its worker implements a one-token diagnostic
and explicitly declares contextual attention unsupported; it has no KV cache.
The R28M1 exporter stores q4 integers as signed-int4 offset binary, while the
browser decoders at the time interpreted nibbles as two's complement. R29B0's
browser output therefore also contains an integer-decoding defect.

The exact contribution of missing contextual attention, missing KV cache, and
the integer-decoding mismatch to generated quality remains unmeasured until a
full browser parity path exists. Correcting integer decoding alone does not make
the browser model usable and is not browser or product admission.

The canonical reference gate cannot proceed on this host: the audited 96M
checkpoints are present, but Python 3.13 exits while importing PyTorch without
diagnostic output and the available Python 3.10 installation has no PyTorch.
The same process failure is recorded by the prior R29A9 foreground supervisor.
No unchecked checkpoint deserialization, substitute model, fallback output,
q4-v2 claim, training segment, corpus, or weight commit was used to bypass it.

The foreground campaign ends `BLOCKED_WITH_EVIDENCE` at the reference-runtime
gate. No product, browser, release, or deployment admission occurred.
