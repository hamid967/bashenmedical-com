import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Save, Loader2, Plus, Trash2 } from "lucide-react";
import { getClinicSettingsAdmin, updateClinicSettings } from "@/lib/admin.functions";
import { RequirePermission } from "@/components/rbac/RequirePermission";

export const Route = createFileRoute("/_authenticated/clinic-settings")({
  head: () => ({
    meta: [
      { title: "إعدادات المجمع — لوحة الإدارة | مجمع باعشن الطبي" },
      { name: "description", content: "إدارة معلومات المجمع الطبي، ساعات العمل، وسائل التواصل، والعنوان." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "إعدادات المجمع — لوحة الإدارة" },
      { property: "og:description", content: "أداة إدارية لتحرير بيانات المجمع." },
    ],
  }),
  component: () => (
    <RequirePermission anyOf="settings.manage">
      <ClinicSettingsPage />
    </RequirePermission>
  ),
});

type OpeningHours = { days: string[]; opens: string; closes: string };

type FormState = {
  name_ar: string;
  name_en: string;
  phone: string;
  phone_display: string;
  mobile: string;
  mobile_display: string;
  whatsapp: string;
  email: string;
  address_ar: string;
  address_en: string;
  street_address: string;
  address_locality: string;
  address_region: string;
  postal_code: string;
  address_country: string;
  lat: string;
  lng: string;
  maps_url: string;
  price_range: string;
  currencies_accepted: string;
  payment_accepted: string;
  medical_specialties: string;
  same_as: string;
  opening_hours: OpeningHours[];
};

const DAYS = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const DAY_AR: Record<string, string> = {
  Saturday: "السبت",
  Sunday: "الأحد",
  Monday: "الاثنين",
  Tuesday: "الثلاثاء",
  Wednesday: "الأربعاء",
  Thursday: "الخميس",
  Friday: "الجمعة",
};

function toForm(row: any): FormState {
  return {
    name_ar: row?.name_ar ?? "",
    name_en: row?.name_en ?? "",
    phone: row?.phone ?? "",
    phone_display: row?.phone_display ?? "",
    mobile: row?.mobile ?? "",
    mobile_display: row?.mobile_display ?? "",
    whatsapp: row?.whatsapp ?? "",
    email: row?.email ?? "",
    address_ar: row?.address_ar ?? "",
    address_en: row?.address_en ?? "",
    street_address: row?.street_address ?? "",
    address_locality: row?.address_locality ?? "",
    address_region: row?.address_region ?? "",
    postal_code: row?.postal_code ?? "",
    address_country: row?.address_country ?? "SA",
    lat: String(row?.lat ?? ""),
    lng: String(row?.lng ?? ""),
    maps_url: row?.maps_url ?? "",
    price_range: row?.price_range ?? "$$",
    currencies_accepted: row?.currencies_accepted ?? "SAR",
    payment_accepted: row?.payment_accepted ?? "",
    medical_specialties: (row?.medical_specialties ?? []).join(", "),
    same_as: (row?.same_as ?? []).join("\n"),
    opening_hours: (row?.opening_hours ?? []) as OpeningHours[],
  };
}

function ClinicSettingsPage() {
  const qc = useQueryClient();
  const getSettings = useServerFn(getClinicSettingsAdmin);
  const saveSettings = useServerFn(updateClinicSettings);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "clinic-settings"],
    queryFn: () => getSettings(),
  });

  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (data && !form) setForm(toForm(data));
  }, [data, form]);

  const mutation = useMutation({
    mutationFn: (payload: any) => saveSettings({ data: payload }),
    onSuccess: () => {
      toast.success("تم حفظ إعدادات العيادة");
      qc.invalidateQueries({ queryKey: ["admin", "clinic-settings"] });
      qc.invalidateQueries({ queryKey: ["clinic-settings"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر الحفظ"),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (error) {
    return <div className="p-6 text-red-600">{(error as Error).message}</div>;
  }
  if (!form) return null;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm({ ...form, [k]: v });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      toast.error("خط العرض والطول يجب أن تكون أرقامًا");
      return;
    }
    mutation.mutate({
      name_ar: form.name_ar.trim(),
      name_en: form.name_en.trim(),
      phone: form.phone.trim(),
      phone_display: form.phone_display.trim() || null,
      mobile: form.mobile.trim() || null,
      mobile_display: form.mobile_display.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      email: form.email.trim(),
      address_ar: form.address_ar.trim(),
      address_en: form.address_en.trim(),
      street_address: form.street_address.trim(),
      address_locality: form.address_locality.trim(),
      address_region: form.address_region.trim(),
      postal_code: form.postal_code.trim() || null,
      address_country: form.address_country.trim(),
      lat,
      lng,
      maps_url: form.maps_url.trim(),
      price_range: form.price_range.trim() || null,
      currencies_accepted: form.currencies_accepted.trim() || null,
      payment_accepted: form.payment_accepted.trim() || null,
      medical_specialties: form.medical_specialties
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      same_as: form.same_as
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      opening_hours: form.opening_hours,
    });
  };

  const updateHours = (idx: number, patch: Partial<OpeningHours>) => {
    const next = form.opening_hours.map((h, i) => (i === idx ? { ...h, ...patch } : h));
    set("opening_hours", next);
  };

  const toggleDay = (idx: number, day: string) => {
    const h = form.opening_hours[idx];
    const days = h.days.includes(day) ? h.days.filter((d) => d !== day) : [...h.days, day];
    updateHours(idx, { days });
  };

  const addHoursRow = () =>
    set("opening_hours", [
      ...form.opening_hours,
      { days: ["Saturday"], opens: "09:00", closes: "17:00" },
    ]);

  const removeHoursRow = (idx: number) =>
    set(
      "opening_hours",
      form.opening_hours.filter((_, i) => i !== idx),
    );

  const input =
    "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
  const label = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">إعدادات العيادة</h1>
            <p className="text-sm text-gray-600">
              العنوان، الإحداثيات، ساعات العمل ووسائل التواصل — تُستخدم في JSON-LD وصفحات SEO.
            </p>
          </div>
          <Link
            to="/admin"
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <ArrowRight className="h-4 w-4" />
            رجوع للإدارة
          </Link>
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          <Section title="الاسم والتواصل">
            <Field label="الاسم بالعربية">
              <input
                className={input}
                value={form.name_ar}
                onChange={(e) => set("name_ar", e.target.value)}
              />
            </Field>
            <Field label="الاسم بالإنجليزية">
              <input
                className={input}
                value={form.name_en}
                onChange={(e) => set("name_en", e.target.value)}
              />
            </Field>
            <Field label="الهاتف (E.164)">
              <input
                className={input}
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+9661..."
              />
            </Field>
            <Field label="الهاتف (عرض)">
              <input
                className={input}
                value={form.phone_display}
                onChange={(e) => set("phone_display", e.target.value)}
              />
            </Field>
            <Field label="الجوال">
              <input
                className={input}
                value={form.mobile}
                onChange={(e) => set("mobile", e.target.value)}
              />
            </Field>
            <Field label="الجوال (عرض)">
              <input
                className={input}
                value={form.mobile_display}
                onChange={(e) => set("mobile_display", e.target.value)}
              />
            </Field>
            <Field label="واتساب">
              <input
                className={input}
                value={form.whatsapp}
                onChange={(e) => set("whatsapp", e.target.value)}
              />
            </Field>
            <Field label="البريد">
              <input
                type="email"
                className={input}
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </Field>
          </Section>

          <Section title="العنوان">
            <Field label="العنوان بالعربية" full>
              <input
                className={input}
                value={form.address_ar}
                onChange={(e) => set("address_ar", e.target.value)}
              />
            </Field>
            <Field label="العنوان بالإنجليزية" full>
              <input
                className={input}
                value={form.address_en}
                onChange={(e) => set("address_en", e.target.value)}
              />
            </Field>
            <Field label="الشارع">
              <input
                className={input}
                value={form.street_address}
                onChange={(e) => set("street_address", e.target.value)}
              />
            </Field>
            <Field label="المدينة">
              <input
                className={input}
                value={form.address_locality}
                onChange={(e) => set("address_locality", e.target.value)}
              />
            </Field>
            <Field label="المنطقة">
              <input
                className={input}
                value={form.address_region}
                onChange={(e) => set("address_region", e.target.value)}
              />
            </Field>
            <Field label="الرمز البريدي">
              <input
                className={input}
                value={form.postal_code}
                onChange={(e) => set("postal_code", e.target.value)}
              />
            </Field>
            <Field label="الدولة (ISO)">
              <input
                className={input}
                value={form.address_country}
                onChange={(e) => set("address_country", e.target.value)}
              />
            </Field>
            <Field label="رابط الخريطة" full>
              <input
                className={input}
                value={form.maps_url}
                onChange={(e) => set("maps_url", e.target.value)}
              />
            </Field>
          </Section>

          <Section title="الإحداثيات (geo)">
            <Field label="خط العرض (lat)">
              <input
                className={input}
                value={form.lat}
                onChange={(e) => set("lat", e.target.value)}
                inputMode="decimal"
              />
            </Field>
            <Field label="خط الطول (lng)">
              <input
                className={input}
                value={form.lng}
                onChange={(e) => set("lng", e.target.value)}
                inputMode="decimal"
              />
            </Field>
          </Section>

          <Section title="ساعات العمل">
            <div className="col-span-full space-y-3">
              {form.opening_hours.map((h, idx) => (
                <div key={idx} className="rounded-md border border-gray-200 bg-white p-3">
                  <div className="mb-2 flex flex-wrap gap-2">
                    {DAYS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(idx, d)}
                        className={`rounded-full border px-3 py-1 text-xs ${
                          h.days.includes(d)
                            ? "border-primary bg-primary text-white"
                            : "border-gray-300 bg-white text-gray-700"
                        }`}
                      >
                        {DAY_AR[d]}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="text-sm text-gray-600">من</label>
                    <input
                      type="time"
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      value={h.opens}
                      onChange={(e) => updateHours(idx, { opens: e.target.value })}
                    />
                    <label className="text-sm text-gray-600">إلى</label>
                    <input
                      type="time"
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      value={h.closes}
                      onChange={(e) => updateHours(idx, { closes: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => removeHoursRow(idx)}
                      className="mr-auto flex items-center gap-1 text-sm text-red-600 hover:underline"
                    >
                      <Trash2 className="h-4 w-4" /> حذف
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addHoursRow}
                className="flex items-center gap-1 rounded-md border border-dashed border-gray-400 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                <Plus className="h-4 w-4" /> إضافة فترة
              </button>
            </div>
          </Section>

          <Section title="بيانات إضافية">
            <Field label="نطاق الأسعار">
              <input
                className={input}
                value={form.price_range}
                onChange={(e) => set("price_range", e.target.value)}
                placeholder="$$"
              />
            </Field>
            <Field label="العملات">
              <input
                className={input}
                value={form.currencies_accepted}
                onChange={(e) => set("currencies_accepted", e.target.value)}
              />
            </Field>
            <Field label="طرق الدفع" full>
              <input
                className={input}
                value={form.payment_accepted}
                onChange={(e) => set("payment_accepted", e.target.value)}
              />
            </Field>
            <Field label="التخصصات الطبية (مفصولة بفاصلة)" full>
              <input
                className={input}
                value={form.medical_specialties}
                onChange={(e) => set("medical_specialties", e.target.value)}
              />
            </Field>
            <Field label="روابط التواصل (سطر لكل رابط)" full>
              <textarea
                rows={4}
                className={input}
                value={form.same_as}
                onChange={(e) => set("same_as", e.target.value)}
              />
            </Field>
          </Section>

          <div className="flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              حفظ التغييرات
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}
