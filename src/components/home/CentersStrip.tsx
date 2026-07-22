import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";

type Center = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  short_ar: string | null;
  short_en: string | null;
  hero_image_url: string | null;
};

export function CentersStrip() {
  const { lang } = useI18n();
  const { t } = useTranslation("homeSections");
  const isAr = lang === "ar";
  const { data } = useQuery({
    queryKey: ["excellence_centers_home"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("excellence_centers")
        .select("id,slug,name_ar,name_en,short_ar,short_en,hero_image_url")
        .eq("is_active", true)
        .order("sort_order")
        .limit(8);
      if (error) throw error;
      return (data ?? []) as Center[];
    },
  });

  if (!data || data.length === 0) return null;

  return (
    <section className="py-16 md:py-24 relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/95 via-primary to-navy-deep" />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-30 [background-image:radial-gradient(circle_at_15%_20%,white/0.15,transparent_50%),radial-gradient(circle_at_85%_75%,white/0.1,transparent_55%)]"
      />
      <div className="container-app text-primary-foreground">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
              <Sparkles className="h-3.5 w-3.5" />
              {t("centersStrip.badge")}
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">{t("centersStrip.title")}</h2>
            <p className="mt-2 max-w-2xl text-white/80">{t("centersStrip.subtitle")}</p>
          </div>
          <Link
            to="/excellence"
            className="inline-flex items-center gap-1.5 rounded-full bg-white text-primary px-4 py-2 text-sm font-semibold hover:bg-white/90 transition"
          >
            {t("centersStrip.all")}
            {isAr ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          </Link>
        </div>

        <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 -mx-4 px-4 scrollbar-thin scrollbar-thumb-white/20">
          {data.map((c) => {
            const name = isAr ? c.name_ar : c.name_en;
            return (
              <Link
                key={c.id}
                to="/excellence/$slug"
                params={{ slug: c.slug }}
                className="group snap-start shrink-0 w-[280px] md:w-[320px] rounded-2xl overflow-hidden bg-white/5 border border-white/15 hover:bg-white/10 hover:border-white/30 transition"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-navy-deep/50">
                  {c.hero_image_url ? (
                    <img
                      src={c.hero_image_url}
                      alt={name}
                      loading="lazy"
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-6xl text-white/20 font-bold">
                      {name.charAt(0)}
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-navy-deep/90 to-transparent" />
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-bold text-white">{name}</h3>
                  <p className="mt-1.5 text-sm text-white/70 line-clamp-2 min-h-[2.5rem]">
                    {isAr ? c.short_ar : c.short_en}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-white/90">
                    {t("centersStrip.details", { name })}
                    {isAr ? <ArrowLeft className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
