#!/usr/bin/env node
import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";

const canonical = resolve(ROOT, "web/another_brain_chat/index.html");
const entries = [
  resolve(ROOT, "web/index.html"),
  resolve(ROOT, "web/another_brain_chat.html")
];

for (const entry of entries) {
  await copyFile(canonical, entry);
}

console.log(JSON.stringify({
  ok: true,
  canonical: "web/another_brain_chat/index.html",
  synced: ["web/index.html", "web/another_brain_chat.html"],
  route_model: "direct_static_entries_no_client_redirect"
}, null, 2));
