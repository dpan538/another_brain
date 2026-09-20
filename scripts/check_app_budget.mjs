// R31B2 — what a first visit downloads, measured on the built app (app/dist).
//
// The owner's budget: a first load of about 10 MB is acceptable on a 5 s warm-up.
// The install (everything the service worker precaches) must stay inside it. The
// OPPO Sans file is deliberately outside the install: it is fetched once, in the
// background, after first paint. Vercel Pro allows 1 GB of static output.
import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "app", "dist");
const INSTALL_BUDGET = 10 * 1024 * 1024;
const PLATFORM_BUDGET = 1024 * 1024 * 1024;
const LAZY = [/^fonts\//];

async function walk(dir) { const out = []; for (const e of await readdir(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) out.push(...await walk(p)); else out.push(p); } return out; }

const files = await walk(DIST).catch(() => null);
if (!files) { console.log(JSON.stringify({ ok: false, reason: "app/dist missing — run `npm run build:vercel` first" }, null, 2)); process.exit(1); }
let install = 0; let lazy = 0; const largest = [];
for (const f of files) {
  const rel = relative(DIST, f).split("\\").join("/"); const { size } = await stat(f);
  if (LAZY.some((re) => re.test(rel))) lazy += size; else install += size;
  largest.push([size, rel]);
}
largest.sort((a, b) => b[0] - a[0]);
const report = {
  ok: install <= INSTALL_BUDGET && install + lazy <= PLATFORM_BUDGET,
  install_bytes: install, install_budget_bytes: INSTALL_BUDGET, lazy_bytes: lazy, total_bytes: install + lazy,
  has_service_worker: files.some((f) => f.endsWith("/sw.js")), has_manifest: files.some((f) => f.endsWith("/manifest.webmanifest")),
  largest: largest.slice(0, 5).map(([size, rel]) => ({ rel, size }))
};
report.ok = report.ok && report.has_service_worker && report.has_manifest;
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
