/**
 * Brand-first full-bleed home hero.
 * Composition: brand mark · one headline · one lede · CTAs · booking strip.
 */
import { Link } from "@tanstack/react-router";
import { CalendarCheck2, Phone } from "lucide-react";
import { SITE, telUrl } from "@/lib/site";
import { useI18n } from "@/lib/i18n";
import { HomeBookingBar } from "./HomeBookingBar";
import heroJpg from "@/assets/baeshen-hero-doctors.jpg?w=1280&quality=72&format=jpg";
import heroAvif from "@/assets/baeshen-hero-doctors.jpg?w=960;1280;1600;1920&quality=48&format=avif&as=srcset";
import heroWebp from "@/assets/baeshen-hero-doctors.jpg?w=960;1280;1600;1920&quality=68&format=webp&as=srcset";
import heroMobileAvif from "@/assets/baeshen-hero-doctors.jpg?w=480;640;800;960&quality=50&format=avif&as=srcset";
import heroMobileWebp from "@/assets/baeshen-hero-doctors.jpg?w=480;640;800;960&quality=70&format=webp&as=srcset";
import heroMobileJpg from "@/assets/baeshen-hero-doctors.jpg?w=800&quality=72&format=jpg";

const DESKTOP_SIZES = "(min-width: 1600px) 1600px, (min-width: 1280px) 1280px, 100vw";
const MOBILE_SIZES = "(min-width: 640px) 800px, 100vw";
const MOBILE_MEDIA = "(max-width: 767px)";

export function HomeHero() {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  return (
    <section
      className="home-hero relative isolate"
      dir={isAr ? "rtl" : "ltr"}
      aria-label={isAr ? SITE.nameAr : SITE.nameEn}
    >
      <div className="home-hero__media absolute inset-0 -z-10">
        <picture>
          <source
            type="image/avif"
            media={MOBILE_MEDIA}
            srcSet={heroMobileAvif}
            sizes={MOBILE_SIZES}
          />
          <source
            type="image/webp"
            media={MOBILE_MEDIA}
            srcSet={heroMobileWebp}
            sizes={MOBILE_SIZES}
          />
          <source
            type="image/jpeg"
            media={MOBILE_MEDIA}
            srcSet={heroMobileJpg}
            sizes={MOBILE_SIZES}
          />
          <source type="image/avif" srcSet={heroAvif} sizes={DESKTOP_SIZES} />
          <source type="image/webp" srcSet={heroWebp} sizes={DESKTOP_SIZES} />
          <img
            src={heroJpg}
            alt=""
            width={1920}
            height={1088}
            fetchPriority="high"
            decoding="async"
            className="h-full w-full object-cover object-center scale-[1.02] home-hero__img"
          />
        </picture>
        <div className="home-hero__veil" aria-hidden />
      </div>

      <div className="container-app relative flex min-h-[min(88dvh,820px)] flex-col justify-center pb-28 pt-20 md:pb-36 md:pt-24">
        <div className={`max-w-2xl ${isAr ? "ms-auto text-right" : "me-auto text-left"}`}>
          <p className="home-hero__brand brand-mark text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.35)]">
            {isAr ? SITE.nameAr : SITE.nameEn}
          </p>
          <h1 className="home-hero__title mt-4 text-white">
            {isAr ? "رحلة علاج أسهل وجودة أعلى" : "Easier care. Higher quality."}
          </h1>
          <p className="home-hero__lede mt-4 max-w-lg text-white/88">
            {isAr
              ? "احجز مع استشاريي مجمع باعشن الطبي في صبيا — بعد التسجيل في المنصة."
              : "Book Baeshen consultants in Sabya — after signing in to the platform."}
          </p>
          <div className="home-hero__ctas mt-8 flex flex-wrap gap-3">
            <Link to="/book" className="home-hero__cta-primary">
              <CalendarCheck2 className="h-4 w-4" />
              {isAr ? "احجز موعدًا" : "Book appointment"}
            </Link>
            <a href={telUrl()} className="home-hero__cta-ghost">
              <Phone className="h-4 w-4" />
              {SITE.phoneDisplay}
            </a>
          </div>
        </div>
      </div>

      <div className="home-hero__bar absolute inset-x-0 bottom-0 translate-y-1/3 px-4 md:translate-y-[40%]">
        <div className="container-app">
          <HomeBookingBar variant="overlay" />
        </div>
      </div>
    </section>
  );
}
