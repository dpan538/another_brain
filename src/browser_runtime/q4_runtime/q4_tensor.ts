import { q4ValueAt, unpackQ4Nibbles } from "./q4_dequant.ts";

export class Q4Tensor {
  constructor(metadata, bytes) {
    this.metadata = metadata;
    this.name = metadata.name;
    this.shape = metadata.shape || [];
    this.encoding = metadata.encoding || "q4_symmetric_per_tensor";
    this.scale = Number(metadata.scale ?? 1);
    this.padNibbles = Number(metadata.pad_nibbles || metadata.padNibbles || 0);
    this.bytes = bytes;
  }

  get rank() {
    return this.shape.length;
  }

  get rows() {
    return Number(this.shape[0] || 0);
  }

  get cols() {
    return Number(this.shape[1] || 1);
  }

  valueAt(index) {
    return q4ValueAt(this.bytes, index, this.scale);
  }

  rowValue(row, col) {
    return this.valueAt(row * this.cols + col);
  }

  dequantize() {
    return unpackQ4Nibbles(this.bytes, { scale: this.scale, padNibbles: this.padNibbles });
  }

  dequantizeRow(row) {
    if (this.rank !== 2) throw new Error(`tensor_not_matrix:${this.name}`);
    const output = new Float32Array(this.cols);
    const base = row * this.cols;
    for (let col = 0; col < this.cols; col += 1) {
      output[col] = this.valueAt(base + col);
    }
    return output;
  }
}

export function tensorNumel(shape = []) {
  return shape.reduce((total, value) => total * Number(value || 0), 1);
}
