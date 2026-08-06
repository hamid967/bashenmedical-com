import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { SITE } from "@/lib/site";
import lobby from "@/assets/complex-lobby.jpg?w=720&quality=70&format=webp";
import clinic from "@/assets/complex-clinic.jpg?w=560&quality=70&format=webp";
import pharmacy from "@/assets/complex-pharmacy.jpg?w=480&quality=70&format=webp";

export function HomeAbout() {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  return (
    <section className="site-section home-about" dir={isAr ? "rtl" : "ltr"}>
      <div className="container-app grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
        <div className={isAr ? "lg:order-2" : undefined}>
          <p className="section-eyebrow">{isAr ? "من نحن" : "About us"}</p>
          <h2 className="section-heading mt-3">{isAr ? SITE.nameAr : SITE.nameEn}</h2>
          <p className="section-lede mt-4 max-w-xl">
            {isAr
              ? "مجمع طبي متكامل في قلب صبيا، يجمع استشاريين معتمدين وتجربة رقمية سلسة من الحجز حتى المتابعة — بهوية جازان الدافئة ومعايير CBAHI."
              : "An integrated medical complex in the heart of Sabya — accredited consultants and a smooth digital journey from booking to follow-up, with warm Jazan character and CBAHI standards."}
          </p>
          <Link
            to="/about"
            className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--brand-deep)] transition hover:text-[color:var(--brand)]"
          >
            {isAr ? "اعرف المزيد" : "Learn more"}
            <ArrowLeft className={`h-4 w-4 ${isAr ? "" : "rotate-180"}`} />
          </Link>
        </div>

        <div
          className={`home-about__gallery relative mx-auto aspect-[4/3] w-full max-w-lg ${isAr ? "lg:order-1" : ""}`}
          aria-hidden
        >
          <img
            src={lobby}
            alt=""
            className="home-about__shot home-about__shot--main absolute inset-x-[8%] top-0 h-[72%] w-[84%] object-cover"
            loading="lazy"
          />
          <img
            src={clinic}
            alt=""
            className="home-about__shot home-about__shot--side absolute bottom-[6%] end-0 h-[48%] w-[42%] object-cover"
            loading="lazy"
          />
          <img
            src={pharmacy}
            alt=""
            className="home-about__shot home-about__shot--accent absolute bottom-[2%] start-[2%] h-[28%] w-[32%] object-cover"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}
