#!/usr/bin/env node
/**
 * Performance budget for the website intro (IntroOverlay).
 *
 * Runs after `vite build`. Scans the client build output for chunks
 * whose module graph includes IntroOverlay, sums their gzipped size,
 * checks the logo asset pointer size, and fails the build with a
 * clear error when a budget is exceeded.
 *
 * Budgets (documented, edit in the BUDGETS block below):
 *   - Intro JS (gzip) .......... 60 KB    hard fail
 *   - Intro JS (gzip) warn ..... 45 KB    warning only
 *   - Logo asset (raw bytes) ... 350 KB   hard fail
 *   - Est. FCP proxy ........... derived from intro JS + logo weight
 *                                over a 4G-slow baseline (1.6 Mbps).
 *                                hard fail > 2500 ms.
 *
 * The FCP figure here is a build-time proxy, not a real Lighthouse
 * measurement. It is deterministic and catches regressions between
 * builds. Pair with a Lighthouse CI run for real-user numbers.
 */

import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readdir } from "node:fs/promises";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const BUDGETS = {
  introJsGzipWarnKB: 45,
  introJsGzipFailKB: 60,
  logoRawFailKB: 350,
  networkKbps: 1600, // 4G-slow effective throughput
  fcpFailMs: 2500,
};

const KB = 1024;

const color = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

/** Recursively list files under a directory. */
async function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

/** Find the client build output. TanStack Start / Nitro emit to a few
 *  possible locations; probe the common ones. */
async function findClientDir() {
  const candidates = [
    ".output/public/_build/assets",
    ".output/public/assets",
    "dist/client/assets",
    "dist/assets",
  ];
  for (const rel of candidates) {
    const full = join(ROOT, rel);
    if (existsSync(full)) return full;
  }
  return null;
}

async function findIntroChunks(clientDir) {
  const files = (await walk(clientDir)).filter((f) => f.endsWith(".js"));
  // Use a marker only present inside the IntroOverlay source body — not
  // the module specifier string ("@/components/IntroOverlay") that leaks
  // into the main bundle via the dynamic import in __root.tsx.
  const hits = [];
  for (const f of files) {
    const text = await readFile(f, "utf8").catch(() => "");
    if (text.includes("[IntroOverlay] audio unavailable")) {
      const raw = Buffer.byteLength(text, "utf8");
      const gz = gzipSync(text).length;
      hits.push({ file: relative(ROOT, f), raw, gz });
    }
  }
  return hits;
}

async function checkLogo() {
  const pointerPath = join(ROOT, "src/assets/baeshen-logo.asset.json");
  if (!existsSync(pointerPath)) return null;
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  return { size: pointer.size ?? 0, filename: pointer.original_filename };
}

function fmtKB(bytes) {
  return `${(bytes / KB).toFixed(1)} KB`;
}

function estimateFcpMs({ introGzBytes, logoRawBytes }) {
  // Rough transfer-time proxy over BUDGETS.networkKbps + fixed
  // parse/render overhead (~250 ms). The logo is preloaded in
  // parallel, so only the larger of the two dominates FCP.
  const bytesToMs = (b) => ((b * 8) / (BUDGETS.networkKbps * 1000)) * 1000;
  const criticalBytes = Math.max(introGzBytes, logoRawBytes);
  return Math.round(bytesToMs(criticalBytes) + 250);
}

async function main() {
  console.log(color.bold("\n▶ Intro performance budget\n"));

  const clientDir = await findClientDir();
  if (!clientDir) {
    console.log(color.yellow("  ⚠ No client build directory found. Run `bun run build` first."));
    // Non-fatal when the build hasn't happened yet — CI runs build first.
    process.exit(0);
  }
  console.log(color.gray(`  scanning: ${relative(ROOT, clientDir)}`));

  const chunks = await findIntroChunks(clientDir);
  const introGz = chunks.reduce((acc, c) => acc + c.gz, 0);
  const introRaw = chunks.reduce((acc, c) => acc + c.raw, 0);

  const logo = await checkLogo();
  const logoRaw = logo?.size ?? 0;

  const fcp = estimateFcpMs({ introGzBytes: introGz, logoRawBytes: logoRaw });

  const problems = [];
  const warnings = [];

  console.log(color.bold("\n  Bundle chunks containing IntroOverlay:"));
  if (chunks.length === 0) {
    console.log(color.gray("    (none matched — component may be inlined)"));
  } else {
    for (const c of chunks) {
      console.log(color.gray(`    · ${c.file}  raw=${fmtKB(c.raw)}  gz=${fmtKB(c.gz)}`));
    }
  }

  const row = (label, value, budget, unit = "") => {
    const over = typeof budget === "number" && value > budget;
    const text = `${label.padEnd(28)} ${String(value).padStart(8)}${unit}   budget ${budget}${unit}`;
    console.log(over ? color.red(`    ✖ ${text}`) : color.green(`    ✓ ${text}`));
    return over;
  };

  console.log(color.bold("\n  Budget checks:"));

  const introGzKB = +(introGz / KB).toFixed(1);
  const logoRawKB = +(logoRaw / KB).toFixed(1);

  if (row("Intro JS gzip (hard)", introGzKB, BUDGETS.introJsGzipFailKB, " KB")) {
    problems.push(
      `Intro JS gzip ${introGzKB} KB exceeds hard budget ${BUDGETS.introJsGzipFailKB} KB.`,
    );
  } else if (introGzKB > BUDGETS.introJsGzipWarnKB) {
    warnings.push(
      `Intro JS gzip ${introGzKB} KB exceeds warn budget ${BUDGETS.introJsGzipWarnKB} KB.`,
    );
    console.log(
      color.yellow(
        `    ⚠ Intro JS gzip ${introGzKB} KB above warn threshold ${BUDGETS.introJsGzipWarnKB} KB`,
      ),
    );
  }

  if (row("Logo asset raw", logoRawKB, BUDGETS.logoRawFailKB, " KB")) {
    problems.push(
      `Logo asset ${logoRawKB} KB exceeds hard budget ${BUDGETS.logoRawFailKB} KB. Re-export at lower size or use WebP/AVIF.`,
    );
  }

  if (row("Est. FCP proxy", fcp, BUDGETS.fcpFailMs, " ms")) {
    problems.push(
      `Estimated FCP proxy ${fcp} ms exceeds ${BUDGETS.fcpFailMs} ms budget (based on max(intro gzip, logo raw) over ${BUDGETS.networkKbps} kbps + 250 ms overhead).`,
    );
  }

  console.log(
    color.gray(
      `\n  Intro JS raw=${fmtKB(introRaw)}  gzip=${fmtKB(introGz)}   Logo=${fmtKB(logoRaw)}   Est. FCP≈${fcp} ms`,
    ),
  );

  if (warnings.length) {
    console.log("\n" + color.yellow("  Warnings:"));
    for (const w of warnings) console.log(color.yellow(`    ⚠ ${w}`));
  }

  if (problems.length) {
    console.log("\n" + color.red(color.bold("  ✖ Performance budget FAILED")));
    for (const p of problems) console.log(color.red(`    - ${p}`));
    console.log(color.gray("\n  Edit BUDGETS in scripts/perf-budget.mjs to change thresholds.\n"));
    process.exit(1);
  }

  console.log("\n" + color.green(color.bold("  ✓ Performance budget OK\n")));
}

main().catch((err) => {
  console.error(color.red("perf-budget crashed:"), err);
  process.exit(1);
});
