# R27A11 Scale Smoke

R27A11 smoke checks are real instantiate/forward/backward/optimizer-step probes when the local device/resource guard allows them.

| Candidate | Params | Device | OK | Optimizer tokens | Optimizer tokens/sec | Budget/result |
| --- | ---: | --- | --- | ---: | ---: | --- |
| `new_60m` | 58409472 | `mps` | `True` | 5120 | 614.7597543592457 | `product_path_fit` |
| `new_80m` | 81420288 | `mps` | `True` | 5120 | 420.07507752063395 | `product_path_tight` |
| `new_90m` | 88501248 | `mps` | `True` | 5120 | 437.84474572137384 | `product_path_tight` |
| `new_96m` | 96363008 | `mps` | `True` | 5120 | 365.549010774975 | `product_path_tight` |
| `new_100m_research` | 106000384 | `mps` | `True` | 5120 | 332.94883900863874 | `impossible_under_100mb` |

Selected product-path model after smoke: `new_96m`.
