/**
 * /portal/settings — Notification, language, and appearance preferences.
 */
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, Bell, CheckCircle2, Globe, Loader2, Mail, MessageSquare,
  MonitorSmartphone, RefreshCw, Save, Send, ShieldCheck, Smartphone, XCircle,
} from "lucide-react";
import { getMyProfile, updateMyProfile } from "@/lib/portal/portal.functions";
import { supabase } from "@/integrations/supabase/client";
import { MutationErrorBanner } from "@/components/portal/MutationErrorBanner";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { PortalPageHeader, PortalCard, PortalSkeleton } from "@/components/portal/ui";

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

  // Test-send per channel (mock delivery to demo data). Push uses the real
  // browser Notification API when a subscription is active.
  // browser Notification API when a subscription is active.
  const [testing, setTesting] = useState<keyof Prefs | null>(null);
  const [results, setResults] = useState<Partial<Record<keyof Prefs, TestResult>>>({});
  const [userEmail, setUserEmail] = useState<string>("");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? ""));
  }, []);
  const contact = {
    email: userEmail,
    sms: p?.phone ?? "",
    whatsapp: p?.phone ?? "",
  };
  const sendTest = async (k: keyof Prefs) => {
    setTesting(k);
    try {
      if (!prefs[k]) throw new Error(`القناة موقوفة — فعّلها أولاً`);
      if (k === "push") {
        if (push.state !== "granted" || !push.subscribed) {
          throw new Error("فعّل إشعارات المتصفح أولاً");
        }
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("إشعار اختبار — مستشفى باشن", {
            body: "هذه رسالة تجريبية للتأكد من عمل الإشعارات.",
            icon: "/favicon.ico",
          });
        }
        setResults((r) => ({ ...r, push: { ok: true, msg: "تم عرض إشعار متصفح تجريبي", at: Date.now() } }));
        toast.success("تم إرسال إشعار الاختبار");
        return;
      }
      const target = contact[k as "email" | "sms" | "whatsapp"];
      if (!target) throw new Error("لا توجد بيانات تواصل محفوظة لهذه القناة");
      // Simulated dispatch to demo data (no external provider wired yet).
      await new Promise((res) => setTimeout(res, 700));
      const msg =
        k === "email" ? `تم إرسال بريد اختبار إلى ${target}` :
        k === "sms" ? `تم إرسال SMS تجريبي إلى ${target}` :
        `تم إرسال رسالة واتساب تجريبية إلى ${target}`;
      setResults((r) => ({ ...r, [k]: { ok: true, msg, at: Date.now() } }));
      toast.success(msg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذّر إرسال إشعار الاختبار";
      setResults((r) => ({ ...r, [k]: { ok: false, msg, at: Date.now() } }));
      toast.error(msg);
    } finally {
      setTesting(null);
    }
  };

  const mut = useMutation({
    mutationFn: () =>
      updateMyProfile({
        data: {
          preferred_language: lang,
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
    <div dir="rtl">
      <PortalPageHeader
        title="الإعدادات"
        description="قنوات التنبيه، اللغة، ومظهر البوابة"
        breadcrumbs={[{ label: "البوابة", to: "/portal" }, { label: "الإعدادات" }]}
      />

      {mut.isError && (
        <div className="mb-4">
          <MutationErrorBanner
            message={mut.error instanceof Error ? mut.error.message : "تعذّر حفظ الإعدادات"}
            onRetry={() => mut.mutate()}
            retrying={mut.isPending}
          />
        </div>
      )}

      <PortalCard as="section" className="p-5 sm:p-6 space-y-4">
        <h2 className="text-sm font-semibold text-[color:var(--portal-ink-2)]">قنوات الإشعارات</h2>
        <Toggle icon={<Mail className="h-4 w-4" />} label="البريد الإلكتروني" desc="تذكيرات المواعيد وتحديثات التقارير"
          value={prefs.email} busy={savingKey === "email"} onChange={(v) => savePref("email", v)}
          onTest={() => sendTest("email")} testing={testing === "email"} result={results.email} />
        <Toggle icon={<MessageSquare className="h-4 w-4" />} label="الرسائل النصية (SMS)" desc="تنبيهات فورية على جوالك"
          value={prefs.sms} busy={savingKey === "sms"} onChange={(v) => savePref("sms", v)}
          onTest={() => sendTest("sms")} testing={testing === "sms"} result={results.sms} />
        <Toggle icon={<Smartphone className="h-4 w-4" />} label="واتساب" desc="رسائل تأكيد وتذكير عبر واتساب"
          value={prefs.whatsapp} busy={savingKey === "whatsapp"} onChange={(v) => savePref("whatsapp", v)}
          onTest={() => sendTest("whatsapp")} testing={testing === "whatsapp"} result={results.whatsapp} />
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
          onTest={() => sendTest("push")}
          testing={testing === "push"}
          result={results.push}
        />
      </PortalCard>

      <PortalCard as="section" className="p-5 sm:p-6 mt-6 space-y-4">
        <h2 className="text-sm font-semibold text-[color:var(--portal-ink-2)]">التخصيص</h2>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Globe className="h-4 w-4 text-[color:var(--portal-ink-2)]" />
            <div>
              <div className="text-sm font-semibold text-[color:var(--portal-ink)]">لغة البوابة</div>
              <div className="text-xs text-[color:var(--portal-ink-2)]">تُطبَّق على الواجهات والإشعارات</div>
            </div>
          </div>
          <div className="inline-flex rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-surface)] p-1">
            {(["ar", "en"] as const).map((k) => {
              const active = lang === k;
              return (
                <button key={k} type="button" onClick={() => { setLang(k); setDirty(true); }}
                  className={`px-3 h-7 rounded-full text-xs font-semibold ${active ? "text-[color:var(--portal-on-primary)]" : "text-[color:var(--portal-ink-2)]"}`}
                  style={active ? { background: "var(--portal-gradient)" } : undefined}>
                  {k === "ar" ? "العربية" : "English"}
                </button>
              );
            })}
          </div>
        </div>
      </PortalCard>

      <PortalCard as="section" className="p-5 sm:p-6 mt-6">
        <h2 className="text-sm font-semibold text-[color:var(--portal-ink-2)] mb-3">الخصوصية والأمان</h2>
        <div className="space-y-2 text-sm">
          <Link to="/portal/consents" className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-surface)] px-4 py-3 hover:bg-[color:var(--portal-surface-2)]">
            <span className="flex items-center gap-2 text-[color:var(--portal-ink)]"><ShieldCheck className="h-4 w-4" />الموافقات وسياسات الخصوصية</span>
            <ArrowLeft className="h-4 w-4 text-[color:var(--portal-ink-2)] -rotate-180" />
          </Link>
        </div>
      </PortalCard>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={signOut} disabled={signingOut}
          className="h-10 px-4 rounded-full border border-[color:var(--portal-error-50)] bg-[color:var(--portal-surface)] text-sm text-[color:var(--portal-error)] hover:bg-[color:var(--portal-error-50)] inline-flex items-center gap-2 disabled:opacity-60">
          {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          تسجيل الخروج
        </button>
        <button type="button" onClick={() => mut.mutate()} disabled={!dirty || mut.isPending}
          className="inline-flex items-center gap-2 h-10 px-5 rounded-full text-sm font-semibold text-[color:var(--portal-on-primary)] disabled:opacity-60"
          style={{ background: "var(--portal-gradient)" }}>
          {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          حفظ التعديلات
        </button>
      </div>
    </div>
  );
}

type TestResult = { ok: boolean; msg: string; at: number };

function Toggle({
  icon, label, desc, value, onChange, busy, disabled, onTest, testing, result,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
  busy?: boolean;
  disabled?: boolean;
  onTest?: () => void;
  testing?: boolean;
  result?: TestResult;
}) {
  return (
    <div className={`rounded-xl border border-[color:var(--portal-border)] bg-white px-4 py-3 ${disabled ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-lg grid place-items-center bg-slate-50 text-[color:var(--portal-ink-2)]">{icon}</div>
          <div>
            <div className="text-sm font-semibold text-[color:var(--portal-ink)]">{label}</div>
            <div className="text-xs text-[color:var(--portal-ink-2)]">{desc}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onTest && (
            <button
              type="button"
              onClick={onTest}
              disabled={disabled || testing || !value}
              title={!value ? "فعّل القناة أولاً" : "إرسال إشعار اختبار"}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-full border border-[color:var(--portal-border)] bg-white text-xs font-semibold text-[color:var(--portal-ink)] hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              اختبار
            </button>
          )}
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-[color:var(--portal-ink-2)]" />}
          <Switch value={value} onChange={onChange} disabled={disabled || busy} />
        </div>
      </div>
      {result && (
        <div
          role="status"
          className={`mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
            result.ok ? "bg-emerald-50 text-emerald-800 border border-emerald-100" : "bg-red-50 text-red-800 border border-red-100"
          }`}
        >
          {result.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
          <span className="flex-1">{result.msg}</span>
          <span className="text-[10px] opacity-70">{new Date(result.at).toLocaleTimeString("ar-SA")}</span>
        </div>
      )}
    </div>
  );
}

function Switch({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={value} disabled={disabled} onClick={() => onChange(!value)}
      className={`h-6 w-11 rounded-full transition relative disabled:cursor-not-allowed ${value ? "bg-[color:var(--portal-success)]" : "bg-[color:var(--portal-surface-3)]"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-[color:var(--portal-surface)] shadow transition-all ${value ? "right-0.5" : "right-[calc(100%-1.375rem)]"}`} />
    </button>
  );
}

function Skeleton() {
  return (
    <div dir="rtl">
      <div className="h-11 w-56 rounded-2xl bg-[color:var(--portal-surface-3)] animate-pulse mb-6" />
      {[0, 1, 2].map((i) => (
        <PortalCard key={i} className="p-6 mb-4 space-y-3">
          {[0, 1, 2, 3].map((j) => <PortalSkeleton key={j} className="h-12" />)}
        </PortalCard>
      ))}
    </div>
  );
}
function ErrorState({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div dir="rtl" className="grid place-items-center p-6">
      <PortalCard className="max-w-md w-full p-8 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-[color:var(--portal-error)] mb-2" />
        <h2 className="text-lg font-bold text-[color:var(--portal-ink)]">تعذّر تحميل الإعدادات</h2>
        <p className="mt-2 text-sm text-[color:var(--portal-ink-2)]">{error.message}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="h-10 px-4 rounded-full text-[color:var(--portal-on-primary)] text-sm font-semibold" style={{ background: "var(--portal-gradient)" }}>
            <RefreshCw className="inline h-4 w-4 ms-1" />حاول مجددًا
          </button>
          <Link to="/portal" className="h-10 px-4 rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-surface)] text-sm inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />العودة
          </Link>
        </div>
      </PortalCard>
    </div>
  );
}
