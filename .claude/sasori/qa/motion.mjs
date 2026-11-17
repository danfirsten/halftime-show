// Sasori QA, motion: checks what a machine can check about animation, and films the interactions a reviewer should watch.
// Imported by shoot.mjs, which runs these jobs in the same pool and puts the findings in the same report.
//
// .sasori/qa.json:
//   "motion": { "allow": [".ticker"], "loading": [".spinner"], "maxEntrances": 2, "frames": 8,
//               "moment": { "route": "/race", "selector": ".bib", "action": "click", "label": "bib tears off" } }
//   "interactions": [ { "route": "/", "selector": "a.cta", "action": "hover", "label": "primary button" } ]
// `action` is hover, focus, click or load. "motion": false turns the motion checks off.
//
// Rules (design-bar.md, Motion): responses to an action take 150 to 250 ms (warn above 250, fail above 400, except the
// declared moment), no `transition: all`, no bounce or elastic easing (a cubic-bezier control point outside 0..1), no
// infinite animation outside a loading state, no entrance animation on more than `maxEntrances` elements (fade-and-
// slide-up on every section), and with reduced motion on, nothing moves (opacity and colour are fine).
// `allow` exempts elements (and their descendants) from every rule except reduced motion.

export const WARN_MS = 250, FAIL_MS = 400, REDUCED_MS = 20;

export function motionConfig(cfg) {
  if (cfg.motion === false) return null;
  const m = cfg.motion || {};
  const moment = m.moment && m.moment.selector ? { action: "click", label: "orchestrated moment", ...m.moment, moment: true } : null;
  return {
    allow: m.allow || [], loading: m.loading || [], maxEntrances: m.maxEntrances ?? 2, frames: Math.max(2, m.frames || 8),
    moment, interactions: [...(cfg.interactions || []).map(i => ({ action: "hover", label: i.selector, ...i })), ...(moment ? [moment] : [])],
  };
}

// Runs in the page: every declared transition and animation, plus every animation seen while the page loads and scrolls
// (or, with `since`, only the ones started after the set of animations captured before an interaction).
async function collect({ allow, loading, moment, scroll, sinceKey }) {
  const MOVES = /^(transform|translate|rotate|scale|top|left|right|bottom|inset.*|margin.*|offset.*)$/;
  const LOADING = ['[aria-busy="true"]', '[role="progressbar"]', '[role="status"]', "[data-loading]", ".skeleton", ".spinner", ".loading", ...loading];
  const within = (el, sels) => !!el && sels.some(s => { try { return el.closest(s); } catch { return false; } });
  const split = v => v.split(/,(?![^(]*\))/).map(x => x.trim());
  const ms = v => (v.endsWith("ms") ? parseFloat(v) : parseFloat(v) * 1000);
  const who = (el, pseudo) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/)[0] : "") + (pseudo || "");
  const ids = new Map(); const idOf = el => { if (!ids.has(el)) ids.set(el, ids.size); return ids.get(el); };
  const records = [];
  const add = (el, r) => records.push({ who: who(el, r.pseudo), id: idOf(el), exempt: within(el, allow), moment: within(el, moment ? [moment] : []), loading: within(el, LOADING), ...r });

  const frames = {};   // @keyframes name -> { props, entrance }
  const walk = rules => { for (const r of rules) {
    if (r.type === CSSRule.KEYFRAMES_RULE) {
      const props = new Set(); let entrance = false;
      for (const k of r.cssRules) {
        for (let i = 0; i < k.style.length; i++) props.add(k.style[i]);
        if (/(^|,)\s*(from|0%)/.test(k.keyText)) {
          const o = k.style.getPropertyValue("opacity"), t = k.style.getPropertyValue("transform") || k.style.getPropertyValue("translate");
          if ((o && parseFloat(o) < 1) || (t && t !== "none")) entrance = true;
        }
      }
      frames[r.name] = { props: [...props], entrance };
    } else if (r.cssRules) {
      if (r.type === CSSRule.MEDIA_RULE && !matchMedia(r.conditionText || r.media.mediaText).matches) continue;
      walk(r.cssRules);
    }
  } };
  for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch {} }

  const fromAnimation = (a, source) => {
    const el = a.effect && a.effect.target; if (!el) return;
    const t = a.effect.getTiming(), kfs = a.effect.getKeyframes();
    const props = a.transitionProperty ? [a.transitionProperty] : [...new Set(kfs.flatMap(k => Object.keys(k).filter(p => !["offset", "computedOffset", "easing", "composite"].includes(p))))]
      .map(p => p.replace(/[A-Z]/g, c => "-" + c.toLowerCase()));
    const first = kfs[0] || {};
    const entrance = a.transitionProperty ? /^(opacity|transform|translate)$/.test(a.transitionProperty)
      : (first.opacity !== undefined && parseFloat(first.opacity) < 1) || (first.transform && first.transform !== "none") || (first.translate && first.translate !== "none");
    add(el, { kind: a.transitionProperty ? "transition" : "animation", name: a.animationName || a.transitionProperty || a.id || "animation", pseudo: a.effect.pseudoElement || "",
      props, dur: Number(t.duration) || 0, delay: t.delay || 0, eases: [t.easing, ...kfs.map(k => k.easing)].filter(Boolean),
      infinite: t.iterations === Infinity, iterations: t.iterations, entrance, source });
  };

  if (sinceKey) {   // only what an interaction started
    const before = window[sinceKey] || new Set();
    for (const a of document.getAnimations()) if (!before.has(a)) fromAnimation(a, "interaction");
    return { records: records.map(r => ({ ...r, moves: r.props.some(p => MOVES.test(p)) })) };
  }

  for (const el of document.querySelectorAll("body, body *")) {
    const s = getComputedStyle(el);
    const tp = split(s.transitionProperty), td = split(s.transitionDuration).map(ms), tl = split(s.transitionDelay).map(ms), tf = split(s.transitionTimingFunction);
    tp.forEach((p, i) => { const dur = td[i % td.length]; if (p !== "none" && dur > 0)
      add(el, { kind: "transition", name: p, props: [p], dur, delay: tl[i % tl.length], eases: [tf[i % tf.length]], infinite: false, entrance: false, source: "style" }); });
    if (s.animationName !== "none") {
      const an = split(s.animationName), ad = split(s.animationDuration).map(ms), ai = split(s.animationIterationCount), af = split(s.animationTimingFunction), al = split(s.animationDelay).map(ms);
      an.forEach((n, i) => { const k = frames[n] || { props: [], entrance: false }, dur = ad[i % ad.length]; if (n === "none" || !(dur > 0)) return;
        const infinite = ai[i % ai.length] === "infinite";
        add(el, { kind: "animation", name: n, props: k.props, dur, delay: al[i % al.length], eases: [af[i % af.length]], infinite, entrance: k.entrance && !infinite, source: "style" }); });
    }
  }
  for (const a of document.getAnimations()) fromAnimation(a, "load");
  if (scroll) {
    const step = Math.max(200, Math.round(innerHeight * 0.8)), end = document.documentElement.scrollHeight;
    for (let y = step, n = 0; y < end && n < 15; y += step, n++) {
      scrollTo(0, y); await new Promise(r => setTimeout(r, 60));
      for (const a of document.getAnimations()) fromAnimation(a, "scroll");
    }
    scrollTo(0, 0);
  }
  return { records: records.map(r => ({ ...r, moves: r.props.some(p => MOVES.test(p)) })) };
}

const moving = r => r.moves || (r.kind === "transition" && r.props.includes("all"));   // `all` carries transform too
const bouncy = e => { const m = /cubic-bezier\(([^)]+)\)/.exec(e || ""); if (!m) return false; const [, y1, , y2] = m[1].split(",").map(Number); return y1 < 0 || y1 > 1 || y2 < 0 || y2 > 1; };
const list = (set, n = 4) => { const a = [...set].sort(); return a.slice(0, n).join(", ") + (a.length > n ? ` and ${a.length - n} more` : ""); };

// The rules, applied to collected records. Returns { fails: [[check, detail]], warns: [[check, detail]] }.
export function judge(records, { reduced = false, maxEntrances = 2, momentStrip = false } = {}) {
  const f = new Map(), w = new Map();
  const put = (m, check, item) => { if (!m.has(check)) m.set(check, new Set()); m.get(check).add(item); };
  if (reduced) {
    for (const r of records) if (moving(r) && r.dur > REDUCED_MS && !(r.infinite && r.loading))
      put(f, "reduced motion", `${r.who} moves (${r.props.filter(p => p !== "all").join(" ") || r.name} ${Math.round(r.dur)}ms)`);
  } else {
    const entrances = new Map();
    for (const r of records) {
      if (r.exempt) continue;
      const what = `${r.who}: ${r.kind === "animation" ? r.name + " " : r.props.join(" ") + " "}${Math.round(r.dur)}ms`;
      if (r.kind === "transition" && r.props.includes("all")) put(f, "motion: transition all", r.who);
      for (const e of r.eases) if (bouncy(e)) put(f, "motion: bounce easing", `${r.who}: ${e}`);
      if (r.infinite && !r.loading) put(f, "motion: infinite", `${r.who}: ${r.name}`);
      if (!r.infinite && !r.moment && !momentStrip) {
        if (r.dur > FAIL_MS) put(f, "motion: duration", what); else if (r.dur > WARN_MS) put(w, "motion: duration", what);
      }
      if (r.entrance && r.source !== "interaction" && !r.moment && !r.infinite) entrances.set(r.id, r.who);
    }
    if (entrances.size > maxEntrances) put(f, "motion: entrances", `${entrances.size} elements fade or slide in as the page loads or scrolls (${list(new Set(entrances.values()))}); keep one orchestrated moment`);
  }
  const out = m => [...m].map(([c, items]) => [c, c === "motion: entrances" ? [...items][0] : list(items)]);
  return { fails: out(f), warns: out(w) };
}

// Checks one already-loaded page.
export async function scanPage(page, mc, { reduced, momentHere }) {
  const { records } = await page.evaluate(collect, { allow: mc.allow, loading: mc.loading, moment: momentHere ? mc.moment.selector : null, scroll: true });
  return judge(records, { reduced, maxEntrances: mc.maxEntrances });
}

// Films one interaction: pauses the page's animation clock, performs the action, then steps every animation it started
// through `frames` evenly spaced instants and photographs each. Seeking rather than racing the clock means the frames
// land on the same instants however busy the machine is.
// Returns { fails, warns, file } (file is written to `out`).
export async function filmStrip(ctx, page, url, it, mc, { reduced, file, waitFor }) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Animation.enable");
  const KEY = "__sasoriBefore";
  if (it.action === "load") await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
  const res = await page.goto(url, { waitUntil: waitFor, timeout: 45000 }).catch(e => e);
  if (!res || res instanceof Error) return { fails: [["motion: interaction", `${it.label}: page didn't load`]], warns: [] };
  const el = page.locator(it.selector).first();
  // networkidle can come before a data-driven page renders (a busy machine, DuckDB loading): wait for the element to
  // appear, up to 15 s, before calling it missing. That loosens nothing: a selector that never matches still fails.
  await el.waitFor({ state: "attached", timeout: Number(process.env.SASORI_QA_WAIT_MS) || 15000 }).catch(() => {});
  if (!(await el.count())) return { fails: [["motion: interaction", `${it.label}: nothing matches ${it.selector}`]], warns: [] };
  if (it.action !== "load" && !(await el.isVisible())) return { fails: [["motion: interaction", `${it.label}: ${it.selector} is hidden at ${page.viewportSize().width}px`]], warns: [] };
  await el.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
  if (it.action !== "load") {
    await page.evaluate(k => { window[k] = new Set(document.getAnimations()); }, KEY);
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
    const o = { timeout: 5000 };   // a target hidden at this width fails the strip, not the run
    const done = await (it.action === "click" ? el.click(o) : it.action === "focus" ? el.focus(o) : el.hover(o)).then(() => true, () => false);
    if (!done) { await cdp.detach().catch(() => {}); return { fails: [["motion: interaction", `${it.label}: couldn't ${it.action} ${it.selector} at ${page.viewportSize().width}px (hidden or covered?)`]], warns: [] }; }
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));
  } else await page.evaluate(k => { window[k] = new Set(); }, KEY);
  const { records } = await page.evaluate(collect, { allow: mc.allow, loading: mc.loading, moment: it.moment ? it.selector : null, sinceKey: KEY });
  const anims = records.filter(r => r.source === "interaction");
  const span = Math.min(2000, Math.max(0, ...anims.map(r => r.delay + r.dur * (r.infinite ? 1 : r.iterations || 1)))) || 600;
  const box = await el.boundingBox(), vp = page.viewportSize(), pad = 48;
  const clip = box ? (() => { const x = Math.max(0, Math.floor(box.x - pad)), y = Math.max(0, Math.floor(box.y - pad));
    const c = { x, y, width: Math.min(vp.width - x, Math.ceil(box.width + 2 * pad)), height: Math.min(vp.height - y, Math.ceil(box.height + 2 * pad)) };
    return c.width > 0 && c.height > 0 ? c : undefined; })() : undefined;   // off screen: the whole viewport
  const shots = [];
  for (let i = 0; i < mc.frames; i++) {
    const t = Math.round((i * span) / (mc.frames - 1));
    await page.evaluate(([k, t]) => { const before = window[k]; for (const a of document.getAnimations()) if (!before.has(a)) { a.pause(); a.currentTime = t; } }, [KEY, t]);
    shots.push({ t, png: (await page.screenshot({ clip, animations: "allow" })).toString("base64") });
  }
  await cdp.detach().catch(() => {});
  const sheet = await ctx.newPage();
  const cw = clip ? clip.width : vp.width, ch = clip ? clip.height : vp.height;
  const h = Math.round(Math.min(160, ch, (ch * 360) / cw));   // frames at most 360 px wide, so a full-width hero stays readable
  await sheet.setContent(`<!doctype html><body style="margin:0;background:#f4f4f2;font:12px/1.3 ui-monospace,monospace;color:#333">
    <div id="s" style="display:inline-block;padding:10px">
      <div style="margin:0 0 8px">${esc(it.label)} · ${esc(it.action)} ${esc(it.selector)} · ${reduced ? "reduced motion" : "motion on"} · ${anims.length} animation${anims.length === 1 ? "" : "s"} over ${span} ms</div>
      <div style="display:flex;gap:6px">${shots.map(s => `<figure style="margin:0"><img style="display:block;height:${h}px;border:1px solid #ccc" src="data:image/png;base64,${s.png}"><figcaption>${s.t} ms</figcaption></figure>`).join("")}</div>
    </div></body>`);
  await sheet.locator("#s").screenshot({ path: file });
  await sheet.close();
  const verdict = judge(anims, { reduced, maxEntrances: Infinity, momentStrip: !!it.moment });
  return { ...verdict, animations: anims.map(r => `${r.who} ${r.kind === "animation" ? r.name : r.props.join(" ")} ${Math.round(r.dur)}ms ${r.eases.find(e => e !== "linear") || r.eases[0] || ""}`.trim()) };
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
