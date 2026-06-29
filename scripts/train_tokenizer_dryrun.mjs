#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = "training/from_scratch/tokenizer_dry_run_config.json";

export function normalizeTokenizerText(text = "", config = {}) {
  let value = String(text || "");
  if (config.normalization?.unicode_nfc !== false) value = value.normalize("NFC");
  if (config.normalization?.collapse_whitespace !== false) value = value.replace(/\s+/g, " ");
  return value;
}

function splitUnits(text) {
  return Array.from(text);
}

function countMap(items) {
  const counts = new Map();
  for (const item of items) counts.set(item, (counts.get(item) || 0) + 1);
  return counts;
}

function pairKey(left, right) {
  return `${left}\u0000${right}`;
}

function pairParts(key) {
  return key.split("\u0000");
}

function mergeSequence(sequence, left, right, merged) {
  const out = [];
  for (let i = 0; i < sequence.length; i += 1) {
    if (sequence[i] === left && sequence[i + 1] === right) {
      out.push(merged);
      i += 1;
    } else {
      out.push(sequence[i]);
    }
  }
  return out;
}

export function trainDryrunTokenizer(text, config) {
  const specialTokens = config.special_tokens || [];
  const maxVocab = Number(config.selected_dryrun_vocab_size || 4096);
  const normalized = normalizeTokenizerText(text, config);
  let sequences = normalized.split(/\n+/).map((line) => splitUnits(line)).filter((seq) => seq.length);
  const charCounts = countMap(sequences.flat());
  const vocab = new Map();
  for (const token of specialTokens) vocab.set(token, vocab.size);
  for (const [char] of [...charCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    if (!vocab.has(char)) vocab.set(char, vocab.size);
    if (vocab.size >= maxVocab) break;
  }

  const merges = [];
  while (vocab.size < maxVocab) {
    const pairCounts = new Map();
    for (const sequence of sequences) {
      for (let i = 0; i < sequence.length - 1; i += 1) {
        const left = sequence[i];
        const right = sequence[i + 1];
        if (!vocab.has(left) || !vocab.has(right)) continue;
        const key = pairKey(left, right);
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
      }
    }
    const best = [...pairCounts.entries()]
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (!best) break;
    const [left, right] = pairParts(best[0]);
    const token = `${left}${right}`;
    if (vocab.has(token)) break;
    vocab.set(token, vocab.size);
    merges.push({ left, right, token, count: best[1] });
    sequences = sequences.map((sequence) => mergeSequence(sequence, left, right, token));
  }

  const tokens = [...vocab.entries()].map(([token, id]) => ({ token, id }));
  return {
    tokenizer_id: config.tokenizer_id,
    tokenizer_type: config.tokenizer_type,
    production_tokenizer: false,
    formal_decoder_training: false,
    special_tokens: specialTokens,
    unk_token: "<unk>",
    vocab_size: tokens.length,
    vocab: Object.fromEntries(tokens.map(({ token, id }) => [token, id])),
    merges,
    normalization: config.normalization,
    training_sources_used: config.train_sources || [],
    eval_sources_not_used_for_training: config.eval_sources || []
  };
}

export function encodeDryrun(text, tokenizer, config = {}) {
  const vocab = tokenizer.vocab || {};
  const sortedTokens = Object.keys(vocab)
    .sort((a, b) => b.length - a.length || a.localeCompare(b));
  const normalized = normalizeTokenizerText(text, config);
  const ids = [];
  let index = 0;
  while (index < normalized.length) {
    let matched = "";
    for (const token of sortedTokens) {
      if (normalized.startsWith(token, index)) {
        matched = token;
        break;
      }
    }
    if (matched) {
      ids.push(vocab[matched]);
      index += matched.length;
    } else {
      ids.push(vocab[tokenizer.unk_token || "<unk>"]);
      index += Array.from(normalized.slice(index))[0]?.length || 1;
    }
  }
  return ids;
}

export function decodeDryrun(ids, tokenizer) {
  const byId = new Map(Object.entries(tokenizer.vocab || {}).map(([token, id]) => [id, token]));
  return ids.map((id) => byId.get(id) || tokenizer.unk_token || "<unk>").join("");
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const config = await readJson(CONFIG_PATH);
  const artifactDir = config.artifact_dir || "artifacts/training_os/tokenizer_dryrun";
  const trainPath = `${artifactDir}/r25j_tokenizer_train.txt`;
  const trainText = await readFile(resolve(ROOT, trainPath), "utf8");
  const tokenizer = trainDryrunTokenizer(trainText, config);
  const stablePayload = JSON.stringify(tokenizer);
  const tokenizer_sha256 = createHash("sha256").update(stablePayload).digest("hex");
  const report = {
    ok: true,
    tokenizer_id: tokenizer.tokenizer_id,
    tokenizer_type: tokenizer.tokenizer_type,
    production_tokenizer: false,
    formal_decoder_training: false,
    train_chars: trainText.trim().length,
    vocab_size: tokenizer.vocab_size,
    merge_count: tokenizer.merges.length,
    tokenizer_sha256,
    output_files: [
      `${artifactDir}/r25j_tokenizer.json`,
      `${artifactDir}/r25j_tokenizer_merges.json`,
      `${artifactDir}/r25j_tokenizer_report.json`
    ]
  };
  await writeJson(`${artifactDir}/r25j_tokenizer.json`, tokenizer);
  await writeJson(`${artifactDir}/r25j_tokenizer_merges.json`, tokenizer.merges);
  await writeJson(`${artifactDir}/r25j_tokenizer_report.json`, report);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
