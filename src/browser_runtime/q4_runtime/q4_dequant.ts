export function q4SignedValue(nibble) {
  const value = Number(nibble) & 0x0f;
  return value >= 8 ? value - 16 : value;
}

export function q4ValueAt(bytes, index, scale = 1) {
  const byte = bytes[Math.floor(index / 2)] || 0;
  const nibble = index % 2 === 0 ? byte & 0x0f : (byte >> 4) & 0x0f;
  return q4SignedValue(nibble) * scale;
}

export function unpackQ4Nibbles(bytes, options = {}) {
  const scale = Number(options.scale ?? 1);
  const padNibbles = Math.max(0, Number(options.padNibbles || 0));
  const values = [];
  for (const byte of bytes || []) {
    values.push(q4SignedValue(byte & 0x0f) * scale);
    values.push(q4SignedValue((byte >> 4) & 0x0f) * scale);
  }
  if (padNibbles > 0) values.splice(Math.max(0, values.length - padNibbles), padNibbles);
  return new Float32Array(values);
}

export function packQ4Nibbles(values, scale = 1) {
  const out = new Uint8Array(Math.ceil(values.length / 2));
  for (let index = 0; index < values.length; index += 1) {
    const raw = Math.max(-8, Math.min(7, Math.round(Number(values[index]) / scale)));
    const nibble = raw < 0 ? raw + 16 : raw;
    const byteIndex = Math.floor(index / 2);
    if (index % 2 === 0) out[byteIndex] = (out[byteIndex] & 0xf0) | nibble;
    else out[byteIndex] = (out[byteIndex] & 0x0f) | (nibble << 4);
  }
  return out;
}
