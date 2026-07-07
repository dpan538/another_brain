export const R28TOK1_DISCOVERY_ORDER = Object.freeze([
  "a12_handoff_tokenizer_path",
  "r27a12_model_lab_tokenizer",
  "r27a11_model_lab_tokenizer",
  "r27a7_model_lab_tokenizer",
  "r27a4_model_lab_tokenizer",
  "r28m1_runtime_tokenizer_asset_or_metadata",
  "committed_r28m1_tokenizer_metadata",
  "blocker"
]);

export const R28TOK1_EXACT_TOKENIZER_BLOCKER = "exact_tokenizer_artifact_missing";

export function summarizeTokenizerSource(report = {}) {
  const exactFound = report.exact_tokenizer_found === true;
  return {
    exact_tokenizer_found: exactFound,
    tokenizer_type: report.tokenizer_type || "unknown",
    vocab_size: Number(report.vocab_size || 0),
    source_kind: report.source_kind || "",
    can_commit_runtime_asset: report.can_commit_runtime_asset === true,
    blocker: exactFound ? "" : report.blocker || R28TOK1_EXACT_TOKENIZER_BLOCKER,
    non_claims: {
      product_tokenizer: false,
      product_admission: false,
      browser_admission: false,
      release_checkpoint_admission: false,
      training: false
    }
  };
}
