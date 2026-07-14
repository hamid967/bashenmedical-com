/**
 * /admin/super/jazan-visual — Super Admin control panel for Jazan visual identity.
 *
 * Controls:
 *  - Intro overlay: enabled, cooldown, duration, AR/EN headline+tagline, licensed logo URL
 *  - Pattern intensity (off/subtle/standard/featured)
 *  - Heritage areas per section (header/home/portal/admin/footer)
 *  - Announcement bar (enabled, AR/EN message)
 *
 * Persistence: system_settings key = `jazan_visual`; RLS restricts UPDATE to super_admin.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Save, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  DEFAULT_JAZAN_SETTINGS,
  loadJazanSettings,
  saveJazanSettings,
  type JazanIntensity,
  type JazanSettings,
} from "@/lib/jazan-settings";

export const Route = createFileRoute("/_authenticated/admin/super/jazan-visual")({
  head: () => ({
    meta: [
      { title: "الهوية البصرية لجازان — لوحة الإدارة" },
      { name: "description", content: "تحكّم Super Admin بمقدمة الموقع، شريط الإعلان، شدة النمط، والتراث حسب الصفحة." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: JazanVisualAdmin,
});

const INTENSITY_LABELS: Record<JazanIntensity, string> = {
  off: "معطّل",
  subtle: "خفيف",
  standard: "قياسي",
  featured: "بارز",
};

function JazanVisualAdmin() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [s, setS] = useState<JazanSettings>(DEFAULT_JAZAN_SETTINGS);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        navigate({ to: "/auth" });
        return;
      }
      const { data: isSuper } = await supabase.rpc("has_role", {
        _user_id: userData.user.id,
        _role: "super_admin",
      });
      const ok = !!isSuper;
      setAllowed(ok);
      if (!ok) {
        setLoading(false);
        return;
      }
      try {
        const loaded = await loadJazanSettings();
        setS(loaded);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    })();
  }, [navigate]);

  const save = async () => {
    setSaving(true);
    try {
      await saveJazanSettings(s);
      toast.success("تم حفظ الإعدادات — التغييرات سارية فورًا");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذّر الحفظ";
      toast.error("تعذّر الحفظ", { description: msg });
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    setS(DEFAULT_JAZAN_SETTINGS);
    toast.info("تمت إعادة القيم الافتراضية — احفظ لتطبيقها");
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">جارٍ التحميل…</div>;
  if (allowed === false) {
    return (
      <div className="max-w-lg mx-auto p-8 text-center">
        <h1 className="text-xl font-semibold mb-2">صلاحيات غير كافية</h1>
        <p className="text-muted-foreground">هذه الصفحة مخصصة لـ Super Admin فقط.</p>
        <Button asChild className="mt-4"><Link to="/admin">العودة للوحة الإدارة</Link></Button>
      </div>
    );
  }

  return (
    <div dir="rtl" className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-[var(--jazan-terracotta,#B85C3C)]" />
            الهوية البصرية لجازان
          </h1>
          <p className="text-sm text-muted-foreground">
            تحكّم بمقدمة الموقع، شريط الإعلان، شدة النمط الزخرفي، وتفعيل عناصر التراث حسب الصفحة.
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

      {/* Intro overlay */}
      <Card>
        <CardHeader><CardTitle>مقدمة الموقع (Intro)</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 flex items-center gap-3">
            <Switch
              checked={s.intro.enabled}
              onCheckedChange={(v) => setS({ ...s, intro: { ...s.intro, enabled: v } })}
            />
            <Label>تفعيل المقدمة السينمائية</Label>
          </div>
          <div>
            <Label>تردد الظهور (ساعات)</Label>
            <Input
              type="number" min={0} max={24 * 90} step={1}
              value={s.intro.cooldownHours}
              onChange={(e) => setS({ ...s, intro: { ...s.intro, cooldownHours: Math.max(0, Math.round(Number(e.target.value) || 0)) } })}
            />
            <p className="text-xs text-muted-foreground mt-1">0 = كل زيارة. الافتراضي 168 (كل 7 أيام).</p>
          </div>
          <div>
            <Label>المدة الكلية (مللي ثانية)</Label>
            <Input
              type="number" min={4000} max={20000} step={500}
              value={s.intro.durationMs}
              onChange={(e) => setS({ ...s, intro: { ...s.intro, durationMs: Math.max(4000, Math.min(20000, Math.round(Number(e.target.value) || 10000))) } })}
            />
            <p className="text-xs text-muted-foreground mt-1">يوصى بين 8000 و 12000.</p>
          </div>
          <div>
            <Label>العنوان الرئيسي (عربي)</Label>
            <Input value={s.intro.headlineAr} onChange={(e) => setS({ ...s, intro: { ...s.intro, headlineAr: e.target.value } })} />
          </div>
          <div>
            <Label>Headline (English)</Label>
            <Input dir="ltr" value={s.intro.headlineEn} onChange={(e) => setS({ ...s, intro: { ...s.intro, headlineEn: e.target.value } })} />
          </div>
          <div>
            <Label>الشعار الفرعي (عربي)</Label>
            <Input value={s.intro.taglineAr} onChange={(e) => setS({ ...s, intro: { ...s.intro, taglineAr: e.target.value } })} />
          </div>
          <div>
            <Label>Tagline (English)</Label>
            <Input dir="ltr" value={s.intro.taglineEn} onChange={(e) => setS({ ...s, intro: { ...s.intro, taglineEn: e.target.value } })} />
          </div>
          <div className="md:col-span-2">
            <Label>رابط الشعار المرخّص (اختياري)</Label>
            <Input
              dir="ltr"
              placeholder="https://…/logo.png"
              value={s.intro.logoUrl}
              onChange={(e) => setS({ ...s, intro: { ...s.intro, logoUrl: e.target.value } })}
            />
            <p className="text-xs text-muted-foreground mt-1">اتركه فارغًا لاستخدام شعار المجمع الافتراضي. استخدم فقط شعارًا لديك حق استعماله.</p>
            {s.intro.logoUrl?.trim() && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.intro.logoUrl} alt="" className="mt-2 h-16 w-16 object-contain rounded border" />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pattern intensity */}
      <Card>
        <CardHeader><CardTitle>شدة النمط الزخرفي (Jazan Pattern)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>الشدة العامة</Label>
            <Select
              value={s.patternIntensity}
              onValueChange={(v) => setS({ ...s, patternIntensity: v as JazanIntensity })}
            >
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(INTENSITY_LABELS) as JazanIntensity[]).map((k) => (
                  <SelectItem key={k} value={k}>{INTENSITY_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              يضبط CSS variable <code>--jazan-intensity</code> ويؤثر على شفافية العناصر الزخرفية المتوافقة.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Heritage per area */}
      <Card>
        <CardHeader><CardTitle>تفعيل عناصر التراث حسب الصفحة</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {(
            [
              ["header", "الهيدر الرئيسي"],
              ["home", "الصفحة الرئيسية"],
              ["portal", "بوابة المرضى"],
              ["admin", "لوحة الإدارة"],
              ["footer", "التذييل (Footer)"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 rounded-md border p-3">
              <Switch
                checked={s.heritageAreas[key]}
                onCheckedChange={(v) => setS({ ...s, heritageAreas: { ...s.heritageAreas, [key]: v } })}
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
          <p className="md:col-span-2 text-xs text-muted-foreground">
            يُضاف class مثل <code>heritage-header</code> على <code>&lt;html&gt;</code> — يمكن للأنماط التصميمية الاستفادة منه لإظهار/إخفاء العناصر الزخرفية.
          </p>
        </CardContent>
      </Card>

      {/* Announcement bar */}
      <Card>
        <CardHeader><CardTitle>شريط الإعلان العلوي</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 flex items-center gap-3">
            <Switch
              checked={s.announcement.enabled}
              onCheckedChange={(v) => setS({ ...s, announcement: { ...s.announcement, enabled: v } })}
            />
            <Label>إظهار شريط الإعلان أعلى الموقع</Label>
          </div>
          <div>
            <Label>الرسالة (عربي)</Label>
            <Textarea
              rows={2}
              value={s.announcement.messageAr}
              onChange={(e) => setS({ ...s, announcement: { ...s.announcement, messageAr: e.target.value } })}
            />
          </div>
          <div>
            <Label>Message (English)</Label>
            <Textarea
              dir="ltr" rows={2}
              value={s.announcement.messageEn}
              onChange={(e) => setS({ ...s, announcement: { ...s.announcement, messageEn: e.target.value } })}
            />
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-between items-center pt-2">
        <Button asChild variant="ghost"><Link to="/admin">← العودة للوحة الإدارة</Link></Button>
        <Button onClick={save} disabled={saving}>
          <Save className="w-4 h-4 ms-1" /> {saving ? "جارٍ الحفظ…" : "حفظ التغييرات"}
        </Button>
      </div>
    </div>
  );
}
