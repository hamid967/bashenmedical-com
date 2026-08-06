import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { I18nProvider } from "@/lib/i18n";
import { Header } from "@/components/Header";
import { AnnouncementBar } from "@/components/AnnouncementBar";
import { Footer } from "@/components/Footer";
import { JazanSettingsProvider } from "@/components/jazan/JazanSettingsProvider";
import { Toaster } from "sonner";
import { BaeshenAssistant } from "@/components/assistant/BaeshenAssistant";
import { FloatingWhatsAppButton } from "@/components/inquiry/FloatingWhatsAppButton";
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt";
import { CommandPaletteProvider } from "@/components/v3/CommandPaletteProvider";

function NotFoundComponent() {
  useEffect(() => {
    // Signal to crawlers this URL should not be indexed.
    const m = document.createElement("meta");
    m.name = "robots";
    m.content = "noindex, follow";
    document.head.appendChild(m);
    const prevTitle = document.title;
    document.title = "الصفحة غير موجودة (404) — مجمع باعشن الطبي";
    return () => {
      m.remove();
      document.title = prevTitle;
    };
  }, []);

  const popular: { to: string; ar: string; en: string }[] = [
    { to: "/", ar: "الرئيسية", en: "Home" },
    { to: "/book", ar: "احجز موعداً", en: "Book appointment" },
    { to: "/doctors", ar: "الأطباء", en: "Doctors" },
    { to: "/specialties", ar: "التخصصات", en: "Specialties" },
    { to: "/services", ar: "الخدمات", en: "Services" },
    { to: "/branches", ar: "الفروع", en: "Branches" },
    { to: "/health", ar: "المدونة الصحية", en: "Health blog" },
    { to: "/contact", ar: "تواصل معنا", en: "Contact" },
  ];

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <div className="max-w-2xl w-full text-center">
        <h1 className="text-7xl font-bold text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          الصفحة غير موجودة / Page not found
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          الصفحة التي تبحث عنها غير متاحة. جرّب أحد الروابط الشائعة أدناه.
        </p>
        <nav
          aria-label="روابط مقترحة"
          className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm"
        >
          {popular.map((p) => (
            <Link
              key={p.to}
              to={p.to}
              className="rounded-md border border-input px-3 py-3 hover:bg-muted transition-colors"
            >
              <div className="font-medium text-foreground">{p.ar}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{p.en}</div>
            </Link>
          ))}
        </nav>
        <div className="mt-8">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            العودة إلى الصفحة الرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    import("@/lib/observability/error-reporter")
      .then((m) => m.reportBrowserError(error, { mechanism: "react_error_boundary" }))
      .catch(() => void 0);
  }, [error]);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">لم يتم تحميل الصفحة</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          حدث خطأ، حاول التحديث أو العودة للرئيسية.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            حاول مجددًا
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium"
          >
            الرئيسية
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "مجمع باعشن الطبي  Baeshen Medical" },
      {
        name: "description",
        content:
          "مجمع طبي معتمد من CBAHI في صبيا بمنطقة جازان. خدمات طبية عامة وتخصصية، صيدلية داخلية، حجز إلكتروني وتوصيل أدوية.",
      },
      { name: "author", content: "Baeshen Medical Complex" },
      { property: "og:title", content: "مجمع باعشن الطبي  Baeshen Medical" },
      {
        property: "og:description",
        content:
          "مجمع طبي معتمد من CBAHI في صبيا بمنطقة جازان. خدمات طبية عامة وتخصصية، صيدلية داخلية، حجز إلكتروني وتوصيل أدوية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "مجمع باعشن الطبي  Baeshen Medical" },
      {
        name: "twitter:description",
        content:
          "مجمع طبي معتمد من CBAHI في صبيا بمنطقة جازان. خدمات طبية عامة وتخصصية، صيدلية داخلية، حجز إلكتروني وتوصيل أدوية.",
      },
      { name: "theme-color", content: "#0f766e" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Baeshen Medical" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "google-site-verification", content: "KUMW5naK-6rJq8nQ6DciyVA2SgVBInRRqhY6WKbaB3U" },
      // og:image / twitter:image are set per-leaf (root would override every child).
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16.png" },
      { rel: "shortcut icon", href: "/favicon.ico" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "MedicalOrganization",
          "@id": "https://bashenmedical.com/#organization",
          name: "مجمع باعشن الطبي",
          alternateName: "Baeshen Medical Complex",
          url: "https://bashenmedical.com",
          logo: "https://bashenmedical.com/apple-touch-icon.png",
          image: "https://bashenmedical.com/og-image.jpg",
          description:
            "مجمع طبي معتمد من CBAHI في صبيا بمنطقة جازان — خدمات طبية عامة وتخصصية، صيدلية داخلية، حجز إلكتروني وتوصيل أدوية.",
          medicalSpecialty: [
            "GeneralPractice",
            "InternalMedicine",
            "Pediatric",
            "Obstetric",
            "Dentistry",
            "Dermatology",
            "Ophthalmologic",
            "Otolaryngologic",
            "Orthopedic",
            "Cardiovascular",
          ],
          address: {
            "@type": "PostalAddress",
            addressLocality: "Sabya",
            addressRegion: "Jazan",
            addressCountry: "SA",
          },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          "@id": "https://bashenmedical.com/#website",
          url: "https://bashenmedical.com",
          name: "مجمع باعشن الطبي",
          alternateName: "Baeshen Medical",
          inLanguage: ["ar-SA", "en"],
          publisher: { "@id": "https://bashenmedical.com/#organization" },
          potentialAction: {
            "@type": "SearchAction",
            target: {
              "@type": "EntryPoint",
              urlTemplate: "https://bashenmedical.com/health/search?q={query}",
            },
            "query-input": "required name=query",
          },
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    // Client-only web-vitals sampler (LCP/CLS/INP/FCP/TTFB).
    // Fails silently if the collector endpoint isn't live yet — safe to ship.
    import("@/lib/observability/web-vitals").then((m) => m.startWebVitals()).catch(() => void 0);
    // E1 Observability — install browser error reporter (window.onerror + unhandledrejection).
    import("@/lib/observability/error-reporter")
      .then((m) => m.installBrowserErrorReporter())
      .catch(() => void 0);
  }, []);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAuthRoute = pathname === "/auth" || pathname.startsWith("/auth/");

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <JazanSettingsProvider>
          <div className="min-h-dvh flex flex-col">
            {!isAuthRoute && <AnnouncementBar />}
            {!isAuthRoute && <Header />}
            <main className="flex-1">
              <Outlet />
            </main>
            {!isAuthRoute && <Footer />}
            <Toaster position="top-center" richColors closeButton />
            {!isAuthRoute && <BaeshenAssistant />}
            {!isAuthRoute && <FloatingWhatsAppButton />}
            <PwaUpdatePrompt />
            {!isAuthRoute && <CommandPaletteProvider />}
          </div>
        </JazanSettingsProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
