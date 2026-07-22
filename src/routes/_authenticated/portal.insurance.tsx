/**
 * /portal/insurance — Insurance details + verification history.
 */
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { getMyProfile, updateMyProfile } from "@/lib/portal/portal.functions";
import { getBookingOptions } from "@/lib/portal/booking.functions";
import { listMyInsuranceVerifications } from "@/lib/portal/insurance.functions";
import { MutationErrorBanner } from "@/components/portal/MutationErrorBanner";

const profileQuery = queryOptions({
  queryKey: ["portal", "my-profile-full"],
  queryFn: () => getMyProfile(),
  staleTime: 30_000,
});
const optionsQuery = queryOptions({
  queryKey: ["portal", "booking", "options"],
  queryFn: () => getBookingOptions(),
  staleTime: 5 * 60_000,
});
const verificationsQuery = queryOptions({
  queryKey: ["portal", "insurance-verifications"],
  queryFn: () => listMyInsuranceVerifications({ data: { limit: 20 } }),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/portal/insurance")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(profileQuery),
      context.queryClient.ensureQueryData(optionsQuery),
      context.queryClient.ensureQueryData(verificationsQuery),
    ]);
  },
  head: () => ({
    meta: [
      { title: "التأمين | بوابة المريض" },
      { name: "description", content: "بيانات وثيقتك التأمينية وسجل التحقق من الأهلية." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InsurancePage,
  errorComponent: ErrorState,
  pendingComponent: Skeleton,
});

function money(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${Number(v).toLocaleString("ar-SA-u-nu-latn", { maximumFractionDigits: 2 })} ر.س`;
}
function dt(iso: string): string {
  return new Date(iso).toLocaleString("ar-SA-u-nu-latn", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function InsurancePage() {
  const p = useSuspenseQuery(profileQuery).data;
  const opts = useSuspenseQuery(optionsQuery).data;
  const vs = useSuspenseQuery(verificationsQuery).data;
  const qc = useQueryClient();

  // Provider is stored as text on profile (name). Match to catalog entry by name.
  const initialProvider = useMemo(() => {
    if (!p?.insurance_provider) return "";
    const match = opts.providers.find(
      (pr) => pr.name_ar === p.insurance_provider || pr.name_en === p.insurance_provider,
    );
    return match?.id ?? "__custom__";
  }, [p?.insurance_provider, opts.providers]);

  const [providerId, setProviderId] = useState<string>(initialProvider);
  const [customName, setCustomName] = useState<string>(
    initialProvider === "__custom__" ? (p?.insurance_provider ?? "") : "",
  );
  const [policyNo, setPolicyNo] = useState<string>(p?.insurance_policy_no ?? "");
  const [dirty, setDirty] = useState(false);
  useEffect(() => setDirty(false), [p?.id]);

  const [errors, setErrors] = useState<{
    provider?: string;
    policyNo?: string;
    customName?: string;
  }>({});

  /** Return validation errors keyed by field, empty when valid. */
  const validate = (): typeof errors => {
    const e: typeof errors = {};
    const hasProvider = providerId !== "";
    const isCustom = providerId === "__custom__";
    const trimmedCustom = customName.trim();
    const trimmedPolicy = policyNo.trim().toUpperCase();

    if (isCustom) {
      if (trimmedCustom.length < 2) e.customName = "اسم الشركة قصير جدًا (حد أدنى حرفان)";
      else if (trimmedCustom.length > 120) e.customName = "اسم الشركة طويل جدًا";
    }

    if (hasProvider) {
      if (!trimmedPolicy) e.policyNo = "رقم البوليصة مطلوب عند اختيار جهة تأمين";
      else if (trimmedPolicy.length < 4) e.policyNo = "رقم البوليصة قصير جدًا (حد أدنى ٤ خانات)";
      else if (trimmedPolicy.length > 64) e.policyNo = "رقم البوليصة طويل جدًا";
      else if (!/^[A-Z0-9][A-Z0-9\-/]{2,63}$/.test(trimmedPolicy))
        e.policyNo = "يُسمح بالأحرف الإنجليزية والأرقام والشرطات فقط (مثال: POL-123456)";
    } else if (trimmedPolicy) {
      e.policyNo = "اختر جهة التأمين أو احذف رقم البوليصة";
    }
    return e;
  };

  const mut = useMutation({
    mutationFn: () => {
      const providerName =
        providerId === "__custom__"
          ? customName.trim() || null
          : (opts.providers.find((pr) => pr.id === providerId)?.name_ar ?? null);
      return updateMyProfile({
        data: {
          insurance_provider: (providerId ? providerName : null) as unknown as string,
          insurance_policy_no: (policyNo.trim().toUpperCase() || null) as unknown as string,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal", "my-profile-full"] });
      qc.invalidateQueries({ queryKey: ["portal", "my-profile"] });
      toast.success("تم حفظ بيانات التأمين");
      setDirty(false);
      setErrors({});
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "تعذّر الحفظ"),
  });

  const onSave = () => {
    const eMap = validate();
    setErrors(eMap);
    if (Object.keys(eMap).length > 0) {
      toast.error("تحقّق من الحقول المميّزة بالأحمر");
      return;
    }
    mut.mutate();
  };

  const removeMut = useMutation({
    mutationFn: () =>
      updateMyProfile({
        data: {
          insurance_provider: null as unknown as string,
          insurance_policy_no: null as unknown as string,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal", "my-profile-full"] });
      toast.success("تم إزالة بيانات التأمين");
      setProviderId("");
      setPolicyNo("");
      setCustomName("");
      setDirty(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "تعذّر الإزالة"),
  });

  return (
    <div className="mx-auto max-w-4xl" dir="rtl">
      <header className="mb-6 flex items-center gap-3">
        <div
          className="h-11 w-11 rounded-2xl grid place-items-center text-[color:var(--portal-on-primary)]"
          style={{ background: "var(--portal-gradient)" }}
        >
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[color:var(--portal-ink)]">
            التأمين الطبي
          </h1>
          <p className="text-xs sm:text-sm text-[color:var(--portal-ink-2)]">
            وثيقتك الحالية وسجل التحقق من الأهلية
          </p>
        </div>
      </header>

      {/* Policy card */}
      <section className="glass-card p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-[color:var(--portal-ink-2)] mb-4">
          وثيقة التأمين المسجّلة
        </h2>
        {(mut.isError || removeMut.isError) && (
          <div className="mb-4">
            <MutationErrorBanner
              message={
                mut.isError
                  ? mut.error instanceof Error
                    ? mut.error.message
                    : "تعذّر حفظ بيانات التأمين"
                  : removeMut.error instanceof Error
                    ? removeMut.error.message
                    : "تعذّر إزالة بيانات التأمين"
              }
              onRetry={() => (mut.isError ? mut.mutate() : removeMut.mutate())}
              retrying={mut.isPending || removeMut.isPending}
            />
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[color:var(--portal-ink)]">
              جهة التأمين
            </span>
            <select
              value={providerId}
              onChange={(e) => {
                setProviderId(e.target.value);
                setDirty(true);
                setErrors((x) => ({
                  ...x,
                  provider: undefined,
                  policyNo: undefined,
                  customName: undefined,
                }));
              }}
              className={`${inputCls} ${errors.provider ? "border-red-400 ring-1 ring-red-200" : ""}`}
              aria-invalid={!!errors.provider}
            >
              <option value="">— بدون تأمين —</option>
              {opts.providers.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.name_ar}
                </option>
              ))}
              <option value="__custom__">أخرى…</option>
            </select>
            {errors.provider && <FieldError msg={errors.provider} />}
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[color:var(--portal-ink)]">
              رقم البوليصة
            </span>
            <input
              value={policyNo}
              onChange={(e) => {
                // Strip Arabic spaces and force to uppercase Latin/digits/-/ as typed.
                const v = e.target.value.replace(/\s+/g, "").toUpperCase();
                setPolicyNo(v);
                setDirty(true);
                setErrors((x) => ({ ...x, policyNo: undefined }));
              }}
              maxLength={64}
              dir="ltr"
              className={`${inputCls} ${errors.policyNo ? "border-red-400 ring-1 ring-red-200" : ""}`}
              placeholder="POL-XXXXXX"
              aria-invalid={!!errors.policyNo}
              inputMode="text"
              autoComplete="off"
            />
            {errors.policyNo ? (
              <FieldError msg={errors.policyNo} />
            ) : (
              <p className="mt-1 text-[10px] text-[color:var(--portal-ink-2)]">
                أحرف إنجليزية وأرقام وشرطات فقط، ٤-٦٤ خانة.
              </p>
            )}
          </label>
          {providerId === "__custom__" && (
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-[color:var(--portal-ink)]">
                اسم شركة التأمين
              </span>
              <input
                value={customName}
                onChange={(e) => {
                  setCustomName(e.target.value);
                  setDirty(true);
                  setErrors((x) => ({ ...x, customName: undefined }));
                }}
                maxLength={120}
                className={`${inputCls} ${errors.customName ? "border-red-400 ring-1 ring-red-200" : ""}`}
                aria-invalid={!!errors.customName}
              />
              {errors.customName && <FieldError msg={errors.customName} />}
            </label>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {(p?.insurance_provider || p?.insurance_policy_no) && (
            <button
              type="button"
              onClick={() => removeMut.mutate()}
              disabled={removeMut.isPending}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-red-200 bg-[color:var(--portal-surface)] text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              <ShieldOff className="h-4 w-4" />
              إزالة
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || mut.isPending}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-semibold text-[color:var(--portal-on-primary)] disabled:opacity-60"
            style={{ background: "var(--portal-gradient)" }}
          >
            {mut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            حفظ
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50 text-teal-900 p-3 text-xs leading-relaxed flex gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            يتم التحقق من أهلية التأمين تلقائيًا عند حجز موعد. تحقق من قائمة الأهلية أدناه أو{" "}
            <Link to="/portal/book" className="underline font-semibold">
              احجز موعدًا جديدًا
            </Link>{" "}
            للتحقق قبل الزيارة.
          </div>
        </div>
      </section>

      {/* Verifications history */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-[color:var(--portal-ink-2)] mb-3 px-1">
          سجل التحقق من الأهلية ({vs.length})
        </h2>
        {vs.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-3">
            {vs.map((v) => (
              <li key={v.id} className="glass-card p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div
                    className={`h-10 w-10 shrink-0 rounded-xl grid place-items-center border ${v.eligible ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-red-50 text-red-600 border-red-100"}`}
                  >
                    {v.eligible ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <ShieldOff className="h-5 w-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <h3 className="text-sm font-semibold text-[color:var(--portal-ink)]">
                          {v.provider_name_ar ?? "جهة التأمين"}
                          <span className="ms-2 text-[11px] text-[color:var(--portal-ink-2)] font-normal">
                            {v.policy_hint ? `• ${v.policy_hint}` : ""}
                          </span>
                        </h3>
                        {v.message && (
                          <p className="mt-1 text-xs text-[color:var(--portal-ink-2)] leading-relaxed">
                            {v.message}
                          </p>
                        )}
                      </div>
                      <time
                        className="text-[11px] text-[color:var(--portal-ink-2)]"
                        dateTime={v.created_at}
                      >
                        {dt(v.created_at)}
                      </time>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <Metric label="سعر الاستشارة" value={money(v.consultation_fee)} />
                      <Metric
                        label="نسبة التغطية"
                        value={v.coverage_percent != null ? `${v.coverage_percent}%` : "—"}
                      />
                      <Metric label="المُغطّى" value={money(v.covered_amount)} />
                      <Metric label="حصة المريض" value={money(v.patient_share)} tone="warn" />
                    </dl>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const inputCls =
  "w-full h-10 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-surface)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--portal-primary)]/30";

function FieldError({ msg }: { msg: string }) {
  return (
    <p role="alert" className="mt-1 text-[11px] font-semibold text-red-600">
      {msg}
    </p>
  );
}
function Metric({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div
      className={`rounded-lg border px-2 py-1.5 ${tone === "warn" ? "bg-amber-50 border-amber-100 text-amber-800" : "bg-slate-50 border-slate-200 text-[color:var(--portal-ink)]"}`}
    >
      <div className="text-[10px] text-[color:var(--portal-ink-2)]">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
function EmptyState() {
  return (
    <div className="glass-card p-8 text-center">
      <div className="mx-auto h-12 w-12 rounded-2xl grid place-items-center bg-[color:var(--portal-surface)] border border-[color:var(--portal-border)] text-[color:var(--portal-primary)]">
        <ShieldCheck className="h-6 w-6" />
      </div>
      <h3 className="mt-3 font-bold">لا يوجد سجل تحقق بعد</h3>
      <p className="mt-1 text-sm text-[color:var(--portal-ink-2)]">
        سيظهر التحقق تلقائيًا عند حجز موعد وإدخال بيانات وثيقتك.
      </p>
      <Link
        to="/portal/book"
        className="mt-4 inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-sm font-semibold text-[color:var(--portal-on-primary)]"
        style={{ background: "var(--portal-gradient)" }}
      >
        <CalendarPlus className="h-4 w-4" />
        احجز موعدًا
      </Link>
    </div>
  );
}
function Skeleton() {
  return (
    <div className="mx-auto max-w-4xl" dir="rtl">
      <div className="h-11 w-64 rounded-2xl bg-slate-200/60 animate-pulse mb-6" />
      <div className="glass-card p-6 space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-10 rounded-xl bg-slate-200/60 animate-pulse" />
        ))}
      </div>
      <div className="mt-6 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass-card h-24 animate-pulse bg-slate-100" />
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
        <h2 className="text-lg font-bold">تعذّر تحميل بيانات التأمين</h2>
        <p className="mt-2 text-sm text-[color:var(--portal-ink-2)]">{error.message}</p>
        <div className="mt-4 flex justify-center gap-2">
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
      </div>
    </div>
  );
}
