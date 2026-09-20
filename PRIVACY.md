# Privacy

> **Current product (since R31B2, 2026-09-20).** efish other is no longer a no-network runtime, and this
> has to be said plainly: **what you type is sent to a language-model provider to be answered.**
>
> - Your message and up to about twenty earlier exchanges of the same conversation go to this site's one
>   server route (`/api/chat`), which adds the owner's API key and the persona and forwards them to
>   DeepSeek. The route stores nothing and logs nothing; the provider's own retention policy applies to
>   what it receives.
> - The preset questions of the 鳄 keyboard and the easter eggs are answered on your device and send nothing.
> - Conversation history is kept only on your device (IndexedDB) for thirty days, can be deleted per
>   conversation in 本地记忆 or entirely with `/forget`, and is never uploaded except as the context above.
>   Safari may clear site data sooner for sites that are not added to the Home Screen.
> - There are no accounts, no analytics and no cookies.
>
> The text below describes the archived local-first runtime (`archive/legacy_site/`) and the rules that
> still govern what may be committed to this repository.

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
