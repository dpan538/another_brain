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
  "web/index.html"
  "web/app.js"
  "web/dialog_rules.js"
  "web/tiny_router_model.generated.js"
  "web/knowledge_base.generated.js"
  "web/knowledge_shards/manifest.json"
)

for path in "${required_files[@]}"; do
  [[ -f "$path" ]] || fail "missing required file: $path"
done

tracked_files="$(git ls-files --cached --others --exclude-standard)"

if printf '%s\n' "$tracked_files" | grep -E '(^|/)artifacts/' | grep -v -E '^artifacts/\.gitkeep$' >/dev/null; then
  fail "tracked artifacts/ file found"
fi

if printf '%s\n' "$tracked_files" | grep -E '(^|/)web/brain_pack\.js$|(^|/)web/models(/|$)|(^|/)web/vendor(/|$)' >/dev/null; then
  fail "tracked private or vendored web runtime payload found"
fi

if printf '%s\n' "$tracked_files" | grep -E '\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$' >/dev/null; then
  fail "tracked model weight or checkpoint file found"
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
python3 scripts/validate_knowledge_shards.py >/dev/null

printf 'release check passed\n'
