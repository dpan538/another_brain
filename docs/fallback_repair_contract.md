# Fallback Repair Contract

Generic fallbacks are controlled exits, not normal answers.

These strings must not become final answers for valid questions:

- `你需要提问。`
- `你要问哪一边？`
- `也许发生过，不在我眼前。`
- `你应该去问百度。`
- `我只是个对话框。`

`你需要提问。` is allowed only when the input is genuinely empty or not question-like and no intent, domain, entity, or task is detected.

`你要问哪一边？` is never allowed as a bare final answer. Clarification must include explicit alternatives, such as asking whether the user means a person, work, album, or comparison axis.

`也许发生过，不在我眼前。` is allowed only for unknown external event/status questions. It is forbidden for person overview, entity lookup, domain overview, self capability, user-intent, help, and fallback repair.

If the previous assistant answer was a generic bad fallback and the user asks what it meant, the runtime must enter fallback self-repair. It should acknowledge the bad fallback, recover the likely topic from the 16-turn session memory, and give a direct repair or concrete examples.
