#!/usr/bin/env node
// Sasori QA: photographs every route at three widths in light and dark, and checks what a machine can check
// (overflow, accessibility, console errors, broken assets, clipped text, focus styles, metadata, and motion: see motion.mjs).
//
//   node .claude/sasori/qa/shoot.mjs [--config .sasori/qa.json] [--base-url http://localhost:3000] [--out qa-report]
//                                    [--routes /,/pricing]
//
// .sasori/qa.json: { "baseUrl": "http://localhost:3000", "routes": ["/", "/app"], "public": ["/"],
//                    "widths": [390, 768, 1440], "waitFor": "networkidle", "ignoreAxe": ["region"], "concurrency": 6,
//                    "notFound": ["/no-such-page"], "interactions": [...], "motion": {...} }   (the last two: see motion.mjs)
// notFound routes are shot like the others but must answer 404 (the product's not-found page).
// .sasori/qa.d/*.json (beside the config) are merged onto it in name order, so each issue adds its own file instead of
// editing qa.json, a merge-conflict hot spot: arrays are joined (duplicates dropped), objects merged, other values replaced.
// Needs `playwright` (or `playwright-core`) and `axe-core` resolvable from the project. Uses the Chromium at
// PLAYWRIGHT_BROWSERS_PATH (preinstalled in Claude Code cloud sessions) or Playwright's own.
// Writes <out>/<route>-<width>-<theme>.png, a frame strip per listed interaction (<route>--<label>-motion.png and
// -reduced.png), <out>/report.json and <out>/report.md. Exit 1 when a check fails; warnings are reported but don't fail.
// Pages are shot in parallel (one isolated browser context each, `concurrency` at a time, default the core count up to 8, or the
// SASORI_QA_CONCURRENCY env var); every page gets exactly the same checks as when shot one by one, and the
// report is sorted, so the output doesn't depend on the order pages finished in.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { motionConfig, scanPage, filmStrip } from "./motion.mjs";

const require = createRequire(path.join(process.cwd(), "package.json"));
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const cfgPath = arg("config", ".sasori/qa.json");
const merge = (a, b) => {
  if (Array.isArray(a) && Array.isArray(b)) {
    const seen = new Set(a.map(x => JSON.stringify(x)));
    return [...a, ...b.filter(x => !seen.has(JSON.stringify(x)) && seen.add(JSON.stringify(x)))];
  }
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b))
    return Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map(k => [k, k in b ? (k in a ? merge(a[k], b[k]) : b[k]) : a[k]]));
  return b;
};
const qaDir = path.join(path.dirname(cfgPath), "qa.d");
const cfg = [cfgPath, ...(fs.existsSync(qaDir) ? fs.readdirSync(qaDir).filter(f => f.endsWith(".json")).sort().map(f => path.join(qaDir, f)) : [])]
  .filter(f => fs.existsSync(f)).reduce((c, f) => merge(c, JSON.parse(fs.readFileSync(f, "utf8"))), {});
const baseUrl = (arg("base-url", cfg.baseUrl || "http://localhost:3000")).replace(/\/$/, "");
const notFound = new Set(cfg.notFound || []);   // routes whose page is a 404 on purpose: shot like the rest, and a 404 passes
const allRoutes = [...new Set([...(cfg.routes || ["/"]), ...notFound])];
// --changed <file of paths>: shoot only the routes those paths can affect, when every changed path is inside some
// route's own files (qa.json "routeFiles": {"/pricing": ["src/app/pricing/"]}, path prefixes). Anything else (a
// shared component, a style, a config) might touch every page, so every route is shot.
function affected() {
  const list = arg("changed"); if (!list || !cfg.routeFiles || !fs.existsSync(list)) return null;
  // the same docs rule as the QA workflow: top-level Markdown and docs/ can't change a page; Markdown inside the app can
  const files = fs.readFileSync(list, "utf8").split("\n").filter(Boolean).filter(f => !/^[^/]+\.md$|^docs\//.test(f));
  const hit = new Set();
  for (const f of files) {
    const own = Object.entries(cfg.routeFiles).filter(([, prefixes]) => prefixes.some(p => f.startsWith(p))).map(([r]) => r);
    if (!own.length) return null;
    own.forEach(r => hit.add(r));
  }
  return allRoutes.filter(r => hit.has(r));
}
const subset = arg("routes") ? null : affected();
const routes = arg("routes") ? arg("routes").split(",") : subset && subset.length ? subset : allRoutes;
const publicRoutes = new Set(cfg.public || ["/"]);
const widths = cfg.widths || [390, 768, 1440];
const themes = ["light", "dark"];
const out = arg("out", "qa-report");
const ignoreAxe = new Set(cfg.ignoreAxe || []);
const cores = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
const wanted = Number(process.env.SASORI_QA_CONCURRENCY || cfg.concurrency);   // "auto", junk or 0 mean the default
const concurrency = Number.isInteger(wanted) && wanted > 0 ? wanted : Math.min(8, Math.max(2, cores));
const mc = motionConfig(cfg);
const waitFor = cfg.waitFor || "networkidle";
const desktop = widths[widths.length - 1];

// bypassCSP on every context: QA injects axe-core as an inline script, which an app's own CSP rightly refuses. The
// app's CSP is the app's to test; QA's tooling stays outside it.
let chromium;
for (const m of ["playwright", "playwright-core", "@playwright/test"]) { try { ({ chromium } = require(m)); break; } catch {} }
if (!chromium) { console.error("QA: install playwright (npm i -D playwright) to run this."); process.exit(2); }
let axeSource = null;
// The project's own axe-core first, then the tools directory session CI passes on NODE_PATH
for (const base of [process.cwd(), ...(process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean)]) {
  try { axeSource = fs.readFileSync(createRequire(path.join(base, "noop.js")).resolve("axe-core/axe.min.js"), "utf8"); break; } catch {}
}
if (!axeSource) {
  // In session CI a QA without the accessibility check isn't a pass: it didn't run (an error, run again), never green
  if (process.env.SASORI_QA_NEED_AXE === "1") { console.error("QA: axe-core isn't installed, so the accessibility check can't run."); process.exit(3); }
  console.warn("QA: axe-core not installed, accessibility check skipped.");
}

fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out))   // an earlier run's pictures never count; only the shooter's own files go, so --out public is safe
  if (/-\d+-(light|dark)\.png$|--.+-(motion|reduced)\.png$/.test(f)) fs.rmSync(path.join(out, f));
const slug = r => (r === "/" ? "home" : r.replace(/^\/|\/$/g, "").replace(/[^a-z0-9]+/gi, "-")).toLowerCase();
const buckets = [];   // one per job, so the report is in job order whatever order jobs finish in

const browser = await chromium.launch();
const taken = new Map();   // two interactions with the same route and label get their own files
const strips = (mc ? mc.interactions : []).filter(it => routes.includes(it.route || "/")).map(it => {
  const base = `${slug(it.route || "/")}--${slug("/" + it.label)}`, n = (taken.get(base) || 0) + 1; taken.set(base, n);
  return { ...it, route: it.route || "/", file: n > 1 ? `${base}-${n}` : base };
}).flatMap(it => [false, true].map(reduced => ({ kind: "strip", it, reduced })));
const jobs = [
  ...routes.flatMap(route => themes.flatMap(theme => widths.map(width => ({ kind: "shot", route, theme, width })))),
  ...(mc ? routes.map(route => ({ kind: "motion", route })) : []),
  ...strips,
];
const filmed = [];
const momentOn = route => mc && mc.moment && (mc.moment.route || "/") === route;
async function motion({ route }, fail, warn) {   // with reduced motion off; the reduced-motion scan rides on a shot job
  const ctx = await browser.newContext({ viewport: { width: desktop, height: 900 }, colorScheme: "light", deviceScaleFactor: 1, bypassCSP: true, reducedMotion: "no-preference" });
  try {
    const page = await ctx.newPage();
    const res = await page.goto(baseUrl + route, { waitUntil: waitFor, timeout: 45000 }).catch(() => null);
    if (res) {
      const v = await scanPage(page, mc, { reduced: false, momentHere: momentOn(route) });
      for (const [c, d] of v.fails) fail(route, desktop, "light", c, d, `${desktop} motion on`);
      for (const [c, d] of v.warns) warn(route, desktop, "light", c, d, `${desktop} motion on`);
    }
  } finally { await ctx.close().catch(() => {}); }
}
async function strip({ it, reduced }, fail, warn) {
  const ctx = await browser.newContext({ viewport: { width: desktop, height: 900 }, colorScheme: "light", deviceScaleFactor: 1, bypassCSP: true, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  const name = `${it.file}-${reduced ? "reduced" : "motion"}.png`;
  const where = `${it.label} (${reduced ? "reduced motion" : "motion on"})`;
  try {
    const v = await filmStrip(ctx, page, baseUrl + it.route, it, mc, { reduced, file: path.join(out, name), waitFor });
    for (const [c, d] of v.fails) fail(it.route, desktop, "light", c, d, where);
    for (const [c, d] of v.warns) warn(it.route, desktop, "light", c, d, where);
    if (fs.existsSync(path.join(out, name))) filmed.push({ route: it.route, label: it.label, action: it.action, selector: it.selector, moment: !!it.moment, reduced, file: name, animations: v.animations || [] });
  } finally { await ctx.close(); }   // its CDP session goes with it
}
async function shoot(job, fail, warn) {   // the context closes even when a check throws
  const ctx = await browser.newContext({ viewport: { width: job.width, height: 900 }, colorScheme: job.theme, deviceScaleFactor: 1, bypassCSP: true, reducedMotion: "reduce" });
  try { await shootIn(ctx, job, fail, warn); } finally { await ctx.close().catch(() => {}); }
}
async function shootIn(ctx, { route, theme, width }, fail, warn) {
        const page = await ctx.newPage();
        const errors = [], broken = [];
        page.on("console", m => { if (m.type() === "error" && !(notFound.has(route) && /status of 404/.test(m.text()))) errors.push(m.text().slice(0, 200)); });
        page.on("pageerror", e => errors.push(String(e.message || e).slice(0, 200)));
        page.on("requestfailed", r => { if (["image", "font", "stylesheet", "script"].includes(r.resourceType())) broken.push(r.url()); });
        page.on("response", r => { if (r.status() >= 400 && ["image", "font", "stylesheet", "script"].includes(r.request().resourceType())) broken.push(`${r.status()} ${r.url()}`); });
        const res = await page.goto(baseUrl + route, { waitUntil: waitFor, timeout: 45000 }).catch(e => { fail(route, width, theme, "load", e.message); return null; });
        if (!res) return;
        if (notFound.has(route)) { if (res.status() !== 404) fail(route, width, theme, "load", `expected a 404 (it's in notFound), got HTTP ${res.status()}`); }
        else if (res.status() >= 400) fail(route, width, theme, "load", `HTTP ${res.status()}`);
        await page.evaluate(() => document.fonts && document.fonts.ready);

        const layout = await page.evaluate(() => {
          const over = document.documentElement.scrollWidth - window.innerWidth;
          const clipped = [];
          for (const el of document.querySelectorAll("body *")) {
            if (!el.childNodes.length || clipped.length >= 5) continue;
            const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
            if (!hasText) continue;
            const s = getComputedStyle(el);
            const scrolls = /(auto|scroll)/.test(s.overflowX + s.overflowY);
            const hides = s.overflow === "hidden" || s.overflowX === "hidden";
            const ellipsis = s.textOverflow === "ellipsis";
            if (hides && !scrolls && !ellipsis && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2))
              clipped.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""}: "${el.textContent.trim().slice(0, 40)}"`);
          }
          return { over, clipped };
        });
        if (layout.over > 1) fail(route, width, theme, "overflow", `page scrolls sideways by ${layout.over}px`);
        if (layout.clipped.length) fail(route, width, theme, "clipped text", layout.clipped.join("; "));
        if (errors.length) fail(route, width, theme, "console", [...new Set(errors)].sort().slice(0, 3).join(" | "));
        if (broken.length) fail(route, width, theme, "broken assets", [...new Set(broken)].sort().slice(0, 3).join(" | "));

        if (axeSource && width === widths[widths.length - 1]) {
          await page.addScriptTag({ content: axeSource });
          const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] })).violations
            .map(x => ({ id: x.id, impact: x.impact, help: x.help, nodes: x.nodes.length })));
          for (const x of v.filter(x => ["serious", "critical"].includes(x.impact) && !ignoreAxe.has(x.id)))
            fail(route, width, theme, "accessibility", `${x.id} (${x.impact}, ${x.nodes} element${x.nodes > 1 ? "s" : ""}): ${x.help}`);
        }

        if (theme === "light" && width === widths[widths.length - 1]) {
          const unfocused = await page.evaluate(async () => {
            const els = [...document.querySelectorAll('a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])')]
              .filter(e => e.offsetParent !== null).slice(0, 20);
            const bad = [];
            for (const el of els) {
              const before = getComputedStyle(el); const b = before.outlineStyle + before.outlineWidth + before.boxShadow + before.borderColor + before.backgroundColor;
              el.focus({ focusVisible: true });
              const after = getComputedStyle(el); const a = after.outlineStyle + after.outlineWidth + after.boxShadow + after.borderColor + after.backgroundColor;
              if (document.activeElement === el && a === b) bad.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}"`);
              el.blur();
            }
            return bad;
          });
          if (unfocused.length) fail(route, width, theme, "focus", `no visible focus style: ${unfocused.slice(0, 4).join(", ")}`);
          if (publicRoutes.has(route)) {
            const meta = await page.evaluate(() => ({
              title: document.title.trim(), lang: document.documentElement.lang,
              description: document.querySelector('meta[name="description"]')?.content,
              og: document.querySelector('meta[property="og:image"]')?.content,
              icon: document.querySelector('link[rel~="icon"]')?.href,
            }));
            const missing = Object.entries(meta).filter(([, v]) => !v).map(([k]) => k);
            if (missing.length) fail(route, width, theme, "metadata", `missing ${missing.join(", ")}`);
          }
        }

        await page.screenshot({ path: path.join(out, `${slug(route)}-${width}-${theme}.png`), fullPage: true });
        if (mc && theme === "light" && width === desktop) {   // this context already has reduced motion on
          const v = await scanPage(page, mc, { reduced: true, momentHere: momentOn(route) });
          for (const [c, d] of v.fails) fail(route, width, theme, c, d, `${width} reduced motion`);
        }
}
try {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (next < jobs.length) {
      const i = next++, job = jobs[i], b = buckets[i] = { fails: [], warns: [] };
      const fail = (route, width, theme, check, detail, where) => b.fails.push({ route, width, theme, check, detail, ...(where ? { where } : {}) });
      const warn = (route, width, theme, check, detail, where) => b.warns.push({ route, width, theme, check, detail, ...(where ? { where } : {}) });
      try { await (job.kind === "motion" ? motion : job.kind === "strip" ? strip : shoot)(job, fail, warn); }
      catch (e) {   // one job's error is a failure in the report, never the end of the run
        const route = job.route || job.it.route;
        fail(route, job.width || desktop, job.theme || "light", job.kind === "shot" ? "load" : "motion: interaction",
          `${job.kind === "strip" ? job.it.label + ": " : ""}${String(e.message || e).split("\n")[0].slice(0, 200)}`);
      }
    }
  }));
} finally { await browser.close(); }
const results = buckets.flatMap(b => b.fails), warnings = buckets.flatMap(b => b.warns);
const stripOrder = f => strips.findIndex(j => `${j.it.file}-${j.reduced ? "reduced" : "motion"}.png` === f.file);
filmed.sort((a, b) => stripOrder(a) - stripOrder(b));

const shots = fs.readdirSync(out).filter(f => /-\d+-(light|dark)\.png$/.test(f)).sort();
if (routes.length && !shots.length)   // never report "All checks passed" over nothing
  results.push({ route: routes[0], width: desktop, theme: "light", check: "load", detail: `no screenshots were taken of ${routes.length} route${routes.length > 1 ? "s" : ""}` });
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify({ baseUrl, routes, widths, failures: results, warnings, screenshots: shots, strips: filmed }, null, 2));
const lines = [`**QA** · ${routes.length} route${routes.length > 1 ? "s" : ""} × ${widths.join("/")} px × light and dark · ${shots.length} screenshots${filmed.length ? ` · ${filmed.length} motion strips` : ""}${subset && subset.length ? ` · only the routes this change can affect (routeFiles)` : ""}`, ""];
if (!results.length) lines.push(`All checks passed: no overflow, no serious accessibility issues, no console errors, no broken assets, no clipped text, focus visible, metadata present${mc ? ", motion within the bar, reduced motion respected" : ""}.`);
else {
  const groups = new Map();
  for (const r of results) {
    const k = `${r.route}\u0000${r.check}\u0000${String(r.detail).replace(/\d+px/, "Npx").split(" | ").sort().join(" | ")}`;
    if (!groups.has(k)) groups.set(k, { ...r, where: new Set() });
    groups.get(k).where.add(r.where || `${r.width} ${r.theme}`);
  }
  lines.push(`${results.length} failure${results.length > 1 ? "s" : ""} in ${groups.size} group${groups.size > 1 ? "s" : ""}.`, "", "| Route | Check | Where | Detail |", "|---|---|---|---|");
  for (const g of groups.values()) {
    const where = g.where.size === widths.length * themes.length ? "every width and theme" : [...g.where].join(", ");
    lines.push(`| \`${g.route}\` | ${g.check} | ${where} | ${String(g.detail).replace(/\|/g, "\\|")} |`);
  }
}
if (warnings.length) {
  lines.push("", `Warnings (not failing): ${warnings.length}.`, "", "| Route | Check | Where | Detail |", "|---|---|---|---|");
  for (const r of warnings) lines.push(`| \`${r.route}\` | ${r.check} | ${r.where || `${r.width} ${r.theme}`} | ${String(r.detail).replace(/\|/g, "\\|")} |`);
}
if (filmed.length) {
  lines.push("", "Motion strips (frames across each animation, for the design review):", "");
  for (const s of filmed) lines.push(`- \`${s.route}\` ${s.label}${s.moment ? " (the orchestrated moment)" : ""}, ${s.action} \`${s.selector}\`, ${s.reduced ? "reduced motion" : "motion on"}: ${s.animations.length ? s.animations.join("; ") : "no animation"} (\`${s.file}\`)`);
}
fs.writeFileSync(path.join(out, "report.md"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
process.exit(results.length ? 1 : 0);
