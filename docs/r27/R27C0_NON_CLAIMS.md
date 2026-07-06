# R27C0 Non-Claims

R27C0 does not claim an external context product model.

It only adds adapter packet contracts and a manual local bridge for the static browser shell. The runtime remains local, static, and non-product:

- no Gmail or Drive connector is implemented
- no OAuth or account linking is implemented
- no backend endpoint is implemented
- no external LLM or hosted vector store is used
- no imported private text is admitted to training
- no adapter payload is committed
- no browser persistence is enabled by default

Future connector work must start from the R27C0 packet envelope and pass the same privacy and training rejection checks before any connector-specific behavior is considered.
