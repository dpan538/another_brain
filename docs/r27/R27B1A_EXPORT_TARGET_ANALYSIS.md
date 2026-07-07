# R27B1A Export Target Analysis

Source mode: `checkpoint`.

Source checkpoint: `artifacts/r27a7/model_lab/checkpoints/r27a7_mps_24h_large_decoder_v1_seg2_continued_pretraining.pt`.

Params: `7724736`. Vocab: `16000`. Context: `256`.

Estimated sizes: `{'fp32_bytes': 30898944, 'fp16_bytes': 15449472, 'int8_bytes': 7724736, 'q4_bytes': 3862368}`.

Fits 70MB model budget with q4: `True`.

Compatibility risks:
- checkpoint layout must be mapped to browser decoder graph
- tokenizer artifact is intentionally not admitted or committed in R27B1A
- q4 path is experimental and needs numeric quality validation before admission
- ONNX browser runtime is exploratory, not selected as final runtime
