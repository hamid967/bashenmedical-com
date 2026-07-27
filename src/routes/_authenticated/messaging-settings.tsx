/**
 * Admin — Messaging Settings
 * Configure the clinic WhatsApp number and inspect which OTP/SMS providers
 * are wired into the server runtime. Displays clear warnings when required
 * infrastructure is missing.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MessageCircle,
  Save,
  Shield,
  XCircle,
} from "lucide-react";
import { RequirePermission } from "@/components/rbac/RequirePermission";
import {
  getMessagingConfig,
  updateMessagingConfig,
  type MessagingConfig,
} from "@/lib/messaging-settings.functions";

export const Route = createFileRoute("/_authenticated/messaging-settings")({
  head: () => ({
    meta: [{ title: "إعدادات المراسلة | لوحة الأدمن" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <RequirePermission anyOf="settings.manage">
      <MessagingSettingsPage />
    </RequirePermission>
  ),
});

function MessagingSettingsPage() {
  const qc = useQueryClient();
  const getCfg = useServerFn(getMessagingConfig);
  const updateCfg = useServerFn(updateMessagingConfig);

  const { data, isLoading, error } = useQuery({
    queryKey: ["messaging-config"],
    queryFn: () => getCfg(),
    staleTime: 30_000,
  });

  const [whatsapp, setWhatsapp] = useState<string>("");
  useEffect(() => {
    if (data) setWhatsapp(data.whatsapp ?? "");
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (value: string) =>
      updateCfg({ data: { whatsapp: value.trim() ? value.trim() : null } }),
    onSuccess: () => {
      toast.success("تم حفظ إعدادات المراسلة");
      qc.invalidateQueries({ queryKey: ["messaging-config"] });
      qc.invalidateQueries({ queryKey: ["clinic-settings"] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "تعذّر الحفظ");
    },
  });

  return (
    <div dir="rtl" className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">إعدادات المراسلة</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            رقم واتساب المجمع وحالة مزوّدي SMS/OTP على الخادم.
          </p>
        </div>
        <Link
          to="/admin"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="h-4 w-4 rotate-180" /> رجوع
        </Link>
      </header>

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل…
        </div>
      ) : error ? (
        <ErrorBox message={(error as Error).message} />
      ) : data ? (
        <>
          <MissingConfigBanner cfg={data} />

          {/* WhatsApp */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <MessageCircle className="h-4 w-4 text-[#25D366]" />
              رقم واتساب المجمع
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              يُستخدم في زر الاستفسار العائم ورسائل التحويل. أدخل الرقم بصيغة دولية مثل{" "}
              <span dir="ltr" className="font-mono">
                +966555088623
              </span>
              .
            </p>
            <div className="mt-4 space-y-2">
              <label htmlFor="wa" className="text-xs font-semibold">
                رقم واتساب
              </label>
              <input
                id="wa"
                type="tel"
                dir="ltr"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="+966XXXXXXXXX"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <div className="flex items-center justify-between gap-2 pt-2">
                <span className="text-[11px] text-muted-foreground">
                  الأرقام فقط، مع علامة + للبادئة الدولية.
                </span>
                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate(whatsapp)}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {mutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  حفظ
                </button>
              </div>
            </div>
          </section>

          {/* Providers */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Shield className="h-4 w-4 text-primary" />
              حالة مزوّدي OTP / SMS
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              الحالة تُقرأ من متغيّرات البيئة الفعلية على الخادم. لإضافة مزوّد اطلب من مسؤول النظام
              ربط الموصل الخاص به أو إضافة مفتاح API.
            </p>
            <ul className="mt-4 divide-y divide-border">
              <ProviderRow
                label="OTP عبر البريد الإلكتروني"
                sublabel="متاح افتراضيًا عبر Supabase Auth."
                ok={data.providers.email_otp_available}
              />
              <ProviderRow
                label="SMS — GatewayAPI"
                sublabel="GATEWAYAPI_API_KEY"
                ok={data.providers.gatewayapi}
              />
              <ProviderRow
                label="SMS — Twilio"
                sublabel="TWILIO_AUTH_TOKEN / TWILIO_API_KEY"
                ok={data.providers.twilio}
              />
              <ProviderRow
                label="SMS — MessageBird"
                sublabel="MESSAGEBIRD_API_KEY"
                ok={data.providers.messagebird}
              />
              <ProviderRow
                label="بريد مخصص (Resend) — اختياري"
                sublabel="RESEND_API_KEY"
                ok={data.providers.resend}
              />
            </ul>
            <div className="mt-4 rounded-lg bg-muted/50 p-3 text-[11px] text-muted-foreground">
              ملاحظة: تفعيل مزوّد SMS يتطلّب أيضًا ربطه في إعدادات مزود المصادقة (Supabase Auth →
              Phone) ليعمل OTP للجوال. تحقّق من ذلك بعد إضافة المفتاح.
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function MissingConfigBanner({ cfg }: { cfg: MessagingConfig }) {
  const missingWhatsapp = !cfg.whatsapp || cfg.whatsapp.trim() === "";
  const missingSms = !cfg.providers.sms_any_configured;

  if (!missingWhatsapp && !missingSms) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-200">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <div className="font-semibold">إعدادات المراسلة مكتملة</div>
          <p className="mt-0.5 text-xs opacity-90">
            رقم واتساب مضبوط، ويوجد مزوّد SMS واحد على الأقل مُفعّل على الخادم.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="space-y-2">
        <div className="font-semibold">تحذير: توجد إعدادات ناقصة</div>
        <ul className="list-inside list-disc space-y-1 text-xs opacity-95">
          {missingWhatsapp && (
            <li>
              لم يتم ضبط <b>رقم واتساب المجمع</b>. زر الاستفسار العائم لن يتمكّن من فتح المحادثة،
              وستظهر رسالة خطأ للمستخدمين.
            </li>
          )}
          {missingSms && (
            <li>
              لا يوجد مزوّد <b>SMS</b> مُهيّأ على الخادم. سيعمل OTP عبر البريد الإلكتروني فقط؛ ولن
              يعمل OTP للجوال حتى يتم ربط مزوّد رسائل.
            </li>
          )}
        </ul>
        <a
          href="https://supabase.com/docs/guides/auth/phone-login"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-2 hover:opacity-80"
        >
          دليل تفعيل مزوّد SMS <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

function ProviderRow({ label, sublabel, ok }: { label: string; sublabel: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div dir="ltr" className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          {sublabel}
        </div>
      </div>
      {ok ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" /> مُفعّل
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
          <XCircle className="h-3.5 w-3.5" /> غير مُفعّل
        </span>
      )}
    </li>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <div className="font-semibold">تعذّر تحميل الإعدادات</div>
        <p className="mt-0.5 text-xs opacity-90">{message}</p>
      </div>
    </div>
  );
}
