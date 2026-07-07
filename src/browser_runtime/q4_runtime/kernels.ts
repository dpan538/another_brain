import { q4ValueAt } from "./q4_dequant.ts";

export function addVectors(a, b) {
  const out = new Float32Array(a.length);
  for (let index = 0; index < a.length; index += 1) out[index] = a[index] + b[index];
  return out;
}

export function addInPlace(target, value) {
  for (let index = 0; index < target.length; index += 1) target[index] += value[index];
  return target;
}

export function gelu(value) {
  return 0.5 * value * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (value + 0.044715 * value ** 3)));
}

export function applyGeluInPlace(values) {
  for (let index = 0; index < values.length; index += 1) values[index] = gelu(values[index]);
  return values;
}

export function argmax(values) {
  let bestIndex = 0;
  let bestValue = values[0] ?? Number.NEGATIVE_INFINITY;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] > bestValue) {
      bestValue = values[index];
      bestIndex = index;
    }
  }
  return { index: bestIndex, value: bestValue };
}

export function matmulQ4Vector(unpackedWeights, inputVector, rows, cols) {
  const rowCount = Number(rows);
  const colCount = Number(cols);
  if (!Number.isInteger(rowCount) || !Number.isInteger(colCount) || rowCount <= 0 || colCount <= 0) {
    throw new Error("invalid_matmul_shape");
  }
  if (unpackedWeights.length < rowCount * colCount) throw new Error("q4_weight_buffer_too_small");
  if (inputVector.length < colCount) throw new Error("input_vector_too_small");
  const output = new Float32Array(rowCount);
  for (let row = 0; row < rowCount; row += 1) {
    let sum = 0;
    const base = row * colCount;
    for (let col = 0; col < colCount; col += 1) {
      sum += unpackedWeights[base + col] * inputVector[col];
    }
    output[row] = sum;
  }
  return output;
}

export function linearQ4(input, weightTensor, biasTensor = null, options = {}) {
  return linearQ4Rows(input, weightTensor, 0, weightTensor.rows, biasTensor, options);
}

export function linearQ4Rows(input, weightTensor, startRow = 0, rowCount = weightTensor.rows, biasTensor = null, options = {}) {
  const cols = weightTensor.cols;
  if (input.length < cols) throw new Error(`linear_input_too_small:${weightTensor.name}`);
  const output = new Float32Array(rowCount);
  const scale = weightTensor.scale;
  const bytes = weightTensor.bytes;
  const bias = biasTensor ? biasTensor.dequantize() : null;
  const maxRows = Number(options.maxRows || rowCount);
  for (let localRow = 0; localRow < Math.min(rowCount, maxRows); localRow += 1) {
    const row = startRow + localRow;
    let sum = bias ? bias[row] || 0 : 0;
    const base = row * cols;
    for (let col = 0; col < cols; col += 1) {
      sum += q4ValueAt(bytes, base + col, scale) * input[col];
    }
    output[localRow] = sum;
  }
  return output;
}
