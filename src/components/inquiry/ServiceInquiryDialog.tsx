/**
 * ServiceInquiryDialog — premium light-themed form to capture a
 * WhatsApp-service inquiry, then hand off to wa.me AFTER the inquiry has
 * been safely persisted to the database.
 *
 * Uses shadcn Dialog on desktop and Drawer (vaul) on mobile.
 * Fields: name, mobile (SA), service (from service_catalog), branch,
 * contact method, optional email/national id/specialty/doctor/date/insurance/notes,
 * privacy consent.
 *
 * Handoff flow:
 *   1) POST /api/public/inquiries/create  → returns request_number
 *   2) show confirmation view
 *   3) user clicks "افتح واتساب" → POST /mark-whatsapp-opened, then open wa.me
 */
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { CheckCircle2, Copy, ExternalLink, Loader2, MessageCircle } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { SITE } from "@/lib/site";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

type ServiceRow = { id: string; name_ar: string };
type BranchRow = { id: string; name_ar: string };

const PHONE_RE = /^[+0-9\s\-()]+$/;
const SA_MOBILE_RE = /^(?:\+?966|00966|0)?5\d{8}$/;

const schema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "الاسم قصير جدًا")
    .max(120, "الاسم طويل جدًا"),
  mobile_number: z
    .string()
    .trim()
    .regex(PHONE_RE, "رقم الجوال يحتوي على أحرف غير مسموحة")
    .refine((v) => SA_MOBILE_RE.test(v.replace(/[\s\-()]/g, "")), {
      message: "أدخل رقم جوال سعودي صحيح (05XXXXXXXX)",
    }),
  service_id: z.string().uuid("اختر الخدمة المطلوبة"),
  branch_id: z.string().uuid("اختر الفرع المفضّل"),
  preferred_contact_method: z.enum(["whatsapp", "phone", "sms", "email"]),
  email: z.string().trim().email("بريد غير صالح").optional().or(z.literal("")),
  national_id: z.string().trim().max(20, "طويل جدًا").optional().or(z.literal("")),
  preferred_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح").optional().or(z.literal("")),
  notes: z.string().trim().max(1000, "الملاحظات طويلة جدًا").optional().or(z.literal("")),
  consent: z.literal(true, { message: "الموافقة على سياسة الخصوصية مطلوبة" }),
});

type FormState = {
  full_name: string;
  mobile_number: string;
  service_id: string;
  branch_id: string;
  preferred_contact_method: "whatsapp" | "phone" | "sms" | "email";
  email: string;
  national_id: string;
  preferred_date: string;
  notes: string;
  consent: boolean;
};

const EMPTY: FormState = {
  full_name: "",
  mobile_number: "",
  service_id: "",
  branch_id: "",
  preferred_contact_method: "whatsapp",
  email: "",
  national_id: "",
  preferred_date: "",
  notes: "",
  consent: false,
};

type ConfirmationState = {
  request_number: string;
  service_label: string;
  branch_label: string;
  full_name: string;
  mobile_number: string;
  preferred_date: string;
  notes: string;
};

function normalizeSaudiMobile(raw: string): string {
  const digits = raw.replace(/[\s\-()]/g, "");
  const m = digits.match(/^(?:\+?966|00966|0)?(5\d{8})$/);
  return m ? `966${m[1]}` : digits;
}

function buildWhatsAppMessage(c: ConfirmationState): string {
  const lines = [
    "السلام عليكم، أرغب في الاستفسار عن إحدى خدمات مجمع باعشن الطبي.",
    "",
    `رقم الطلب: ${c.request_number}`,
    `الاسم: ${c.full_name}`,
    `رقم الجوال: ${c.mobile_number}`,
    `الخدمة المطلوبة: ${c.service_label}`,
    `الفرع المفضل: ${c.branch_label}`,
    `التاريخ المفضل: ${c.preferred_date || "غير محدد"}`,
    `تفاصيل الطلب: ${c.notes?.trim() || "لا توجد تفاصيل إضافية"}`,
    "",
    "تم إرسال الطلب من خلال موقع مجمع باعشن الطبي.",
  ];
  return lines.join("\n");
}

async function fetchWhatsappNumber(): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("clinic_settings")
      .select("whatsapp")
      .eq("id", 1)
      .maybeSingle();
    const digits = (data?.whatsapp ?? SITE.whatsapp).replace(/\D/g, "");
    return digits || null;
  } catch {
    return SITE.whatsapp.replace(/\D/g, "") || null;
  }
}

export function ServiceInquiryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const isMobile = useIsMobile();

  const [services, setServices] = useState<ServiceRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [whatsappNumber, setWhatsappNumber] = useState<string | null>(null);
  const [handoffStatus, setHandoffStatus] = useState<"not_opened" | "opened">("not_opened");

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    (async () => {
      const [svcRes, brRes, wa] = await Promise.all([
        supabase
          .from("service_catalog")
          .select("id, name_ar")
          .eq("is_active", true)
          .order("display_order", { ascending: true }),
        supabase
          .from("branches")
          .select("id, name_ar")
          .eq("is_active", true)
          .order("name_ar", { ascending: true }),
        fetchWhatsappNumber(),
      ]);
      if (cancel) return;
      setServices((svcRes.data as ServiceRow[]) ?? []);
      setBranches((brRes.data as BranchRow[]) ?? []);
      setWhatsappNumber(wa);
    })();
    return () => {
      cancel = true;
    };
  }, [open]);

  // Reset when closed
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      setForm(EMPTY);
      setErrors({});
      setConfirmation(null);
      setHandoffStatus("not_opened");
    }, 250);
    return () => clearTimeout(t);
  }, [open]);

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((s) => ({ ...s, [k]: v }));
    if (errors[k as string]) setErrors((e) => ({ ...e, [k as string]: "" }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const iss of parsed.error.issues) {
        const key = iss.path[0] as string | undefined;
        if (key && !fe[key]) fe[key] = iss.message;
      }
      setErrors(fe);
      const first = Object.values(fe)[0];
      if (first) toast.error(first);
      return;
    }

    setSubmitting(true);
    const toastId = toast.loading("جاري إرسال طلب الاستفسار...");
    try {
      const res = await fetch("/api/public/inquiries/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...parsed.data,
          email: parsed.data.email || undefined,
          national_id: parsed.data.national_id || undefined,
          preferred_date: parsed.data.preferred_date || undefined,
          notes: parsed.data.notes || undefined,
          source: isMobile ? "mobile_web" : "website",
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        request_number?: string;
        link_token?: string;
        message?: string;
      };
      if (!res.ok || !body.ok || !body.request_number) {
        toast.error(body.message ?? "تعذّر إرسال الطلب. حاول مرة أخرى.", { id: toastId });
        return;
      }

      // Persist the one-time link token so the portal can auto-claim
      // this inquiry once the patient signs in.
      if (body.link_token) {
        try {
          const KEY = "bmc:pending_inquiry_links";
          const prev = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Array<{ request_number: string; link_token: string }>;
          const next = [
            { request_number: body.request_number, link_token: body.link_token },
            ...prev.filter((r) => r.request_number !== body.request_number),
          ].slice(0, 20);
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch { /* ignore */ }
      }

      const svc = services.find((s) => s.id === form.service_id);
      const br = branches.find((b) => b.id === form.branch_id);
      setConfirmation({
        request_number: body.request_number,
        service_label: svc?.name_ar ?? "—",
        branch_label: br?.name_ar ?? "—",
        full_name: form.full_name,
        mobile_number: form.mobile_number,
        preferred_date: form.preferred_date,
        notes: form.notes,
      });
      toast.success(`تم إنشاء طلبك رقم ${body.request_number}`, { id: toastId });
    } catch {
      toast.error("تعذّر الاتصال بالخادم. حاول لاحقًا.", { id: toastId });
    } finally {
      setSubmitting(false);
    }
  }

  async function onOpenWhatsApp() {
    if (!confirmation) return;
    if (!whatsappNumber) {
      toast.error("لم يتم تكوين رقم واتساب المجمع. يرجى إبلاغ الأدمن.");
      return;
    }
    // Best-effort handoff marker BEFORE opening a new tab (so popup blockers
    // don't swallow the click, we don't await too long).
    fetch("/api/public/inquiries/mark-whatsapp-opened", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_number: confirmation.request_number }),
      keepalive: true,
    }).catch(() => { /* ignore */ });
    setHandoffStatus("opened");

    const msg = encodeURIComponent(buildWhatsAppMessage(confirmation));
    const url = `https://wa.me/${whatsappNumber}?text=${msg}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const Body = confirmation ? (
    <ConfirmationView
      c={confirmation}
      whatsappConfigured={!!whatsappNumber}
      handoffStatus={handoffStatus}
      onOpenWhatsApp={onOpenWhatsApp}
      onClose={() => onOpenChange(false)}
    />
  ) : (
    <FormBody
      form={form}
      errors={errors}
      services={services}
      branches={branches}
      submitting={submitting}
      today={today}
      onChange={update}
      onSubmit={onSubmit}
    />
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="text-start">
            <DrawerTitle>استفسر عن خدمات مجمع باعشن</DrawerTitle>
            <DrawerDescription>
              أكمل البيانات ليصلك ردّ من فريقنا عبر واتساب.
            </DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">{Body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>استفسر عن خدمات مجمع باعشن</DialogTitle>
          <DialogDescription>
            أكمل البيانات ليصلك ردّ من فريقنا عبر واتساب.
          </DialogDescription>
        </DialogHeader>
        {Body}
      </DialogContent>
    </Dialog>
  );
}

function FormBody({
  form,
  errors,
  services,
  branches,
  submitting,
  today,
  onChange,
  onSubmit,
}: {
  form: FormState;
  errors: Record<string, string>;
  services: ServiceRow[];
  branches: BranchRow[];
  submitting: boolean;
  today: string;
  onChange: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3 text-sm" aria-busy={submitting}>
      <fieldset disabled={submitting} className="space-y-3 border-0 p-0 m-0 disabled:opacity-70">
        <Field label="الاسم الكامل" error={errors.full_name} htmlFor="si-name" required>
          <input
            id="si-name"
            required
            value={form.full_name}
            onChange={(e) => onChange("full_name", e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2"
          />
        </Field>

        <Field label="رقم الجوال" error={errors.mobile_number} htmlFor="si-mobile" hint="مثال: 05XXXXXXXX" required>
          <input
            id="si-mobile"
            type="tel"
            inputMode="tel"
            dir="ltr"
            required
            value={form.mobile_number}
            onChange={(e) => onChange("mobile_number", e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2"
          />
        </Field>

        <Field label="الخدمة المطلوبة" error={errors.service_id} htmlFor="si-service" required>
          <select
            id="si-service"
            required
            value={form.service_id}
            onChange={(e) => onChange("service_id", e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2"
          >
            <option value="">— اختر الخدمة —</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name_ar}</option>
            ))}
          </select>
        </Field>

        <Field label="الفرع المفضّل" error={errors.branch_id} htmlFor="si-branch" required>
          <select
            id="si-branch"
            required
            value={form.branch_id}
            onChange={(e) => onChange("branch_id", e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2"
          >
            <option value="">— اختر الفرع —</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name_ar}</option>
            ))}
          </select>
        </Field>

        <Field label="طريقة التواصل المفضّلة" htmlFor="si-contact" required>
          <select
            id="si-contact"
            value={form.preferred_contact_method}
            onChange={(e) => onChange("preferred_contact_method", e.target.value as FormState["preferred_contact_method"])}
            className="w-full rounded-md border border-input bg-background px-3 py-2"
          >
            <option value="whatsapp">واتساب</option>
            <option value="phone">اتصال هاتفي</option>
            <option value="sms">رسالة نصية</option>
            <option value="email">البريد الإلكتروني</option>
          </select>
        </Field>

        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
            حقول اختيارية (بريد، تاريخ مفضّل، ملاحظات، هوية)
          </summary>
          <div className="mt-3 space-y-3">
            <Field label="البريد الإلكتروني (اختياري)" error={errors.email} htmlFor="si-email">
              <input
                id="si-email"
                type="email"
                dir="ltr"
                value={form.email}
                onChange={(e) => onChange("email", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              />
            </Field>

            <Field label="التاريخ المفضّل (اختياري)" error={errors.preferred_date} htmlFor="si-date">
              <input
                id="si-date"
                type="date"
                min={today}
                value={form.preferred_date}
                onChange={(e) => onChange("preferred_date", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              />
            </Field>

            <Field label="الهوية / الإقامة (اختياري)" error={errors.national_id} htmlFor="si-nid" hint="لن تُرسل ضمن رسالة واتساب">
              <input
                id="si-nid"
                dir="ltr"
                value={form.national_id}
                onChange={(e) => onChange("national_id", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              />
            </Field>

            <Field label="تفاصيل إضافية (اختياري)" error={errors.notes} htmlFor="si-notes">
              <textarea
                id="si-notes"
                rows={3}
                maxLength={1000}
                value={form.notes}
                onChange={(e) => onChange("notes", e.target.value)}
                placeholder="لا تُدرج معلومات طبية حساسة هنا."
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              />
            </Field>
          </div>
        </details>

        <label className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
          <input
            type="checkbox"
            checked={form.consent}
            onChange={(e) => onChange("consent", e.target.checked)}
            className="mt-1"
          />
          <span>
            أوافق على{" "}
            <a href="/privacy" className="font-semibold text-primary underline" target="_blank" rel="noreferrer">
              سياسة الخصوصية
            </a>{" "}
            وعلى استخدام بياناتي للتواصل معي بخصوص هذا الاستفسار.
            {errors.consent && (
              <span className="mt-1 block text-destructive">{errors.consent}</span>
            )}
          </span>
        </label>
      </fieldset>

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
        {submitting ? "جارٍ الإرسال..." : "إرسال الاستفسار"}
      </button>
      <p className="text-[10px] text-muted-foreground text-center">
        سيُنشأ رقم طلب فريد، ثم يمكنك متابعته عبر إنشاء حساب.
      </p>
    </form>
  );
}

function ConfirmationView({
  c,
  whatsappConfigured,
  handoffStatus,
  onOpenWhatsApp,
  onClose,
}: {
  c: ConfirmationState;
  whatsappConfigured: boolean;
  handoffStatus: "not_opened" | "opened";
  onOpenWhatsApp: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/10 to-accent/5 p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold">تم إنشاء طلبك بنجاح</h3>
            <p className="text-xs text-muted-foreground">
              احتفظ برقم الطلب أدناه لمتابعته لاحقًا.
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-border bg-background/80 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">رقم الطلب</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(c.request_number).then(
                  () => toast.success("تم نسخ رقم الطلب"),
                  () => toast.error("تعذّر النسخ"),
                );
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <Copy className="h-3 w-3" /> نسخ
            </button>
          </div>
          <div className="mt-1 font-mono text-lg font-bold tracking-wider">
            {c.request_number}
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <Info label="الخدمة" value={c.service_label} />
          <Info label="الفرع" value={c.branch_label} />
          <Info label="الحالة" value="جديد" />
          <Info
            label="حالة واتساب"
            value={handoffStatus === "opened" ? "تم فتح واتساب (لم يتم التحقق من التسليم)" : "لم يُفتح بعد"}
          />
        </dl>
      </div>

      {!whatsappConfigured && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          تنبيه: لم يتم تكوين رقم واتساب المجمع في الإعدادات. الرجاء إبلاغ إدارة المجمع.
        </div>
      )}

      <button
        type="button"
        onClick={onOpenWhatsApp}
        disabled={!whatsappConfigured}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-2.5 font-semibold text-white hover:bg-[#1ebe5b] disabled:opacity-60"
      >
        <ExternalLink className="h-4 w-4" />
        افتح واتساب الآن مع رسالة جاهزة
      </button>

      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
        <p className="font-semibold">أنشئ حسابك لمتابعة الطلب</p>
        <p className="mt-1 text-muted-foreground">
          أنشئ حسابًا آمنًا لمتابعة حالة طلبك، واستكمال بياناتك وحجوزاتك وتقاريرك الطبية.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <a
            href={`/auth?redirect=${encodeURIComponent(`/portal/inquiries?ref=${c.request_number}`)}`}
            className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            أنشئ حسابك لمتابعة الطلب
          </a>
          <a
            href={`/auth?redirect=${encodeURIComponent(`/portal/inquiries?ref=${c.request_number}`)}`}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold hover:bg-muted"
          >
            لدي حساب بالفعل
          </a>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full text-xs text-muted-foreground hover:text-foreground underline"
      >
        إغلاق النافذة
      </button>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-background/60 p-2">
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}

function Field({
  label,
  error,
  hint,
  htmlFor,
  required,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-destructive" role="alert">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
