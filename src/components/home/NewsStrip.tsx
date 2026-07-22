import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { ArrowLeft, ArrowRight, Newspaper } from "lucide-react";

type Article = {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string | null;
  excerpt_ar: string | null;
  excerpt_en: string | null;
  cover_image_url: string | null;
  published_at: string | null;
};

export function NewsStrip() {
  const { lang } = useI18n();
  const { t } = useTranslation("homeSections");
  const isAr = lang === "ar";
  const { data } = useQuery({
    queryKey: ["home_news"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("health_articles")
        .select("id,slug,title_ar,title_en,excerpt_ar,excerpt_en,cover_image_url,published_at")
        .eq("is_published", true)
        .order("published_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return (data ?? []) as Article[];
    },
  });

  if (!data || data.length === 0) return null;

  return (
    <section className="py-16 md:py-24">
      <div className="container-app">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
              <Newspaper className="h-3.5 w-3.5" />
              {t("newsStrip.badge")}
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">{t("newsStrip.title")}</h2>
          </div>
          <Link
            to="/health"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            {t("newsStrip.all")}
            {isAr ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {data.map((a) => (
            <Link
              key={a.id}
              to="/health/$slug"
              params={{ slug: a.slug }}
              className="group bento-card overflow-hidden flex flex-col"
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-secondary">
                {a.cover_image_url ? (
                  <img
                    src={a.cover_image_url}
                    alt={(isAr ? a.title_ar : a.title_en) ?? a.title_ar}
                    loading="lazy"
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                ) : (
                  <div className="h-full w-full grid place-items-center bg-gradient-to-br from-primary/15 to-accent/15">
                    <Newspaper className="h-10 w-10 text-primary/40" />
                  </div>
                )}
              </div>
              <div className="p-5 flex-1 flex flex-col">
                {a.published_at && (
                  <time className="text-xs text-muted-foreground">
                    {new Date(a.published_at).toLocaleDateString(isAr ? "ar-SA" : "en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                )}
                <h3 className="mt-2 text-lg font-bold line-clamp-2 group-hover:text-primary transition">
                  {isAr ? a.title_ar : a.title_en}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground line-clamp-3 flex-1">
                  {isAr ? a.excerpt_ar : a.excerpt_en}
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                  {t("newsStrip.read")}
                  {isAr ? <ArrowLeft className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
