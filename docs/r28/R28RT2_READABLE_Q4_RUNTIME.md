# R28RT2 Readable Q4 Runtime

R28RT2 upgrades the RT1 token-id-only smoke into readable browser/runtime text smoke without training and without new model shards.

What changed:

- prompt text is encoded locally with a browser runtime display codec
- committed R28M1 q4 shards are loaded and checksum verified
- q4 decoder forward generates multiple real token ids
- token ids are decoded to non-empty display text
- runtime stats include generated token count, elapsed milliseconds, runtime mode, decode status, fallback status, and debug token ids

The runtime mode remains `static_q4_experimental`. This is not product admission, browser admission, or release checkpoint admission.
