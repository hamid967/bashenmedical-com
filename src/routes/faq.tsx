import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { bmcOgImageMeta } from "@/lib/og-meta";

const SITE_URL = "https://bashenmedical.com";
const PAGE_URL = `${SITE_URL}/faq`;
const PAGE_TITLE_AR = "الأسئلة الشائعة — مجمع باعشن الطبي";
const PAGE_DESC_AR =
  "إجابات موثوقة عن أكثر الأسئلة شيوعًا حول حجز المواعيد، الخدمات الطبية، الصيدلية، مناطق التوصيل وساعات العمل في مجمع باعشن الطبي بصبيا، جازان.";

type Faq = {
  id: string;
  question_ar: string;
  question_en: string | null;
  answer_ar: string;
  answer_en: string | null;
  sort_order: number;
};

async function fetchFaqs(): Promise<Faq[]> {
  const { data, error } = await supabase
    .from("faqs")
    .select("id, question_ar, question_en, answer_ar, answer_en, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export const Route = createFileRoute("/faq")({
  loader: async ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["faqs"],
      queryFn: fetchFaqs,
    }),
  head: ({ loaderData }) => {
    const faqs = (loaderData as Faq[] | undefined) ?? [];
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.question_ar,
        acceptedAnswer: { "@type": "Answer", text: f.answer_ar },
      })),
    };
    return {
      meta: [
      ...bmcOgImageMeta(),
        { title: PAGE_TITLE_AR },
        { name: "description", content: PAGE_DESC_AR },
        { property: "og:title", content: PAGE_TITLE_AR },
        { property: "og:description", content: PAGE_DESC_AR },
        { property: "og:type", content: "website" },
        { property: "og:url", content: PAGE_URL },
        { property: "og:locale", content: "ar_SA" },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: PAGE_TITLE_AR },
        { name: "twitter:description", content: PAGE_DESC_AR },
      ],
      links: [{ rel: "canonical", href: PAGE_URL }],
      scripts:
        faqs.length > 0
          ? [{ type: "application/ld+json", children: JSON.stringify(jsonLd) }]
          : [],
    };
  },
  component: FAQPage,
});

function FAQPage() {
  const { t, lang } = useI18n();
  const initialFaqs = Route.useLoaderData() as Faq[] | undefined;
  const { data: faqs } = useQuery({
    queryKey: ["faqs"],
    queryFn: fetchFaqs,
    initialData: initialFaqs,
  });

  return (
    <div className="container-app py-12 max-w-3xl">
      <h1 className="text-4xl font-bold">{t("faq_title")}</h1>
      <div className="mt-8 space-y-3">
        {(faqs ?? []).map((f) => {
          const q = lang === "ar" ? f.question_ar : (f.question_en ?? f.question_ar);
          const a = lang === "ar" ? f.answer_ar : (f.answer_en ?? f.answer_ar);
          return (
            <details
              key={f.id}
              className="group rounded-xl border border-border bg-card p-5 open:shadow-sm"
            >
              <summary className="cursor-pointer font-semibold list-none flex items-center justify-between">
                {q}
                <span className="text-primary group-open:rotate-45 transition">+</span>
              </summary>
              <p className="mt-3 text-sm text-muted-foreground leading-7">{a}</p>
            </details>
          );
        })}
      </div>
    </div>
  );
}
