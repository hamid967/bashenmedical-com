/**
 * /portal/reminder-preferences — Patient reminder preferences.
 * Channels (in-app / email / SMS), frequency, lead times, quiet hours.
 */
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Bell, BellRing, Loader2, Mail, MessageCircle, MessageSquare, RefreshCw, Save, Smartphone } from "lucide-react";
import {
  getMyReminderPreferences,
  updateMyReminderPreferences,
  sendTestNotification,
  type ReminderPreferences,
  type TestChannel,
} from "@/lib/portal/reminder-preferences.functions";
import { Send } from "lucide-react";

const prefsQuery = queryOptions({
  queryKey: ["portal", "reminder-preferences"],
  queryFn: () => getMyReminderPreferences(),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/portal/reminder-preferences")({
  loader: ({ context }) => context.queryClient.ensureQueryData(prefsQuery),
  head: () => ({
    meta: [
      { title: "تفضيلات التنبيهات | بوابة المريض" },
      { name: "description", content: "اختر قنوات وتكرار التذكيرات والإشعارات الخاصة بك." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PrefsPage,
  errorComponent: ErrorState,
  pendingComponent: Skeleton,
});

function PrefsPage() {
  const q = useSuspenseQuery(prefsQuery);
  const qc = useQueryClient();
  const [form, setForm] = useState<ReminderPreferences>(q.data);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setForm(q.data);
    setDirty(false);
  }, [q.data]);

  const set = <K extends keyof ReminderPreferences>(k: K, v: ReminderPreferences[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const mut = useMutation({
    mutationFn: (payload: ReminderPreferences) => updateMyReminderPreferences({ data: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal", "reminder-preferences"] });
      toast.success("تم حفظ تفضيلات التنبيهات");
      setDirty(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "تعذّر الحفظ"),
  });

  const [testing, setTesting] = useState<TestChannel | null>(null);
  const testMut = useMutation({
    mutationFn: (channel: TestChannel) => sendTestNotification({ data: { channel } }),
    onMutate: (channel) => setTesting(channel),
    onSettled: () => setTesting(null),
    onSuccess: (res) => {
      toast.success(res.note, { description: res.preview, duration: 6000 });
      qc.invalidateQueries({ queryKey: ["portal", "notifications"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "تعذّر إرسال الاختبار"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const anyChannel =
      form.channel_in_app || form.channel_email || form.channel_sms ||
      form.channel_whatsapp || form.channel_push;
    if (!anyChannel) {
      toast.error("اختر قناة إشعار واحدة على الأقل");
      return;
    }
    mut.mutate(form);
  };

  return (
    <div className="mx-auto max-w-3xl" dir="rtl">
        <header className="mb-6 flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl grid place-items-center text-[color:var(--portal-on-primary)]" style={{ background: "var(--portal-gradient)" }}>
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[color:var(--portal-ink)]">تفضيلات التنبيهات</h1>
            <p className="text-xs sm:text-sm text-[color:var(--portal-ink-2)]">اختر كيف ومتى تصلك التذكيرات والإشعارات.</p>
          </div>
        </header>

        <form onSubmit={submit} className="glass-card p-5 sm:p-6 space-y-8">
          <Section title="قنوات الإشعار" hint="اختر قناة واحدة على الأقل. سنستخدم القنوات المفعّلة معًا حسب توفّرها.">
            <ChannelToggle
              icon={<Bell className="h-4 w-4" />}
              label="داخل التطبيق"
              hint="إشعارات فورية داخل بوابة المريض."
              checked={form.channel_in_app}
              onChange={(v) => set("channel_in_app", v)}
            />
            <ChannelToggle
              icon={<BellRing className="h-4 w-4" />}
              label="إشعارات المتصفح (Push)"
              hint="تظهر على جهازك حتى وإن لم تكن البوابة مفتوحة."
              checked={form.channel_push}
              onChange={(v) => set("channel_push", v)}
            />
            <ChannelToggle
              icon={<Mail className="h-4 w-4" />}
              label="البريد الإلكتروني"
              hint="عند توفر بريدك في الملف الشخصي."
              checked={form.channel_email}
              onChange={(v) => set("channel_email", v)}
            />
            <ChannelToggle
              icon={<MessageSquare className="h-4 w-4" />}
              label="رسالة SMS"
              hint="عند توفر رقم جوالك المُتحقق منه."
              checked={form.channel_sms}
              onChange={(v) => set("channel_sms", v)}
            />
            <ChannelToggle
              icon={<MessageCircle className="h-4 w-4" />}
              label="واتساب"
              hint="نرسل عبر واتساب الأعمال عند توفّر تكامل الرسائل."
              checked={form.channel_whatsapp}
              onChange={(v) => set("channel_whatsapp", v)}
            />
          </Section>

          <Section title="تكرار التنبيهات">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(
                [
                  { v: "immediate", label: "فوري", hint: "عند وقوع الحدث" },
                  { v: "daily", label: "ملخص يومي", hint: "مرة واحدة يوميًا" },
                  { v: "weekly", label: "ملخص أسبوعي", hint: "مرة واحدة أسبوعيًا" },
                ] as const
              ).map((opt) => {
                const active = form.frequency === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => set("frequency", opt.v)}
                    className={`text-right rounded-2xl border p-4 transition ${
                      active
                        ? "border-[color:var(--portal-primary)] bg-[color:var(--portal-primary)]/5"
                        : "border-[color:var(--portal-border)] bg-[color:var(--portal-surface)] hover:border-[color:var(--portal-primary)]/40"
                    }`}
                  >
                    <div className="text-sm font-semibold text-[color:var(--portal-ink)]">{opt.label}</div>
                    <div className="text-[11px] text-[color:var(--portal-ink-2)] mt-1">{opt.hint}</div>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="مواعيد الإرسال (تذكيرات المواعيد والدواء)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="تذكير الموعد قبل (بالدقائق)">
                <input
                  type="number" min={0} max={10080}
                  value={form.appointment_lead_minutes}
                  onChange={(e) => set("appointment_lead_minutes", Math.max(0, Number(e.target.value) || 0))}
                  className={inputCls}
                />
              </Field>
              <Field label="تذكير الدواء قبل (بالدقائق)">
                <input
                  type="number" min={0} max={1440}
                  value={form.medication_lead_minutes}
                  onChange={(e) => set("medication_lead_minutes", Math.max(0, Number(e.target.value) || 0))}
                  className={inputCls}
                />
              </Field>
            </div>
          </Section>

          <Section title="ساعات الهدوء" hint="لا تُرسل تنبيهات خارج نطاق ساعات نشاطك.">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.quiet_hours_enabled}
                onChange={(e) => set("quiet_hours_enabled", e.target.checked)}
              />
              تفعيل ساعات الهدوء
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="بداية النشاط (ساعة اليوم)">
                <input
                  type="number" min={0} max={23}
                  disabled={!form.quiet_hours_enabled}
                  value={form.wake_hour}
                  onChange={(e) => set("wake_hour", Math.min(23, Math.max(0, Number(e.target.value) || 0)))}
                  className={inputCls}
                />
              </Field>
              <Field label="نهاية النشاط (ساعة اليوم)">
                <input
                  type="number" min={0} max={23}
                  disabled={!form.quiet_hours_enabled}
                  value={form.sleep_hour}
                  onChange={(e) => set("sleep_hour", Math.min(23, Math.max(0, Number(e.target.value) || 0)))}
                  className={inputCls}
                />
              </Field>
            </div>
          </Section>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[color:var(--portal-border)]">
            <p className="text-[11px] text-[color:var(--portal-ink-2)] inline-flex items-center gap-1">
              <Smartphone className="h-3.5 w-3.5" />
              فعّل إشعارات المتصفح من صفحة{" "}
              <Link to="/portal/notifications" className="underline">الإشعارات</Link>.
            </p>
            <div className="flex gap-2">
              <Link to="/portal" className="h-10 px-4 rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-surface)] text-sm inline-flex items-center">
                إلغاء
              </Link>
              <button
                type="submit"
                disabled={!dirty || mut.isPending}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-full text-sm font-semibold text-[color:var(--portal-on-primary)] disabled:opacity-60"
                style={{ background: "var(--portal-gradient)" }}
              >
                {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                حفظ التفضيلات
              </button>
            </div>
          </div>
        </form>
      </div>
  );
}

const inputCls =
  "w-full h-10 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-surface)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--portal-primary)]/30 disabled:opacity-50";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--portal-ink)]">{title}</h2>
        {hint && <p className="text-[11px] text-[color:var(--portal-ink-2)]">{hint}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-[color:var(--portal-ink)]">{label}</span>
      {children}
    </label>
  );
}

function ChannelToggle({
  icon, label, hint, checked, onChange,
}: {
  icon: React.ReactNode; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className={`flex items-center gap-3 rounded-2xl border p-4 cursor-pointer transition ${
      checked
        ? "border-[color:var(--portal-primary)] bg-[color:var(--portal-primary)]/5"
        : "border-[color:var(--portal-border)] bg-[color:var(--portal-surface)] hover:border-[color:var(--portal-primary)]/40"
    }`}>
      <div className="h-9 w-9 rounded-xl grid place-items-center bg-[color:var(--portal-primary)]/10 text-[color:var(--portal-primary)]">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-[color:var(--portal-ink)]">{label}</div>
        <div className="text-[11px] text-[color:var(--portal-ink-2)]">{hint}</div>
      </div>
      <input
        type="checkbox"
        className="h-5 w-5 accent-[color:var(--portal-primary)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

function Skeleton() {
  return (
    <div className="mx-auto max-w-3xl" dir="rtl">
        <div className="h-11 w-64 rounded-2xl bg-slate-200/60 animate-pulse mb-6" />
        <div className="glass-card p-6 space-y-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 rounded-xl bg-slate-200/60 animate-pulse" />
          ))}
        </div>
      </div>
  );
}

function ErrorState({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="portal-root portal-gradient-bg min-h-dvh grid place-items-center p-6" dir="rtl">
      <div className="glass-card max-w-md w-full p-8 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-red-500 mb-2" />
        <h2 className="text-lg font-bold">تعذّر تحميل التفضيلات</h2>
        <p className="mt-2 text-sm text-[color:var(--portal-ink-2)]">{error.message}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 h-10 px-4 rounded-full text-[color:var(--portal-on-primary)] text-sm font-semibold inline-flex items-center gap-1"
          style={{ background: "var(--portal-gradient)" }}
        >
          <RefreshCw className="h-4 w-4" /> حاول مجددًا
        </button>
      </div>
    </div>
  );
}
