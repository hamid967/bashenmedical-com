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
 *   node scripts/codemod-portal-tokens.mjs [options]
 *
 *   بدون --write: dry-run افتراضي (يمكن تمرير --dry-run صراحةً للوضوح).
 *   مع --write : يحفظ الملفات ويطبع ملخّصًا + Diff مختصر.
 *
 * تقييد النطاق (يمكن دمج أكثر من خيار):
 *   --file <substr>        تصفية بسيطة على المسار (تحتفظ بالسلوك القديم).
 *   --glob <pattern>       نمط glob؛ يقبل *, **, ?، وقابل للتكرار.
 *   --paths <file>         ملف نصّي فيه مسار/glob في كل سطر (# للتعليق).
 *   --limit N              حدّ أعلى لعدد الملفات المُغيَّرة.
 *   --list-rules           اعرض قواعد التحويل واخرج.
 *   --verbose              اعرض utilities قريبة لم تُحوَّل + تفصيل حسب المجلد.
 *
 * الضمانات:
 *   1. لا يعدّل أي سطر يحوي  // tokens-allow.
 *   2. يعمل حصريًا على الحرفيات داخل  className="…"  أو  className={`…`}
 *      أو داخل  clsx(...)/cn(...)/twMerge(...) — لا يلمس مقاطع أخرى.
 *   3. أي تحويل ذو بديل غير مؤكّد (مثل shade نادر) يُترك ويُبلَّغ عنه في --verbose.
 *   4. عند --write ينشئ نسخة .bak لكل ملف مُعدَّل (يمكن حذفها بعد التحقق).
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
import { pathToFileURL } from "node:url";
const IS_MAIN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const WRITE = argv.includes("--write");
const VERBOSE = argv.includes("--verbose");
const LIST_RULES = argv.includes("--list-rules");
const DRY_RUN_FLAG = argv.includes("--dry-run"); // معلوماتي؛ الوضع الافتراضي dry أصلًا
const CHECK = argv.includes("--check") || argv.includes("--fail-if-uncodemed");
function readOpt(name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
function readOptAll(name) {
  const out = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === name && argv[i + 1]) out.push(argv[i + 1]);
  return out;
}
const LIMIT = (() => {
  const v = readOpt("--limit");
  return v ? parseInt(v, 10) || Infinity : Infinity;
})();
const FILE_FILTER = readOpt("--file") ?? "";
const GLOB_PATTERNS = readOptAll("--glob");
const PATHS_FILE = readOpt("--paths");

if (PATHS_FILE) {
  if (!existsSync(PATHS_FILE)) {
    console.error(`--paths: الملف غير موجود: ${PATHS_FILE}`);
    process.exit(2);
  }
  const lines = readFileSync(PATHS_FILE, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  GLOB_PATTERNS.push(...lines);
}

// glob → RegExp (يدعم **، *، ?). المطابقة على المسار النسبي بعد توحيد "/"
function globToRegExp(g) {
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") {
      if (g[i + 1] === "*") { re += ".*"; i++; if (g[i + 1] === "/") i++; }
      else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (".+^$(){}|[]\\".includes(c)) re += "\\" + c;
    else re += c;
  }
  return new RegExp("^" + re + "$");
}
const GLOB_RES = GLOB_PATTERNS.map(globToRegExp);

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
// (تنفيذ CLI في نهاية الملف بعد تعريف الدوال)

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
// تنفيذ CLI
// ─────────────────────────────────────────────────────────────────────
if (IS_MAIN) runCli();
function runCli() {
const files = TARGET_DIRS.flatMap((d) => walk(join(ROOT, d)))
  .filter((p) => {
    const rel = relative(ROOT, p).replaceAll("\\", "/");
    if (FILE_EXCEPTIONS.has(rel)) return false;
    if (!(rel.startsWith("src/components/portal/") || rel.startsWith("src/routes/_authenticated/portal"))) return false;
    if (FILE_FILTER && !rel.includes(FILE_FILTER)) return false;
    if (GLOB_RES.length && !GLOB_RES.some((re) => re.test(rel))) return false;
    return true;
  });

if (VERBOSE) {
  console.log(`نطاق المطابقة: ${files.length} ملف بعد التصفية` +
    (GLOB_PATTERNS.length ? ` (globs: ${GLOB_PATTERNS.length})` : "") +
    (FILE_FILTER ? ` (--file="${FILE_FILTER}")` : ""));
}

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
const mode = WRITE ? "WRITE" : (DRY_RUN_FLAG ? "dry-run (تقدير)" : "dry-run");
console.log(`portal-tokens codemod — ${mode}`);
console.log(`نطاق: ${files.length} ملف مُرشَّح  ·  مُتأثِّر: ${totalFiles}  ·  استبدالات: ${totalReplacements}`);

// تفصيل حسب المجلد (يُعرض دائمًا حتى في dry-run)
if (perFile.length) {
  const byDir = new Map();
  for (const p of perFile) {
    const dir = dirname(p.rel);
    const agg = byDir.get(dir) ?? { files: 0, changed: 0 };
    agg.files++;
    agg.changed += p.changed;
    byDir.set(dir, agg);
  }
  const rows = [...byDir.entries()].sort((a, b) => b[1].changed - a[1].changed);
  console.log(`\nتفصيل حسب المجلد:`);
  const dirW = Math.min(60, Math.max(...rows.map(([d]) => d.length)));
  for (const [dir, agg] of rows) {
    console.log(`  ${dir.padEnd(dirW)}  ${String(agg.files).padStart(3)} ملف · ${String(agg.changed).padStart(4)} استبدال`);
  }

  const topN = VERBOSE ? perFile.length : Math.min(30, perFile.length);
  console.log(`\nأعلى الملفات (${topN}${topN < perFile.length ? `/${perFile.length}` : ""}):`);
  for (const p of perFile.sort((a, b) => b.changed - a.changed).slice(0, topN)) {
    console.log(`  • ${p.rel}  (${p.changed})`);
  }
  if (!VERBOSE && perFile.length > 30) console.log(`  … +${perFile.length - 30} ملف آخر (شغّل بـ --verbose للقائمة الكاملة)`);
}

if (VERBOSE && skippedAll.length) {
  console.log(`\nتنبيه — utilities قريبة لم تُحوَّل (تحتاج قرار يدوي):`);
  const flat = skippedAll.flatMap((s) => s.tokens.map((t) => `${s.rel}: ${t}`));
  const uniq = [...new Set(flat)].slice(0, 40);
  for (const line of uniq) console.log(`  ~ ${line}`);
  if (flat.length > 40) console.log(`  … +${flat.length - 40}`);
}

if (!WRITE) {
  console.log(`\nلتطبيق التغييرات:  bun run codemod:portal-tokens -- --write`);
  console.log(`تقييد بـ glob:      bun run codemod:portal-tokens -- --glob "src/routes/_authenticated/portal.prescriptions*.tsx"`);
  console.log(`تقييد بقائمة:       bun run codemod:portal-tokens -- --paths .codemod-scope.txt`);
  console.log(`عرض القواعد:        bun run codemod:portal-tokens -- --list-rules`);
  console.log(`للتحقق بعد التطبيق: bun run lint:portal-tokens  ثم استعرِض  /design/storybook`);
}
} // /runCli

export { transformSource, transformClassLiteral, mapUtility, DIRECT, SEMANTIC_FAMILIES, INK_FAMILIES };


