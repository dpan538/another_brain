# Answer Latency And Thinking Profile

R17 treats another_brain as a personal mini Web-LLM runtime, so some answers may legitimately take a little longer than a tiny router path. The loaded-page service-level target is still short: user-facing answers should complete within 3000 ms.

```json
{
  "answer_sla_ms_loaded_page": 3000,
  "fast_path_target_ms": 300,
  "standard_path_target_ms": 1200,
  "full_profile_target_ms": 3000,
  "visible_thinking_allowed": true,
  "thinking_not_chain_of_thought": true
}
```

The UI may show a brief thinking state. That state must not expose chain-of-thought, hidden traces, verifier internals, private memory, source snippets, or local paths. It is only a latency affordance.

## Profiles

| Profile | Target | Intended Use |
| --- | ---: | --- |
| instant | <= 120 ms | greetings, exact identity, deterministic privacy/copyright boundaries |
| fast | <= 300 ms | simple solvers, direct approved facts, small culture lookups |
| standard | <= 1200 ms | 16-turn session binding, culture entry paths, work explanations, verifier pass |
| deep | <= 2200 ms | cross-domain comparison, ambiguous referents, verifier rewrite, multi-card planning |
| full | <= 3000 ms | optional 100M-200M personal profile when WebGPU is available |

## Runtime Rules

- Solver tasks should stay fast and deterministic.
- Culture comparison, 16-turn memory binding, WebGPU inference, and verifier rewrites may use standard or deep profiles.
- Full 100M-200M profile is optional and must degrade to standard if WebGPU is unavailable or too slow.
- WASM/CPU fallback must remain available for standard tasks.
- The loaded-page answer SLA is 3000 ms; profile delays and model calls must be budgeted inside that limit.
- Existing release gates may remain stricter for current frontend checks; the 3000 ms SLA is the upper bound for the personal mini Web-LLM profile.
- A visible thinking indicator is allowed, but it is not a reasoning transcript.
