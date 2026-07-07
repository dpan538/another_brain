#!/usr/bin/env node
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname);
const out = join(tmpdir(), `r28tok0-exact-tokenizer-${process.pid}`);

async function copyAsMjs(fromDir, toDir) {
  await mkdir(toDir, { recursive: true });
  for (const entry of await readdir(fromDir, { withFileTypes: true })) {
    const source = join(fromDir, entry.name);
    const targetBase = join(toDir, entry.name);
    if (entry.isDirectory()) {
      await copyAsMjs(source, targetBase);
      continue;
    }
    if (!entry.name.endsWith(".ts")) continue;
    const target = targetBase.replace(/\.ts$/, ".mjs");
    const text = (await readFile(source, "utf8")).replace(/\.ts(["'])/g, ".mjs$1");
    await writeFile(target, text, "utf8");
  }
}

await rm(out, { recursive: true, force: true });
await copyAsMjs(join(root, "src/browser_runtime"), join(out, "src/browser_runtime"));
const tokenizerMod = await import(pathToFileURL(join(out, "src/browser_runtime/tokenizer/runtime_tokenizer.mjs")));
const tokenizer = JSON.parse(await readFile(join(root, "web/another_brain/model_assets/r28m1/tokenizer/runtime_tokenizer.json"), "utf8"));
const modelConfig = JSON.parse(await readFile(join(root, "web/another_brain/model_assets/r28m1/model.config.json"), "utf8"));
const quantizationManifest = JSON.parse(await readFile(join(root, "web/another_brain/model_assets/r28m1/quantization.manifest.json"), "utf8"));
const runtimeTokenizer = tokenizerMod.createRuntimeTokenizer({ tokenizer, modelConfig, quantizationManifest });
const texts = ["你好", "请用中文简短回答。", "证据不足时应该怎么回答？"];
const cases = texts.map((text) => {
  const encoded = runtimeTokenizer.encode(text, { maxTokens: 64 });
  const decoded = runtimeTokenizer.decode(encoded.input_ids);
  return {
    text,
    ok: encoded.ok && decoded.ok,
    input_ids: encoded.input_ids,
    decoded_text: decoded.text,
    exact_encode: encoded.exact_encode,
    exact_decode: decoded.exact_decode,
    decode_status: decoded.decode_status
  };
});
const ok = runtimeTokenizer.inspection.exact_runtime_tokenizer === true &&
  runtimeTokenizer.inspection.decode_status === "exact_runtime_tokenizer" &&
  cases.every((item) => item.ok && item.exact_encode && item.exact_decode && item.decoded_text.length > 0);
const report = {
  ok,
  tokenizer_type: runtimeTokenizer.inspection.tokenizer_type,
  vocab_size: runtimeTokenizer.inspection.vocab_size,
  decode_status: runtimeTokenizer.inspection.decode_status,
  exact_encode: runtimeTokenizer.inspection.exact_encode,
  exact_decode: runtimeTokenizer.inspection.exact_decode,
  lossy_decode_status: "lossy_runtime_display_codec_emergency_fallback",
  lossy_fallback_primary: false,
  cases,
  non_claims: {
    product_model: false,
    product_admission: false,
    browser_admission: false,
    release_checkpoint_admission: false,
    training: false
  }
};
console.log(JSON.stringify(report, null, 2));
await rm(out, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
