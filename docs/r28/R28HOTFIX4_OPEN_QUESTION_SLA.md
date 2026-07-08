# R28HOTFIX4 Open Question SLA

Open, abstract, value, aesthetic, and philosophical questions now have a terminal answer path.

SLA:

- q4 start timeout: 1500 ms.
- first token timeout: 6000 ms desktop, 10000 ms mobile.
- max total generation: 12000 ms desktop, 20000 ms mobile.
- every request ends in `completed`, `timeout`, `failed`, `aborted`, or `fallback`.

If q4 is ready, open questions must attempt q4 generation. If q4 is not ready, the response falls back quickly with a visible blocker. If q4 times out, the answer uses an abstract/value fallback surface and records `fallback_reason=q4_generation_timeout`.
