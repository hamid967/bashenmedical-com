/**
 * Patient-facing "Install app" card. Shows the native A2HS prompt when
 * Chrome/Edge has captured `beforeinstallprompt`, or step-by-step Share →
 * "Add to Home Screen" instructions on iOS Safari. Hidden entirely when
 * the app is already running installed (display-mode: standalone).
 */
import { useState } from "react";
import { Smartphone, Share, PlusSquare, CheckCircle2, Download } from "lucide-react";
import { toast } from "sonner";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

const T = {
  title: { ar: "ثبّت التطبيق على جهازك", en: "Install the app on your device" },
  subtitle: {
    ar: "افتح باعشن مباشرة من الشاشة الرئيسية — أسرع، وبدون شريط المتصفح، ويعمل جزئيًا بدون إنترنت.",
    en: "Open Baeshen from your home screen — faster, no browser bar, and works partially offline.",
  },
  installBtn: { ar: "تثبيت الآن", en: "Install now" },
  installed: { ar: "التطبيق مثبّت على جهازك", en: "App is installed on this device" },
  iosTitle: { ar: "التثبيت على iPhone / iPad", en: "Install on iPhone / iPad" },
  iosStep1: { ar: "افتح هذا الرابط في Safari", en: "Open this page in Safari" },
  iosStep2: {
    ar: "اضغط زر المشاركة",
    en: "Tap the Share button",
  },
  iosStep3: {
    ar: 'اختر "إضافة إلى الشاشة الرئيسية"',
    en: 'Tap "Add to Home Screen"',
  },
  iosStep4: { ar: 'أكّد بالضغط على "إضافة"', en: 'Confirm by tapping "Add"' },
  unavailable: {
    ar: "التثبيت غير متاح على هذا المتصفح — استخدم Chrome أو Edge أو Safari (iOS).",
    en: "Install isn't available in this browser — use Chrome, Edge, or Safari (iOS).",
  },
};

type Lang = "ar" | "en";

function tr(key: keyof typeof T, lang: Lang): string {
  return T[key][lang];
}

export function InstallAppCard({ lang = "ar" }: { lang?: Lang }) {
  const { canPrompt, isInstalled, isIOS, promptInstall } = useInstallPrompt();
  const [busy, setBusy] = useState(false);

  if (isInstalled) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
        <div className="text-sm text-emerald-800 dark:text-emerald-200 font-medium">
          {tr("installed", lang)}
        </div>
      </div>
    );
  }

  const onInstall = async () => {
    setBusy(true);
    try {
      const outcome = await promptInstall();
      if (outcome === "unavailable") {
        toast.info(tr("unavailable", lang));
      } else if (outcome === "accepted") {
        toast.success(tr("installed", lang));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[color:var(--ac-border,#e5e7eb)] bg-[color:var(--ac-bg-2,#fff)] p-4 md:p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl grid place-items-center bg-teal-500/10 text-teal-600 shrink-0">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm md:text-base font-semibold">{tr("title", lang)}</h3>
          <p className="text-xs md:text-sm text-[color:var(--ac-ink-3,#64748b)] mt-1">
            {tr("subtitle", lang)}
          </p>
        </div>
      </div>

      {isIOS ? (
        <div className="rounded-xl bg-[color:var(--ac-bg-3,#f8fafc)] p-3 space-y-2 text-sm">
          <div className="font-medium text-xs uppercase tracking-wide text-[color:var(--ac-ink-3,#64748b)]">
            {tr("iosTitle", lang)}
          </div>
          <ol className="space-y-1.5 list-decimal pr-5 rtl:pr-5 ltr:pl-5 marker:text-teal-600">
            <li>{tr("iosStep1", lang)}</li>
            <li className="flex items-center gap-1.5 flex-wrap">
              <span>{tr("iosStep2", lang)}</span>
              <Share className="h-4 w-4 text-teal-600" />
            </li>
            <li className="flex items-center gap-1.5 flex-wrap">
              <span>{tr("iosStep3", lang)}</span>
              <PlusSquare className="h-4 w-4 text-teal-600" />
            </li>
            <li>{tr("iosStep4", lang)}</li>
          </ol>
        </div>
      ) : (
        <button
          type="button"
          onClick={onInstall}
          disabled={busy || !canPrompt}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Download className="h-4 w-4" />
          {canPrompt ? tr("installBtn", lang) : tr("unavailable", lang)}
        </button>
      )}
    </div>
  );
}
