import { Link } from "@tanstack/react-router";
import { Instagram, MapPin, Phone, Mail, Clock, ShieldCheck, Award, Siren } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { SITE } from "@/lib/site";
import bmcLogoAsset from "@/assets/bmc-logo-transparent.png.asset.json";
import { JazanDivider, JazanPattern } from "@/components/jazan";

const bmcLogo = bmcLogoAsset.url;

export function Footer() {
  const { t, lang } = useI18n();
  const isAr = lang === "ar";

  return (
    <footer className="mt-16 bg-gradient-to-b from-muted/40 to-muted/70 border-t border-border relative">
      <JazanPattern variant="subtle" className="absolute inset-x-0 top-0 h-3 opacity-70 pointer-events-none" />
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, var(--jazan-gold,#C7A46B), var(--jazan-terracotta,#B85C3C), var(--jazan-gold,#C7A46B), transparent)", opacity: 0.45 }} />
      <div className="container-app py-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
        {/* Brand */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <img
              src={bmcLogo}
              alt={isAr ? SITE.nameAr : SITE.nameEn}
              width={44}
              height={44}
              className="h-11 w-11 object-contain"
              loading="lazy"
              decoding="async"
            />
            <div className="text-sm font-bold">{isAr ? SITE.nameAr : SITE.nameEn}</div>
          </div>
          <p className="text-sm text-muted-foreground leading-6 mb-4">
            {isAr
              ? "منظومة رعاية صحية متكاملة معتمدة من CBAHI في محافظة صبيا — نقدم خدمات طبية عامة وتخصصية، صيدلية، رعاية منزلية واستشارات عن بُعد."
              : "Integrated CBAHI-accredited healthcare in Sabya — general and specialty medicine, pharmacy, home care and telemedicine."}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-md bg-background border border-border px-2 py-1 text-[11px] font-medium">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" /> CBAHI
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-background border border-border px-2 py-1 text-[11px] font-medium">
              <Award className="h-3.5 w-3.5 text-primary" /> {isAr ? "وزارة الصحة" : "MOH"}
            </span>
          </div>
        </div>

        {/* Services */}
        <div>
          <h4 className="text-sm font-semibold mb-3">{isAr ? "خدماتنا" : "Services"}</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link to="/specialties" className="hover:text-primary">{t("nav_specialties")}</Link></li>
            <li><Link to="/doctors" className="hover:text-primary">{t("nav_doctors")}</Link></li>
            <li><Link to="/excellence" className="hover:text-primary">{isAr ? "مراكز التميز" : "Excellence Centers"}</Link></li>
            <li><Link to="/packages" className="hover:text-primary">{isAr ? "الباقات والفحوصات" : "Checkup Packages"}</Link></li>
            <li><Link to="/programs" className="hover:text-primary">{isAr ? "برامجنا الطبية" : "Programs"}</Link></li>
            <li><Link to="/telemedicine" className="hover:text-primary">{isAr ? "استشارة عن بُعد" : "Telemedicine"}</Link></li>
            <li><Link to="/home-care" className="hover:text-primary">{isAr ? "الرعاية المنزلية" : "Home Care"}</Link></li>
            <li><Link to="/pharmacy" className="hover:text-primary">{t("nav_pharmacy")}</Link></li>
          </ul>
        </div>

        {/* Patient portal */}
        <div>
          <h4 className="text-sm font-semibold mb-3">{isAr ? "بوابة المريض" : "Patient Portal"}</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link to="/book" className="hover:text-primary">{t("nav_book")}</Link></li>
            <li><Link to="/lookup" className="hover:text-primary">{t("nav_lookup")}</Link></li>
            <li><Link to="/my" className="hover:text-primary">{t("nav_my")}</Link></li>
            <li><Link to="/insurance" className="hover:text-primary">{isAr ? "شركات التأمين" : "Insurance"}</Link></li>
            <li><Link to="/faq" className="hover:text-primary">{t("nav_faq")}</Link></li>
            <li><Link to="/health" className="hover:text-primary">{t("nav_health")}</Link></li>
            <li><Link to="/careers" className="hover:text-primary">{isAr ? "الوظائف" : "Careers"}</Link></li>
            <li><Link to="/accreditations" className="hover:text-primary">{isAr ? "الاعتمادات والجوائز" : "Accreditations"}</Link></li>
          </ul>
        </div>

        {/* Contact */}
        <div>
          <h4 className="text-sm font-semibold mb-3">{t("footer_contact")}</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Siren className="h-4 w-4 text-destructive" />
              <Link to="/emergency" className="font-semibold text-destructive hover:underline">
                {isAr ? "الطوارئ 24/7" : "Emergency 24/7"}
              </Link>
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              <a href={`tel:${SITE.phone}`}>{SITE.phoneDisplay}</a>
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              <a href={`tel:${SITE.mobile}`}>{SITE.mobileDisplay}</a>
            </li>
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
            </li>
            <li className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-primary mt-0.5" />
              <a href={SITE.mapsUrl} target="_blank" rel="noreferrer">
                {isAr ? SITE.addressAr : SITE.addressEn}
              </a>
            </li>
            <li className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-primary mt-0.5" />
              <span>{t("footer_hours_val")}</span>
            </li>
          </ul>
          <div className="mt-4 flex items-center gap-3">
            <a href={SITE.instagram} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary">
              <Instagram className="h-5 w-5" />
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="container-app py-4 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
          <span>
            © {new Date().getFullYear()} {isAr ? SITE.nameAr : SITE.nameEn} — {t("footer_rights")}
          </span>
          <div className="flex items-center gap-3">
            <Link to="/complaints" className="hover:text-primary">
              {isAr ? "الشكاوى والمقترحات" : "Complaints"}
            </Link>
            <Link to="/contact" className="hover:text-primary">{t("nav_contact")}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
