# R28SURF5 Length Policy

R28SURF5 keeps entry and fallback surfaces short.

## Policy

- `greeting`: one sentence, target under 20 Chinese characters.
- `identity`: one or two sentences, target under 50 Chinese characters.
- `origin` and `capability`: one or two sentences, target under 80 Chinese characters.
- Evidence boundaries: one to three sentences.
- Abstract/value fallback: two to four sentences, target under 160 Chinese characters.
- q4 accepted open answers: trimmed if they ramble.

The runtime records the applied `length_policy` in the public trace. The policy never exposes hidden reasoning or private prompt text.
