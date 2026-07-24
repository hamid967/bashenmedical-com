#!/usr/bin/env node
/**
 * scripts/design/contrast-audit.mjs
 *
 * Automated WCAG contrast audit for design tokens.
 * Parses hex color tokens from src/styles.css and evaluates critical
 * foreground/background pairs against WCAG 2.2 (AA=4.5, Large=3.0, AAA=7.0).
 *
 * Exit codes:
 *   0 — all pairs pass WCAG AA
 *   1 — one or more pairs fail
 *   2 — parse error (missing token)
 *
 * Usage:
 *   bun run design:contrast
 *   node scripts/design/contrast-audit.mjs [--json out.json] [--min 4.5]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CSS_PATH = resolve(ROOT, "src/styles.css");

// --- args ------------------------------------------------------------------
const args = process.argv.slice(2);
const argVal = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};
const jsonOut = argVal("--json");
const MIN = Number(argVal("--min") ?? 4.5);
const LARGE_MIN = 3.0;

// --- CSS parse -------------------------------------------------------------
const css = readFileSync(CSS_PATH, "utf8");
/** Grab first :root block (light theme). */
const rootMatch = css.match(/:root\s*\{([\s\S]*?)\n\}/);
if (!rootMatch) {
  console.error("contrast-audit: could not locate :root { ... } block");
  process.exit(2);
}
const rootBody = rootMatch[1];
const tokens = {};
for (const line of rootBody.split("\n")) {
  const m = line.match(/^\s*(--[a-z0-9-]+):\s*([^;]+);/i);
  if (!m) continue;
  const [, name, raw] = m;
  const val = raw.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(val)) {
    tokens[name] = val;
  }
}

// --- Color math (sRGB → relative luminance → contrast) ---------------------
function hexToRgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function relLuminance([r, g, b]) {
  const chan = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}
function contrast(a, b) {
  const [L1, L2] = [relLuminance(hexToRgb(a)), relLuminance(hexToRgb(b))].sort(
    (x, y) => y - x,
  );
  return (L1 + 0.05) / (L2 + 0.05);
}

// --- Pairs to check --------------------------------------------------------
/**
 * `large` = intended for large text (≥18pt or 14pt bold), so it's audited
 * against the 3:1 threshold instead of 4.5:1.
 */
const pairs = [
  { fg: "--foreground", bg: "--background", role: "Body text" },
  { fg: "--foreground", bg: "--card", role: "Card body text" },
  { fg: "--foreground", bg: "--popover", role: "Popover body text" },
  { fg: "--muted-foreground", bg: "--background", role: "Muted body copy" },
  { fg: "--muted-foreground", bg: "--card", role: "Muted card copy" },
  { fg: "--primary-foreground", bg: "--primary", role: "Primary button label" },
  { fg: "--secondary-foreground", bg: "--secondary", role: "Secondary button label" },
  { fg: "--accent-foreground", bg: "--accent", role: "Accent chip label" },
  { fg: "--destructive-foreground", bg: "--destructive", role: "Destructive button" },
  { fg: "--primary", bg: "--background", role: "Primary link on page", large: true },
  { fg: "--primary", bg: "--card", role: "Primary link on card", large: true },
  { fg: "--ring", bg: "--background", role: "Focus ring", large: true },
  { fg: "--border", bg: "--background", role: "Border on page", large: true },
];

// --- Run -------------------------------------------------------------------
const results = [];
let missing = false;
let failures = 0;
for (const p of pairs) {
  const fg = tokens[p.fg];
  const bg = tokens[p.bg];
  if (!fg || !bg) {
    results.push({ ...p, status: "missing" });
    missing = true;
    continue;
  }
  const ratio = contrast(fg, bg);
  const threshold = p.large ? LARGE_MIN : MIN;
  const passed = ratio >= threshold;
  if (!passed) failures += 1;
  results.push({
    ...p,
    fgHex: fg,
    bgHex: bg,
    ratio: Number(ratio.toFixed(2)),
    threshold,
    status: passed ? "pass" : "fail",
  });
}

// --- Report ----------------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
const symbol = { pass: "PASS", fail: "FAIL", missing: "MISS" };
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YEL = "\x1b[33m";
const DIM = "\x1b[2m";
const OFF = "\x1b[0m";
const color = (s) => (s === "pass" ? GREEN : s === "fail" ? RED : YEL);

console.log(`\nContrast audit — src/styles.css :root (min ${MIN}, large ${LARGE_MIN})\n`);
console.log(pad("role", 32), pad("fg", 22), pad("bg", 22), pad("ratio", 8), "status");
console.log("-".repeat(90));
for (const r of results) {
  const label = r.large ? `${r.role} (large)` : r.role;
  const ratioStr = r.ratio == null ? "  —  " : `${r.ratio.toFixed(2)}:1`;
  console.log(
    pad(label, 32),
    pad(`${r.fg}${r.fgHex ? DIM + " " + r.fgHex + OFF : ""}`, 22),
    pad(`${r.bg}${r.bgHex ? DIM + " " + r.bgHex + OFF : ""}`, 22),
    pad(ratioStr, 8),
    `${color(r.status)}${symbol[r.status]}${OFF}`,
  );
}

const summary = {
  ok: !missing && failures === 0,
  failures,
  missing_tokens: missing,
  min_normal: MIN,
  min_large: LARGE_MIN,
  results,
  generated_at: new Date().toISOString(),
};

console.log("");
if (summary.ok) console.log(`${GREEN}All ${results.length} pairs pass WCAG AA.${OFF}`);
else console.log(`${RED}${failures} pair(s) failed WCAG AA.${OFF}`);

if (jsonOut) {
  const abs = resolve(process.cwd(), jsonOut);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, JSON.stringify(summary, null, 2));
  console.log(`\nWrote JSON report → ${abs}`);
}

process.exit(missing ? 2 : failures > 0 ? 1 : 0);
