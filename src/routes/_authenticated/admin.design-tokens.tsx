/**
 * /admin/design-tokens — Internal documentation for Design Tokens v2.
 * Explains the portal token system and the legacy-color migration map
 * (bg-slate-300, bg-emerald-500, …) so contributors stop hardcoding colors.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/design-tokens")({
  component: DesignTokensDocs,
  head: () => ({
    meta: [{ title: "Design Tokens v2 · Docs" }],
  }),
});

type Row = {
  legacy: string;
  token: string;
  className: string;
  note?: string;
};

const surfaces: Row[] = [
  {
    legacy: "bg-white / bg-slate-50",
    token: "--portal-surface-1",
    className: "bg-[color:var(--portal-surface-1)]",
    note: "بطاقة/سطح رئيسي",
  },
  {
    legacy: "bg-slate-100 / bg-gray-100",
    token: "--portal-surface-2",
    className: "bg-[color:var(--portal-surface-2)]",
    note: "خلفية القسم",
  },
  {
    legacy: "bg-slate-200 / bg-gray-200",
    token: "--portal-surface-3",
    className: "bg-[color:var(--portal-surface-3)]",
    note: "chip / pill / حالة هادئة",
  },
  {
    legacy: "bg-slate-300",
    token: "--portal-border-strong",
    className: "bg-[color:var(--portal-border-strong)]",
    note: "فواصل بارزة، لا تُستخدم كخلفية عامة",
  },
  {
    legacy: "bg-gray-50 sunken area",
    token: "--portal-surface-sunken",
    className: "bg-[color:var(--portal-surface-sunken)]",
    note: "منطقة مُغَوَّرة داخل بطاقة",
  },
];

const ink: Row[] = [
  {
    legacy: "text-slate-900 / text-gray-900",
    token: "--portal-ink",
    className: "text-[color:var(--portal-ink)]",
    note: "النص الأساسي",
  },
  {
    legacy: "text-slate-600 / text-gray-600",
    token: "--portal-ink-2",
    className: "text-[color:var(--portal-ink-2)]",
    note: "نص ثانوي / وصف",
  },
  {
    legacy: "text-slate-400 / text-gray-400",
    token: "--portal-ink-3",
    className: "text-[color:var(--portal-ink-3)]",
    note: "placeholder / meta",
  },
  {
    legacy: "text-white",
    token: "--portal-on-primary",
    className: "text-[color:var(--portal-on-primary)]",
    note: "نص فوق سطح ملوّن",
  },
];

const brand: Row[] = [
  {
    legacy: "bg-teal-700 / bg-emerald-700",
    token: "--portal-primary",
    className: "bg-[color:var(--portal-primary)] text-[color:var(--portal-on-primary)]",
    note: "زر رئيسي / CTA",
  },
  {
    legacy: "bg-teal-800",
    token: "--portal-primary-600",
    className: "bg-[color:var(--portal-primary-600)]",
    note: "حالة hover للـCTA",
  },
  {
    legacy: "bg-teal-50",
    token: "--portal-primary-50",
    className: "bg-[color:var(--portal-primary-50)] text-[color:var(--portal-primary)]",
    note: "خلفية badge/chip للعلامة",
  },
  {
    legacy: "bg-teal-500",
    token: "--portal-secondary",
    className: "bg-[color:var(--portal-secondary)]",
    note: "لهجة ثانوية",
  },
  {
    legacy: "bg-amber-500 / bg-yellow-500",
    token: "--portal-accent",
    className: "bg-[color:var(--portal-accent)]",
    note: "تمييز/شارة مميّزة",
  },
];

const status: Row[] = [
  {
    legacy: "bg-emerald-500 / bg-green-500",
    token: "--portal-success",
    className: "bg-[color:var(--portal-success)] text-[color:var(--portal-on-primary)]",
    note: "نجاح صريح",
  },
  {
    legacy: "bg-emerald-50 / bg-green-50",
    token: "--portal-success-50",
    className: "bg-[color:var(--portal-success-50)] text-[color:var(--portal-success)]",
    note: "شارة نجاح هادئة",
  },
  {
    legacy: "bg-amber-500",
    token: "--portal-warning",
    className: "bg-[color:var(--portal-warning)] text-[color:var(--portal-on-primary)]",
    note: "تحذير",
  },
  {
    legacy: "bg-amber-50 / bg-yellow-50",
    token: "--portal-warning-50",
    className: "bg-[color:var(--portal-warning-50)] text-[color:var(--portal-warning)]",
  },
  {
    legacy: "bg-red-500 / bg-rose-500",
    token: "--portal-error",
    className: "bg-[color:var(--portal-error)] text-[color:var(--portal-on-primary)]",
    note: "خطأ / حذف",
  },
  {
    legacy: "bg-red-50 / bg-rose-50",
    token: "--portal-error-50",
    className: "bg-[color:var(--portal-error-50)] text-[color:var(--portal-error)]",
  },
  {
    legacy: "bg-sky-500 / bg-blue-500",
    token: "--portal-info",
    className: "bg-[color:var(--portal-info)] text-[color:var(--portal-on-primary)]",
    note: "معلومة",
  },
];

const borders: Row[] = [
  {
    legacy: "border-slate-200",
    token: "--portal-border",
    className: "border border-[color:var(--portal-border)]",
  },
  {
    legacy: "border-slate-300",
    token: "--portal-border-strong",
    className: "border border-[color:var(--portal-border-strong)]",
    note: "حدود بارزة / focus rings",
  },
];

function Swatch({ className }: { className: string }) {
  return (
    <div
      className={`h-10 w-16 rounded-md border border-[color:var(--portal-border)] ${className}`}
      aria-hidden
    />
  );
}

function TokenTable({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-surface-1)] p-5 shadow-[var(--portal-shadow-sm)]">
      <h2 className="mb-4 text-lg font-semibold text-[color:var(--portal-ink)]">
        {title}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-start text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-[color:var(--portal-ink-3)]">
              <th className="pb-2 text-start font-medium">Preview</th>
              <th className="pb-2 text-start font-medium">Legacy (لا تستخدم)</th>
              <th className="pb-2 text-start font-medium">Token</th>
              <th className="pb-2 text-start font-medium">Class</th>
              <th className="pb-2 text-start font-medium">ملاحظة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--portal-border)]">
            {rows.map((r) => (
              <tr key={r.token + r.legacy} className="align-middle">
                <td className="py-3 pe-4">
                  <Swatch className={r.className} />
                </td>
                <td className="py-3 pe-4">
                  <code className="rounded bg-[color:var(--portal-surface-3)] px-1.5 py-0.5 text-xs text-[color:var(--portal-error)]">
                    {r.legacy}
                  </code>
                </td>
                <td className="py-3 pe-4">
                  <code className="text-xs text-[color:var(--portal-ink-2)]">
                    var({r.token})
                  </code>
                </td>
                <td className="py-3 pe-4">
                  <code className="whitespace-pre-wrap break-all text-xs text-[color:var(--portal-primary)]">
                    {r.className}
                  </code>
                </td>
                <td className="py-3 text-xs text-[color:var(--portal-ink-2)]">
                  {r.note ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DesignTokensDocs() {
  return (
    <div className="portal-root mx-auto max-w-6xl space-y-6 p-6">
      <header className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-surface-1)] p-6 shadow-[var(--portal-shadow-sm)]">
        <p className="text-xs uppercase tracking-wider text-[color:var(--portal-primary)]">
          Internal Docs
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-[color:var(--portal-ink)]">
          Design Tokens v2 — دليل الاستخدام
        </h1>
        <p className="mt-2 text-sm leading-6 text-[color:var(--portal-ink-2)]">
          نستخدم في بوابة المريض والإدارة نظام tokens مُعرَّف داخل{" "}
          <code className="rounded bg-[color:var(--portal-surface-3)] px-1.5 py-0.5 text-xs">
            src/styles.css
          </code>{" "}
          تحت الـselector{" "}
          <code className="rounded bg-[color:var(--portal-surface-3)] px-1.5 py-0.5 text-xs">
            .portal-root
          </code>
          . الهدف: منع الألوان الجامدة (Tailwind palettes مثل{" "}
          <code className="text-[color:var(--portal-error)]">bg-slate-300</code>{" "}
          و
          <code className="text-[color:var(--portal-error)]">
            bg-emerald-500
          </code>
          ) واستبدالها بمتغيرات تلتزم بالوضع الفاتح/المظلم وبقواعد التباين.
        </p>
        <ul className="mt-4 space-y-1 text-sm text-[color:var(--portal-ink)]">
          <li>
            ✅ استخدم <code>bg-[color:var(--portal-…)]</code> أو utility مثل{" "}
            <code>portal-card</code> / <code>portal-chip</code>.
          </li>
          <li>
            🚫 لا تكتب ألوان hex/rgb في JSX ولا تستخدم{" "}
            <code>bg-slate-*</code> / <code>text-gray-*</code> /{" "}
            <code>bg-emerald-*</code> داخل صفحات <code>portal/*</code> أو{" "}
            <code>admin/*</code>.
          </li>
          <li>
            ⚠️ الاستثناء الوحيد: صفحات التسويق العامة (خارج{" "}
            <code>.portal-root</code>) لها نظام tokens منفصل.
          </li>
        </ul>
      </header>

      <TokenTable title="Surfaces — الأسطح والخلفيات" rows={surfaces} />
      <TokenTable title="Ink — النصوص" rows={ink} />
      <TokenTable title="Brand — العلامة" rows={brand} />
      <TokenTable title="Status — الحالات الدلالية" rows={status} />
      <TokenTable title="Borders — الحدود" rows={borders} />

      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-surface-1)] p-6 shadow-[var(--portal-shadow-sm)]">
        <h2 className="mb-3 text-lg font-semibold text-[color:var(--portal-ink)]">
          أنماط جاهزة (Utilities)
        </h2>
        <p className="mb-4 text-sm text-[color:var(--portal-ink-2)]">
          بدل تجميع classes يدوياً، فضِّل الـutilities المعرّفة في{" "}
          <code>src/styles.css</code>:
        </p>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {[
            ["portal-card", "بطاقة قياسية بحدود + ظل خفيف"],
            ["portal-card-elevated", "بطاقة مرفوعة (modal/hero)"],
            ["portal-chip", "شارة محايدة"],
            ["portal-chip-primary", "شارة العلامة"],
            ["portal-btn-primary", "زر CTA"],
            ["portal-btn-secondary", "زر ثانوي"],
            ["portal-gradient-bg", "خلفية الصفحة"],
            ["portal-focus-ring", "حلقة تركيز موحّدة"],
          ].map(([cls, desc]) => (
            <li
              key={cls}
              className="flex items-start gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-surface-2)] px-3 py-2"
            >
              <code className="text-xs text-[color:var(--portal-primary)]">
                .{cls}
              </code>
              <span className="text-xs text-[color:var(--portal-ink-2)]">
                — {desc}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-surface-1)] p-6 shadow-[var(--portal-shadow-sm)]">
        <h2 className="mb-3 text-lg font-semibold text-[color:var(--portal-ink)]">
          كيف أُهاجر ملفاً قديماً؟
        </h2>
        <ol className="list-inside list-decimal space-y-2 text-sm text-[color:var(--portal-ink)]">
          <li>
            ابحث عن أي <code>bg-slate-*</code>, <code>bg-gray-*</code>,{" "}
            <code>bg-emerald-*</code>, <code>bg-red-*</code>,{" "}
            <code>text-white</code>, <code>text-slate-*</code> داخل الملف.
          </li>
          <li>استبدلها بالـclass المقابل من الجداول أعلاه.</li>
          <li>
            إذا كان العنصر بطاقة كاملة، فضّل استبدال الـwrapper بـ{" "}
            <code>PortalCard</code> من{" "}
            <code>src/components/portal/ui/</code>.
          </li>
          <li>
            شغّل <code>bunx tsgo --noEmit</code> ثم افتح الصفحة بصرياً للتأكد
            من التباين (AA على الأقل).
          </li>
        </ol>
      </section>
    </div>
  );
}
