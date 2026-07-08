# R28SURF4 Natural Daily Surfaces

R28SURF4 makes common daily entries shorter and less like engineering templates. It updates the browser runtime and source router modules so the deployed static page and TypeScript source agree.

## Covered Intents

- `greeting`
- `identity_who_are_you`
- `identity_are_you_crocodile`
- `origin_where_from`
- `capability_what_can_you_do`
- narrow boundary and status intents already covered by SURF2

## Example Shape

- `你好`: `你好，我在。`
- `你是谁`: `我是鳄鱼，另一个大脑界面。`
- `你是鳄鱼吗`: `可以这么叫我，鳄鱼。`
- `你从哪里来`: `从本地静态网页、小模型和轻量检索里来。`
- `你能做什么`: `能做边界判断、证据整理、拒答；证据不足时停住。`

The variation is deterministic by input hash, so the same input stays stable while the surface avoids one fixed line.

## Runtime Boundary

SURF4 does not answer broad factual or knowledge questions with templates. Low-confidence and ordinary open prompts continue to use q4/RAG/router/finalizer.
