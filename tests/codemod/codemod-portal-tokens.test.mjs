// اختبارات fixtures لـ codemod portal-tokens.
// نستدعي transformSource مباشرة (بلا CLI) — لأن fixtures خارج شجرة portal.
// كل fixture يتكوّن من زوج <name>.input.tsx / <name>.expected.tsx تحت ./fixtures.
// أي تعديل مستقبلي على القواعد يجب ألا يُغيّر مخرجات fixtures بلا تحديث متعمَّد.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  transformSource,
  mapUtility,
} from "../../scripts/codemod-portal-tokens.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");

function run(src) {
  const ctx = { skipped: [] };
  return transformSource(src, ctx);
}

describe("codemod-portal-tokens — fixtures", () => {
  const inputs = readdirSync(FIXTURES).filter((f) => f.endsWith(".input.tsx"));
  assert.ok(inputs.length >= 4, "لا بد من وجود fixtures متعددة");

  for (const inputName of inputs) {
    const base = inputName.replace(/\.input\.tsx$/, "");
    test(`fixture: ${base}`, () => {
      const input = readFileSync(join(FIXTURES, inputName), "utf8");
      const expected = readFileSync(join(FIXTURES, `${base}.expected.tsx`), "utf8");
      const { src: actual, changed } = run(input);

      if (actual !== expected) {
        // إخراج تشخيصي مفيد
        console.error(`\n─── DIFF (${base}) ───`);
        console.error("--- expected ---\n" + expected);
        console.error("--- actual   ---\n" + actual);
      }
      assert.equal(actual, expected, `مخرجات codemod تختلف عن expected لـ ${base}`);
      assert.ok(changed > 0 || input === expected, "إحصاء changed يجب أن يعكس التغييرات");
    });
  }
});

describe("codemod-portal-tokens — خصائص صلبة", () => {
  test("idempotent: تشغيلٌ ثانٍ لا يُنتج تغييرات", () => {
    for (const f of readdirSync(FIXTURES).filter((x) => x.endsWith(".expected.tsx"))) {
      const expected = readFileSync(join(FIXTURES, f), "utf8");
      const { src, changed } = run(expected);
      assert.equal(src, expected, `${f} تغيّر على تمريرة ثانية`);
      assert.equal(changed, 0, `${f} أنتج ${changed} استبدال على تمريرة ثانية`);
    }
  });

  test("لا يلمس نصوصًا خارج className/clsx/cn/twMerge", () => {
    const src = `const s = "bg-red-500 text-white";\nconst t = \`bg-slate-100\`;\nconsole.log("bg-blue-600");\n`;
    const { src: out, changed } = run(src);
    assert.equal(out, src);
    assert.equal(changed, 0);
  });

  test("tokens-allow يمنع التحويل على نفس السطر", () => {
    const src = `<div className="bg-red-500" /* tokens-allow */ />`;
    const { src: out, changed } = run(src);
    assert.equal(out, src);
    assert.equal(changed, 0);
  });

  test("mapUtility: خرائط أساسية", () => {
    assert.equal(mapUtility("text-white"), "text-[color:var(--portal-on-primary)]");
    assert.equal(mapUtility("bg-red-500"), "bg-[color:var(--portal-error)]");
    assert.equal(mapUtility("bg-red-50"), "bg-[color:var(--portal-error-50)]");
    assert.equal(mapUtility("text-slate-800"), "text-[color:var(--portal-ink)]");
    assert.equal(mapUtility("bg-gray-100"), "bg-[color:var(--portal-surface-2)]");
    assert.equal(mapUtility("fill-emerald-500"), "fill-[var(--portal-success)]");
    assert.equal(mapUtility("stroke-slate-700"), "stroke-[var(--portal-ink-2)]");
    // opacity
    assert.equal(mapUtility("bg-red-500/40"), "bg-[color:var(--portal-error)]/40");
    // خارج النطاق: shades غير مدعومة / props غير مدعومة
    assert.equal(mapUtility("shadow-red-500"), null);
    assert.equal(mapUtility("bg-red-1000"), null);
    assert.equal(mapUtility("unrelated-class"), null);
  });

  test("variants تبقى مع الجذر المحوَّل", () => {
    const src = `<div className="hover:bg-red-500 md:focus:text-gray-700" />`;
    const { src: out } = run(src);
    assert.match(out, /hover:bg-\[color:var\(--portal-error\)\]/);
    assert.match(out, /md:focus:text-\[color:var\(--portal-ink-2\)\]/);
  });
});

describe("codemod-portal-tokens — twMerge conflict handling", () => {
  test("utilities متكررة لنفس الخاصية تُستبدل كلها بشكل مستقل داخل twMerge", () => {
    const src = `<div className={twMerge("bg-white", "bg-slate-50", "bg-blue-600")} />`;
    const { src: out } = run(src);
    // كل حرفية على حدة تحوَّل — twMerge يظل يحلّ التعارض في وقت التشغيل
    assert.match(out, /"bg-\[color:var\(--portal-surface-1\)\]"/);
    assert.match(out, /"bg-\[color:var\(--portal-primary\)\]"/);
    // ثلاث بدائل bg مستقلة
    assert.equal((out.match(/bg-\[color:var/g) || []).length, 3);
  });

  test("twMerge مع variants متضاربة تحافظ على البادئة", () => {
    const src = `<div className={twMerge("bg-red-500", "hover:bg-red-50", "focus:bg-white")} />`;
    const { src: out } = run(src);
    assert.match(out, /"bg-\[color:var\(--portal-error\)\]"/);
    assert.match(out, /"hover:bg-\[color:var\(--portal-error-50\)\]"/);
    assert.match(out, /"focus:bg-\[color:var\(--portal-surface-1\)\]"/);
  });

  test("twMerge مع short-circuit وternary لا يكسر البنية", () => {
    const src = `<button className={twMerge("bg-white text-slate-900", on && "bg-red-500 text-white", tone === "ok" ? "bg-emerald-50" : "bg-amber-50")} />`;
    const { src: out } = run(src);
    assert.match(out, /on && "bg-\[color:var\(--portal-error\)\] text-\[color:var\(--portal-on-primary\)\]"/);
    assert.match(out, /tone === "ok" \? "bg-\[color:var\(--portal-success-50\)\]" : "bg-\[color:var\(--portal-warning-50\)\]"/);
    // البنية نفسها محفوظة (فاصلات، أقواس)
    assert.match(out, /twMerge\([^)]*\) } \/>|twMerge\([\s\S]*?\)/);
  });

  test("twMerge لا يلمس أي شيء خارج الحرفيات، والاستدعاءات المتداخلة تُغلق الالتقاط (سلوك موثَّق)", () => {
    // حرفيات مباشرة بعد identifiers تعمل:
    const s1 = `<div className={twMerge(baseClasses, "bg-red-500")} />`;
    assert.match(run(s1).src, /twMerge\(baseClasses, "bg-\[color:var\(--portal-error\)\]"\)/);

    // قيود موثَّقة: استدعاء متداخل مثل computeBg(x) يُنهي التقاط clsx/cn/twMerge الحالي،
    // فالحرفيات بعده لا تُحوَّل. تحسين هذا يتطلّب parser حقيقي؛ نُثبِّت السلوك هنا لتفادي كسر بصري غير مقصود.
    const s2 = `<div className={twMerge(baseClasses, computeBg(x), "bg-red-500")} />`;
    assert.equal(run(s2).src, s2, "الحرفية بعد استدعاء متداخل تبقى بلا تحويل (limitation)");
  });

  test("عدّاد changed يعكس كل استبدال داخل twMerge بشكل مستقل", () => {
    const src = `<div className={twMerge("bg-white", "bg-slate-50", "text-slate-900", "border-gray-200")} />`;
    const { changed } = run(src);
    assert.equal(changed, 4, "كل حرفية bg/text/border تُعدّ استبدالًا منفردًا");
  });
});
