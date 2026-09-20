export const RUNTIME_FEATURE_FLAGS = Object.freeze({
  fallbackFirewallEnabled: true,
  canarySafeModeAvailable: true,
  controlledGateEnabled: true,
  staticLlmEnabledByDefault: false,
  staticLlmCandidateEnabledByDefault: false,
  staticLlmRequiresSameOriginAssets: true,
  staticLlmNoBackendInference: true,
  staticLlmNoExternalStorage: true,
  r24FallbackHarnessEnabled: true,
  webGpuInferenceEnabled: false,
  legacySlmRuntimeEnabledByDefault: false,
  legacyPersonal200mEnabledByDefault: false,
  personal200mProfileEnabled: false,
  externalReviewCardsEnabled: false,
  allowBareGenericFallbacks: false
});
