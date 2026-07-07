# R28RT1 Runtime Mode

Runtime mode after RT1:

- `model_mode=static_q4_experimental`
- `model_route=r28m1_static_q4_engineering_candidate`
- `inference_smoke_passed=true`
- `runtime_capability_status=q4_manifest_checksum_unpack_matmul_decoder_forward_token_id_passed`
- `runtime_fallback_reason=fallback_available`
- `browser_admission=false`
- `product_model_admission=false`
- `release_checkpoint_admission=false`

The runtime can switch from synthetic fallback to static q4 experimental for token-id smoke. Fallback remains available for verifier/runtime failures.
