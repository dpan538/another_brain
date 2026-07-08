# R28P0C Cold-Start Mobile Chat

R28P0C fixes the user-facing cold-start failure mode without training, changing q4 shards, adding backend inference, or claiming product admission.

## What Changed

- Chat mode no longer blocks first paint on deep q4 warmup, but input remains locked until q4 is ready.
- Mobile and slow-network sessions show the loading screen instead of entering lightweight chat.
- Desktop fast cold-start still attempts q4 warmup and reports q4 ready when forward passes.
- Technical q4 details are hidden from Chat and kept in Dashboard.
- User-facing brand is `鳄鱼`; `another_brain` remains an internal project/path name only.
- Mobile Chat is reduced to two cards: message area and input card.
- Chat composer shows one action: send, and Send is disabled until full q4 mount.

## Cold-Start Matrix

Script:

```bash
node scripts/r28p0c_coldstart_matrix.mjs
```

Report:

```text
artifacts/r28p0c/reports/coldstart_matrix.json
```

Scenarios:

- Desktop / fast network
- Desktop / 3G throttle
- Mobile / fast network
- Mobile / 3G throttle

Measured fields:

- `chat_interactive_ms`
- `quick_check_ms`
- `q4_ready_ms`
- `q4_status`
- `overflow_x`
- visible composer buttons

## Local Result

Latest local matrix:

- desktop fast: Chat shell paints quickly; q4 must become ready before Send is enabled.
- desktop 3G: Chat shell paints quickly; loading remains active until q4 readiness or explicit blocker.
- mobile fast: Chat shell paints quickly; q4 must become ready before Send is enabled.
- mobile 3G: Chat shell paints quickly; loading remains active until q4 readiness or explicit blocker.

The mobile result is no longer a lightweight-chat claim. User chat submission is gated on q4 readiness.

## Non-Claims

- Not product model admission.
- Not browser admission.
- Not release checkpoint admission.
- No training.
- No new model assets.
- No new q4 shards.
- No backend inference.
- No external LLM API.
- No Doubao.
- No hosted vector store.
