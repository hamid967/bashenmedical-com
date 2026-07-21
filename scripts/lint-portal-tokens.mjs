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

const ROOT = process.cwd();
const BASELINE_PATH = join(ROOT, "scripts", "portal-tokens-baseline.json");
const UPDATE_BASELINE = process.argv.includes("--update-baseline");


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

let violations = 0;

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("tokens-allow")) continue; // إفلات صريح
    // تجاهل الأسطر التي هي تعليقات JSDoc/تعليقات مضمّنة بحتة
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
        violations++;
        const rel = relative(ROOT, file);
        console.error(
          `\n✗ ${rel}:${i + 1}\n  match: ${m[0]}\n  fix:   ${rule.reason}\n  line:  ${line.trim().slice(0, 160)}`,
        );
      }
    }
  }
}

if (violations > 0) {
  console.error(
    `\n${violations} انتهاك لقاعدة Design Tokens v2 في ${files.length} ملف بورتال.\n` +
      `راجع /admin/design-tokens لخريطة التحويل الكاملة.\n` +
      `لتجاوز سطر بحاجة فعلية أضِف تعليق  // tokens-allow  في نهايته.`,
  );
  process.exit(1);
}

console.log(
  `✓ نظافة Design Tokens v2 مُتحقَّقة في ${files.length} ملف بورتال.`,
);
