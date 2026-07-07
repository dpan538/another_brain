# R28RT0 Inference Admission Gate

R28RT0 does not admit browser inference.

Admission decision:

- static q4 assets present: yes
- manifest/checksum loader path: yes
- q4 unpack helper: yes
- q4 matmul helper: yes
- real model forward: no
- generated output tokens from committed q4 model: no
- browser admission: false
- product model admission: false
- release admission: false

The UI/runtime mode remains synthetic fallback and carries the release blocker `real_browser_inference_not_verified`.

Runtime mode after RT0:

- `model_mode=synthetic_tiny`
- `model_route=r28m1_static_q4_engineering_candidate`
- `inference_smoke_passed=false`
- `runtime_fallback_reason=real_browser_inference_not_verified`
