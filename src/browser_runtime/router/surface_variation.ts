export const R28SURF4_SURFACE_VARIATION_VERSION = "r28surf4-deterministic-surface-variation-v1";

export function normalizeSurfaceVariationInput(input = "") {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[\s?？!！。.,，、:：;；"'“”‘’（）()\[\]【】<>《》]/g, "");
}

export function hashSurfaceInput(input = "", salt = "") {
  let hash = 2166136261;
  for (const char of `${normalizeSurfaceVariationInput(input)}:${salt}`) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function pickDeterministicVariant(variants = [], input = "", salt = "") {
  const safeVariants = variants.map((item) => String(item || "").trim()).filter(Boolean);
  if (!safeVariants.length) {
    return { id: "", index: -1, text: "" };
  }
  const index = hashSurfaceInput(input, salt) % safeVariants.length;
  return {
    id: `${salt || "surface"}_${String(index + 1).padStart(2, "0")}`,
    index,
    text: safeVariants[index]
  };
}

export function compactSurfaceParts(parts = []) {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("");
}
