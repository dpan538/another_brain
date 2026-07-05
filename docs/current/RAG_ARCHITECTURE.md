# RAG Architecture

R27A defines static local RAG as evidence-packet construction over same-origin knowledge shards and reviewed corpus metadata. It does not use hosted vector stores, backend retrieval, external APIs, or teacher calls.

An `evidence_packet` contains retrieval queries, source refs, card refs, relation refs, short evidence snippets, confidence, evidence sufficiency, and `must_not_claim` constraints. If evidence is absent, the packet must say `evidence_sufficiency: absent` instead of fabricating support.

Knowledge shards are evidence sources, not answer banks. Future draft paths should cite packet refs and preserve uncertainty rather than copying knowledge text into fixed final answers.
