# R28UX6 Minimal Chat UI

R28UX6 makes the user-facing preview open in Chat Mode by default. The default surface is a compact chat card with message bubbles, a text input, send/stop controls, and small model/source/evidence badges.

## Chat Mode

- `#app-shell` starts with `data-ui-mode="chat"`.
- Dashboard-only panels are hidden by CSS while chat remains the primary viewport.
- The initial assistant message is short and user-facing.
- Assistant responses show only compact metadata:
  - `source: q4 | router | fallback`
  - `evidence: sufficient | insufficient | none`

## Hidden Reasoning Boundary

Chat Mode does not display hidden chain-of-thought, hidden prompts, or internal prompt text. Generation feedback is represented by a light breathing animation on the composer/message surface instead of exposing private reasoning.

## Non-Product Warning

The non-product warning remains visible as a small badge and header note, but it no longer dominates the chat experience.
