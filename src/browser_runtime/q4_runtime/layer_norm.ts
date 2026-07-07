export function layerNorm(input, weight, bias, epsilon = 1e-5) {
  let mean = 0;
  for (const value of input) mean += value;
  mean /= input.length;
  let variance = 0;
  for (const value of input) {
    const delta = value - mean;
    variance += delta * delta;
  }
  variance /= input.length;
  const invStd = 1 / Math.sqrt(variance + epsilon);
  const out = new Float32Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    out[index] = (input[index] - mean) * invStd * weight[index] + bias[index];
  }
  return out;
}

export function layerNormFromStore(input, store, weightName, biasName) {
  return layerNorm(input, store.dequantize(weightName), store.dequantize(biasName));
}
