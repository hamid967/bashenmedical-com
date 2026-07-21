import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Coins, Cpu } from "lucide-react";

export const Route = createFileRoute("/docs/ai-cost")({
  head: () => ({
    meta: [
      { title: "كيف تُحسب تكلفة رسائل المساعد الذكي | باعشن الطبي" },
      {
        name: "description",
        content:
          "شرح مختصر لطريقة حساب التوكنات (Tokens) والائتمانات (Credits) لكل رسالة في مساعد باعشن الذكي، مع الفرق بين التقدير المحلي والقياس الفعلي.",
      },
      { property: "og:title", content: "كيف تُحسب تكلفة رسائل المساعد الذكي" },
      {
        property: "og:description",
        content: "شرح مختصر للتوكنات والائتمانات في مساعد باعشن الذكي.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiCostDocsPage,
});

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 border-b border-black/5 dark:border-white/5 last:border-0">
      <span className="opacity-70">{k}</span>
      <span className="font-mono">{v}</span>
    </div>
  );
}

function AiCostDocsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold">
            كيف تُحسب تكلفة رسائل المساعد؟
          </h1>
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            الرئيسية
          </Link>
        </div>

        <p className="text-muted-foreground leading-relaxed">
          كل رسالة تُرسل إلى مساعد باعشن تُقاس بوحدتين: <b>الرموز (Tokens)</b>
          وهي الوحدة التي يفهم بها النموذج النص، و<b>الائتمانات (Credits)</b>
          وهي التكلفة المحسوبة على استخدامك.
        </p>

        <section className="rounded-2xl border bg-card p-5 space-y-3">
          <h2 className="text-lg font-semibold inline-flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" /> الرموز (Tokens)
          </h2>
          <p className="text-sm leading-relaxed opacity-90">
            الرمز قطعة صغيرة من النص (كلمة أو جزء منها). كلما زاد طول السؤال أو
            الرد زاد عدد الرموز. نميّز بين:
          </p>
          <ul className="list-disc pr-5 text-sm space-y-1 opacity-90">
            <li>
              <b>المدخلات (Input)</b>: ما يُرسل للنموذج (سؤالك + السياق).
            </li>
            <li>
              <b>المخرجات (Output)</b>: ما يُنتجه النموذج (الرد النصي).
            </li>
          </ul>
          <p className="text-xs opacity-70">
            قبل وصول الرد الرسمي من النموذج، نعرض تقديرًا محليًا مبنيًّا على طول
            النص. بعد اكتمال الرد يُستبدل بالقياس الفعلي عند توفره.
          </p>
        </section>

        <section className="rounded-2xl border bg-card p-5 space-y-3">
          <h2 className="text-lg font-semibold inline-flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary" /> الائتمانات (Credits)
          </h2>
          <p className="text-sm leading-relaxed opacity-90">
            كل نموذج له سعر لكل مليون رمز، ويختلف سعر المدخلات عن سعر المخرجات.
            المعادلة:
          </p>
          <pre className="rounded-md border bg-muted/40 p-3 text-xs font-mono leading-relaxed overflow-x-auto">
{`credits =
  (input_tokens  × input_rate_per_1M  / 1,000,000)
+ (output_tokens × output_rate_per_1M / 1,000,000)`}
          </pre>
          <div className="text-sm space-y-1">
            <Row k="مثال: مدخلات" v="500 رمز × 0.30 / 1,000,000 = 0.00015" />
            <Row k="مثال: مخرجات" v="800 رمز × 2.50 / 1,000,000 = 0.00200" />
            <Row k="الإجمالي" v="≈ 0.00215 رصيد" />
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-5 space-y-2">
          <h2 className="text-lg font-semibold">التقدير مقابل القياس الفعلي</h2>
          <ul className="list-disc pr-5 text-sm space-y-1 opacity-90">
            <li>
              <b>تقدير محلي</b>: يظهر أثناء التوليد بناءً على طول النص المكتوب
              حتى تلك اللحظة.
            </li>
            <li>
              <b>قياس فعلي</b>: يصل من بوابة الذكاء الاصطناعي بعد اكتمال الرد،
              ويحل محل التقدير تلقائيًا.
            </li>
          </ul>
          <p className="text-xs opacity-70">
            قد يختلف التقدير المحلي عن الفعلي بنسبة صغيرة بسبب طريقة تجزئة النص
            الخاصة بكل نموذج (Tokenizer).
          </p>
        </section>

        <div className="text-sm opacity-70">
          هل تحتاج تفصيلاً أعمق للأسعار حسب النموذج؟{" "}
          <a
            href="https://docs.lovable.dev/integrations/cloud"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            راجع دليل التسعير الكامل
          </a>
          .
        </div>
      </div>
    </div>
  );
}
