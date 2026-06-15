Not every user turn requires a textual answer.

不是每一次用户输入都需要被文字回答。

Generic fallback is not the right response to vague declarations. A vague declaration should not be punished by `你需要提问。`, should not trigger a mechanical counterquestion, and can produce a transient UI affordance instead of an assistant message.

## Response Kinds

`answer`: the user asks a clear question, requests explanation, comparison, reasoning, listing, or continuation. Examples include `罗大佑是谁？`, `日本文学代表作家有哪些？`, `继续说。`, and `这是什么意思？`

`repair`: the user is following up on a bad or confusing assistant answer. Examples include `什么发生过？`, `哪一边？`, `我不是已经问了吗？`, and `你是不是答偏了？`

`help`: the user asks how to ask or how to start. Examples include `我需要怎么提问？`, `怎么问你？`, and `我该怎么开始？`

`declaration_with_signal`: the user gives feedback, correction, diagnosis, or a topic direction. If the session has an active task, the runtime should acknowledge or repair briefly. Otherwise it can hold space with an affordance.

`quiet_affordance`: the user input is a vague declaration, pause, fragment, or unfinished thought without a clear action target. Examples include `嗯。`, `这样啊。`, `可能吧。`, `算了。`, and `……`

`hard_boundary`: privacy, safety, copyright, or dangerous content still requires a textual boundary response, even if the input is not phrased as a question.

## UI Contract

A quiet affordance is not an assistant answer. It must not enter `answerIndex`, must not be appended as a chat message, must not count as a visible exchange turn, and must not pollute the 16-turn internal session memory as assistant text.

The UI may show a small transient affordance such as `…？…` with a water-ripple or breathing animation. It should feel like the dialog box is holding space, not demanding a question.
