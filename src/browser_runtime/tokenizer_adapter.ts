export function createTokenizerAdapter(options = {}) {
  const vocabSize = Number(options.vocabSize || 65536);
  return {
    vocabSize,
    encode(text) {
      return Array.from(String(text)).map((char) => char.codePointAt(0) % vocabSize);
    },
    decode(tokens) {
      return Array.from(tokens || []).map((token) => String.fromCodePoint(Number(token))).join("");
    }
  };
}
