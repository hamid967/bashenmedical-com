import { Link } from "@tanstack/react-router";
import { Sparkles, ArrowLeft } from "lucide-react";
import { JazanDivider, JazanPattern, JazanSectionLabel } from "@/components/jazan";

export function ComingSoon({
  title_ar,
  title_en,
  description_ar,
  description_en,
}: {
  title_ar: string;
  title_en: string;
  description_ar?: string;
  description_en?: string;
}) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="portal-card p-8 md:p-12 text-center relative overflow-hidden ring-1 ring-[var(--jazan-gold,#C7A46B)]/25">
        <JazanPattern
          variant="subtle"
          className="absolute inset-x-0 top-0 h-4 opacity-60 pointer-events-none"
        />
        <JazanPattern
          variant="subtle"
          className="absolute inset-x-0 bottom-0 h-4 opacity-60 pointer-events-none"
        />
        <div className="relative">
          <JazanSectionLabel align="center" className="mb-3">
            {title_en}
          </JazanSectionLabel>
          <div
            className="mx-auto h-14 w-14 rounded-2xl grid place-items-center text-white portal-float ring-2 ring-[var(--jazan-gold,#C7A46B)]/40"
            style={{ background: "var(--portal-gradient)" }}
          >
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="mt-5 text-2xl md:text-3xl font-bold text-[color:var(--portal-ink)]">
            {title_ar}
          </h1>
          <JazanDivider variant="subtle" className="my-4 max-w-xs mx-auto" />
          <p className="text-sm md:text-base text-[color:var(--portal-ink-2)] max-w-md mx-auto">
            {description_ar ?? "هذه الصفحة قيد التطوير وستكون متاحة قريبًا داخل البوابة."}
          </p>
          {description_en && (
            <p className="mt-1 text-xs text-[color:var(--portal-ink-3)]">{description_en}</p>
          )}
          <Link
            to="/portal"
            className="mt-6 inline-flex items-center gap-2 rounded-full px-5 h-10 text-sm font-semibold text-white"
            style={{ background: "var(--portal-gradient)" }}
          >
            <ArrowLeft className="h-4 w-4" />
            العودة إلى الرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}
