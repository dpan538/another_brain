# R28UX4 Model Path Visibility

R28UX4 keeps the R28UX3 model-path self-check visible in the default UI.

The self-check displays:

- manifest pass/fail
- q4 shards pass/fail
- exact tokenizer pass/fail
- q4 forward pass/fail
- fallback availability

If q4 forward does not run, the UI shows `q4_forward_ran=false`.

If the answer source is not the q4 model draft, the process summary shows `answer_source=hard_router_boundary`, `synthetic_fallback`, or `no_model_fallback`.

This is runtime path transparency. It is not browser admission, product admission, or release checkpoint admission.
