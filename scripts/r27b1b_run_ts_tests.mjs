#!/usr/bin/env node
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(new URL("..", import.meta.url).pathname);
const out = join(tmpdir(), `r27b1b-ts-tests-${process.pid}`);

async function copyAsMjs(fromDir, toDir) {
  await mkdir(toDir, { recursive: true });
  for (const name of await readdir(fromDir)) {
    if (!name.endsWith(".ts")) continue;
    const source = join(fromDir, name);
    const target = join(toDir, name.replace(/\.ts$/, ".mjs"));
    const text = (await readFile(source, "utf8")).replace(/\.ts(["'])/g, ".mjs$1");
    await writeFile(target, text, "utf8");
  }
}

await rm(out, { recursive: true, force: true });
await copyAsMjs(join(root, "src/browser_runtime"), join(out, "src/browser_runtime"));
await copyAsMjs(join(root, "tests/r27b1b"), join(out, "tests/r27b1b"));
await cp(join(root, "package.json"), join(out, "package.json"));

const result = spawnSync("node", ["--test", join(out, "tests/r27b1b/*.mjs")], {
  cwd: root,
  shell: true,
  stdio: "inherit"
});
await rm(out, { recursive: true, force: true });
process.exit(result.status || 0);
