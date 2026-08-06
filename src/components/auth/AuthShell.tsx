/**
 * Andalusia-inspired auth shell: brand full-bleed panel + form panel.
 * Keeps Baeshen teal/gold identity; used by /auth/* child routes.
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Phone } from "lucide-react";
import { SITE, telUrl, whatsappUrl } from "@/lib/site";
import brandJpg from "@/assets/baeshen-hero-doctors.jpg?w=1200&quality=70&format=jpg";
import brandWebp from "@/assets/baeshen-hero-doctors.jpg?w=800;1200;1600&quality=68&format=webp&as=srcset";

export function AuthShell({ children, eyebrow }: { children: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="auth-shell" dir="rtl">
      <aside className="auth-shell__brand" aria-hidden={false}>
        <picture>
          <source type="image/webp" srcSet={brandWebp} sizes="(min-width: 1024px) 55vw, 100vw" />
          <img
            src={brandJpg}
            alt=""
            className="auth-shell__brand-img"
            width={1600}
            height={900}
            decoding="async"
          />
        </picture>
        <div className="auth-shell__brand-veil" aria-hidden />
        <div className="auth-shell__brand-content">
          <Link to="/" className="auth-shell__logo-link">
            <img
              src="/baeshen-logo.png"
              alt=""
              className="auth-shell__logo"
              width={56}
              height={56}
            />
            <div>
              <div className="auth-shell__brand-name">{SITE.nameAr}</div>
              <div className="auth-shell__brand-sub">{SITE.nameEn}</div>
            </div>
          </Link>
          <p className="auth-shell__brand-tagline">
            رعاية موثوقة في صبيا — حجز ومتابعة عبر المنصة بعد التسجيل.
          </p>
        </div>
      </aside>

      <section className="auth-shell__panel">
        <div className="auth-shell__panel-inner">
          <Link to="/" className="auth-shell__back">
            العودة للصفحة الرئيسية
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          {eyebrow}
          <div className="auth-shell__card">{children}</div>
        </div>
      </section>

      <div className="auth-shell__fab" aria-label="تواصل سريع">
        <a
          href={whatsappUrl("مرحبا، أحتاج مساعدة في تسجيل الدخول")}
          target="_blank"
          rel="noreferrer"
          className="auth-shell__fab-wa"
          aria-label="واتساب"
        >
          واتساب
        </a>
        <a href={telUrl()} className="auth-shell__fab-call" aria-label="اتصال">
          <Phone className="h-4 w-4" aria-hidden />
          {SITE.phoneDisplay}
        </a>
      </div>
    </div>
  );
}
