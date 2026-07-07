#!/usr/bin/env node
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(new URL("..", import.meta.url).pathname);
const out = join(tmpdir(), `r28ux3-ts-tests-${process.pid}`);

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
await copyAsMjs(join(root, "tests/r28ux3"), join(out, "tests/r28ux3"));
await cp(join(root, "web/another_brain_chat"), join(out, "web/another_brain_chat"), { recursive: true });
await cp(join(root, "web/another_brain/asset_manifest.json"), join(out, "web/another_brain/asset_manifest.json"));
await cp(join(root, "web/another_brain/runtime_mode.json"), join(out, "web/another_brain/runtime_mode.json"));
await cp(join(root, "package.json"), join(out, "package.json"));
await cp(join(root, "vercel.json"), join(out, "vercel.json"));

const result = spawnSync("node", ["--test", join(out, "tests/r28ux3/*.mjs")], {
  cwd: out,
  shell: true,
  stdio: "inherit"
});
await rm(out, { recursive: true, force: true });
process.exit(result.status || 0);
