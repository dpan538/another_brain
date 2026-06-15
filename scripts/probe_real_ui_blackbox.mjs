#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { ROOT } from "./r18_utils.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/p0_real_ui_blackbox_report.json");

async function main() {
  let playwrightAvailable = false;
  try {
    await import("playwright");
    playwrightAvailable = true;
  } catch {
    playwrightAvailable = false;
  }
  const report = {
    generated_at: new Date().toISOString(),
    attempted: true,
    available: playwrightAvailable,
    ran: false,
    reason: playwrightAvailable
      ? "Playwright is available, but this script delegates full mobile E2E to eval_p0_browser_e2e.mjs."
      : "Playwright is not installed; real browser blackbox must be verified by the app/browser tool or a local browser harness.",
    prompts: ["罗大佑是谁？", "罗大佑你知道吗？", "什么发生过？", "哪一边？", "你读过日本文学吗？", "我需要怎么提问？", "你知道我要干什么吗？"]
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
