import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getOwnerService,
  createOwnerService,
  updateOwnerService,
} from "@/lib/owner/services.functions";
import { Button } from "@/components/ui-v3";
import { Input } from "@/components/ui-v3";
import { Label } from "@/components/ui-v3";
import { Textarea } from "@/components/ui-v3";
import { Switch } from "@/components/ui-v3";
import { ArrowRight, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/owner/services/$id")({
  head: () => ({
    meta: [{ title: "تحرير خدمة · Site Builder" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: ServiceEditor,
});

const CATEGORIES = [
  { value: "", label: "— بدون (استفسار فقط) —" },
  { value: "appointments", label: "المواعيد" },
  { value: "records", label: "الملفات الطبية" },
  { value: "pharmacy", label: "الصيدلية" },
  { value: "care", label: "الرعاية" },
  { value: "billing", label: "الفواتير والتأمين" },
  { value: "support", label: "الدعم" },
] as const;

type Form = {
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  icon: string;
  price_from: string;
  duration_min: string;
  image_url: string;
  href: string;
  category: string;
  requires_auth: boolean;
  show_in_portal: boolean;
  display_order: number;
  is_active: boolean;
};
const EMPTY: Form = {
  slug: "",
  name_ar: "",
  name_en: "",
  description_ar: "",
  description_en: "",
  icon: "",
  price_from: "",
  duration_min: "",
  image_url: "",
  href: "",
  category: "",
  requires_auth: false,
  show_in_portal: false,
  display_order: 0,
  is_active: true,
};

function ServiceEditor() {
  const { id } = Route.useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const getFn = useServerFn(getOwnerService);
  const createFn = useServerFn(createOwnerService);
  const updateFn = useServerFn(updateOwnerService);

  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const row: any = await getFn({ data: { id } });
        setForm({
          slug: row.slug ?? "",
          name_ar: row.name_ar ?? "",
          name_en: row.name_en ?? "",
          description_ar: row.description_ar ?? "",
          description_en: row.description_en ?? "",
          icon: row.icon ?? "",
          price_from: row.price_from != null ? String(row.price_from) : "",
          duration_min: row.duration_min != null ? String(row.duration_min) : "",
          image_url: row.image_url ?? "",
          href: row.href ?? "",
          category: row.category ?? "",
          requires_auth: !!row.requires_auth,
          show_in_portal: !!row.show_in_portal,
          display_order: row.display_order ?? 0,
          is_active: !!row.is_active,
        });
      } catch (e: any) {
        toast.error(e?.message ?? "تعذّر التحميل");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew, getFn]);

  function up<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    setSaving(true);
    try {
      const payload = {
        slug: form.slug,
        name_ar: form.name_ar,
        name_en: form.name_en,
        description_ar: form.description_ar,
        description_en: form.description_en,
        icon: form.icon || null,
        price_from: form.price_from ? Number(form.price_from) : null,
        duration_min: form.duration_min ? Number(form.duration_min) : null,
        image_url: form.image_url || null,
        href: form.href || null,
        category: form.category || null,
        requires_auth: form.requires_auth,
        show_in_portal: form.show_in_portal,
        display_order: Number(form.display_order) || 0,
        is_active: form.is_active,
      } as any;

      if (isNew) {
        const row: any = await createFn({ data: payload });
        toast.success("تم إنشاء الخدمة");
        navigate({ to: "/owner/services/$id", params: { id: row.id } });
      } else {
        await updateFn({ data: { id, ...payload } });
        toast.success("تم الحفظ");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="p-8 text-center text-slate-500" dir="rtl">
        جاري التحميل…
      </div>
    );

  return (
    <div className="p-6 md:p-8 max-w-4xl" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="رجوع إلى الخدمات">
            <Link to="/owner/services">
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold text-slate-900">
            {isNew ? "خدمة جديدة" : form.name_ar || "تحرير الخدمة"}
          </h1>
        </div>
        <Button onClick={submit} disabled={saving}>
          <Save className="h-4 w-4 ml-1" /> {saving ? "…" : "حفظ"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white rounded-xl border shadow-sm p-5">
        <div className="md:col-span-2">
          <Label>Slug</Label>
          <Input
            dir="ltr"
            value={form.slug}
            onChange={(e) => up("slug", e.target.value.toLowerCase())}
            placeholder="esvc-book"
          />
        </div>
        <div>
          <Label>الاسم (عربي)</Label>
          <Input value={form.name_ar} onChange={(e) => up("name_ar", e.target.value)} />
        </div>
        <div>
          <Label>Name (EN)</Label>
          <Input dir="ltr" value={form.name_en} onChange={(e) => up("name_en", e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label>الوصف (عربي)</Label>
          <Textarea
            rows={3}
            value={form.description_ar}
            onChange={(e) => up("description_ar", e.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <Label>Description (EN)</Label>
          <Textarea
            dir="ltr"
            rows={3}
            value={form.description_en}
            onChange={(e) => up("description_en", e.target.value)}
          />
        </div>

        <div className="md:col-span-2 rounded-lg bg-slate-50 border p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-800">عرض في بوابة الخدمات (/services)</div>
          <div className="flex items-center justify-between">
            <Label>تظهر في البوابة</Label>
            <Switch
              checked={form.show_in_portal}
              onCheckedChange={(v) => up("show_in_portal", v)}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>الرابط (مسار داخلي)</Label>
              <Input
                dir="ltr"
                value={form.href}
                onChange={(e) => up("href", e.target.value)}
                placeholder="/book"
              />
            </div>
            <div>
              <Label>التصنيف</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.category}
                onChange={(e) => up("category", e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value || "none"} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label>تتطلب تسجيل دخول</Label>
            <Switch checked={form.requires_auth} onCheckedChange={(v) => up("requires_auth", v)} />
          </div>
        </div>

        <div>
          <Label>السعر من (ر.س)</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.price_from}
            onChange={(e) => up("price_from", e.target.value)}
          />
        </div>
        <div>
          <Label>المدة (دقيقة)</Label>
          <Input
            type="number"
            min={0}
            value={form.duration_min}
            onChange={(e) => up("duration_min", e.target.value)}
          />
        </div>
        <div>
          <Label>الأيقونة (اسم من lucide)</Label>
          <Input
            dir="ltr"
            value={form.icon}
            onChange={(e) => up("icon", e.target.value)}
            placeholder="Stethoscope"
          />
        </div>
        <div>
          <Label>الترتيب</Label>
          <Input
            type="number"
            min={0}
            value={form.display_order}
            onChange={(e) => up("display_order", Number(e.target.value) || 0)}
          />
        </div>
        <div className="md:col-span-2">
          <Label>رابط الصورة</Label>
          <Input
            dir="ltr"
            value={form.image_url}
            onChange={(e) => up("image_url", e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div className="md:col-span-2 flex items-center justify-between pt-2 border-t">
          <Label>مفعّلة</Label>
          <Switch checked={form.is_active} onCheckedChange={(v) => up("is_active", v)} />
        </div>
      </div>
    </div>
  );
}
