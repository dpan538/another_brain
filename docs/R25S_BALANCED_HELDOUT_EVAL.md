# R25S Balanced Held-Out Eval

R25S held-out replay evaluation loads the ignored R25S JSON checkpoint and the
R25L held-out subset. It does not train and does not update weights.

The evaluation checks that held-out loss is finite, that train/dev/held-out
splits remain separated, that the checkpoint is ignored and untracked, and that
the run makes no product, long-term, phase_4 scaled-training, or release
checkpoint claim.

The held-out loss is useful only as a bounded pilot signal. It is not a product
benchmark, not proof of browser intelligence, and not release admission. R25T
must compare R25S against R25P before deciding whether to pause, run another
data pass with fresh approval, or design a small architecture ablation.

No R25S replay report or checkpoint may be committed. Generated artifacts stay
under `artifacts/training_os/small_decoder_pilot/r25s/`.
