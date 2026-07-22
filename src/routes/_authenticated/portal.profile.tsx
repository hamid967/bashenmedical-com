/**
 * /portal/profile — Editable patient profile.
 * Reads via getMyProfile and writes via updateMyProfile.
 */
import { createFileRoute, Link, useRouter, useBlocker } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw, Save } from "lucide-react";
import { getMyProfile, updateMyProfile } from "@/lib/portal/portal.functions";
import { MutationErrorBanner } from "@/components/portal/MutationErrorBanner";
import { PortalPageHeader, PortalCard, PortalSkeleton } from "@/components/portal/ui";

const profileQuery = queryOptions({
  queryKey: ["portal", "my-profile-full"],
  queryFn: () => getMyProfile(),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/portal/profile")({
  loader: ({ context }) => context.queryClient.ensureQueryData(profileQuery),
  head: () => ({
    meta: [
      { title: "الملف الشخصي | بوابة المريض" },
      { name: "description", content: "إدارة بياناتك الشخصية ومعلومات الاتصال الطارئ." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfilePage,
  errorComponent: ErrorState,
  pendingComponent: Skeleton,
});

type FormState = {
  full_name: string;
  phone: string;
  national_id: string;
  date_of_birth: string;
  gender: "" | "male" | "female";
  preferred_language: "ar" | "en";
  emergency_contact_name: string;
  emergency_contact_phone: string;
};

function ProfilePage() {
  const q = useSuspenseQuery(profileQuery);
  const qc = useQueryClient();
  const p = q.data;

  const [form, setForm] = useState<FormState>(() => ({
    full_name: p?.full_name ?? "",
    phone: p?.phone ?? "",
    national_id: p?.national_id ?? "",
    date_of_birth: p?.date_of_birth ?? "",
    gender: (p?.gender as FormState["gender"]) ?? "",
    preferred_language: (p?.preferred_language as "ar" | "en") ?? "ar",
    emergency_contact_name: p?.emergency_contact_name ?? "",
    emergency_contact_phone: p?.emergency_contact_phone ?? "",
  }));
  const [dirty, setDirty] = useState(false);
  useEffect(() => setDirty(false), [p?.id]);

  // Warn on browser tab close/refresh with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Warn on in-app navigation with unsaved changes.
  useBlocker({
    shouldBlockFn: () => {
      if (!dirty) return false;
      return !window.confirm(
        "لديك تغييرات غير محفوظة في الملف الشخصي. هل تريد المغادرة دون حفظها؟",
      );
    },
    enableBeforeUnload: false,
  });

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  // Phase 10 — sensitive-field reauth dialog state
  const [pwOpen, setPwOpen] = useState(false);
  const [pwValue, setPwValue] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (payload: Partial<FormState> & { _password?: string }) =>
      updateMyProfile({ data: payload as never }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal", "my-profile-full"] });
      qc.invalidateQueries({ queryKey: ["portal", "my-profile"] });
      qc.invalidateQueries({ queryKey: ["portal", "dashboard-summary"] });
      toast.success("تم حفظ الملف الشخصي");
      setDirty(false);
      setPwOpen(false);
      setPwValue("");
      setPwError(null);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "تعذّر الحفظ";
      if (pwOpen) setPwError(msg);
      else toast.error(msg);
    },
  });

  function buildPayload(pw?: string) {
    return {
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || (null as unknown as string),
      national_id: form.national_id.trim() || (null as unknown as string),
      date_of_birth: form.date_of_birth || (null as unknown as string),
      gender: (form.gender || null) as FormState["gender"],
      preferred_language: form.preferred_language,
      emergency_contact_name: form.emergency_contact_name.trim() || (null as unknown as string),
      emergency_contact_phone: form.emergency_contact_phone.trim() || (null as unknown as string),
      ...(pw ? { _password: pw } : {}),
    };
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.full_name.trim().length < 2) {
      toast.error("الاسم قصير جدًا");
      return;
    }
    if (form.phone && !/^(?:\+?966|0)?5\d{8}$/.test(form.phone.trim())) {
      toast.error("رقم الجوال غير صالح");
      return;
    }
    // Detect sensitive changes vs original values
    const sensitiveChanged =
      (form.phone.trim() || "") !== (p?.phone ?? "") ||
      (form.national_id.trim() || "") !== (p?.national_id ?? "");
    if (sensitiveChanged) {
      setPwError(null);
      setPwValue("");
      setPwOpen(true);
      return;
    }
    mut.mutate(buildPayload());
  };

  const confirmSensitive = () => {
    if (!pwValue) {
      setPwError("أدخل كلمة المرور");
      return;
    }
    mut.mutate(buildPayload(pwValue));
  };

  return (
    <div dir="rtl">
      <PortalPageHeader
        title="الملف الشخصي"
        description="بياناتك المستخدَمة في المواعيد والتواصل والفوترة"
        breadcrumbs={[{ label: "البوابة", to: "/portal" }, { label: "الملف الشخصي" }]}
      />

      <PortalCard as="section" className="p-5 sm:p-6">
        <form onSubmit={submit} className="space-y-6">
          {mut.isError && (
            <MutationErrorBanner
              message={mut.error instanceof Error ? mut.error.message : "تعذّر حفظ التعديلات"}
              onRetry={() => mut.variables && mut.mutate(mut.variables)}
              retrying={mut.isPending}
            />
          )}
          <Section title="البيانات الأساسية">
            <Field label="الاسم الكامل" required>
              <input
                value={form.full_name}
                onChange={(e) => set("full_name", e.target.value)}
                maxLength={120}
                className={inputCls}
                placeholder="الاسم كما في الهوية"
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="رقم الهوية / الإقامة">
                <input
                  value={form.national_id}
                  onChange={(e) =>
                    set("national_id", e.target.value.replace(/\D/g, "").slice(0, 20))
                  }
                  className={inputCls}
                  inputMode="numeric"
                  placeholder="10 أرقام"
                />
              </Field>
              <Field label="رقم الجوال">
                <input
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  className={inputCls}
                  inputMode="tel"
                  placeholder="05XXXXXXXX"
                  dir="ltr"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="تاريخ الميلاد">
                <input
                  type="date"
                  value={form.date_of_birth}
                  onChange={(e) => set("date_of_birth", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="الجنس">
                <select
                  value={form.gender}
                  onChange={(e) => set("gender", e.target.value as FormState["gender"])}
                  className={inputCls}
                >
                  <option value="">— اختر —</option>
                  <option value="male">ذكر</option>
                  <option value="female">أنثى</option>
                </select>
              </Field>
            </div>
            <Field label="اللغة المفضّلة">
              <select
                value={form.preferred_language}
                onChange={(e) => set("preferred_language", e.target.value as "ar" | "en")}
                className={inputCls}
              >
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </Field>
          </Section>

          <Section title="جهة اتصال للطوارئ">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="الاسم">
                <input
                  value={form.emergency_contact_name}
                  onChange={(e) => set("emergency_contact_name", e.target.value)}
                  maxLength={120}
                  className={inputCls}
                />
              </Field>
              <Field label="رقم الجوال">
                <input
                  value={form.emergency_contact_phone}
                  onChange={(e) => set("emergency_contact_phone", e.target.value)}
                  maxLength={32}
                  className={inputCls}
                  inputMode="tel"
                  dir="ltr"
                />
              </Field>
            </div>
          </Section>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[color:var(--portal-border)]">
            <Link
              to="/portal"
              className="h-10 px-4 rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-surface)] text-sm"
            >
              إلغاء
            </Link>
            <button
              type="submit"
              disabled={!dirty || mut.isPending}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-full text-sm font-semibold text-[color:var(--portal-on-primary)] disabled:opacity-60"
              style={{ background: "var(--portal-gradient)" }}
            >
              {mut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              حفظ التعديلات
            </button>
          </div>
        </form>
      </PortalCard>

      {/* Phase 10 — Privacy & security quick links */}
      <PortalCard as="section" className="mt-6 p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-[color:var(--portal-ink-2)] mb-3">
          الخصوصية والأمان
        </h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <li>
            <Link
              to="/portal/sessions"
              className="block rounded-xl px-3 py-2 border border-[color:var(--portal-border)] hover:bg-[color:var(--portal-surface-2)]"
            >
              الجلسات والأجهزة النشطة
            </Link>
          </li>
          <li>
            <Link
              to="/portal/consents"
              className="block rounded-xl px-3 py-2 border border-[color:var(--portal-border)] hover:bg-[color:var(--portal-surface-2)]"
            >
              الموافقات والخصوصية
            </Link>
          </li>
          <li>
            <Link
              to="/portal/reminder-preferences"
              className="block rounded-xl px-3 py-2 border border-[color:var(--portal-border)] hover:bg-[color:var(--portal-surface-2)]"
            >
              تفضيلات التذكيرات
            </Link>
          </li>
          <li>
            <Link
              to="/portal/notifications"
              className="block rounded-xl px-3 py-2 border border-[color:var(--portal-border)] hover:bg-[color:var(--portal-surface-2)]"
            >
              مركز الإشعارات
            </Link>
          </li>
        </ul>
      </PortalCard>

      <p className="mt-6 text-center text-[11px] text-[color:var(--portal-ink-2)]">
        لتحديث إعدادات الإشعارات والتأمين، انتقل إلى{" "}
        <Link to="/portal/settings" className="underline">
          الإعدادات
        </Link>{" "}
        و{" "}
        <Link to="/portal/insurance" className="underline">
          التأمين
        </Link>
        .
      </p>

      {/* Sensitive change reauth dialog */}
      {pwOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl bg-[color:var(--portal-surface)] p-6 shadow-xl">
            <h3 className="text-base font-bold text-[color:var(--portal-ink)]">
              تأكيد التغييرات الحسّاسة
            </h3>
            <p className="mt-1 text-xs text-[color:var(--portal-ink-2)]">
              يتطلب تحديث رقم الجوال أو الهوية إعادة إدخال كلمة المرور.
            </p>
            <input
              type="password"
              autoFocus
              value={pwValue}
              onChange={(e) => {
                setPwValue(e.target.value);
                setPwError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmSensitive();
              }}
              placeholder="كلمة المرور"
              className={`${inputCls} mt-4`}
            />
            {pwError && <p className="mt-2 text-xs text-[color:var(--portal-error)]">{pwError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPwOpen(false);
                  setPwValue("");
                  setPwError(null);
                }}
                className="h-9 px-3 rounded-full border border-[color:var(--portal-border)] text-sm"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={confirmSensitive}
                disabled={mut.isPending}
                className="h-9 px-4 rounded-full text-sm font-semibold text-[color:var(--portal-on-primary)] disabled:opacity-60"
                style={{ background: "var(--portal-gradient)" }}
              >
                {mut.isPending ? "جارٍ التحقق…" : "تأكيد"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full h-10 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-surface)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--portal-primary)]/30";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-[color:var(--portal-ink-2)]">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-[color:var(--portal-ink)]">
        {label}
        {required && <span className="text-red-500 ms-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

function Skeleton() {
  return (
    <div dir="rtl">
      <div className="h-11 w-64 rounded-2xl bg-[color:var(--portal-surface-3)] animate-pulse mb-6" />
      <PortalCard className="p-6 space-y-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <PortalSkeleton key={i} className="h-10" />
        ))}
      </PortalCard>
    </div>
  );
}
function ErrorState({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div dir="rtl" className="grid place-items-center p-6">
      <PortalCard className="max-w-md w-full p-8 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-[color:var(--portal-error)] mb-2" />
        <h2 className="text-lg font-bold text-[color:var(--portal-ink)]">
          تعذّر تحميل الملف الشخصي
        </h2>
        <p className="mt-2 text-sm text-[color:var(--portal-ink-2)]">{error.message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="h-10 px-4 rounded-full text-[color:var(--portal-on-primary)] text-sm font-semibold"
            style={{ background: "var(--portal-gradient)" }}
          >
            <RefreshCw className="inline h-4 w-4 ms-1" />
            حاول مجددًا
          </button>
          <Link
            to="/portal"
            className="h-10 px-4 rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-surface)] text-sm inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            العودة
          </Link>
        </div>
      </PortalCard>
    </div>
  );
}
