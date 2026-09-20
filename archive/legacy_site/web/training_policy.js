export const TRAINING_POLICY = Object.freeze({
  staticLlmEnabledByDefault: false,
  staticLlmCandidateEnabledByDefault: false,
  staticLlmAssetsAllowedInRepo: false,
  staticLlmRequiresSameOriginAssets: true,
  staticLlmNoBackendInference: true,
  staticLlmNoExternalStorage: true,
  r24FallbackHarnessEnabled: true,
  legacySlmRuntimeEnabledByDefault: false,
  legacyPersonal200mEnabledByDefault: false,
  llmTrainingEnabledByDefault: false,
  experimentalGeneratorEnabledByDefault: false,
  personal200mEnabledByDefault: false,
  externalSyntheticSamplesEnabledByDefault: false,
  longHorizonTrainingScaffoldEnabled: true
});

export function assertTrainingDisabledByDefault(policy = TRAINING_POLICY) {
  return (
    policy.staticLlmEnabledByDefault === false &&
    policy.staticLlmCandidateEnabledByDefault === false &&
    policy.staticLlmAssetsAllowedInRepo === false &&
    policy.staticLlmRequiresSameOriginAssets === true &&
    policy.staticLlmNoBackendInference === true &&
    policy.staticLlmNoExternalStorage === true &&
    policy.r24FallbackHarnessEnabled === true &&
    policy.legacySlmRuntimeEnabledByDefault === false &&
    policy.legacyPersonal200mEnabledByDefault === false &&
    policy.llmTrainingEnabledByDefault === false &&
    policy.experimentalGeneratorEnabledByDefault === false &&
    policy.personal200mEnabledByDefault === false &&
    policy.externalSyntheticSamplesEnabledByDefault === false
  );
}
