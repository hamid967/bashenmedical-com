import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, GripVertical, Plus, Save, Trash2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  DEFAULT_INTRO_SETTINGS,
  ICON_OPTIONS,
  type IntroSettingsRow,
  type RawService,
  type RawStatMetric,
  type SceneKey,
} from "@/lib/intro-config";

const SCENE_LABELS: Record<SceneKey, string> = {
  pulse: "النبض",
  brand: "الهوية",
  services: "الخدمات",
  stats: "الإحصائيات",
  booking: "خطوات الحجز",
  final: "الختام",
};

export const Route = createFileRoute("/_authenticated/intro-settings")({
  head: () => ({
    meta: [
      { title: "إعدادات المقدمة — لوحة الإدارة" },
      { name: "description", content: "تحكّم بمحتوى مقدمة الموقع بدون تعديل الكود." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: IntroSettingsAdmin,
});

function IntroSettingsAdmin() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [row, setRow] = useState<IntroSettingsRow>(DEFAULT_INTRO_SETTINGS);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        navigate({ to: "/auth" });
        return;
      }
      const [{ data: adminRole }, { data: superRole }] = await Promise.all([
        supabase.rpc("has_role", { _user_id: userData.user.id, _role: "admin" }),
        supabase.rpc("has_role", { _user_id: userData.user.id, _role: "super_admin" }),
      ]);
      const ok = !!(adminRole || superRole);
      setAllowed(ok);
      if (!ok) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("intro_settings")
        .select("*")
        .eq("id", "default")
        .maybeSingle();
      if (!error && data) {
        setRow({ ...DEFAULT_INTRO_SETTINGS, ...(data as unknown as IntroSettingsRow) });
        setUpdatedAt(data.updated_at as string);
      }
      setLoading(false);
    })();
  }, [navigate]);

  const save = async () => {
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const payload = {
      id: "default",
      is_active: row.is_active,
      services: row.services,
      scene_order: row.scene_order,
      stat_metrics: row.stat_metrics,
      headline_ar: row.headline_ar,
      headline_en: row.headline_en,
      tagline_ar: row.tagline_ar,
      tagline_en: row.tagline_en,
      prefetch_enabled: row.prefetch_enabled,
      prefetch_lead_ms: row.prefetch_lead_ms,
      updated_by: userData.user?.id ?? null,
    };
    const { data, error } = await supabase
      .from("intro_settings")
      .upsert(payload, { onConflict: "id" })
      .select()
      .maybeSingle();
    setSaving(false);
    if (error) {
      toast.error("تعذّر الحفظ", { description: error.message });
      return;
    }
    toast.success("تم حفظ الإعدادات");
    if (data) setUpdatedAt(data.updated_at as string);
  };

  const resetDefaults = () => {
    setRow({ ...DEFAULT_INTRO_SETTINGS, is_active: row.is_active });
    toast.info("تمت إعادة القيم الافتراضية — احفظ لتطبيقها");
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">جارٍ التحميل…</div>;
  if (allowed === false) {
    return (
      <div className="max-w-lg mx-auto p-8 text-center">
        <h1 className="text-xl font-semibold mb-2">صلاحيات غير كافية</h1>
        <p className="text-muted-foreground">هذه الصفحة مخصصة للمدراء فقط.</p>
        <Button asChild className="mt-4">
          <Link to="/">العودة للرئيسية</Link>
        </Button>
      </div>
    );
  }

  return (
    <div dir="rtl" className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">إعدادات مقدمة الموقع</h1>
          <p className="text-sm text-muted-foreground">
            حرّر الخدمات، عناوين المشاهد، ترتيبها، ومقاييس الإحصاءات بدون تعديل الكود.
            {updatedAt && ` · آخر تحديث: ${new Date(updatedAt).toLocaleString("ar-SA")}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={resetDefaults}>
            <RotateCcw className="w-4 h-4 ms-1" /> استعادة الافتراضي
          </Button>
          <Button onClick={save} disabled={saving} size="sm">
            <Save className="w-4 h-4 ms-1" /> {saving ? "جارٍ الحفظ…" : "حفظ"}
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>العرض والعناوين</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 flex items-center gap-3">
            <Switch
              checked={row.is_active}
              onCheckedChange={(v) => setRow({ ...row, is_active: v })}
            />
            <Label>تفعيل عرض المقدمة على الموقع</Label>
          </div>
          <div>
            <Label>العنوان (عربي)</Label>
            <Input
              value={row.headline_ar ?? ""}
              onChange={(e) => setRow({ ...row, headline_ar: e.target.value })}
            />
          </div>
          <div>
            <Label>العنوان (إنجليزي)</Label>
            <Input
              dir="ltr"
              value={row.headline_en ?? ""}
              onChange={(e) => setRow({ ...row, headline_en: e.target.value })}
            />
          </div>
          <div>
            <Label>الشعار الفرعي (عربي)</Label>
            <Input
              value={row.tagline_ar ?? ""}
              onChange={(e) => setRow({ ...row, tagline_ar: e.target.value })}
            />
          </div>
          <div>
            <Label>الشعار الفرعي (إنجليزي)</Label>
            <Input
              dir="ltr"
              value={row.tagline_en ?? ""}
              onChange={(e) => setRow({ ...row, tagline_en: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>الأداء والتحميل المسبق</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 flex items-center gap-3">
            <Switch
              checked={row.prefetch_enabled}
              onCheckedChange={(v) => setRow({ ...row, prefetch_enabled: v })}
            />
            <Label>تفعيل التحميل المسبق لوسائط المشهد التالي</Label>
          </div>
          <div className="md:col-span-2">
            <Label>التأخير قبل بدء المشهد (بالمللي ثانية): {row.prefetch_lead_ms}</Label>
            <Input
              type="number"
              min={0}
              max={10000}
              step={100}
              value={row.prefetch_lead_ms}
              disabled={!row.prefetch_enabled}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) {
                  setRow({ ...row, prefetch_lead_ms: Math.max(0, Math.min(10000, Math.round(n))) });
                }
              }}
            />
            <p className="text-xs text-muted-foreground mt-1">
              كم من الوقت قبل بدء المشهد يبدأ تحميل صوره/فيديوهاته (0–10000 مللي ثانية، الافتراضي
              1500).
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ترتيب المشاهد</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            استخدم الأسهم لإعادة ترتيب المشاهد. يمكنك إخفاء أي مشهد بإزالته.
          </p>
          <div className="space-y-2">
            {row.scene_order.map((key, i) => (
              <div key={key} className="flex items-center gap-2 rounded-md border p-2">
                <GripVertical className="w-4 h-4 text-muted-foreground" />
                <span className="flex-1 text-sm">{SCENE_LABELS[key] ?? key}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={i === 0}
                  onClick={() => {
                    const next = [...row.scene_order];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    setRow({ ...row, scene_order: next });
                  }}
                >
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={i === row.scene_order.length - 1}
                  onClick={() => {
                    const next = [...row.scene_order];
                    [next[i + 1], next[i]] = [next[i], next[i + 1]];
                    setRow({ ...row, scene_order: next });
                  }}
                >
                  ↓
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRow({ ...row, scene_order: row.scene_order.filter((_, j) => j !== i) });
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Select
              onValueChange={(v) =>
                setRow({ ...row, scene_order: [...row.scene_order, v as SceneKey] })
              }
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="إضافة مشهد…" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SCENE_LABELS) as SceneKey[])
                  .filter((k) => !row.scene_order.includes(k))
                  .map((k) => (
                    <SelectItem key={k} value={k}>
                      {SCENE_LABELS[k]}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>الخدمات المعروضة</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setRow({
                ...row,
                services: [
                  ...row.services,
                  { id: `svc-${Date.now()}`, titleAr: "", titleEn: "", icon: "Stethoscope" },
                ],
              })
            }
          >
            <Plus className="w-4 h-4 ms-1" /> إضافة خدمة
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {row.services.map((s, i) => (
            <ServiceRow
              key={i}
              value={s}
              onChange={(v) => {
                const next = [...row.services];
                next[i] = v;
                setRow({ ...row, services: next });
              }}
              onRemove={() => setRow({ ...row, services: row.services.filter((_, j) => j !== i) })}
              onMove={(dir) => {
                const j = i + dir;
                if (j < 0 || j >= row.services.length) return;
                const next = [...row.services];
                [next[i], next[j]] = [next[j], next[i]];
                setRow({ ...row, services: next });
              }}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>مقاييس الإحصائيات</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setRow({
                ...row,
                stat_metrics: [
                  ...row.stat_metrics,
                  { id: `stat-${Date.now()}`, labelAr: "", value: 0, icon: "Award", source: "" },
                ],
              })
            }
          >
            <Plus className="w-4 h-4 ms-1" /> إضافة مقياس
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            علّم "مباشر" للمقاييس التي تُحسب من قاعدة البيانات (حاليًا مدعوم: <code>doctors</code>).
            القيمة الرقمية تُتجاهل في هذه الحالة.
          </p>
          <Separator />
          {row.stat_metrics.map((m, i) => (
            <StatRow
              key={i}
              value={m}
              onChange={(v) => {
                const next = [...row.stat_metrics];
                next[i] = v;
                setRow({ ...row, stat_metrics: next });
              }}
              onRemove={() =>
                setRow({ ...row, stat_metrics: row.stat_metrics.filter((_, j) => j !== i) })
              }
            />
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-between items-center pt-2">
        <Button asChild variant="ghost">
          <Link to="/">← العودة للرئيسية</Link>
        </Button>
        <Button onClick={save} disabled={saving}>
          <Save className="w-4 h-4 ms-1" /> {saving ? "جارٍ الحفظ…" : "حفظ التغييرات"}
          <ArrowRight className="w-4 h-4 me-1" />
        </Button>
      </div>
    </div>
  );
}

function ServiceRow({
  value,
  onChange,
  onRemove,
  onMove,
}: {
  value: RawService;
  onChange: (v: RawService) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[auto,1fr,1fr,10rem,auto] gap-2 items-end rounded-md border p-2">
      <div className="flex flex-col gap-1">
        <Button size="sm" variant="ghost" onClick={() => onMove(-1)}>
          ↑
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onMove(1)}>
          ↓
        </Button>
      </div>
      <div>
        <Label className="text-xs">العنوان (عربي)</Label>
        <Input
          value={value.titleAr}
          onChange={(e) => onChange({ ...value, titleAr: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">العنوان (إنجليزي)</Label>
        <Input
          dir="ltr"
          value={value.titleEn}
          onChange={(e) => onChange({ ...value, titleEn: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">الأيقونة</Label>
        <Select value={value.icon} onValueChange={(v) => onChange({ ...value, icon: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {ICON_OPTIONS.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button variant="ghost" size="icon" onClick={onRemove} aria-label="حذف الخدمة">
        <Trash2 className="w-4 h-4 text-destructive" />
      </Button>
    </div>
  );
}

function StatRow({
  value,
  onChange,
  onRemove,
}: {
  value: RawStatMetric;
  onChange: (v: RawStatMetric) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr,6rem,5rem,5rem,10rem,1fr,auto,auto] gap-2 items-end rounded-md border p-2">
      <div>
        <Label className="text-xs">النص العربي</Label>
        <Input
          value={value.labelAr}
          onChange={(e) => onChange({ ...value, labelAr: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">القيمة</Label>
        <Input
          type="number"
          value={value.value ?? ""}
          disabled={!!value.live}
          onChange={(e) =>
            onChange({
              ...value,
              value: e.target.value === "" ? undefined : Number(e.target.value),
            })
          }
        />
      </div>
      <div>
        <Label className="text-xs">Prefix</Label>
        <Input
          value={value.prefix ?? ""}
          onChange={(e) => onChange({ ...value, prefix: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">Suffix</Label>
        <Input
          value={value.suffix ?? ""}
          onChange={(e) => onChange({ ...value, suffix: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">الأيقونة</Label>
        <Select value={value.icon} onValueChange={(v) => onChange({ ...value, icon: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {ICON_OPTIONS.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">المصدر</Label>
        <Input
          value={value.source}
          onChange={(e) => onChange({ ...value, source: e.target.value })}
        />
      </div>
      <div className="flex flex-col items-center gap-1">
        <Label className="text-xs">مباشر</Label>
        <Switch checked={!!value.live} onCheckedChange={(v) => onChange({ ...value, live: v })} />
      </div>
      <Button variant="ghost" size="icon" onClick={onRemove} aria-label="حذف المقياس">
        <Trash2 className="w-4 h-4 text-destructive" />
      </Button>
    </div>
  );
}
