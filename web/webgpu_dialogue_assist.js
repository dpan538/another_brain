export async function rerankContextBindings({ candidates = [] } = {}) {
  return {
    available: false,
    authoritative: false,
    candidates,
    latency_ms: 0,
    reason: "webgpu_dialogue_assist_disabled_by_default"
  };
}

export async function classifyDeclarationSignal({ query = "" } = {}) {
  return {
    available: false,
    authoritative: false,
    signal: "",
    query,
    latency_ms: 0,
    reason: "webgpu_dialogue_assist_disabled_by_default"
  };
}

export async function suggestTopicShift({ query = "" } = {}) {
  return {
    available: false,
    authoritative: false,
    shifted: false,
    query,
    latency_ms: 0,
    reason: "webgpu_dialogue_assist_disabled_by_default"
  };
}
