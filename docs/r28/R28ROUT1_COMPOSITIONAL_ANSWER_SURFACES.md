# R28ROUT1 Compositional Answer Surfaces

R28ROUT1 composes short public answer surfaces from bounded, indexed fragments. The composition is deterministic by input hash, so it can vary slightly without becoming random or non-reproducible.

## Example Surfaces

- Greeting: `你好，我在。`
- Identity: `我是鳄鱼。更准确地说，我是这个本地网页里的另一个大脑界面。`
- Crocodile confirmation may choose an indexed variant such as `是，我是鳄鱼。` or `可以这么叫我：鳄鱼。`
- Origin: local static page, tiny model path, lightweight retrieval, answer boundaries, reviewed anchors.
- Capability: boundary judgment, evidence organization, short answers, refusal, semantic rewrite.

## Rules

- No hidden chain-of-thought.
- No system or developer prompt exposure.
- No private raw facts.
- No eval prompt fragments.
- No old excluded question-pack rows.
- No arbitrary knowledge answers from fragments.
- Ordinary open questions continue to the q4/RAG/finalizer path.
- Route policy and process trace can expose selected `fragment_ids` for debugging.
