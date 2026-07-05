# R27A7R2 Limited Scale Smoke

| Candidate | OK | Device | Params | Tok/s optimizer | Fits 100MB q4 | Risk | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `continue_best_mini8m` | `True` | `mps` | `7522560` | `1095.8952195789886` | `True` | `low` | `` |
| `new_30m` | `True` | `mps` | `41697280` | `901.9525331478345` | `True` | `low` | `` |
| `new_60m` | `True` | `mps` | `58409472` | `638.5444115428958` | `True` | `low` | `` |
| `new_100m` | `True` | `mps` | `106000384` | `299.8538066284146` | `True` | `medium` | `` |
| `new_125m` | `True` | `mps` | `133726208` | `214.5701439699408` | `False` | `high` | `` |
| `new_150m` | `True` | `mps` | `164597760` | `167.75687886781273` | `False` | `impossible` | `` |

- Selected candidate for A8B config: `new_100m`
- Selected device: `mps`
- Max optimizer steps per trainable candidate: `5`
- 0.5B and 2B are estimate-only.
- R27A7R2 does not run long training and does not launch A8.
