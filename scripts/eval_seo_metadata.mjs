#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_ROOT = resolve(ROOT, "web");
const DEFAULT_OUT = resolve(ROOT, "artifacts/release/seo_metadata_report.json");
const CANONICAL = "https://www.efishother.com/";

function parseArgs(argv) {
  const args = { out: DEFAULT_OUT };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--out") args.out = resolve(ROOT, argv[++index]);
  }
  return args;
}

async function text(path) {
  return readFile(resolve(WEB_ROOT, path), "utf8");
}

function has(html, needle) {
  return html.includes(needle);
}

function scriptJsonLd(html) {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  return JSON.parse(match[1]);
}

function includesAny(value, needles) {
  return needles.some((needle) => String(value || "").includes(needle));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const failures = [];
  const index = await text("index.html");
  const robots = await text("robots.txt");
  const sitemap = await text("sitemap.xml");
  const llms = await text("llms.txt");
  const about = await text("about.txt");
  const manifest = JSON.parse(await text("site.webmanifest"));

  if (!has(index, "<title>Answer Machine | efishother</title>")) failures.push("title");
  if (has(index, "<title>Dialog</title>")) failures.push("old_dialog_title");
  if (!has(index, 'name="description"')) failures.push("meta_description");
  if (!has(index, 'name="robots" content="index,follow')) failures.push("robots_meta");
  if (!has(index, `rel="canonical" href="${CANONICAL}"`)) failures.push("canonical");
  if (!has(index, 'property="og:title" content="Answer Machine | efishother"')) failures.push("og_title");
  if (!has(index, 'name="twitter:card" content="summary"')) failures.push("twitter_card");
  if (!has(index, 'rel="manifest" href="./site.webmanifest"')) failures.push("manifest_link");
  if (!has(index, "Answer Machine is a local-first browser-side answer machine")) failures.push("crawl_summary");

  const jsonLd = scriptJsonLd(index);
  if (!jsonLd) {
    failures.push("json_ld_missing");
  } else {
    const graph = Array.isArray(jsonLd["@graph"]) ? jsonLd["@graph"] : [];
    const types = graph.map((item) => item["@type"]);
    if (!types.includes("WebSite")) failures.push("json_ld_website");
    if (!types.includes("WebApplication")) failures.push("json_ld_web_application");
    if (!types.includes("WebPage")) failures.push("json_ld_web_page");
    if (!includesAny(JSON.stringify(graph), ["no cloud inference", "deterministic dialog rules"])) {
      failures.push("json_ld_project_boundary");
    }
  }

  if (!robots.includes("Sitemap: https://www.efishother.com/sitemap.xml")) failures.push("robots_sitemap");
  if (!robots.includes("Allow: /")) failures.push("robots_allow_root");
  for (const disallowed of ["/knowledge_shards/", "/tiny_router_model.generated.js", "/knowledge_base.generated.js"]) {
    if (!robots.includes(`Disallow: ${disallowed}`)) failures.push(`robots_missing_disallow:${disallowed}`);
  }

  if (!sitemap.includes("<loc>https://www.efishother.com/</loc>")) failures.push("sitemap_root");
  if (!sitemap.includes("<loc>https://www.efishother.com/about.txt</loc>")) failures.push("sitemap_about");
  if (!sitemap.includes("<loc>https://www.efishother.com/llms.txt</loc>")) failures.push("sitemap_llms");
  if (!sitemap.trim().startsWith('<?xml version="1.0" encoding="UTF-8"?>')) failures.push("sitemap_xml_header");
  if (!sitemap.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')) failures.push("sitemap_namespace");

  if (!llms.startsWith("# Answer Machine")) failures.push("llms_h1");
  if (!llms.includes("[Answer Machine](https://www.efishother.com/)")) failures.push("llms_home_link");
  if (!llms.includes("Do not describe it as a general chatbot")) failures.push("llms_boundaries");
  if (!llms.includes("No cloud inference is required")) failures.push("llms_no_cloud");

  if (!about.includes("Answer Machine | efishother")) failures.push("about_title");
  if (!about.includes("not a general-purpose AI assistant")) failures.push("about_boundary");
  if (!about.includes("Canonical URL: https://www.efishother.com/")) failures.push("about_canonical");

  if (manifest.name !== "Answer Machine") failures.push("manifest_name");
  if (manifest.start_url !== "/") failures.push("manifest_start_url");

  const report = {
    ok: failures.length === 0,
    summary: {
      canonical: CANONICAL,
      sitemap: "https://www.efishother.com/sitemap.xml",
      title: "Answer Machine | efishother",
      files: 6,
      structuredData: Boolean(jsonLd),
      failures: failures.length
    },
    failures
  };
  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
