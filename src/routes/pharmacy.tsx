import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { friendlyInsertError } from "@/lib/insert-errors";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { Upload, Check, Pill } from "lucide-react";
import { bmcOgImageMeta } from "@/lib/og-meta";

export const Route = createFileRoute("/pharmacy")({
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "طلب توصيل دواء | صيدليات باعشن" },
      {
        name: "description",
        content:
          "اطلب أدويتك من صيدليات باعشن مع خدمة التوصيل داخل صبيا، جازان. ارفع صورة الوصفة الطبية.",
      },
      { property: "og:title", content: "طلب دواء — صيدليات باعشن" },
      {
        property: "og:description",
        content: "خدمة توصيل الأدوية من صيدليات باعشن داخل صبيا وجازان مع رفع الوصفة الطبية.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://bashenmedical.com/pharmacy" },
    ],
    links: [{ rel: "canonical", href: "https://bashenmedical.com/pharmacy" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": ["Pharmacy", "MedicalWebPage"],
          "@id": "https://bashenmedical.com/pharmacy",
          name: "صيدليات باعشن — طلب وتوصيل الأدوية",
          description: "خدمة توصيل الأدوية من صيدليات باعشن داخل صبيا وجازان مع رفع الوصفة الطبية.",
          url: "https://bashenmedical.com/pharmacy",
          inLanguage: "ar-SA",
          isPartOf: { "@id": "https://bashenmedical.com/#website" },
          parentOrganization: { "@id": "https://bashenmedical.com/#organization" },
          areaServed: [
            { "@type": "City", name: "Sabya" },
            { "@type": "AdministrativeArea", name: "Jazan Region" },
          ],
          potentialAction: {
            "@type": "OrderAction",
            target: "https://bashenmedical.com/pharmacy",
            deliveryMethod: ["http://purl.org/goodrelations/v1#DeliveryModeOwnFleet"],
          },
        }),
      },
    ],
  }),
  component: PharmacyPage,
});

function PharmacyPage() {
  const { t, lang } = useI18n();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    district: "",
    items_text: "",
    notes: "",
    delivery_type: "delivery" as "delivery" | "pickup",
  });
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!form.name || !form.phone || (!form.items_text && !file)) {
      toast.error(
        lang === "ar"
          ? "أدخل الاسم والجوال والوصفة أو قائمة الأدوية"
          : "Provide name, phone, and prescription or medicines",
      );
      return;
    }
    setSubmitting(true);
    // Insert the order first so the storage policy can validate the upload path
    // against a real pending order.
    const { data: inserted, error } = await supabase
      .from("medicine_orders")
      .insert({
        patient_name: form.name,
        patient_phone: form.phone,
        address: form.address || null,
        district: form.district || null,
        items_text: form.items_text || null,
        notes: form.notes || null,
        delivery_type: form.delivery_type,
        prescription_image_url: null,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      setSubmitting(false);
      toast.error(friendlyInsertError(error ?? new Error("insert failed")));
      return;
    }
    if (file) {
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
      const path = `orders/${inserted.id}/prescription${ext}`;
      const { error: upErr } = await supabase.storage.from("prescriptions").upload(path, file);
      if (upErr) {
        setSubmitting(false);
        toast.error(friendlyInsertError(upErr));
        return;
      }
      await supabase
        .from("medicine_orders")
        .update({ prescription_image_url: path })
        .eq("id", inserted.id);
    }
    setSubmitting(false);
    setDone(true);
  };

  if (done) {
    return (
      <div className="container-app py-16">
        <div className="max-w-lg mx-auto text-center rounded-3xl border border-border bg-card p-10">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary/15 text-primary grid place-items-center">
            <Check className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-2xl font-bold">{t("order_success")}</h1>
          <p className="mt-2 text-muted-foreground">{t("order_success_desc")}</p>
          <Link
            to="/"
            className="mt-8 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            {t("nav_home")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-app py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary grid place-items-center">
            <Pill className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">{t("med_title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("med_sub")}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 md:p-8 grid gap-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={t("name")} req>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label={t("phone")} req>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                inputMode="tel"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>
          </div>

          <Field label={t("delivery_type")}>
            <div className="grid grid-cols-2 gap-2">
              {(["delivery", "pickup"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setForm({ ...form, delivery_type: v })}
                  className={`rounded-md border p-3 text-sm text-start transition ${form.delivery_type === v ? "border-primary bg-primary/5 text-primary font-semibold" : "border-border hover:border-primary/50"}`}
                >
                  {v === "delivery" ? t("delivery") : t("pickup")}
                </button>
              ))}
            </div>
          </Field>

          {form.delivery_type === "delivery" && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label={t("district")}>
                <input
                  value={form.district}
                  onChange={(e) => setForm({ ...form, district: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </Field>
              <Field label={t("address")}>
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </Field>
            </div>
          )}

          <Field label={t("prescription_image")}>
            <label className="flex items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-muted/40 px-3 py-6 text-sm text-muted-foreground cursor-pointer hover:bg-muted">
              <Upload className="h-4 w-4" />
              {file
                ? file.name
                : lang === "ar"
                  ? "اضغط لرفع صورة الوصفة"
                  : "Click to upload prescription image"}
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
          </Field>

          <Field label={t("medicines_list")}>
            <textarea
              value={form.items_text}
              onChange={(e) => setForm({ ...form, items_text: e.target.value })}
              rows={4}
              placeholder={
                lang === "ar"
                  ? "اكتب أسماء الأدوية والجرعات، دواء في كل سطر"
                  : "List medicine names and doses, one per line"
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </Field>

          <Field label={t("notes")}>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </Field>

          <button
            onClick={submit}
            disabled={submitting}
            className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50 hover:bg-primary/90"
          >
            {submitting ? t("loading") : t("submit_order")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  req,
  children,
}: {
  label: string;
  req?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label} {req && <span className="text-destructive">*</span>}
      </span>
      {children}
    </label>
  );
}
