#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'release check failed: %s\n' "$1" >&2
  exit 1
}

required_files=(
  "LICENSE"
  "NOTICE"
  "PRIVACY.md"
  "SECURITY.md"
  "MODEL_CARD.md"
  "DATA_CARD.md"
  "DEPLOYMENT.md"
  "README.md"
  ".vercelignore"
  "vercel.json"
  "web/about.txt"
  "web/index.html"
  "web/llms.txt"
  "web/robots.txt"
  "web/sitemap.xml"
  "web/site.webmanifest"
  "web/app.js"
  "web/debug_report.js"
  "web/dialog_rules.js"
  "web/knowledge_runtime.js"
  "web/static_llm_runtime.js"
  "web/llm_answer_contract.js"
  "web/tiny_router_model.generated.js"
  "static_llm/README.md"
  "static_llm/llm_manifest.schema.json"
  "static_llm/example_manifest.hobby.json"
  "static_llm/example_manifest.pro.json"
  "knowledge_sources/registry.json"
  "knowledge_sources/schema.json"
  "build_sources/knowledge/knowledge_base.generated.js"
  "web/knowledge_shards/manifest.json"
  "web/knowledge_shards/routing.json"
)

for path in "${required_files[@]}"; do
  [[ -f "$path" ]] || fail "missing required file: $path"
done

if [[ -f "web/knowledge_base.generated.js" ]]; then
  fail "monolithic knowledge build source must not live under web/"
fi

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  tracked_files="$(git ls-files --cached --others --exclude-standard)"
else
  tracked_files="$(
    find . \
      -path './node_modules' -prune -o \
      -path './.git' -prune -o \
      -path './artifacts' -prune -o \
      -path './web/brain_pack.js' -prune -o \
      -path './web/models' -prune -o \
      -path './web/vendor' -prune -o \
      -path './models' -prune -o \
      -path '*/__pycache__' -prune -o \
      -name '.DS_Store' -prune -o \
      -type f -print |
      sed 's#^\./##'
  )"
fi

if printf '%s\n' "$tracked_files" | grep -E '(^|/)artifacts/' | grep -v -E '^artifacts/\.gitkeep$' >/dev/null; then
  fail "tracked artifacts/ file found"
fi

if printf '%s\n' "$tracked_files" | grep -E '(^|/)web/brain_pack\.js$|(^|/)web/models(/|$)|(^|/)web/vendor(/|$)' >/dev/null; then
  fail "tracked private or vendored web runtime payload found"
fi

model_weight_files="$(printf '%s\n' "$tracked_files" | grep -E '\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$' || true)"
if [[ -n "$model_weight_files" ]]; then
  unmanaged_model_weight_files="$(printf '%s\n' "$model_weight_files" | grep -v -E '^(static_llm/assets/|web/static_llm/assets/)' || true)"
  if [[ -n "$unmanaged_model_weight_files" ]]; then
    printf '%s\n' "$unmanaged_model_weight_files" >&2
    fail "tracked model weight or checkpoint file found outside approved static LLM asset paths"
  fi
  node scripts/check_static_llm_budget.mjs >/dev/null || fail "static LLM model asset admission or budget check failed"
fi

if printf '%s\n' "$tracked_files" | grep -E '(^|/)\.env($|\.|/)|vercel_token|VERCEL_TOKEN' >/dev/null; then
  fail "tracked env or Vercel token-looking file found"
fi

scan_targets=(
  "README.md"
  "LICENSE"
  "NOTICE"
  "PRIVACY.md"
  "SECURITY.md"
  "MODEL_CARD.md"
  "DATA_CARD.md"
  "DEPLOYMENT.md"
)

while IFS= read -r path; do
  [[ -f "$path" ]] || continue
  scan_targets+=("$path")
done < <(printf '%s\n' "$tracked_files" | grep -E '^(web|docs)/' || true)

if grep -R -n -E '/Users/|/Volumes/|VERCEL_TOKEN|API_KEY|SECRET_KEY|PRIVATE_KEY|BEGIN RSA PRIVATE KEY|BEGIN OPENSSH PRIVATE KEY' "${scan_targets[@]}" >/tmp/another_brain_release_scan.txt; then
  cat /tmp/another_brain_release_scan.txt >&2
  fail "sensitive-looking string found in public files"
fi

python3 -m json.tool vercel.json >/dev/null
python3 -m json.tool package.json >/dev/null
python3 -m json.tool web/site.webmanifest >/dev/null
python3 scripts/validate_knowledge_shards.py >/dev/null
node scripts/validate_knowledge_runtime_shards.mjs >/dev/null
node scripts/validate_static_llm_manifest.mjs >/dev/null
node scripts/check_static_llm_budget.mjs >/dev/null
node scripts/check_no_backend_llm_inference.mjs >/dev/null
node scripts/eval_seo_metadata.mjs >/dev/null
node scripts/check_fallback_invariants.mjs >/dev/null
node scripts/eval_canary_anti_lobotomy.mjs >/dev/null
node scripts/eval_non_question_affordance.mjs >/dev/null
node scripts/eval_p0_response_mode.mjs >/dev/null
node scripts/check_repair_overtrigger_invariants.mjs >/dev/null
node scripts/fuzz_fallback_routes.mjs >/dev/null
node scripts/check_finalizer_coverage.mjs >/dev/null
node scripts/check_finalizer_order.mjs >/dev/null
node scripts/eval_dialogue_boundary.mjs >/dev/null
node scripts/eval_r19_contextual_binding.mjs >/dev/null
node scripts/eval_mobile_answer_density.mjs >/dev/null
node scripts/check_answer_deduplication.mjs >/dev/null
node scripts/check_response_mode_invariants.mjs >/dev/null
node scripts/check_conversation_controller_coverage.mjs >/dev/null
node scripts/fuzz_contextual_questions.mjs >/dev/null
node scripts/eval_endpoint_readiness.mjs >/dev/null
node scripts/eval_session_level_stress.mjs >/dev/null
node scripts/check_mobile_answer_density.mjs >/dev/null
node scripts/check_webgpu_contract.mjs >/dev/null
node scripts/bench_retrieval_webgpu.mjs >/dev/null
node scripts/eval_embedding_retrieval_quality.mjs >/dev/null
node scripts/validate_r21_failure_bank.mjs >/dev/null
node scripts/build_r21_control_family_evals.mjs >/dev/null
node scripts/validate_r21_family_splits.mjs >/dev/null
node scripts/train_r21_typed_control_gate.mjs >/dev/null
node scripts/eval_r21_typed_control_gate.mjs >/dev/null
node scripts/eval_r21_mixed_dialogic_sessions.mjs >/dev/null
node scripts/check_r21_anti_overfit_invariants.mjs >/dev/null

printf 'release check passed\n'
