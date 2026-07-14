/**
 * /portal/profile — Editable patient profile.
 * Reads via getMyProfile and writes via updateMyProfile.
 */
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, Loader2, RefreshCw, Save, User as UserIcon,
} from "lucide-react";
import { getMyProfile, updateMyProfile } from "@/lib/portal/portal.functions";
import { MutationErrorBanner } from "@/components/portal/MutationErrorBanner";

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

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const mut = useMutation({
    mutationFn: (payload: Partial<FormState>) => updateMyProfile({ data: payload as never }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal", "my-profile-full"] });
      qc.invalidateQueries({ queryKey: ["portal", "my-profile"] });
      qc.invalidateQueries({ queryKey: ["portal", "dashboard-summary"] });
      toast.success("تم حفظ الملف الشخصي");
      setDirty(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "تعذّر الحفظ"),
  });

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
    mut.mutate({
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null as unknown as string,
      national_id: form.national_id.trim() || null as unknown as string,
      date_of_birth: form.date_of_birth || null as unknown as string,
      gender: (form.gender || null) as FormState["gender"],
      preferred_language: form.preferred_language,
      emergency_contact_name: form.emergency_contact_name.trim() || null as unknown as string,
      emergency_contact_phone: form.emergency_contact_phone.trim() || null as unknown as string,
    });
  };

  return (
    <div className="portal-root portal-gradient-bg min-h-dvh" dir="rtl">
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
        <header className="mb-6 flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl grid place-items-center text-white" style={{ background: "var(--portal-gradient)" }}>
            <UserIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[color:var(--portal-ink)]">الملف الشخصي</h1>
            <p className="text-xs sm:text-sm text-[color:var(--portal-ink-2)]">بياناتك المستخدَمة في المواعيد والتواصل والفوترة</p>
          </div>
        </header>

        <form onSubmit={submit} className="glass-card p-5 sm:p-6 space-y-6">
          <Section title="البيانات الأساسية">
            <Field label="الاسم الكامل" required>
              <input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} maxLength={120}
                className={inputCls} placeholder="الاسم كما في الهوية" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="رقم الهوية / الإقامة">
                <input value={form.national_id} onChange={(e) => set("national_id", e.target.value.replace(/\D/g, "").slice(0, 20))}
                  className={inputCls} inputMode="numeric" placeholder="10 أرقام" />
              </Field>
              <Field label="رقم الجوال">
                <input value={form.phone} onChange={(e) => set("phone", e.target.value)}
                  className={inputCls} inputMode="tel" placeholder="05XXXXXXXX" dir="ltr" />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="تاريخ الميلاد">
                <input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} className={inputCls} />
              </Field>
              <Field label="الجنس">
                <select value={form.gender} onChange={(e) => set("gender", e.target.value as FormState["gender"])} className={inputCls}>
                  <option value="">— اختر —</option>
                  <option value="male">ذكر</option>
                  <option value="female">أنثى</option>
                </select>
              </Field>
            </div>
            <Field label="اللغة المفضّلة">
              <select value={form.preferred_language} onChange={(e) => set("preferred_language", e.target.value as "ar" | "en")} className={inputCls}>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </Field>
          </Section>

          <Section title="جهة اتصال للطوارئ">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="الاسم">
                <input value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)}
                  maxLength={120} className={inputCls} />
              </Field>
              <Field label="رقم الجوال">
                <input value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)}
                  maxLength={32} className={inputCls} inputMode="tel" dir="ltr" />
              </Field>
            </div>
          </Section>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[color:var(--portal-border)]">
            <Link to="/portal" className="h-10 px-4 rounded-full border border-[color:var(--portal-border)] bg-white text-sm">إلغاء</Link>
            <button type="submit" disabled={!dirty || mut.isPending}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-full text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--portal-gradient)" }}>
              {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ التعديلات
            </button>
          </div>
        </form>

        <p className="mt-6 text-center text-[11px] text-[color:var(--portal-ink-2)]">
          لتحديث إعدادات الإشعارات والتأمين، انتقل إلى{" "}
          <Link to="/portal/settings" className="underline">الإعدادات</Link> و{" "}
          <Link to="/portal/insurance" className="underline">التأمين</Link>.
        </p>
      </main>
    </div>
  );
}

const inputCls =
  "w-full h-10 rounded-xl border border-[color:var(--portal-border)] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--portal-primary)]/30";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-[color:var(--portal-ink-2)]">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-[color:var(--portal-ink)]">
        {label}{required && <span className="text-red-500 ms-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

function Skeleton() {
  return (
    <div className="portal-root portal-gradient-bg min-h-dvh" dir="rtl">
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
        <div className="h-11 w-64 rounded-2xl bg-slate-200/60 animate-pulse mb-6" />
        <div className="glass-card p-6 space-y-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 rounded-xl bg-slate-200/60 animate-pulse" />
          ))}
        </div>
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
        <h2 className="text-lg font-bold">تعذّر تحميل الملف الشخصي</h2>
        <p className="mt-2 text-sm text-[color:var(--portal-ink-2)]">{error.message}</p>
        <div className="mt-6 flex justify-center gap-2">
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
