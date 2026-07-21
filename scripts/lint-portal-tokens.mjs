#!/usr/bin/env node
/**
 * lint:portal-tokens
 * ------------------
 * يفرض Design Tokens v2 داخل شجرة البوابة:
 *   - src/routes/_authenticated/portal*.tsx
 *   - src/components/portal/**\/*.tsx
 *
 * يمنع الألوان الجامدة من نظام Tailwind palette الافتراضي
 * (bg-slate-*, bg-emerald-500, text-white, hex/rgb inline …) ويطلب
 * استخدام var(--portal-*) أو utilities المشروع (portal-card, portal-chip …).
 *
 * الاستثناءات:
 *   - أي سطر مُعلَّم بـ  // tokens-allow  يُتجاوز.
 *   - portal.index.tsx يستخدم طقم "magazine" tokens المعتمد.
 *
 * الخروج: 0 عند نظافة الشجرة، 1 عند وجود انتهاك.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const BASELINE_PATH = join(ROOT, "scripts", "portal-tokens-baseline.json");
const UPDATE_BASELINE = process.argv.includes("--update-baseline");
const STRICT_CHANGED = process.argv.includes("--strict-changed");
const BASE_REF =
  process.env.LINT_BASE_REF ||
  process.env.GITHUB_BASE_REF ||
  "origin/main";


// المسارات المُراقَبة
const TARGET_DIRS = [
  "src/routes/_authenticated",
  "src/components/portal",
];

// الملفات التي يُسمح لها بتجاوز القاعدة (نية تصميم موثّقة)
const FILE_EXCEPTIONS = new Set([
  "src/routes/_authenticated/portal.index.tsx", // magazine tokens
]);

// أي ملف يبدأ اسمه بـ admin. أو portal. فقط
function isPortalFile(path) {
  const rel = relative(ROOT, path).replaceAll("\\", "/");
  if (FILE_EXCEPTIONS.has(rel)) return false;
  if (rel.startsWith("src/components/portal/")) return true;
  if (rel.startsWith("src/routes/_authenticated/portal")) return true;
  return false;
}

// أنماط ممنوعة → السبب البشري
const RULES = [
  // Tailwind palette shades (كل الأرقام)
  {
    pattern:
      /\b(bg|text|border|ring|from|to|via|placeholder|divide|outline|shadow|fill|stroke)-(slate|gray|zinc|neutral|stone|red|rose|pink|fuchsia|purple|violet|indigo|blue|sky|cyan|teal|emerald|green|lime|yellow|amber|orange)-(50|100|200|300|400|500|600|700|800|900|950)\b/,
    reason:
      "استخدم tokens: var(--portal-surface-*), var(--portal-primary), var(--portal-error*) بدل ألوان palette الافتراضية.",
  },
  // bg-white / text-white / border-white / ring-white
  {
    pattern: /\b(bg|text|border|ring)-white\b/,
    reason:
      "text-white → text-[color:var(--portal-on-primary)] · bg-white → bg-[color:var(--portal-surface-1)]",
  },
  {
    pattern: /\b(bg|text|border)-black\b/,
    reason: "استخدم var(--portal-ink) بدل الأسود المطلق.",
  },
  // ألوان hex/rgb داخل className
  {
    pattern: /className="[^"]*#[0-9a-fA-F]{3,8}\b[^"]*"/,
    reason:
      "لا تكتب #hex داخل className. اربطها بـ token في src/styles.css ثم استخدم var(--portal-*).",
  },
  {
    pattern: /className="[^"]*\brgba?\s*\([^"]*"/,
    reason:
      "لا تكتب rgb()/rgba() داخل className. عرِّف token في src/styles.css.",
  },
];

// اجمع الملفات
function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (s.isFile() && /\.(tsx|ts)$/.test(name)) out.push(p);
  }
  return out;
}

const files = TARGET_DIRS.flatMap((d) => walk(join(ROOT, d))).filter(
  isPortalFile,
);

const counts = {}; // file(rel) → violations
const details = []; // {rel,line,match,reason,text}

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const lines = src.split(/\r?\n/);
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("tokens-allow")) continue;
    const trimmed = line.trim();
    if (
      trimmed.startsWith("*") ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("/*")
    ) {
      continue;
    }
    for (const rule of RULES) {
      const m = line.match(rule.pattern);
      if (m) {
        counts[rel] = (counts[rel] ?? 0) + 1;
        details.push({
          rel,
          line: i + 1,
          match: m[0],
          reason: rule.reason,
          text: line.trim().slice(0, 160),
        });
      }
    }
  }
}


// ── وضع صارم على الأسطر المُعدَّلة فقط (pre-merge zero-tolerance) ──
// يرفض أي انتهاك جديد أُدخل في diff مقابل BASE_REF ويشير للمصدر بدقّة سطر:عمود.
if (STRICT_CHANGED) {
  const changed = collectChangedLines(BASE_REF); // Map<rel, Set<lineNo>>
  const offenders = details.filter(
    (d) => changed.get(d.rel)?.has(d.line),
  );
  if (offenders.length === 0) {
    const trackedRels = [...changed.keys()].filter((r) =>
      files.some((f) => relative(ROOT, f).replaceAll("\\", "/") === r),
    );
    console.log(
      `✓ strict-changed — لا استخدام مباشر لـ Tailwind في السطور الجديدة/المعدّلة داخل portal ` +
        `(المرجع: ${BASE_REF}${trackedRels.length ? `, ملفات مفحوصة: ${trackedRels.length}` : ""}).`,
    );
    process.exit(0);
  }
  console.error(
    `\n✗ رُفض الدمج: ${offenders.length} استخدام مباشر لـ Tailwind داخل portal في التغييرات الحالية ` +
      `(المرجع: ${BASE_REF}).\n`,
  );
  for (const d of offenders) {
    console.error(
      `  ${d.rel}:${d.line}\n    match: ${d.match}\n    fix:   ${d.reason}\n    line:  ${d.text}\n`,
    );
  }
  console.error(
    `طبّق الإصلاح باستخدام var(--portal-*) / var(--ds-*) أو مكوّنات portal-primitives.\n` +
      `للاستثناء الموثّق أضِف تعليق  // tokens-allow  على نفس السطر.`,
  );
  process.exit(1);
}

// وضع تحديث الـ baseline
if (UPDATE_BASELINE) {
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify({ files: counts }, null, 2) + "\n",
  );
  console.log(
    `✓ حُدِّث baseline (${Object.keys(counts).length} ملف · ${details.length} انتهاك سابق مقبول).\n` +
      `  ${relative(ROOT, BASELINE_PATH)}\n` +
      `القاعدة من الآن ستمنع أي زيادة أو إدخال جديد.`,
  );
  process.exit(0);
}

// تحميل baseline
let baseline = { files: {} };
if (existsSync(BASELINE_PATH)) {
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  } catch {
    console.error(`تعذّر قراءة ${BASELINE_PATH} — أعِد التوليد بـ --update-baseline`);
    process.exit(2);
  }
}

const regressions = []; // ملفات تجاوزت baseline
for (const [rel, n] of Object.entries(counts)) {
  const allowed = baseline.files?.[rel] ?? 0;
  if (n > allowed) regressions.push({ rel, allowed, actual: n });
}
// ملفات في baseline ولم تعد موجودة/انخفضت → تنبيه لتحديث الـ baseline (غير فادح)
const shrunk = [];
for (const [rel, allowed] of Object.entries(baseline.files ?? {})) {
  const n = counts[rel] ?? 0;
  if (n < allowed) shrunk.push({ rel, allowed, actual: n });
}

if (regressions.length > 0) {
  const regressedFiles = new Set(regressions.map((r) => r.rel));
  for (const d of details) {
    if (!regressedFiles.has(d.rel)) continue;
    console.error(
      `\n✗ ${d.rel}:${d.line}\n  match: ${d.match}\n  fix:   ${d.reason}\n  line:  ${d.text}`,
    );
  }
  console.error(
    `\nتراجع Design Tokens v2 في ${regressions.length} ملف:\n` +
      regressions
        .map((r) => `  - ${r.rel}: ${r.actual} (المسموح ${r.allowed})`)
        .join("\n") +
      `\n\nإما أن تُصلح الانتهاكات (راجع /admin/design-tokens) أو تضع  // tokens-allow  عند الحاجة الحقيقية.\n` +
      `عند إتمام إصلاح فعلي شغّل:  bun run lint:portal-tokens:update`,
  );
  process.exit(1);
}

if (shrunk.length > 0) {
  console.log(
    `ℹ️  انخفضت انتهاكات ${shrunk.length} ملف عن baseline — حدِّث الـ baseline بـ: bun run lint:portal-tokens:update`,
  );
}

console.log(
  `✓ نظافة Design Tokens v2 مُتحقَّقة — ${files.length} ملف بورتال، لا تراجع عن baseline (${details.length} انتهاك تاريخي مسموح، صفر جديد).`,
);

// ─────────────────────────────────────────────────────────────────────
// git diff helper — يُرجع Map<relPath, Set<lineNo>> للأسطر المُضافة/المعدَّلة
// في الملفات المفحوصة مقابل BASE_REF. آمن ضد فشل git (fork/shallow).
// ─────────────────────────────────────────────────────────────────────
function collectChangedLines(baseRef) {
  const result = new Map();
  const targeted = new Set(
    files.map((f) => relative(ROOT, f).replaceAll("\\", "/")),
  );

  let raw = "";
  const attempts = [baseRef, "HEAD~1", "HEAD"];
  for (const ref of attempts) {
    try {
      raw = execSync(`git diff --unified=0 --no-color ${ref} -- ${[...targeted].map((p) => `'${p}'`).join(" ") || "'/dev/null'"}`, {
        cwd: ROOT,
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 20 * 1024 * 1024,
      }).toString();
      if (raw) break;
    } catch {
      // جرّب المرجع التالي
    }
  }
  if (!raw) return result;

  let currentFile = null;
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("+++ b/")) {
      const p = line.slice(6);
      currentFile = targeted.has(p) ? p : null;
      continue;
    }
    if (!currentFile) continue;
    const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (m) {
      const start = parseInt(m[1], 10);
      const count = m[2] ? parseInt(m[2], 10) : 1;
      if (count === 0) continue;
      let set = result.get(currentFile);
      if (!set) {
        set = new Set();
        result.set(currentFile, set);
      }
      for (let i = 0; i < count; i++) set.add(start + i);
    }
  }
  return result;
}

