export function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value === "string") return new TextEncoder().encode(value);
  throw new Error("unsupported_checksum_bytes");
}

export async function sha256Hex(value) {
  const bytes = toUint8Array(value);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  const crypto = await import("node:crypto");
  return crypto.createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

export async function verifySha256(value, expected) {
  if (!expected || typeof expected !== "string") {
    return { ok: false, expected: "", actual: "", reason: "missing_sha256" };
  }
  const actual = await sha256Hex(value);
  return {
    ok: actual === expected,
    expected,
    actual,
    reason: actual === expected ? "" : "sha256_mismatch"
  };
}
