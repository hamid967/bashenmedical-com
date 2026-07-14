import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { lazy, Suspense, useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { I18nProvider } from "@/lib/i18n";
import { Header } from "@/components/Header";
import { AnnouncementBar } from "@/components/AnnouncementBar";
import { Footer } from "@/components/Footer";
import { Toaster } from "sonner";
const JazanIntro = lazy(() =>
  import("@/components/JazanIntro").then((m) => ({ default: m.JazanIntro })),
);
import { ChatbotBubble } from "@/components/ChatbotBubble";
import { FloatingWhatsAppButton } from "@/components/inquiry/FloatingWhatsAppButton";
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          الصفحة غير موجودة / Page not found
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">الصفحة التي تبحث عنها غير متاحة.</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            الصفحة الرئيسية
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
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
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
        content: "مجمع طبي معتمد من CBAHI في صبيا بمنطقة جازان. خدمات طبية عامة وتخصصية، صيدلية داخلية، حجز إلكتروني وتوصيل أدوية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "مجمع باعشن الطبي  Baeshen Medical" },
      { name: "twitter:description", content: "مجمع طبي معتمد من CBAHI في صبيا بمنطقة جازان. خدمات طبية عامة وتخصصية، صيدلية داخلية، حجز إلكتروني وتوصيل أدوية." },
      { name: "theme-color", content: "#0f766e" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Baeshen Medical" },
      { name: "mobile-web-app-capable", content: "yes" },
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
        href: "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800&family=Figtree:wght@400;500;600;700&display=swap",
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
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <Suspense fallback={null}>
          <JazanIntro />
        </Suspense>
        <div className="min-h-screen flex flex-col">
          <AnnouncementBar />
          <Header />
          <main className="flex-1">
            <Outlet />
          </main>
          <Footer />
          <Toaster position="top-center" richColors closeButton />
          <ChatbotBubble />
          <FloatingWhatsAppButton />
          <PwaUpdatePrompt />
        </div>
      </I18nProvider>
    </QueryClientProvider>
  );
}

