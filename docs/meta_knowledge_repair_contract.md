# Meta Knowledge Repair Contract

`你知道 X 吗` is not one intent.

The runtime must decompose it:

- `X = known person/work/domain`: route to entity, work, or domain overview.
- `X = self/model/capability`: answer with capability boundary.
- `X = user identity or intention`: answer with user-intent or memory boundary.
- `X = private value`: privacy boundary.
- `X = unknown external event/status`: bounded unknown status.

Examples:

- `你知道罗大佑吗？` -> known entity overview.
- `罗大佑你知道吗？` -> known entity overview.
- `你知道日本文学吗？` -> domain overview.
- `你读过日本文学吗？` -> capability boundary plus domain offer.
- `你知道自己是谁吗？` -> self identity/scope boundary.
- `你知道我要干什么吗？` -> infer only from current session; do not mind-read.
- `你知道我的手机号吗？` -> privacy boundary.

The system may say it has no human experience, but it should then offer what it can do with local knowledge cards, the 16-turn session memory, deterministic solvers, and verifier-supported boundaries.
