/** R28M1 signed-int4 offset-binary contract shared by the browser worker. */

export function decodeOffsetBinaryNibble(nibble) {
  return (Number(nibble) & 0x0f) - 8;
}

export function q4OffsetBinaryValueAt(bytes, index, scale = 1) {
  if (!Number.isInteger(index) || index < 0) throw new Error("q4_index_invalid");
  const byte = bytes[Math.floor(index / 2)] || 0;
  const nibble = index % 2 === 0 ? byte & 0x0f : (byte >> 4) & 0x0f;
  return decodeOffsetBinaryNibble(nibble) * Number(scale);
}

export function unpackOffsetBinaryQ4(bytes, options = {}) {
  const scale = Number(options.scale ?? 1);
  const padNibbles = Math.max(0, Number(options.padNibbles || 0));
  const values = [];
  for (const byte of bytes || []) {
    values.push(decodeOffsetBinaryNibble(byte & 0x0f) * scale);
    values.push(decodeOffsetBinaryNibble((byte >> 4) & 0x0f) * scale);
  }
  if (padNibbles > 0) values.splice(Math.max(0, values.length - padNibbles), padNibbles);
  return new Float32Array(values);
}
