import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import {
  Stethoscope,
  CheckCircle2,
  Loader2,
  Upload,
  X,
  FileText,
  ShieldCheck,
  ClipboardList,
  UserCheck,
  MessageSquareText,
} from "lucide-react";
import { PageHero } from "@/components/PageShell";
import { supabase } from "@/integrations/supabase/client";
import { bmcOgImageMeta } from "@/lib/og-meta";

export const Route = createFileRoute("/second-opinion")({
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "الرأي الطبي الثاني — مجمع باعشن الطبي" },
      {
        name: "description",
        content:
          "احصل على رأي طبي ثانٍ من استشاريي مجمع باعشن قبل اتخاذ قرار علاجي — ارفع تقاريرك السابقة، وسيتواصل معك الفريق خلال 48 ساعة.",
      },
      { property: "og:title", content: "الرأي الطبي الثاني — مجمع باعشن الطبي" },
      {
        property: "og:description",
        content: "تأكّد من خيارك العلاجي عبر مراجعة استشاريّ مستقلّ لتقاريرك.",
      },
      {
        property: "og:url",
        content: "https://bashenmedical.com/second-opinion",
      },
    ],
    links: [
      { rel: "canonical", href: "https://bashenmedical.com/second-opinion" },
    ],
  }),
  component: SecondOpinionPage,
});

const SPECIALTIES = [
  "الأورام",
  "جراحة القلب",
  "جراحة العظام",
  "المخ والأعصاب",
  "أمراض النساء والولادة",
  "طب الأطفال",
  "الجهاز الهضمي",
  "المسالك البولية",
  "الأمراض الجلدية",
  "الغدد الصماء",
  "أخرى",
];

const schema = z.object({
  patient_name: z.string().trim().min(2, "الاسم قصير").max(120),
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+?966|00966|0)?5\d{8}$/, "أدخل رقم جوال سعودي صحيح"),
  email: z.string().trim().email("بريد إلكتروني غير صالح").optional().or(z.literal("")),
  specialty: z.string().min(1, "اختر التخصص"),
  summary: z.string().trim().min(30, "اكتب ملخصًا لا يقلّ عن 30 حرفًا").max(2000),
});

const MAX_FILE_MB = 8;
const MAX_FILES = 5;
const SUMMARY_MAX = 2000;

// Unified field classes — one place to tune the whole form.
const FIELD_BASE =
  "w-full rounded-lg border border-input bg-background px-3.5 text-sm transition-shadow " +
  "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 " +
  "aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20";
const FIELD_HEIGHT = "h-11";

function SecondOpinionPage() {
  const [form, setForm] = useState({
    patient_name: "",
    phone: "",
    email: "",
    specialty: "",
    summary: "",
  });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((s) => ({ ...s, [k]: e.target.value }));
      setErrors((prev) => ({ ...prev, [k]: undefined }));
    };

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) {
        toast.error(`الحد الأقصى ${MAX_FILES} ملفات`);
        break;
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`الملف "${f.name}" يتجاوز ${MAX_FILE_MB} ميجابايت`);
        continue;
      }
      next.push(f);
    }
    setFiles(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const parsed = schema.safeParse(form);
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
      // Insert the request row FIRST with a client-generated UUID so the
      // storage RLS policy can tie every uploaded file back to a real,
      // still-pending second_opinion_requests row.
      const requestId = crypto.randomUUID();

      const { error: insErr } = await supabase
        .from("second_opinion_requests")
        .insert({
          id: requestId,
          patient_name: parsed.data.patient_name,
          phone: parsed.data.phone,
          email: parsed.data.email || null,
          specialty: parsed.data.specialty,
          summary: parsed.data.summary,
          upload_paths: [],
        });
      if (insErr) {
        toast.error(insErr.message, { id: toastId });
        return;
      }

      const uploaded: string[] = [];
      for (const f of files) {
        const path = `${requestId}/${Date.now()}-${f.name.replace(/[^\w.\-]/g, "_")}`;
        const { error: upErr } = await supabase.storage
          .from("second-opinion-uploads")
          .upload(path, f, { upsert: false, contentType: f.type || undefined });
        if (upErr) {
          toast.error(`تعذّر رفع الملف: ${upErr.message}`, { id: toastId });
          setSubmitting(false);
          return;
        }
        uploaded.push(path);
      }

      if (uploaded.length > 0) {
        // Best-effort — attachments are already stored under the request's
        // folder; failing to persist the array shouldn't block success.
        await supabase
          .from("second_opinion_requests")
          .update({ upload_paths: uploaded })
          .eq("id", requestId);
      }

      toast.success("تم استلام طلبك", { id: toastId });
      setDone(requestId);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <>
        <PageHero eyebrow="الرأي الطبي الثاني" title="تم استلام طلبك" />
        <section className="container-app py-12">
          <div className="mx-auto max-w-2xl rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-background to-background p-8 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold">استلمنا طلبك بنجاح</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  سيراجع الفريق الطبي تقاريرك ويتواصل معك خلال 48 ساعة عمل.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-between rounded-xl border border-border bg-background/60 px-4 py-3 text-sm">
              <span className="text-muted-foreground">رقم طلبك</span>
              <span className="font-mono text-base font-bold tracking-widest">
                {done.slice(0, 8).toUpperCase()}
              </span>
            </div>
          </div>
        </section>
      </>
    );
  }

  const summaryLen = form.summary.trim().length;

  return (
    <>
      <PageHero
        eyebrow="خدمة استشارية"
        title="الرأي الطبي الثاني"
        subtitle="قبل أي قرار جراحي أو علاجي كبير، احصل على مراجعة مستقلة من استشاريّي مجمع باعشن — نستقبل تقاريرك ونعود إليك بتوصية موثّقة خلال 48 ساعة."
      />

      {/* Simple 3-step process bar — sets expectations before the form */}
      <section className="container-app -mt-2 pt-6">
        <ol className="mx-auto grid max-w-4xl gap-3 sm:grid-cols-3">
          {[
            { n: "1", icon: ClipboardList, t: "أرسِل تقاريرك", d: "املأ النموذج وأرفق التقارير." },
            { n: "2", icon: UserCheck, t: "مراجعة استشاريّ", d: "استشاريّ التخصص يدرس حالتك." },
            { n: "3", icon: MessageSquareText, t: "توصية موثّقة", d: "نعود إليك خلال 48 ساعة." },
          ].map((s) => (
            <li
              key={s.n}
              className="flex items-start gap-3 rounded-xl border border-border/70 bg-card/60 p-4"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <span className="text-xs text-muted-foreground">{s.n}.</span>
                  <span className="truncate">{s.t}</span>
                </div>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="container-app grid gap-6 py-10 lg:grid-cols-[1fr_1.5fr] lg:items-start">
        <aside className="space-y-4 lg:sticky lg:top-24">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2.5 text-sm font-bold">
              <ShieldCheck className="h-5 w-5 text-primary" />
              خصوصية تامّة
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              تُعامَل تقاريرك بسريّة تامة ولا يُطّلع عليها إلا الاستشاري المعنيّ.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2.5 text-sm font-bold">
              <Stethoscope className="h-5 w-5 text-primary" />
              متى تحتاجه؟
            </div>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              {[
                "قبل جراحة كبرى",
                "تشخيص غير قاطع",
                "خطة علاجية طويلة",
                "حالة أورام أو مزمنة",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <form
          onSubmit={onSubmit}
          noValidate
          aria-busy={submitting}
          className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-7"
          aria-label="نموذج طلب رأي طبي ثانٍ"
        >
          <fieldset disabled={submitting} className="m-0 space-y-5 border-0 p-0 disabled:opacity-70">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="الاسم الكامل" error={errors.patient_name} id="so-name">
                <input
                  id="so-name"
                  value={form.patient_name}
                  onChange={update("patient_name")}
                  aria-invalid={!!errors.patient_name}
                  className={`${FIELD_BASE} ${FIELD_HEIGHT}`}
                />
              </FormField>
              <FormField label="رقم الجوال" error={errors.phone} id="so-phone" hint="05XXXXXXXX">
                <input
                  id="so-phone"
                  dir="ltr"
                  inputMode="tel"
                  placeholder="05XXXXXXXX"
                  value={form.phone}
                  onChange={update("phone")}
                  aria-invalid={!!errors.phone}
                  className={`${FIELD_BASE} ${FIELD_HEIGHT} text-left`}
                />
              </FormField>
              <FormField label="البريد الإلكتروني (اختياري)" error={errors.email} id="so-email">
                <input
                  id="so-email"
                  type="email"
                  dir="ltr"
                  value={form.email}
                  onChange={update("email")}
                  aria-invalid={!!errors.email}
                  className={`${FIELD_BASE} ${FIELD_HEIGHT} text-left`}
                />
              </FormField>
              <FormField label="التخصص" error={errors.specialty} id="so-spec">
                <select
                  id="so-spec"
                  value={form.specialty}
                  onChange={update("specialty")}
                  aria-invalid={!!errors.specialty}
                  className={`${FIELD_BASE} ${FIELD_HEIGHT}`}
                >
                  <option value="">— اختر التخصص —</option>
                  {SPECIALTIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <FormField
              label="ملخّص الحالة"
              error={errors.summary}
              id="so-summary"
              hint="التشخيص السابق، العلاجات المتخذة، الأعراض الحالية"
              trailing={
                <span
                  className={`text-[11px] tabular-nums ${
                    summaryLen > SUMMARY_MAX
                      ? "text-destructive"
                      : summaryLen >= 30
                      ? "text-muted-foreground"
                      : "text-muted-foreground/70"
                  }`}
                >
                  {summaryLen}/{SUMMARY_MAX}
                </span>
              }
            >
              <textarea
                id="so-summary"
                rows={5}
                value={form.summary}
                onChange={update("summary")}
                aria-invalid={!!errors.summary}
                className={`${FIELD_BASE} resize-y py-2.5 leading-6`}
              />
            </FormField>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="so-files" className="text-xs font-semibold">
                  تقارير سابقة{" "}
                  <span className="font-normal text-muted-foreground">(اختياري)</span>
                </label>
                <span className="text-[11px] text-muted-foreground">
                  {files.length}/{MAX_FILES} · {MAX_FILE_MB}MB لكل ملف
                </span>
              </div>
              <label
                htmlFor="so-files"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  addFiles(e.dataTransfer.files);
                }}
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/40"
                }`}
              >
                <input
                  ref={fileInputRef}
                  id="so-files"
                  type="file"
                  multiple
                  accept=".pdf,image/*"
                  onChange={(e) => addFiles(e.target.files)}
                  className="hidden"
                />
                <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
                  <Upload className="h-5 w-5" />
                </div>
                <div className="text-sm font-semibold">اسحب الملفات هنا أو اضغط للاختيار</div>
                <div className="text-[11px] text-muted-foreground">PDF أو صور</div>
              </label>

              {files.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {files.map((f, i) => (
                    <li
                      key={i}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{f.name}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {(f.size / 1024 / 1024).toFixed(1)}MB
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setFiles(files.filter((_, j) => j !== i))}
                        className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`إزالة ${f.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </fieldset>

          <div className="mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] leading-5 text-muted-foreground">
              بإرسال الطلب فإنك توافق على مراجعة تقاريرك من قِبل الاستشاري المختصّ فقط.
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60 sm:min-w-[180px]"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Stethoscope className="h-4 w-4" />
              )}
              {submitting ? "جاري الإرسال..." : "إرسال الطلب"}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

function FormField({
  label,
  error,
  hint,
  id,
  children,
  trailing,
}: {
  label: string;
  error?: string;
  hint?: string;
  id: string;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-semibold">
          {label}
        </label>
        {trailing}
      </div>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
