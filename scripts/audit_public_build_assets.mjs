#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { ROOT } from "./r18_utils.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/public_build_asset_audit.json");

async function hashFile(file) {
  const text = await readFile(file, "utf8");
  return createHash("sha256").update(text).digest("hex");
}

async function main() {
  const files = ["web/app.js", "web/operation_layer.js", "web/fallback_firewall.js", "web/tiny_router_model.generated.js", "web/index.html"];
  const local = {};
  for (const file of files) {
    try {
      local[file] = await hashFile(resolve(ROOT, file));
    } catch (error) {
      local[file] = `missing:${error.message}`;
    }
  }
  const index = await readFile(resolve(ROOT, "web/index.html"), "utf8");
  const appVersionRef = index.match(/app\.js\?v=(\d+)/)?.[1] || "";
  const report = {
    generated_at: new Date().toISOString(),
    local_hashes: local,
    app_js_version_ref: appVersionRef,
    service_worker_declared: /serviceWorker|navigator\.serviceWorker/.test(index),
    cache_busting_present: Boolean(appVersionRef),
    deployed_asset_probe: "see p0_deployed_site_probe_report.json",
    notes: "This audit checks local static asset hashes and cache-busting references. Deployed hashes require network probe."
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
