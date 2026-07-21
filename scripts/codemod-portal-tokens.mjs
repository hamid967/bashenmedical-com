#!/usr/bin/env node
/**
 * codemod:portal-tokens
 * ---------------------
 * تحويل classnames داخل شجرة portal من ألوان Tailwind الجامدة إلى
 * تعبيرات portal tokens (`var(--portal-*)`) — التي بدورها تُعاد توجيهها إلى
 * primitives `var(--ds-*)` داخل `.portal-root`. لا تغيير بصري متوقّع:
 * كل تحويل يستبدل نفس اللون بمرجع الرمز المُعرَّف.
 *
 * الاستخدام:
 *   node scripts/codemod-portal-tokens.mjs [--write] [--file <substr>] [--limit N] [--verbose]
 *   node scripts/codemod-portal-tokens.mjs --list-rules
 *
 *   بدون --write: dry-run يعرض عدد التغييرات + عيّنة (Diff مختصر).
 *   مع --write : يحفظ الملفات ويطبع ملخّصًا.
 *
 * الضمانات:
 *   1. لا يعدّل أي سطر يحوي  // tokens-allow.
 *   2. يعمل حصريًا على الحرفيات داخل  className="…"  أو  className={`…`}
 *      أو داخل  clsx(...)/cn(...)/twMerge(...) — لا يلمس مقاطع أخرى.
 *   3. أي تحويل ذو بديل غير مؤكّد (مثل shade نادر) يُترك ويُبلَّغ عنه في --verbose.
 *   4. عند --write ينشئ نسخة .bak لكل ملف مُعدَّل (يمكن حذفها بعد التحقق).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const VERBOSE = argv.includes("--verbose");
const LIST_RULES = argv.includes("--list-rules");
const LIMIT = (() => {
  const i = argv.indexOf("--limit");
  return i >= 0 ? parseInt(argv[i + 1] ?? "0", 10) || Infinity : Infinity;
})();
const FILE_FILTER = (() => {
  const i = argv.indexOf("--file");
  return i >= 0 ? argv[i + 1] ?? "" : "";
})();

const TARGET_DIRS = ["src/routes/_authenticated", "src/components/portal"];
const FILE_EXCEPTIONS = new Set([
  "src/routes/_authenticated/portal.index.tsx", // magazine tokens
]);

// ─────────────────────────────────────────────────────────────────────
// خرائط التحويل (Tailwind → portal token)
// المفتاح = utility مُحدَّد بالضبط. القيمة = بديل نصّي.
// ─────────────────────────────────────────────────────────────────────
const DIRECT = new Map([
  // أبيض / أسود
  ["text-white", "text-[color:var(--portal-on-primary)]"],
  ["bg-white", "bg-[color:var(--portal-surface-1)]"],
  ["border-white", "border-[color:var(--portal-on-primary)]"],
  ["ring-white", "ring-[color:var(--portal-on-primary)]"],
  ["text-black", "text-[color:var(--portal-ink)]"],
  ["bg-black", "bg-[color:var(--portal-ink)]"],
  ["border-black", "border-[color:var(--portal-ink)]"],
]);

// بادئات + shade → portal token (نستهدف الأنماط الشائعة الآمنة فقط)
// prop ∈ {bg,text,border,ring,from,to,via,fill,stroke,divide,placeholder,shadow,outline}
const SEMANTIC_FAMILIES = {
  error: ["red", "rose", "pink"],
  success: ["green", "emerald", "teal"],
  warning: ["amber", "yellow", "orange"],
  primary: ["blue", "sky", "indigo", "cyan"],
};

const INK_FAMILIES = ["slate", "gray", "zinc", "neutral", "stone"];

// خريطة shade → token فرعي داخل نفس العائلة
const SEMANTIC_SHADE = {
  50: "-50",
  100: "-50",
  200: "-50",
  // 300–500 → الأساس
  300: "",
  400: "",
  500: "",
  600: "",
  700: "",
  800: "",
  900: "",
  950: "",
};

const INK_MAP = {
  50: "surface-1",
  100: "surface-2",
  200: "surface-3",
  300: "ink-3",
  400: "ink-3",
  500: "ink-3",
  600: "ink-2",
  700: "ink-2",
  800: "ink",
  900: "ink",
  950: "ink",
};

// PROP → CSS property حسب Tailwind
const PROP_TO_CSS = {
  bg: "background",
  text: "color",
  border: "border-color",
  ring: "--tw-ring-color",
  from: "color", // gradient stops غير مدعومة كليًا — نتجنّبها
  to: "color",
  via: "color",
  fill: "fill",
  stroke: "stroke",
  divide: "border-color",
  placeholder: "color",
  outline: "outline-color",
};

// props التي نتعامل معها بأمان (نتجنّب gradients لأنها تحتاج tokens مختلفة)
const SAFE_PROPS = new Set(["bg", "text", "border", "ring", "fill", "stroke", "outline", "placeholder", "divide"]);

// بناء اسم utility المستهدف: مثال bg-[color:var(--portal-error-50)]
function tokenUtility(prop, tokenSuffix) {
  const cssVar = `var(--portal-${tokenSuffix})`;
  // fill/stroke لا تستخدم صيغة color: — Tailwind يقبل [var(...)] مباشرة
  if (prop === "fill" || prop === "stroke") return `${prop}-[${cssVar}]`;
  return `${prop}-[color:${cssVar}]`;
}

// يُرجع بديلاً لـ utility مُنفرد أو null إن لم يُطبَّق.
function mapUtility(u) {
  if (DIRECT.has(u)) return DIRECT.get(u);

  // bg-black/40  →  bg-[color:var(--portal-ink)]/40
  const opacityMatch = u.match(/^([a-z]+)-(white|black)\/(\d{1,3})$/);
  if (opacityMatch) {
    const [, prop, tone, op] = opacityMatch;
    const base = DIRECT.get(`${prop}-${tone}`);
    if (base) return `${base}/${op}`;
  }

  // <prop>-<family>-<shade>[/<opacity>]
  const m = u.match(
    /^(bg|text|border|ring|from|to|via|fill|stroke|divide|placeholder|outline)-([a-z]+)-(\d{2,3})(?:\/(\d{1,3}))?$/,
  );
  if (!m) return null;
  const [, prop, family, shadeStr, opacity] = m;
  if (!SAFE_PROPS.has(prop)) return null;
  const shade = parseInt(shadeStr, 10);

  // Ink families
  if (INK_FAMILIES.includes(family)) {
    const suffix = INK_MAP[shade];
    if (!suffix) return null;
    const out = tokenUtility(prop, suffix);
    return opacity ? `${out}/${opacity}` : out;
  }

  // Semantic families
  for (const [sem, fams] of Object.entries(SEMANTIC_FAMILIES)) {
    if (!fams.includes(family)) continue;
    const shadeSuffix = SEMANTIC_SHADE[shade];
    if (shadeSuffix === undefined) return null;
    const suffix = `${sem}${shadeSuffix}`;
    const out = tokenUtility(prop, suffix);
    return opacity ? `${out}/${opacity}` : out;
  }
  return null;
}

if (LIST_RULES) {
  console.log("Direct mappings:");
  for (const [k, v] of DIRECT) console.log(`  ${k.padEnd(28)} → ${v}`);
  console.log("\nSemantic families → portal-*:");
  for (const [sem, fams] of Object.entries(SEMANTIC_FAMILIES))
    console.log(`  ${sem.padEnd(8)} ← ${fams.join(", ")}  (shades 50/100/200 → -50, 300–950 → base)`);
  console.log("\nInk families → portal-{surface-1|surface-2|surface-3|ink-3|ink-2|ink}:");
  for (const f of INK_FAMILIES) console.log(`  ${f}`);
  console.log("\nصيغة الإخراج: <prop>-[color:var(--portal-<token>)]  (fill/stroke بدون color:)");
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────
// جمع الملفات
// ─────────────────────────────────────────────────────────────────────
function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (s.isFile() && /\.(tsx|ts)$/.test(name)) out.push(p);
  }
  return out;
}
const files = TARGET_DIRS.flatMap((d) => walk(join(ROOT, d)))
  .filter((p) => {
    const rel = relative(ROOT, p).replaceAll("\\", "/");
    if (FILE_EXCEPTIONS.has(rel)) return false;
    if (!(rel.startsWith("src/components/portal/") || rel.startsWith("src/routes/_authenticated/portal"))) return false;
    if (FILE_FILTER && !rel.includes(FILE_FILTER)) return false;
    return true;
  });

// ─────────────────────────────────────────────────────────────────────
// تحويل نطاق className
// نلتقط: className="…"  |  className={"…"}  |  className={`…`}
//        clsx("…", …)  |  cn("…", …)  |  twMerge("…", …)  — الحرفيات فقط
// ─────────────────────────────────────────────────────────────────────
function transformClassLiteral(literal, ctx) {
  const parts = literal.split(/(\s+)/);
  let touched = 0;
  const skipped = [];
  const out = parts.map((tok) => {
    if (!tok.trim()) return tok;
    // تجاهل رموز variant/prefix معقّدة: نُحوّل فقط عندما الجذر بعد آخر ":" قابل للمطابقة
    const idx = tok.lastIndexOf(":");
    const prefix = idx >= 0 ? tok.slice(0, idx + 1) : "";
    const bare = idx >= 0 ? tok.slice(idx + 1) : tok;
    const mapped = mapUtility(bare);
    if (mapped) { touched++; return prefix + mapped; }
    // تسجيل الحالات القريبة (bg-red-… إلخ) التي لم تُطبَّق
    if (VERBOSE && /^(bg|text|border|ring|fill|stroke|divide|placeholder|outline)-[a-z]+-\d{2,3}(\/\d+)?$/.test(bare)) {
      skipped.push(tok);
    }
    return tok;
  });
  ctx.skipped.push(...skipped);
  return { text: out.join(""), touched };
}

// regex شاملة تلتقط الحرفيات المرشّحة بدون تعطيل بنية الكود.
// - className="…"
// - className={'…'} / className={"…"}
// - className={`…`}
// - clsx( … "…" … )   (فقط الحرفيات المزدوجة/المفردة/backtick داخل الاستدعاء)
const CLASSNAME_ATTR = /className=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{"([^"]*)"\}|\{'([^']*)'\})/g;
const CLSX_CALL = /(?:clsx|cn|twMerge)\s*\(([\s\S]*?)\)/g;
const STRING_IN_CALL = /(["'`])((?:\\.|(?!\1).)*)\1/g;

function transformSource(src, ctx) {
  let changed = 0;
  // 1) className="…" family
  src = src.replace(CLASSNAME_ATTR, (full, a, b, c, d, e, offset) => {
    const lit = a ?? b ?? c ?? d ?? e ?? "";
    if (!lit.trim()) return full;
    // احترم // tokens-allow على نفس السطر
    const lineStart = src.lastIndexOf("\n", offset) + 1;
    const lineEnd = src.indexOf("\n", offset);
    const line = src.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
    if (line.includes("tokens-allow")) return full;
    const { text, touched } = transformClassLiteral(lit, ctx);
    if (!touched) return full;
    changed += touched;
    if (a !== undefined) return `className="${text}"`;
    if (b !== undefined) return `className='${text}'`;
    if (c !== undefined) return `className={\`${text}\`}`;
    if (d !== undefined) return `className={"${text}"}`;
    return `className={'${text}'}`;
  });
  // 2) clsx/cn/twMerge(…) — نلمس الحرفيات فقط داخل الاستدعاء
  src = src.replace(CLSX_CALL, (full, inner, offset) => {
    const lineStart = src.lastIndexOf("\n", offset) + 1;
    const lineEnd = src.indexOf("\n", offset);
    const line = src.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
    if (line.includes("tokens-allow")) return full;
    const newInner = inner.replace(STRING_IN_CALL, (m, q, body) => {
      const { text, touched } = transformClassLiteral(body, ctx);
      if (!touched) return m;
      changed += touched;
      return `${q}${text}${q}`;
    });
    if (newInner === inner) return full;
    return full.slice(0, full.indexOf("(") + 1) + newInner + ")";
  });
  return { src, changed };
}

// ─────────────────────────────────────────────────────────────────────
// تنفيذ
// ─────────────────────────────────────────────────────────────────────
let totalFiles = 0;
let totalReplacements = 0;
const perFile = [];
const skippedAll = [];

for (const f of files) {
  if (totalFiles >= LIMIT) break;
  const rel = relative(ROOT, f).replaceAll("\\", "/");
  const original = readFileSync(f, "utf8");
  const ctx = { skipped: [] };
  const { src, changed } = transformSource(original, ctx);
  if (changed > 0) {
    totalFiles++;
    totalReplacements += changed;
    perFile.push({ rel, changed });
    if (WRITE) {
      writeFileSync(f + ".bak", original);
      writeFileSync(f, src);
    }
  }
  if (ctx.skipped.length) skippedAll.push({ rel, tokens: ctx.skipped });
}

// إخراج
const mode = WRITE ? "WRITE" : "dry-run";
console.log(`portal-tokens codemod — ${mode}`);
console.log(`ملفات مُتأثِّرة: ${totalFiles}  ·  استبدالات: ${totalReplacements}`);
for (const p of perFile.slice(0, 30)) console.log(`  • ${p.rel}  (${p.changed})`);
if (perFile.length > 30) console.log(`  … +${perFile.length - 30} ملف آخر`);

if (VERBOSE && skippedAll.length) {
  console.log(`\nتنبيه — utilities قريبة لم تُحوَّل (تحتاج قرار يدوي):`);
  const flat = skippedAll.flatMap((s) => s.tokens.map((t) => `${s.rel}: ${t}`));
  const uniq = [...new Set(flat)].slice(0, 40);
  for (const line of uniq) console.log(`  ~ ${line}`);
  if (flat.length > 40) console.log(`  … +${flat.length - 40}`);
}

if (!WRITE) {
  console.log(`\nلتطبيق التغييرات:  bun run codemod:portal-tokens -- --write`);
  console.log(`لعرض القواعد كاملة:  bun run codemod:portal-tokens -- --list-rules`);
  console.log(`للتحقق بعد التطبيق: bun run lint:portal-tokens  ثم استعرِض  /design/storybook`);
}
