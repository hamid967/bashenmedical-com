import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { Building2, CheckCircle2, Loader2, HeartHandshake, Users, BadgePercent } from "lucide-react";
import { PageHero } from "@/components/PageShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/corporate")({
  head: () => ({
    meta: [
      { title: "خدمات الشركات — اتفاقيات مجمع باعشن الطبي" },
      {
        name: "description",
        content:
          "اتفاقيات طبية مخصّصة لشركتك: فحوصات ما قبل التوظيف، رعاية طبية للموظفين، وخصومات مؤسسية على الباقات الشاملة.",
      },
      { property: "og:title", content: "خدمات الشركات — مجمع باعشن" },
      { property: "og:description", content: "اتفاقيات طبية مخصّصة للشركات في جازان." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://bashenmedical.com/corporate" },
    ],
    links: [{ rel: "canonical", href: "https://bashenmedical.com/corporate" }],
  }),
  component: CorporatePage,
});

const SERVICES = ["فحوصات ما قبل التوظيف", "رعاية طبية للموظفين", "باقات فحص سنوية", "تطعيمات جماعية", "أخرى"];

const schema = z.object({
  company_name: z.string().trim().min(2, "اسم الشركة قصير").max(200),
  contact_name: z.string().trim().min(2, "الاسم قصير").max(120),
  phone: z.string().trim().regex(/^(?:\+?966|00966|0)?5\d{8}$/, "أدخل جوال سعودي صحيح"),
  email: z.string().trim().email("بريد غير صالح").optional().or(z.literal("")),
  employee_count: z.coerce.number().int().min(1, "عدد الموظفين مطلوب").max(1_000_000).optional(),
  service_type: z.string().optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

function CorporatePage() {
  const [form, setForm] = useState({
    company_name: "",
    contact_name: "",
    phone: "",
    email: "",
    employee_count: "",
    service_type: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((s) => ({ ...s, [k]: e.target.value }));
    setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const parsed = schema.safeParse({
      ...form,
      employee_count: form.employee_count === "" ? undefined : form.employee_count,
    });
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as string | undefined;
        if (k && !fe[k]) fe[k] = issue.message;
      }
      setErrors(fe);
      toast.error(Object.values(fe)[0] ?? "راجع الحقول");
      return;
    }

    setSubmitting(true);
    const toastId = toast.loading("جاري إرسال طلبك...");
    try {
      const { error } = await supabase.from("corporate_requests").insert({
        company_name: parsed.data.company_name,
        contact_name: parsed.data.contact_name,
        phone: parsed.data.phone,
        email: parsed.data.email || null,
        employee_count: parsed.data.employee_count ?? null,
        service_type: parsed.data.service_type || null,
        notes: parsed.data.notes || null,
      });
      if (error) {
        toast.error(error.message, { id: toastId });
        return;
      }
      toast.success("سيتواصل معك فريق الاتفاقيات قريبًا", { id: toastId });
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHero
        eyebrow="اتفاقيات مؤسسية"
        title="خدمات الشركات"
        subtitle="نصمّم لشركتك اتفاقية طبية مخصّصة تجمع بين الجودة والتوفير — من فحوصات ما قبل التوظيف إلى تغطية طبية شاملة لموظفيك."
      />

      <section className="container-app py-10 grid gap-8 lg:grid-cols-3">
        {[
          {
            icon: <Users className="h-6 w-6" />,
            title: "رعاية الموظفين",
            desc: "أولوية حجز، خصم على الاستشارات، ومسار سريع في الاستقبال لموظفي الشركات المتعاقدة.",
          },
          {
            icon: <BadgePercent className="h-6 w-6" />,
            title: "أسعار مؤسسية",
            desc: "خصومات على باقات الفحص السنوي والفحوصات المخبرية والأشعة حسب حجم الاتفاقية.",
          },
          {
            icon: <HeartHandshake className="h-6 w-6" />,
            title: "مدير حساب مخصّص",
            desc: "نقطة اتصال واحدة لتنسيق كل ما تحتاجه شركتك — تقارير شهرية، جدولة، وفوترة موحّدة.",
          },
        ].map((c) => (
          <div key={c.title} className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
              {c.icon}
            </div>
            <h3 className="font-bold text-lg">{c.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground leading-6">{c.desc}</p>
          </div>
        ))}
      </section>

      <section className="container-app pb-14">
        <div className="max-w-3xl mx-auto">
          {done ? (
            <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-background to-background p-8 text-center shadow-sm">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/15 text-primary">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h2 className="mt-4 text-xl font-bold">تم استلام طلبك</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                سيتواصل معك فريق الاتفاقيات المؤسسية خلال يوم عمل واحد لمناقشة تفاصيل اتفاقيتك.
              </p>
            </div>
          ) : (
            <form
              onSubmit={onSubmit}
              noValidate
              aria-busy={submitting}
              className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-7"
              aria-label="نموذج طلب اتفاقية شركات"
            >
              <div className="mb-5">
                <h2 className="text-xl font-bold">اطلب اتفاقية</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  املأ البيانات وسنتواصل معك بأسرع وقت.
                </p>
              </div>
              <fieldset
                disabled={submitting}
                className="m-0 grid gap-4 border-0 p-0 disabled:opacity-70 sm:grid-cols-2"
              >
                <Field label="اسم الشركة" error={errors.company_name} id="co-name">
                  <input
                    id="co-name"
                    value={form.company_name}
                    onChange={update("company_name")}
                    aria-invalid={!!errors.company_name}
                    className={FIELD_CLS}
                  />
                </Field>
                <Field label="اسم جهة الاتصال" error={errors.contact_name} id="co-contact">
                  <input
                    id="co-contact"
                    value={form.contact_name}
                    onChange={update("contact_name")}
                    aria-invalid={!!errors.contact_name}
                    className={FIELD_CLS}
                  />
                </Field>
                <Field label="رقم الجوال" error={errors.phone} id="co-phone" hint="05XXXXXXXX">
                  <input
                    id="co-phone"
                    dir="ltr"
                    inputMode="tel"
                    placeholder="05XXXXXXXX"
                    value={form.phone}
                    onChange={update("phone")}
                    aria-invalid={!!errors.phone}
                    className={`${FIELD_CLS} text-left`}
                  />
                </Field>
                <Field label="البريد الإلكتروني" error={errors.email} id="co-email">
                  <input
                    id="co-email"
                    type="email"
                    dir="ltr"
                    value={form.email}
                    onChange={update("email")}
                    aria-invalid={!!errors.email}
                    className={`${FIELD_CLS} text-left`}
                  />
                </Field>
                <Field label="عدد الموظفين" error={errors.employee_count} id="co-count">
                  <input
                    id="co-count"
                    type="number"
                    min={1}
                    value={form.employee_count}
                    onChange={update("employee_count")}
                    aria-invalid={!!errors.employee_count}
                    className={FIELD_CLS}
                  />
                </Field>
                <Field label="نوع الخدمة" error={errors.service_type} id="co-service">
                  <select
                    id="co-service"
                    value={form.service_type}
                    onChange={update("service_type")}
                    className={FIELD_CLS}
                  >
                    <option value="">— اختر —</option>
                    {SERVICES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="sm:col-span-2">
                  <Field label="ملاحظات إضافية" error={errors.notes} id="co-notes">
                    <textarea
                      id="co-notes"
                      rows={4}
                      value={form.notes}
                      onChange={update("notes")}
                      className={`${FIELD_CLS_BASE} resize-y py-2.5 leading-6`}
                    />
                  </Field>
                </div>
              </fieldset>

              <div className="mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] leading-5 text-muted-foreground">
                  سنستخدم بياناتك للتواصل معك بخصوص طلب الاتفاقية فقط.
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60 sm:min-w-[220px]"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Building2 className="h-4 w-4" />
                  )}
                  {submitting ? "جاري الإرسال..." : "إرسال طلب الاتفاقية"}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </>
  );
}

// Unified field styles — matches /second-opinion form for site-wide consistency.
const FIELD_CLS_BASE =
  "w-full rounded-lg border border-input bg-background px-3.5 text-sm transition-shadow " +
  "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 " +
  "aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20";
const FIELD_CLS = `${FIELD_CLS_BASE} h-11`;

function Field({
  label,
  error,
  hint,
  id,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

