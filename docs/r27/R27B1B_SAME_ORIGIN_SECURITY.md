# R27B1B Same-Origin Security

Same-origin loader rules:

- reject external manifest URLs
- reject external shard paths
- reject private or artifact paths
- require budget metadata
- load only declared shard paths
- verify SHA-256 when declared
- keep backend inference and external runtime dependency flags false

The loader does not read training artifacts and does not call external generation services.
