/**
 * نموذج طلب رعاية منزلية — يحفظ في جدول `home_care_requests` المستقل
 * (وليس مع المواعيد). يمنح المريض رقم مرجعي فوري للتتبع من /my-orders.
 */
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2, CheckCircle2, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@tanstack/react-router";

const PHONE_RE = /^[+0-9\s\-()]+$/;
const SA_MOBILE_RE = /^(?:\+?966|00966|0)?5\d{8}$/;

const schema = z.object({
  patient_name: z.string().trim().min(2, "الاسم قصير جدًا").max(120, "الاسم طويل"),
  patient_phone: z
    .string()
    .trim()
    .regex(PHONE_RE, "رقم غير صحيح")
    .refine((v) => SA_MOBILE_RE.test(v.replace(/[\s\-()]/g, "")), "أدخل جوال سعودي (05XXXXXXXX)"),
  service: z.string().trim().min(1, "اختر نوع الخدمة"),
  address: z.string().trim().min(5, "أدخل العنوان بالتفصيل").max(500),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  preferred_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ غير صالح")
    .optional()
    .or(z.literal("")),
  preferred_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "الوقت غير صالح")
    .optional()
    .or(z.literal("")),
});

type Form = z.infer<typeof schema>;

export function HomeCareRequestForm({ services }: { services: string[] }) {
  const [form, setForm] = useState<Form>({
    patient_name: "",
    patient_phone: "",
    service: services[0] ?? "",
    address: "",
    notes: "",
    preferred_date: "",
    preferred_time: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ reference: string; phone: string } | null>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const errs: Partial<Record<keyof Form, string>> = {};
      for (const iss of parsed.error.issues) {
        const k = iss.path[0] as keyof Form;
        if (!errs[k]) errs[k] = iss.message;
      }
      setErrors(errs);
      toast.error("يرجى تصحيح الأخطاء");
      return;
    }
    setErrors({});
    setSubmitting(true);
    const payload = {
      patient_name: parsed.data.patient_name,
      patient_phone: parsed.data.patient_phone,
      service: parsed.data.service,
      address: parsed.data.address,
      notes: parsed.data.notes || null,
      preferred_date: parsed.data.preferred_date || null,
      preferred_time: parsed.data.preferred_time || null,
    };
    const { data, error } = await supabase
      .from("home_care_requests")
      .insert(payload)
      .select("id")
      .single();
    setSubmitting(false);
    if (error || !data) {
      toast.error("تعذّر إرسال الطلب: " + (error?.message ?? "خطأ غير معروف"));
      return;
    }
    const ref = data.id.replace(/-/g, "").slice(0, 8);
    setResult({ reference: ref, phone: parsed.data.patient_phone });
    toast.success("تم إرسال طلب الرعاية المنزلية");
  };

  if (result) {
    return (
      <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5 p-6 md:p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-full bg-primary/15 text-primary flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold">تم استلام طلبك</h3>
            <p className="text-sm text-muted-foreground">
              سنتواصل معك خلال ساعة عمل لتأكيد التفاصيل.
            </p>
          </div>
        </div>
        <div className="rounded-xl bg-card p-4 mb-4">
          <div className="text-xs text-muted-foreground mb-1">رقم الطلب المرجعي</div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-lg font-bold">#{result.reference}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard?.writeText(result.reference);
                toast.success("تم النسخ");
              }}
            >
              <Copy className="h-3.5 w-3.5" /> نسخ
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/my-orders">
            <Button variant="premium">تتبع طلباتي</Button>
          </Link>
          <Button variant="outline" onClick={() => setResult(null)}>
            طلب جديد
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-border bg-card p-6 md:p-7 space-y-4"
      noValidate
    >
      <div>
        <h3 className="text-xl font-bold">اطلب زيارة منزلية</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          سنتواصل معك خلال ساعة عمل لتأكيد التفاصيل.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="hc_name">الاسم الكامل *</Label>
          <Input
            id="hc_name"
            value={form.patient_name}
            onChange={(e) => set("patient_name", e.target.value)}
            required
          />
          {errors.patient_name && (
            <p className="mt-1 text-xs text-destructive">{errors.patient_name}</p>
          )}
        </div>
        <div>
          <Label htmlFor="hc_phone">رقم الجوال *</Label>
          <Input
            id="hc_phone"
            type="tel"
            inputMode="tel"
            value={form.patient_phone}
            onChange={(e) => set("patient_phone", e.target.value)}
            placeholder="05XXXXXXXX"
            required
          />
          {errors.patient_phone && (
            <p className="mt-1 text-xs text-destructive">{errors.patient_phone}</p>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="hc_service">نوع الخدمة *</Label>
        <select
          id="hc_service"
          value={form.service}
          onChange={(e) => set("service", e.target.value)}
          className="mt-1 flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          required
        >
          {services.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {errors.service && <p className="mt-1 text-xs text-destructive">{errors.service}</p>}
      </div>

      <div>
        <Label htmlFor="hc_address">العنوان بالتفصيل *</Label>
        <textarea
          id="hc_address"
          value={form.address}
          onChange={(e) => set("address", e.target.value)}
          rows={2}
          className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="مثال: صبيا — حي الروضة، بجوار مسجد..."
          required
        />
        {errors.address && <p className="mt-1 text-xs text-destructive">{errors.address}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="hc_date">التاريخ المفضّل</Label>
          <Input
            id="hc_date"
            type="date"
            value={form.preferred_date}
            onChange={(e) => set("preferred_date", e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
          />
        </div>
        <div>
          <Label htmlFor="hc_time">الوقت المفضّل</Label>
          <Input
            id="hc_time"
            type="time"
            value={form.preferred_time}
            onChange={(e) => set("preferred_time", e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="hc_notes">وصف الحالة (اختياري)</Label>
        <textarea
          id="hc_notes"
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={3}
          className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="مثال: والدي عمره 72 عام يحتاج تغيير قسطرة."
        />
      </div>

      <Button type="submit" variant="premium" size="xl" className="w-full" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> جاري الإرسال...
          </>
        ) : (
          "أرسل طلب الزيارة"
        )}
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        بإرسالك الطلب أنت توافق على تواصلنا معك عبر الجوال المُدخل.
      </p>
    </form>
  );
}
