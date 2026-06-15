# Clarification Loop Contract

A clarification is useful only when it names the ambiguity.

Forbidden final answer:

```text
你要问哪一边？
```

Allowed shape:

```text
你是问《之乎者也》这张专辑，还是标题曲？
```

If the user asks `哪一边？`, `什么哪一边？`, or `我需要怎么提问？` after a clarification fallback, the runtime must explain the failed clarification or give examples. It must not repeat the same clarification.

The same generic clarification must not repeat more than once in the recent visible or internal session turns. The fallback firewall rejects repeated bare clarification drafts and rewrites them into a help or repair answer.
