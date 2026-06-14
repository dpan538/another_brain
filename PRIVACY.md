# Privacy

Another Brain is designed as a local-first browser-side dialog runtime. The
public launch target has no account system, no cloud inference API, and no
remote LLM call.

## Public Runtime

The public runtime may include:

- deterministic dialog rules
- generated public knowledge cards
- a generated tiny-router route-and-answer artifact
- public UI assets and scripts

The public runtime must not include raw personal memory cards, private drive
inventories, local model weights, LoRA checkpoints, source documents, banking
data, identity documents, visa or passport material, addresses, phone numbers,
or account numbers.

## Local Artifacts

Local artifacts are private runtime outputs and are ignored by git:

- `artifacts/**`
- `web/brain_pack.js`
- local memory packs
- drive inventories
- source-material inventories
- local model weights and adapters

These files can be rebuilt locally when needed, but they are not part of the
public repository or public deployment.

## Memory Scanning

Local scanning tools should avoid paths or files that look like identity,
banking, visa, passport, address proof, account-number, or other sensitive
material. Sensitive skipped items may be represented only by hashed references
and aggregate counts in local artifacts.

## Public Deployment Rule

Vercel is used only for static hosting. No private artifact should be generated
inside Vercel builds, uploaded to Vercel as a server function bundle, or sent to
third-party inference APIs.
