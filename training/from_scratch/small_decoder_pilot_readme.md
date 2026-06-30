# R25L Small Decoder Pilot Config

This directory defines a phase 3 small decoder pilot plan only. R25L does not
run the pilot, write pilot weights, admit release assets, or start formal
decoder training.

The default runner must skip until a later reviewer supplies a narrow phase 3
approval marker. Any future pilot checkpoint must remain under ignored
`artifacts/training_os/small_decoder_pilot/` paths until separate release
review and static admission.

The pilot is not a product model, not a benchmark, and not a browser release.
It exists to size a bounded from-scratch decoder experiment and to plan the
held-out and R24/R25 regression gates that would be checked before and after a
future approved run.

R25M may run the bounded pilot only with
`training/from_scratch/APPROVE_R25M_SMALL_DECODER_PILOT.json` plus the explicit
`--allow-small-pilot-training` flag. The R25M run uses ignored artifacts under
`artifacts/training_os/small_decoder_pilot/r25m/`, does not admit release
checkpoints, does not create a product model, and does not permit tracked
weights.
