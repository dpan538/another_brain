# R27B2 Candidate Model Injection

R27B2 adds an engineering bridge from A-line candidate metadata or ignored checkpoints into B-line browser asset manifests. It discovers a candidate, reconstructs the local mini decoder architecture, writes ignored export and quantization reports, emits ignored same-origin shard manifests, and runs a browser-loader smoke against those ignored files.

All generated outputs live under `artifacts/r27b2/` and remain ignored. The committed product shell still ships without model weights, tokenizer artifacts, exported assets, ONNX assets, or quantized shards.

The default deployable browser UI remains mock or synthetic unless a later admitted build step copies a candidate package into a same-origin public asset path.
