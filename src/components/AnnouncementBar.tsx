/**
 * AnnouncementBar — Jazan-heritage upper announcement strip.
 * Sits above the main Header. Warm ivory background, thin patterned border,
 * small ornaments at both ends, high-contrast teal text.
 */
import { JazanPattern } from "@/components/jazan/JazanPattern";
import { useI18n } from "@/lib/i18n";

export function AnnouncementBar() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const message = isAr
    ? "من قلب جازان، نقدم رعاية طبية بمعايير حديثة"
    : "From the heart of Jazan, delivering modern medical care";
  return (
    <div
      dir={isAr ? "rtl" : "ltr"}
      className="relative w-full border-b border-[var(--jazan-gold,#C7A46B)]/40 bg-[var(--jazan-ivory,#FCF9F2)] text-[var(--jazan-teal,#075E63)]"
      role="region"
      aria-label={isAr ? "شريط الإعلانات" : "Announcement bar"}
    >
      {/* faint pattern watermark */}
      <JazanPattern
        variant="subtle"
        className="absolute inset-0 h-full w-full opacity-30"
      />
      <div className="container-app relative flex h-9 items-center justify-center gap-3 text-[12px] sm:text-[13px]">
        <JazanPattern
          orientation="vertical"
          variant="standard"
          className="h-5 w-4 shrink-0 hidden sm:block"
        />
        <span className="font-semibold tracking-tight text-center truncate">
          {message}
        </span>
        <JazanPattern
          orientation="vertical"
          variant="standard"
          className="h-5 w-4 shrink-0 hidden sm:block"
        />
      </div>
    </div>
  );
}

export default AnnouncementBar;
