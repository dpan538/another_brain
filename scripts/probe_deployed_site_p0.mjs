#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { ROOT } from "./r18_utils.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/p0_deployed_site_probe_report.json");
const URL = "https://efishother.com/?p0_probe=1";

async function main() {
  const report = {
    generated_at: new Date().toISOString(),
    deployed_probe: "attempted",
    url: URL,
    available: false,
    status: 0,
    headers: {},
    asset_urls: [],
    asset_hashes: {},
    reason: "",
    ui_automation_possible: false
  };
  try {
    const res = await fetch(URL, { headers: { "User-Agent": "another_brain_p0_probe/1.0" } });
    report.status = res.status;
    report.available = res.ok;
    for (const [key, value] of res.headers.entries()) report.headers[key] = value;
    const html = await res.text();
    const assetUrls = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => new URL(m[1], URL).href);
    report.asset_urls = assetUrls;
    for (const asset of assetUrls.slice(0, 8)) {
      try {
        const assetRes = await fetch(asset, { headers: { "User-Agent": "another_brain_p0_probe/1.0" } });
        const text = await assetRes.text();
        report.asset_hashes[asset] = createHash("sha256").update(text).digest("hex");
      } catch (error) {
        report.asset_hashes[asset] = `fetch_failed:${error.message}`;
      }
    }
  } catch (error) {
    report.deployed_probe = "skipped";
    report.reason = `network_unavailable_or_blocked: ${error.message}`;
  }
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
