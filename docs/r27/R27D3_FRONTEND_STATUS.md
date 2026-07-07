# R27D3 frontend status

The R27D3 frontend is a static memory-backed personal answer surface. It is not a generic customer-service assistant and does not load a product model.

## Visible state

- Local-only badge: present.
- No backend inference badge: present.
- Model mode: present.
- RAG mode: present.
- Budget status: present.
- Non-product warning: present.
- Fallback status: present.
- Evidence drawer: present.
- Context adapter import panel: present.
- Context adapter export state: present.
- Asset cache status: present.
- Asset progress: present.
- Asset verification: present.
- Offline/cache fallback: present.

## Runtime wiring

- Context packets are local-session only.
- Imported context is not saved.
- Imported context is not training data.
- Static RAG uses same-origin demo memory.
- Browser static decoder remains mock/synthetic.
- Verifier/finalizer/fallback remains browser-side.
- Asset cache reports CacheStorage or memory fallback status.
- Asset loader rejects external/private/artifact paths.

## Mobile layout

The chat shell includes mobile layout handling for:

- Full-height chat window.
- Wrapped header badges.
- Two-column compact status strips.
- Single-column delivery warning.
- Single-column composer.
- Context adapter actions that fit narrow screens.

## Non-product warning text

The UI continues to display that demo static mode uses mock/synthetic generation and demo memory only unless a future, separately approved product-path candidate is admitted.
