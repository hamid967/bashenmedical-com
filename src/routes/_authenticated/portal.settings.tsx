/**
 * /portal/settings — Notification, language, and appearance preferences.
 */
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, Bell, CheckCircle2, Globe, Loader2, Mail, MessageSquare, Moon,
  RefreshCw, Save, Send, Settings as SettingsIcon, ShieldCheck, Smartphone, Sun, XCircle,
} from "lucide-react";
import { getMyProfile, updateMyProfile } from "@/lib/portal/portal.functions";
import { supabase } from "@/integrations/supabase/client";
import { MutationErrorBanner } from "@/components/portal/MutationErrorBanner";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const profileQuery = queryOptions({
  queryKey: ["portal", "my-profile-full"],
  queryFn: () => getMyProfile(),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/portal/settings")({
  loader: ({ context }) => context.queryClient.ensureQueryData(profileQuery),
  head: () => ({
    meta: [
      { title: "الإعدادات | بوابة المريض" },
      { name: "description", content: "قنوات الإشعارات، اللغة، ووضع العرض." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
  errorComponent: ErrorState,
  pendingComponent: Skeleton,
});

type Prefs = { email: boolean; sms: boolean; whatsapp: boolean; push: boolean };

function SettingsPage() {
  const q = useSuspenseQuery(profileQuery);
  const qc = useQueryClient();
  const p = q.data;
  const initial: Prefs = {
    email: (p?.notification_prefs as Prefs)?.email ?? true,
    sms: (p?.notification_prefs as Prefs)?.sms ?? true,
    whatsapp: (p?.notification_prefs as Prefs)?.whatsapp ?? true,
    push: (p?.notification_prefs as Prefs)?.push ?? false,
  };
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [lang, setLang] = useState<"ar" | "en">((p?.preferred_language as "ar" | "en") ?? "ar");
  const [dark, setDark] = useState<boolean>(!!p?.dark_mode);
  const [dirty, setDirty] = useState(false);
  useEffect(() => setDirty(false), [p?.id]);

  const push = usePushNotifications(true);

  // Auto-save one preference and roll back on failure.
  const [savingKey, setSavingKey] = useState<keyof Prefs | null>(null);
  const CHANNEL_LABEL: Record<keyof Prefs, string> = {
    email: "البريد الإلكتروني",
    sms: "الرسائل النصية",
    whatsapp: "واتساب",
    push: "إشعارات المتصفح",
  };
  const savePref = async (k: keyof Prefs, v: boolean) => {
    const prev = prefs;
    const next = { ...prev, [k]: v };
    setPrefs(next);
    setSavingKey(k);
    try {
      await updateMyProfile({ data: { notification_prefs: next } });
      qc.invalidateQueries({ queryKey: ["portal", "my-profile-full"] });
      qc.invalidateQueries({ queryKey: ["portal", "my-profile"] });
      toast.success(v ? `تم تفعيل ${CHANNEL_LABEL[k]}` : `تم إيقاف ${CHANNEL_LABEL[k]}`);
    } catch (e) {
      setPrefs(prev);
      toast.error(e instanceof Error ? e.message : "تعذّر حفظ التفضيل");
    } finally {
      setSavingKey(null);
    }
  };

  const onPushToggle = async (v: boolean) => {
    // Real browser activation: request permission and register/remove subscription
    // before persisting the preference so a saved "on" always matches a live sub.
    try {
      if (v) {
        await push.subscribe();
        if (Notification.permission !== "granted") return; // subscribe already toasted
      } else {
        await push.unsubscribe();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحديث حالة الإشعارات");
      return;
    }
    await savePref("push", v);
  };

  const mut = useMutation({
    mutationFn: () =>
      updateMyProfile({
        data: {
          preferred_language: lang,
          dark_mode: dark,
          notification_prefs: prefs,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal", "my-profile-full"] });
      qc.invalidateQueries({ queryKey: ["portal", "my-profile"] });
      toast.success("تم حفظ الإعدادات");
      setDirty(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "تعذّر الحفظ"),
  });

  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();
  const signOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    qc.clear();
    router.navigate({ to: "/auth" });
  };

  return (
    <div className="portal-root portal-gradient-bg min-h-dvh" dir="rtl">
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
        <header className="mb-6 flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl grid place-items-center text-white" style={{ background: "var(--portal-gradient)" }}>
            <SettingsIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[color:var(--portal-ink)]">الإعدادات</h1>
            <p className="text-xs sm:text-sm text-[color:var(--portal-ink-2)]">قنوات التنبيه، اللغة، ومظهر البوابة</p>
          </div>
        </header>

        {mut.isError && (
          <div className="mb-4">
            <MutationErrorBanner
              message={mut.error instanceof Error ? mut.error.message : "تعذّر حفظ الإعدادات"}
              onRetry={() => mut.mutate()}
              retrying={mut.isPending}
            />
          </div>
        )}

        <section className="glass-card p-5 sm:p-6 space-y-4">
          <h2 className="text-sm font-semibold text-[color:var(--portal-ink-2)]">قنوات الإشعارات</h2>
          <Toggle icon={<Mail className="h-4 w-4" />} label="البريد الإلكتروني" desc="تذكيرات المواعيد وتحديثات التقارير"
            value={prefs.email} busy={savingKey === "email"} onChange={(v) => savePref("email", v)} />
          <Toggle icon={<MessageSquare className="h-4 w-4" />} label="الرسائل النصية (SMS)" desc="تنبيهات فورية على جوالك"
            value={prefs.sms} busy={savingKey === "sms"} onChange={(v) => savePref("sms", v)} />
          <Toggle icon={<Smartphone className="h-4 w-4" />} label="واتساب" desc="رسائل تأكيد وتذكير عبر واتساب"
            value={prefs.whatsapp} busy={savingKey === "whatsapp"} onChange={(v) => savePref("whatsapp", v)} />
          <Toggle
            icon={<Bell className="h-4 w-4" />}
            label="إشعارات المتصفح (Push)"
            desc={
              push.state === "unsupported"
                ? "غير مدعوم في هذا المتصفح"
                : push.state === "denied"
                  ? "الإذن مرفوض — فعّل الإشعارات من إعدادات المتصفح"
                  : "تنبيه لحظي داخل المتصفح"
            }
            value={prefs.push && push.subscribed}
            disabled={push.state === "unsupported" || push.state === "denied"}
            busy={push.busy || savingKey === "push"}
            onChange={onPushToggle}
          />
        </section>

        <section className="glass-card p-5 sm:p-6 mt-6 space-y-4">
          <h2 className="text-sm font-semibold text-[color:var(--portal-ink-2)]">التخصيص</h2>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Globe className="h-4 w-4 text-[color:var(--portal-ink-2)]" />
              <div>
                <div className="text-sm font-semibold text-[color:var(--portal-ink)]">لغة البوابة</div>
                <div className="text-xs text-[color:var(--portal-ink-2)]">تُطبَّق على الواجهات والإشعارات</div>
              </div>
            </div>
            <div className="inline-flex rounded-full border border-[color:var(--portal-border)] bg-white p-1">
              {(["ar", "en"] as const).map((k) => {
                const active = lang === k;
                return (
                  <button key={k} type="button" onClick={() => { setLang(k); setDirty(true); }}
                    className={`px-3 h-7 rounded-full text-xs font-semibold ${active ? "text-white" : "text-[color:var(--portal-ink-2)]"}`}
                    style={active ? { background: "var(--portal-gradient)" } : undefined}>
                    {k === "ar" ? "العربية" : "English"}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {dark ? <Moon className="h-4 w-4 text-[color:var(--portal-ink-2)]" /> : <Sun className="h-4 w-4 text-[color:var(--portal-ink-2)]" />}
              <div>
                <div className="text-sm font-semibold text-[color:var(--portal-ink)]">الوضع الداكن</div>
                <div className="text-xs text-[color:var(--portal-ink-2)]">راحة أفضل للعين ليلاً</div>
              </div>
            </div>
            <Switch value={dark} onChange={(v) => { setDark(v); setDirty(true); }} />
          </div>
        </section>

        <section className="glass-card p-5 sm:p-6 mt-6">
          <h2 className="text-sm font-semibold text-[color:var(--portal-ink-2)] mb-3">الخصوصية والأمان</h2>
          <div className="space-y-2 text-sm">
            <Link to="/portal/consents" className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--portal-border)] bg-white px-4 py-3 hover:bg-slate-50">
              <span className="flex items-center gap-2 text-[color:var(--portal-ink)]"><ShieldCheck className="h-4 w-4" />الموافقات وسياسات الخصوصية</span>
              <ArrowLeft className="h-4 w-4 text-[color:var(--portal-ink-2)] -rotate-180" />
            </Link>
          </div>
        </section>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={signOut} disabled={signingOut}
            className="h-10 px-4 rounded-full border border-red-200 bg-white text-sm text-red-700 hover:bg-red-50 inline-flex items-center gap-2 disabled:opacity-60">
            {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            تسجيل الخروج
          </button>
          <button type="button" onClick={() => mut.mutate()} disabled={!dirty || mut.isPending}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-full text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--portal-gradient)" }}>
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ التعديلات
          </button>
        </div>
      </main>
    </div>
  );
}

function Toggle({
  icon, label, desc, value, onChange, busy, disabled,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-xl border border-[color:var(--portal-border)] bg-white px-4 py-3 ${disabled ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-lg grid place-items-center bg-slate-50 text-[color:var(--portal-ink-2)]">{icon}</div>
        <div>
          <div className="text-sm font-semibold text-[color:var(--portal-ink)]">{label}</div>
          <div className="text-xs text-[color:var(--portal-ink-2)]">{desc}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-[color:var(--portal-ink-2)]" />}
        <Switch value={value} onChange={onChange} disabled={disabled || busy} />
      </div>
    </div>
  );
}
function Switch({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={value} disabled={disabled} onClick={() => onChange(!value)}
      className={`h-6 w-11 rounded-full transition relative disabled:cursor-not-allowed ${value ? "bg-emerald-500" : "bg-slate-300"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${value ? "right-0.5" : "right-[calc(100%-1.375rem)]"}`} />
    </button>
  );
}

function Skeleton() {
  return (
    <div className="portal-root portal-gradient-bg min-h-dvh" dir="rtl">
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
        <div className="h-11 w-56 rounded-2xl bg-slate-200/60 animate-pulse mb-6" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass-card p-6 mb-4 space-y-3">
            {[0, 1, 2, 3].map((j) => (
              <div key={j} className="h-12 rounded-xl bg-slate-200/60 animate-pulse" />
            ))}
          </div>
        ))}
      </main>
    </div>
  );
}
function ErrorState({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="portal-root portal-gradient-bg min-h-dvh grid place-items-center p-6" dir="rtl">
      <div className="glass-card max-w-md w-full p-8 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-red-500 mb-2" />
        <h2 className="text-lg font-bold">تعذّر تحميل الإعدادات</h2>
        <p className="mt-2 text-sm text-[color:var(--portal-ink-2)]">{error.message}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="h-10 px-4 rounded-full text-white text-sm font-semibold" style={{ background: "var(--portal-gradient)" }}>
            <RefreshCw className="inline h-4 w-4 ms-1" />حاول مجددًا
          </button>
          <Link to="/portal" className="h-10 px-4 rounded-full border border-[color:var(--portal-border)] bg-white text-sm inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />العودة
          </Link>
        </div>
      </div>
    </div>
  );
}
