# Anti-Lobotomy Runtime Contract

Generic fallback is not an answer strategy. It is a last-resort output that requires a typed reason.

Generic fallback 不是回答策略。它只能在有明确 typed reason 的最后路径中出现。

## Controlled Fallbacks

`你需要提问。` is legal only when the input is empty, non-question-like, has no actionable continuation, no entity/domain/task/relation/capability/help intent, and no usable 16-turn session state. It is illegal for entity, domain, help, capability, or reasoning questions.

`你要问哪一边？` is never legal as a bare final answer. Clarification must name alternatives, for example: `你是问《之乎者也》这张专辑，还是标题曲？`

`也许发生过，不在我眼前。` is legal only for external event/current status questions where the local runtime lacks reliable evidence. It is illegal for known entities, known domains, self/meta questions, user-intent questions, and capability boundaries.

`你应该去问百度。` is legal only when the user asks for latest/current external facts and the local runtime has no source. It is illegal for local known culture, reasoning, help, and meta questions.

`我只是个对话框。` is legal only for identity, scope, or capability explanation. It is illegal as an answer to culture, math, logic, list, comparison, or work-explanation requests.

## Repair Quotes

A generic fallback phrase is forbidden as a bare final answer. It is not forbidden when quoted or referenced inside a repair explanation.

Examples:

- Bad final: `你要问哪一边？`
- Good repair: `我刚才不该只问“哪一边”。你可以直接问作者、作品、代表作或关系。`
- Bad final: `也许发生过，不在我眼前。`
- Good repair: `我刚才不该说“发生过”。你问的是罗大佑，不是一个事件。`

## Release Gate

Every answer source must pass through the shared finalizer and fallback firewall before becoming visible to the user. The anti-lobotomy canary, fallback fuzzing, fallback invariant scan, and finalizer coverage check are release-blocking.
