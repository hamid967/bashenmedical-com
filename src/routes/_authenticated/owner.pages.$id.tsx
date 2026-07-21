import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getOwnerPage, createOwnerPage, updateOwnerPage } from "@/lib/owner/pages.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowRight, Save, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { MediaPicker, type PickedMedia } from "@/components/owner/MediaPicker";

export const Route = createFileRoute("/_authenticated/owner/pages/$id")({
  head: () => ({ meta: [{ title: "تحرير صفحة · Site Builder" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: PageEditor,
});

type Form = {
  slug: string;
  title_ar: string;
  title_en: string;
  content_ar: string;
  content_en: string;
  seo_title: string;
  seo_description: string;
  og_image: string;
  status: "draft" | "published";
  show_in_nav: boolean;
  nav_order: number;
};

const EMPTY: Form = {
  slug: "", title_ar: "", title_en: "",
  content_ar: "", content_en: "",
  seo_title: "", seo_description: "", og_image: "",
  status: "draft", show_in_nav: false, nav_order: 0,
};

function PageEditor() {
  const { id } = Route.useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const getFn = useServerFn(getOwnerPage);
  const createFn = useServerFn(createOwnerPage);
  const updateFn = useServerFn(updateOwnerPage);

  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // Media picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] =
    useState<"content_ar" | "content_en" | "og_image" | null>(null);
  const arRef = useRef<HTMLTextAreaElement>(null);
  const enRef = useRef<HTMLTextAreaElement>(null);

  function openPicker(target: "content_ar" | "content_en" | "og_image") {
    setPickerTarget(target);
    setPickerOpen(true);
  }

  function handlePick(media: PickedMedia) {
    if (pickerTarget === "og_image") {
      up("og_image", media.url);
      return;
    }
    if (!pickerTarget) return;
    const key = pickerTarget;
    const ref = key === "content_ar" ? arRef.current : enRef.current;
    const snippet = `![${media.alt.replace(/[\[\]]/g, "")}](${media.url})`;
    setForm((f) => {
      const current = f[key];
      const start = ref?.selectionStart ?? current.length;
      const end = ref?.selectionEnd ?? current.length;
      const next = current.slice(0, start) + snippet + current.slice(end);
      // Restore caret after React updates.
      requestAnimationFrame(() => {
        if (ref) {
          const pos = start + snippet.length;
          ref.focus();
          ref.setSelectionRange(pos, pos);
        }
      });
      return { ...f, [key]: next };
    });
  }

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const row: any = await getFn({ data: { id } });
        setForm({
          slug: row.slug ?? "",
          title_ar: row.title_ar ?? "",
          title_en: row.title_en ?? "",
          content_ar: row.content_ar ?? "",
          content_en: row.content_en ?? "",
          seo_title: row.seo_title ?? "",
          seo_description: row.seo_description ?? "",
          og_image: row.og_image ?? "",
          status: row.status ?? "draft",
          show_in_nav: !!row.show_in_nav,
          nav_order: row.nav_order ?? 0,
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

  async function submit(nextStatus?: "draft" | "published") {
    setSaving(true);
    try {
      const payload = { ...form, status: nextStatus ?? form.status };
      if (isNew) {
        const row: any = await createFn({ data: payload });
        toast.success("تم إنشاء الصفحة");
        navigate({ to: "/owner/pages/$id", params: { id: row.id } });
      } else {
        await updateFn({ data: { id, ...payload } });
        toast.success("تم الحفظ");
        setForm((f) => ({ ...f, status: payload.status }));
      }
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-slate-500" dir="rtl">جاري التحميل…</div>;

  return (
    <div className="p-6 md:p-8 max-w-5xl" dir="rtl">
      <div className="flex items-center justify-between mb-6 gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/owner/pages"><ArrowRight className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{isNew ? "صفحة جديدة" : form.title_ar || "تحرير الصفحة"}</h1>
            {!isNew && <div className="text-xs text-slate-500 font-mono mt-1">/p/{form.slug}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => submit("draft")} disabled={saving}>حفظ كمسودّة</Button>
          <Button onClick={() => submit("published")} disabled={saving}>
            <Save className="h-4 w-4 ml-1" /> {saving ? "…" : "نشر"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <div>
            <Label>الرابط (Slug)</Label>
            <Input dir="ltr" value={form.slug} onChange={(e) => up("slug", e.target.value.toLowerCase())} placeholder="about-us" />
            <p className="text-xs text-slate-500 mt-1">يظهر في العنوان: <span className="font-mono">/p/{form.slug || "your-slug"}</span></p>
          </div>

          <Tabs defaultValue="ar">
            <TabsList>
              <TabsTrigger value="ar">العربية</TabsTrigger>
              <TabsTrigger value="en">English</TabsTrigger>
            </TabsList>
            <TabsContent value="ar" className="space-y-3 pt-3">
              <div>
                <Label>العنوان (عربي)</Label>
                <Input value={form.title_ar} onChange={(e) => up("title_ar", e.target.value)} />
              </div>
              <div>
                <Label>المحتوى (عربي)</Label>
                <Textarea value={form.content_ar} onChange={(e) => up("content_ar", e.target.value)}
                  rows={18} className="font-mono text-sm" placeholder="يدعم Markdown أو HTML بسيط" />
              </div>
            </TabsContent>
            <TabsContent value="en" className="space-y-3 pt-3">
              <div>
                <Label>Title (EN)</Label>
                <Input dir="ltr" value={form.title_en} onChange={(e) => up("title_en", e.target.value)} />
              </div>
              <div>
                <Label>Content (EN)</Label>
                <Textarea dir="ltr" value={form.content_en} onChange={(e) => up("content_en", e.target.value)}
                  rows={18} className="font-mono text-sm" placeholder="Markdown or simple HTML" />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
            <h3 className="font-semibold text-slate-900">القائمة</h3>
            <div className="flex items-center justify-between">
              <Label>عرض في القائمة العلوية</Label>
              <Switch checked={form.show_in_nav} onCheckedChange={(v) => up("show_in_nav", v)} />
            </div>
            <div>
              <Label>ترتيب في القائمة</Label>
              <Input type="number" min={0} value={form.nav_order}
                onChange={(e) => up("nav_order", Number(e.target.value) || 0)} />
            </div>
          </div>

          <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
            <h3 className="font-semibold text-slate-900">SEO</h3>
            <div>
              <Label>عنوان SEO</Label>
              <Input value={form.seo_title} onChange={(e) => up("seo_title", e.target.value)} maxLength={200} />
            </div>
            <div>
              <Label>وصف SEO</Label>
              <Textarea rows={3} value={form.seo_description} onChange={(e) => up("seo_description", e.target.value)} maxLength={500} />
            </div>
            <div>
              <Label>صورة OG (رابط)</Label>
              <Input dir="ltr" value={form.og_image} onChange={(e) => up("og_image", e.target.value)} placeholder="https://…" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
