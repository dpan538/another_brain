export const R28SURF3_VARIATION_VERSION = "r28surf3-deterministic-variation-v1";

export function hashSurfaceInput(text = "", salt = "") {
  let hash = 2166136261;
  for (const char of `${String(text || "")}:${String(salt || "")}`) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function pickSurfaceVariant(list = [], input = "", salt = "") {
  const variants = Array.isArray(list) ? list.filter(Boolean) : [];
  if (!variants.length) return { id: "", text: "" };
  const index = hashSurfaceInput(input, salt) % variants.length;
  return {
    id: `${salt || "surface"}_${String(index + 1).padStart(2, "0")}`,
    text: variants[index]
  };
}
