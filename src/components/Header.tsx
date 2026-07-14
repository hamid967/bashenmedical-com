import { Link } from "@tanstack/react-router";
import {
  Menu,
  X,
  Globe,
  Phone,
  LayoutDashboard,
  LogIn,
  User,
  Settings,
  ChevronDown,
  Siren,
  MapPin,
  Clock,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { SITE } from "@/lib/site";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import bmcLogoAsset from "@/assets/bmc-logo-transparent.png.asset.json";
import { JazanPattern } from "@/components/jazan/JazanPattern";

const bmcLogo = bmcLogoAsset.url;

type NavItem = {
  to: string;
  label: string;
  children?: { to: string; label: string; desc?: string }[];
};

export function Header() {
  const { t, lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(!!session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const isAr = lang === "ar";

  const nav: NavItem[] = [
    { to: "/", label: t("nav_home") },
    { to: "/about", label: t("nav_about") },
    { to: "/branches", label: isAr ? "مستشفياتنا" : "Our Hospitals" },
    { to: "/excellence", label: isAr ? "مراكز التميز" : "Excellence Centers" },
    { to: "/specialties", label: t("nav_specialties") },
    { to: "/doctors", label: t("nav_doctors") },
    {
      to: "/services",
      label: isAr ? "الخدمات" : "Services",
      children: [
        { to: "/services", label: isAr ? "كل الخدمات الإلكترونية" : "All E-Services", desc: isAr ? "دليل موحّد لكل خدماتنا" : "Unified directory of all services" },
        { to: "/packages", label: isAr ? "الباقات والفحوصات" : "Checkup Packages", desc: isAr ? "باقات فحص شاملة" : "Comprehensive packages" },
        { to: "/telemedicine", label: isAr ? "استشارة عن بُعد" : "Telemedicine", desc: isAr ? "طبيبك أونلاين" : "Doctor online" },
        { to: "/home-care", label: isAr ? "الرعاية المنزلية" : "Home Care", desc: isAr ? "خدمات طبية بالمنزل" : "Medical at home" },
        { to: "/pharmacy", label: t("nav_pharmacy"), desc: isAr ? "توصيل دواء" : "Delivery" },
        { to: "/insurance", label: isAr ? "شركات التأمين" : "Insurance", desc: isAr ? "التغطيات المعتمدة" : "Approved networks" },
        { to: "/second-opinion", label: isAr ? "الرأي الطبي الثاني" : "Second Opinion", desc: isAr ? "استشارة مستقلة" : "Independent review" },
        { to: "/corporate", label: isAr ? "خدمات الشركات" : "Corporate", desc: isAr ? "اتفاقيات مؤسسية" : "Enterprise partnerships" },
        { to: "/international-patients", label: isAr ? "المرضى الدوليون" : "International Patients" },
      ],
    },
    {
      to: "/media/news",
      label: isAr ? "المركز الإعلامي" : "Media Center",
      children: [
        { to: "/media/news", label: isAr ? "الأخبار" : "News" },
        { to: "/media/stories", label: isAr ? "قصص المرضى" : "Patient Stories", desc: isAr ? "تجارب علاج ملهمة" : "Inspiring cases" },
        { to: "/health", label: t("nav_health"), desc: isAr ? "مقالات صحية" : "Health articles" },
        { to: "/faq", label: t("nav_faq") },
        { to: "/careers", label: isAr ? "الوظائف" : "Careers" },
        { to: "/app", label: isAr ? "تطبيق الجوال" : "Mobile App", desc: isAr ? "حمّل التطبيق" : "Download app" },
      ],
    },
    { to: "/contact", label: t("nav_contact") },
  ];

  return (
    <header className="sticky top-0 z-40 bg-background/90 backdrop-blur border-b border-border/60">
      {/* Top bar */}
      <div className="hidden md:block bg-[color:var(--primary)] text-primary-foreground text-xs">
        <div className="container-app flex h-9 items-center justify-between gap-4">
          <div className="flex items-center gap-4 opacity-95">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {isAr ? "السبت–الأربعاء 9ص–9م" : "Sat–Wed 9am–9pm"}
            </span>
            <span className="hidden lg:inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {isAr ? SITE.addressAr : SITE.addressEn}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/emergency"
              className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 font-semibold hover:bg-white/25"
            >
              <Siren className="h-3.5 w-3.5" />
              {isAr ? "الطوارئ" : "Emergency"}
            </a>
            <a href={`tel:${SITE.phone}`} className="inline-flex items-center gap-1 hover:underline">
              <Phone className="h-3.5 w-3.5" /> {SITE.phoneDisplay}
            </a>
            <button
              onClick={() => setLang(isAr ? "en" : "ar")}
              className="inline-flex items-center gap-1 hover:underline"
            >
              <Globe className="h-3.5 w-3.5" /> {t("lang_switch")}
            </button>
          </div>
        </div>
      </div>

      {/* Main bar */}
      <div className="container-app flex h-16 items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 group shrink-0">
          <img
            src={bmcLogo}
            alt={isAr ? SITE.nameAr : SITE.nameEn}
            width={44}
            height={44}
            className="h-11 w-11 object-contain"
            loading="eager"
            decoding="async"
          />
          <div className="leading-tight">
            <div className="text-sm font-bold text-foreground">
              {isAr ? SITE.nameAr : SITE.nameEn}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {isAr ? "صبيا – جازان" : "Sabya – Jazan"}
            </div>
          </div>
        </Link>

        <nav className="hidden xl:flex items-center gap-0.5">
          {nav.map((n) =>
            n.children ? (
              <div
                key={n.to}
                className="relative"
                onMouseEnter={() => setOpenMenu(n.to)}
                onMouseLeave={() => setOpenMenu(null)}
              >
                <Link
                  to={n.to}
                  className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-foreground/85 rounded-md hover:text-primary hover:bg-primary/5"
                >
                  {n.label}
                  <ChevronDown className="h-3.5 w-3.5" />
                </Link>
                {openMenu === n.to && (
                  <div className="absolute top-full start-0 mt-1 w-72 rounded-xl border border-border bg-popover shadow-lg p-2 grid gap-1">
                    {n.children.map((c) => (
                      <Link
                        key={c.to}
                        to={c.to}
                        className="rounded-lg px-3 py-2 hover:bg-muted"
                      >
                        <div className="text-sm font-semibold text-foreground">{c.label}</div>
                        {c.desc && <div className="text-xs text-muted-foreground">{c.desc}</div>}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Link
                key={n.to}
                to={n.to}
                className="px-3 py-2 text-sm font-medium text-foreground/85 rounded-md hover:text-primary hover:bg-primary/5 transition"
                activeProps={{ className: "text-primary bg-primary/10" }}
                activeOptions={{ exact: n.to === "/" }}
              >
                {n.label}
              </Link>
            ),
          )}
        </nav>

        <div className="hidden md:flex items-center gap-2 shrink-0">
          <ThemeToggle />
          <Link
            to="/book"
            className="inline-flex items-center rounded-md bg-gradient-to-r from-primary to-accent px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-95"
          >
            {t("cta_book")}
          </Link>
          {signedIn ? (
            <>
              <NotificationBell />
              <Link
                to="/my"
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                <User className="h-3.5 w-3.5" /> {t("nav_my")}
              </Link>
              <Link
                to="/settings"
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                title="الإعدادات"
              >
                <Settings className="h-3.5 w-3.5" />
              </Link>
              <Link
                to="/admin"
                className="hidden 2xl:inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                <LayoutDashboard className="h-3.5 w-3.5" /> {isAr ? "لوحة" : "Admin"}
              </Link>
            </>
          ) : (
            <Link
              to="/auth"
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <LogIn className="h-3.5 w-3.5" /> {isAr ? "دخول" : "Sign in"}
            </Link>
          )}
        </div>

        <div className="xl:hidden flex items-center gap-1">
          <ThemeToggle />
          <button
            className="inline-flex items-center justify-center rounded-md p-2 text-foreground"
            onClick={() => setOpen((v) => !v)}
            aria-label="menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Jazan heritage strip — subtle decorative line under the nav */}
      <div
        aria-hidden="true"
        className="relative h-1.5 w-full bg-[var(--jazan-ivory,#FCF9F2)] border-t border-[var(--jazan-gold,#C7A46B)]/25"
      >
        <JazanPattern
          variant="subtle"
          className="absolute inset-0 h-full w-full"
        />
      </div>

      {open && (
        <div className="xl:hidden border-t border-border bg-background max-h-[calc(100vh-4rem)] overflow-auto">
          <div className="container-app py-3 flex flex-col gap-0.5">
            {nav.map((n) => (
              <div key={n.to}>
                <Link
                  to={n.to}
                  className="block px-3 py-2 rounded-md text-sm font-semibold text-foreground/90 hover:bg-primary/5"
                  onClick={() => setOpen(false)}
                >
                  {n.label}
                </Link>
                {n.children && (
                  <div className="ps-4 mt-0.5 mb-1 flex flex-col gap-0.5">
                    {n.children.map((c) => (
                      <Link
                        key={c.to}
                        to={c.to}
                        onClick={() => setOpen(false)}
                        className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-primary hover:bg-primary/5"
                      >
                        {c.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => setLang(isAr ? "en" : "ar")}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-medium"
              >
                <Globe className="h-3.5 w-3.5" /> {t("lang_switch")}
              </button>
              <Link
                to="/book"
                onClick={() => setOpen(false)}
                className="flex-1 text-center rounded-md bg-gradient-to-r from-primary to-accent px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                {t("cta_book")}
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
