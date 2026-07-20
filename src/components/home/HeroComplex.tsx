import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
// Doctors hero — responsive srcset with per-format quality tuning for smaller payloads.
// AVIF ~48q / WebP ~68q / JPEG ~72q keep visual fidelity while dropping bytes 40–60%.
import heroAvif from "@/assets/baeshen-hero-doctors.jpg?w=960;1280;1600;1920&quality=48&format=avif&as=srcset";
import heroWebp from "@/assets/baeshen-hero-doctors.jpg?w=960;1280;1600;1920&quality=68&format=webp&as=srcset";
import heroJpg from "@/assets/baeshen-hero-doctors.jpg?w=1280&quality=72&format=jpg";
import heroMobileAvif from "@/assets/baeshen-hero-doctors.jpg?w=480;640;800;960&quality=50&format=avif&as=srcset";
import heroMobileWebp from "@/assets/baeshen-hero-doctors.jpg?w=480;640;800;960&quality=70&format=webp&as=srcset";
import heroMobileJpg from "@/assets/baeshen-hero-doctors.jpg?w=800&quality=72&format=jpg";
import { CalendarCheck, Phone } from "lucide-react";
import { MedicalMotifs } from "./MedicalMotifs";

// Viewport-aware sizes hint so the browser picks the smallest source that fits.
const DESKTOP_SIZES = "(min-width: 1600px) 1600px, (min-width: 1280px) 1280px, 100vw";
const MOBILE_SIZES = "(min-width: 640px) 800px, 100vw";
const MOBILE_MEDIA = "(max-width: 767px)";

export function HeroComplex() {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  return (
    <section
      dir={isAr ? "rtl" : "ltr"}
      className="relative isolate overflow-hidden min-h-[78vh] md:min-h-[86vh] flex items-center"
      aria-label={isAr ? "مجمع باعشن الطبي" : "Baeshen Medical Complex"}
    >
      {/* Art-directed background: portrait crop on mobile, wide crop on desktop */}
      <picture>
        {/* Mobile-first: vertical composition */}
        <source type="image/avif" media={MOBILE_MEDIA} srcSet={heroMobileAvif} sizes={MOBILE_SIZES} />
        <source type="image/webp" media={MOBILE_MEDIA} srcSet={heroMobileWebp} sizes={MOBILE_SIZES} />
        <source type="image/jpeg" media={MOBILE_MEDIA} srcSet={heroMobileJpg} sizes={MOBILE_SIZES} />
        {/* Desktop / tablet: wide composition */}
        <source type="image/avif" srcSet={heroAvif} sizes={DESKTOP_SIZES} />
        <source type="image/webp" srcSet={heroWebp} sizes={DESKTOP_SIZES} />
        <img
          src={heroJpg}
          alt={isAr ? "مجمع باعشن الطبي" : "Baeshen Medical Complex"}
          width={1920}
          height={1088}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
      </picture>



      {/* Medical color overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a2540]/70 via-[#0f766e]/35 to-[#06b6d4]/25" />
      <div className={`absolute inset-0 ${isAr ? "bg-gradient-to-l" : "bg-gradient-to-r"} from-[#0a2540]/85 via-[#0a2540]/40 to-transparent`} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(6,12,25,0.55)_100%)]" />

      {/* Floating medical motifs (DNA / ECG / cross) */}
      <MedicalMotifs />

      {/* Content */}
      <div className="container-app relative z-10 py-20 md:py-28">
        <div className={`max-w-2xl ${isAr ? "text-right" : "text-left"} text-white`}>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 px-4 py-1.5 text-xs font-medium text-white/90 tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.9)]" />
            {isAr ? "معتمد من CBAHI · صبيا، جازان" : "CBAHI Accredited · Sabya, Jazan"}
          </span>

          <h1 className="mt-6 text-4xl md:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight drop-shadow-[0_2px_20px_rgba(0,0,0,0.4)]">
            {isAr ? (
              <>
                رعاية طبية <span className="text-cyan-300">استثنائية</span>
                <br />
                في مجمع باعشن الطبي
              </>
            ) : (
              <>
                Exceptional care at
                <br />
                <span className="text-cyan-300">Baeshen Medical Complex</span>
              </>
            )}
          </h1>

          <p className="mt-5 text-base md:text-xl text-white/85 max-w-xl leading-relaxed">
            {isAr
              ? "استشاريون معتمدون، تقنيات حديثة، وتجربة مريض راقية — احجز موعدك بلمسة واحدة."
              : "Board-certified consultants, modern technology, and a premium patient experience — book in one tap."}
          </p>

          <div className={`mt-8 flex flex-wrap gap-3 ${isAr ? "justify-start" : ""}`}>
            <Link
              to="/book"
              className="group inline-flex items-center gap-2 rounded-full bg-white text-[#0a2540] px-7 py-3.5 text-sm md:text-base font-semibold shadow-[0_10px_40px_-10px_rgba(6,182,212,0.6)] hover:bg-cyan-50 hover:shadow-[0_10px_40px_-5px_rgba(6,182,212,0.9)] transition-all duration-300"
            >
              <CalendarCheck className="h-5 w-5" />
              {isAr ? "احجز موعدك الآن" : "Book your appointment"}
              <span className={`transition-transform ${isAr ? "group-hover:-translate-x-1" : "group-hover:translate-x-1"}`}>
                {isAr ? "←" : "→"}
              </span>
            </Link>
            <a
              href="tel:+966555088623"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 backdrop-blur-md text-white px-7 py-3.5 text-sm md:text-base font-semibold hover:bg-white/20 transition-all duration-300"
            >
              <Phone className="h-5 w-5" />
              {isAr ? "اتصل بنا" : "Call us"}
            </a>
          </div>

          {/* Trust chips */}
          <div className={`mt-10 flex flex-wrap gap-x-6 gap-y-3 text-xs md:text-sm text-white/70 ${isAr ? "flex-row-reverse justify-end" : ""}`}>
            <div className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-cyan-300" />
              {isAr ? "أطباء استشاريون" : "Consultant specialists"}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-cyan-300" />
              {isAr ? "خدمة رعاية منزلية" : "Home care service"}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-cyan-300" />
              {isAr ? "صيدلية متكاملة" : "Full pharmacy"}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom fade to page bg */}
      <div className="pointer-events-none absolute bottom-0 inset-x-0 h-24 bg-gradient-to-b from-transparent to-background" />
    </section>
  );
}
