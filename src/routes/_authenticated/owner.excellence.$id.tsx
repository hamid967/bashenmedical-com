import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  getOwnerExcellence,
  createOwnerExcellence,
  updateOwnerExcellence,
} from "@/lib/owner/excellence.functions";
import { listOwnerSpecialties } from "@/lib/owner/specialties.functions";
import { Button } from "@/components/ui-v3";
import { Input } from "@/components/ui-v3";
import { Label } from "@/components/ui-v3";
import { Textarea } from "@/components/ui-v3";
import { Switch } from "@/components/ui-v3";
import { ArrowRight, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/owner/excellence/$id")({
  head: () => ({
    meta: [
      { title: "تحرير مركز تميز · Site Builder" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ExcellenceEditor,
});

type Form = {
  slug: string;
  name_ar: string;
  name_en: string;
  short_ar: string;
  short_en: string;
  description_ar: string;
  description_en: string;
  icon: string;
  hero_image_url: string;
  specialty_id: string;
  sort_order: number;
  is_active: boolean;
};

const EMPTY: Form = {
  slug: "",
  name_ar: "",
  name_en: "",
  short_ar: "",
  short_en: "",
  description_ar: "",
  description_en: "",
  icon: "",
  hero_image_url: "",
  specialty_id: "",
  sort_order: 0,
  is_active: true,
};

function ExcellenceEditor() {
  const { id } = Route.useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const getFn = useServerFn(getOwnerExcellence);
  const createFn = useServerFn(createOwnerExcellence);
  const updateFn = useServerFn(updateOwnerExcellence);
  const listSpecs = useServerFn(listOwnerSpecialties);

  const specsQ = useQuery({
    queryKey: ["owner", "specialties"],
    queryFn: () => listSpecs(),
  });

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
          short_ar: row.short_ar ?? "",
          short_en: row.short_en ?? "",
          description_ar: row.description_ar ?? "",
          description_en: row.description_en ?? "",
          icon: row.icon ?? "",
          hero_image_url: row.hero_image_url ?? "",
          specialty_id: row.specialty_id ?? "",
          sort_order: row.sort_order ?? 0,
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
        short_ar: form.short_ar || null,
        short_en: form.short_en || null,
        description_ar: form.description_ar || null,
        description_en: form.description_en || null,
        icon: form.icon || null,
        hero_image_url: form.hero_image_url || null,
        specialty_id: form.specialty_id || null,
        sort_order: Number(form.sort_order) || 0,
        is_active: form.is_active,
      };
      if (isNew) {
        const row: any = await createFn({ data: payload });
        toast.success("تم إنشاء المركز");
        navigate({ to: "/owner/excellence/$id", params: { id: row.id } });
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
          <Button asChild variant="ghost" size="icon" aria-label="رجوع">
            <Link to="/owner/excellence">
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold text-slate-900">
            {isNew ? "مركز تميز جديد" : form.name_ar || "تحرير المركز"}
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
            placeholder="cardiology"
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
        <div>
          <Label>وصف مختصر (عربي)</Label>
          <Input value={form.short_ar} onChange={(e) => up("short_ar", e.target.value)} />
        </div>
        <div>
          <Label>Short (EN)</Label>
          <Input dir="ltr" value={form.short_en} onChange={(e) => up("short_en", e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label>الوصف الكامل (عربي)</Label>
          <Textarea
            rows={4}
            value={form.description_ar}
            onChange={(e) => up("description_ar", e.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <Label>Full description (EN)</Label>
          <Textarea
            dir="ltr"
            rows={4}
            value={form.description_en}
            onChange={(e) => up("description_en", e.target.value)}
          />
        </div>
        <div>
          <Label>الأيقونة (Lucide)</Label>
          <Input
            dir="ltr"
            value={form.icon}
            onChange={(e) => up("icon", e.target.value)}
            placeholder="Heart"
          />
        </div>
        <div>
          <Label>التخصص المرتبط</Label>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={form.specialty_id}
            onChange={(e) => up("specialty_id", e.target.value)}
          >
            <option value="">— بدون —</option>
            {(specsQ.data ?? []).map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name_ar}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <Label>رابط صورة الغلاف</Label>
          <Input
            dir="ltr"
            value={form.hero_image_url}
            onChange={(e) => up("hero_image_url", e.target.value)}
            placeholder="https://… أو /api/public/media/…"
          />
        </div>
        <div>
          <Label>الترتيب</Label>
          <Input
            type="number"
            min={0}
            value={form.sort_order}
            onChange={(e) => up("sort_order", Number(e.target.value) || 0)}
          />
        </div>
        <div className="flex items-center justify-between pt-2">
          <Label>مفعّل</Label>
          <Switch checked={form.is_active} onCheckedChange={(v) => up("is_active", v)} />
        </div>
      </div>
    </div>
  );
}
