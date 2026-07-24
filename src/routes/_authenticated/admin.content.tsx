/**
 * Phase 6 — Content management console for editors, admins, super_admins.
 * Lists content items with filters, exposes an editor drawer for create /
 * update, status transitions, and an immediate disable kill switch.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import {
  listContentItems,
  upsertContentItem,
  transitionContentStatus,
  toggleContentDisabled,
  getContentStats,
} from "@/lib/admin/content.functions";
import { listPublicBranches } from "@/lib/branches.functions";
import { listSpecialtiesMini } from "@/lib/doctors.functions";
import { Checkbox } from "@/components/ui-v3";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui-v3";
import { Button } from "@/components/ui-v3";
import { Badge } from "@/components/ui-v3";
import { Input } from "@/components/ui-v3";
import { Textarea } from "@/components/ui-v3";
import { Label } from "@/components/ui-v3";
import { Switch } from "@/components/ui-v3";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui-v3";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-v3";
import { toast } from "sonner";
import { Ban, PlayCircle, Plus, BarChart3 } from "lucide-react";

const TYPES = [
  "announcement",
  "offer",
  "screening",
  "new_service",
  "reminder",
  "doctor_spotlight",
  "nearest_slot",
  "suggested_service",
] as const;

const STATUSES = [
  "draft",
  "review",
  "approved",
  "scheduled",
  "published",
  "archived",
] as const;

type Row = {
  id: string;
  type: (typeof TYPES)[number];
  status: (typeof STATUSES)[number];
  title_ar: string;
  title_en: string;
  body_ar: string | null;
  body_en: string | null;
  excerpt_ar: string | null;
  excerpt_en: string | null;
  image_url: string | null;
  cta_label_ar: string | null;
  cta_label_en: string | null;
  cta_href: string | null;
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  branch_id: string | null;
  specialty_id: string | null;
  is_promotional: boolean;
  disabled_at: string | null;
  surface: string;
  audience: Record<string, unknown> | null;
};

export const Route = createFileRoute("/_authenticated/admin/content")({
  head: () => ({
    meta: [
      { title: "إدارة المحتوى | لوحة الإدارة" },
      { name: "description", content: "إدارة الإعلانات والعروض والحملات وتوصيات المحتوى." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ContentAdminPage,
});

export function ContentAdminPage() {
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [editing, setEditing] = React.useState<Row | null>(null);
  const [statsFor, setStatsFor] = React.useState<Row | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "content-items", typeFilter, statusFilter],
    queryFn: () =>
      listContentItems({
        data: {
          type: typeFilter === "all" ? undefined : (typeFilter as never),
          status: statusFilter === "all" ? undefined : (statusFilter as never),
        },
      }),
  });

  const disableMut = useMutation({
    mutationFn: (args: { id: string; disabled: boolean }) =>
      toggleContentDisabled({ data: args }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "content-items"] });
      toast.success("تم التحديث");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const transitionMut = useMutation({
    mutationFn: (args: { id: string; to: (typeof STATUSES)[number] }) =>
      transitionContentStatus({ data: args }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "content-items"] });
      toast.success("تم تغيير الحالة");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">إدارة المحتوى</h1>
          <p className="text-sm text-muted-foreground">
            الإعلانات والعروض والحملات وتوصيات المحتوى داخل بوابة المريض.
          </p>
        </div>
        <Button onClick={() => setEditing(blankRow())}>
          <Plus className="me-1 h-4 w-4" aria-hidden />
          إضافة عنصر
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
          <CardTitle className="text-base">العناصر</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="النوع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأنواع</SelectItem>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="الحالة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">جاري التحميل…</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">لا توجد عناصر.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>العنوان</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الأولوية</TableHead>
                  <TableHead>النافذة</TableHead>
                  <TableHead>حالة التفعيل</TableHead>
                  <TableHead className="text-end">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows as Row[]).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-[260px] truncate">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{r.title_ar}</span>
                        {r.is_promotional && (
                          <Badge variant="secondary" className="text-[10px]">إعلان</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{r.type}</Badge></TableCell>
                    <TableCell><Badge>{r.status}</Badge></TableCell>
                    <TableCell>{r.priority}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatRange(r.starts_at, r.ends_at)}
                    </TableCell>
                    <TableCell>
                      {r.disabled_at ? (
                        <Badge variant="destructive">معطّل</Badge>
                      ) : (
                        <Badge variant="secondary">نشط</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setStatsFor(r)}>
                          <BarChart3 className="h-3 w-3" aria-hidden />
                        </Button>
                        <Select
                          value={r.status}
                          onValueChange={(to) =>
                            transitionMut.mutate({ id: r.id, to: to as (typeof STATUSES)[number] })
                          }
                        >
                          <SelectTrigger className="h-7 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant={r.disabled_at ? "outline" : "destructive"}
                          onClick={() =>
                            disableMut.mutate({ id: r.id, disabled: !r.disabled_at })
                          }
                          title={r.disabled_at ? "إعادة تفعيل" : "تعطيل فورًا"}
                        >
                          {r.disabled_at ? (
                            <PlayCircle className="h-3 w-3" aria-hidden />
                          ) : (
                            <Ban className="h-3 w-3" aria-hidden />
                          )}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                          تحرير
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <EditorSheet
        row={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["admin", "content-items"] });
        }}
      />
      <StatsSheet row={statsFor} onClose={() => setStatsFor(null)} />
    </div>
  );
}

function blankRow(): Row {
  return {
    id: "",
    type: "announcement",
    status: "draft",
    title_ar: "",
    title_en: "",
    body_ar: "",
    body_en: "",
    excerpt_ar: "",
    excerpt_en: "",
    image_url: "",
    cta_label_ar: "",
    cta_label_en: "",
    cta_href: "",
    starts_at: null,
    ends_at: null,
    priority: 0,
    branch_id: null,
    specialty_id: null,
    is_promotional: false,
    disabled_at: null,
    surface: "dashboard_bento",
    audience: {},
  };
}

function formatRange(a: string | null, b: string | null) {
  const f = (v: string | null) => (v ? new Date(v).toLocaleDateString("ar-SA") : "—");
  return `${f(a)} → ${f(b)}`;
}

function EditorSheet({
  row,
  onClose,
  onSaved,
}: {
  row: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState<Row | null>(row);
  React.useEffect(() => setForm(row), [row]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const payload = {
        id: form.id || undefined,
        type: form.type,
        title_ar: form.title_ar,
        title_en: form.title_en,
        body_ar: form.body_ar || null,
        body_en: form.body_en || null,
        excerpt_ar: form.excerpt_ar || null,
        excerpt_en: form.excerpt_en || null,
        image_url: form.image_url || null,
        cta_label_ar: form.cta_label_ar || null,
        cta_label_en: form.cta_label_en || null,
        cta_href: form.cta_href || null,
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
        priority: form.priority ?? 0,
        branch_id: form.branch_id || null,
        specialty_id: form.specialty_id || null,
        audience: form.audience ?? {},
        is_promotional: form.is_promotional,
        surface: form.surface || "dashboard_bento",
      };
      return upsertContentItem({ data: payload });
    },
    onSuccess: () => {
      toast.success("تم الحفظ");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!form) return null;
  const set = <K extends keyof Row>(k: K, v: Row[K]) =>
    setForm((prev) => (prev ? { ...prev, [k]: v } : prev));

  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{form.id ? "تحرير عنصر" : "عنصر جديد"}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="النوع">
              <Select value={form.type} onValueChange={(v) => set("type", v as Row["type"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="السطح">
              <Input
                value={form.surface}
                onChange={(e) => set("surface", e.target.value)}
                placeholder="dashboard_bento"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="العنوان (عربي)">
              <Input value={form.title_ar} onChange={(e) => set("title_ar", e.target.value)} />
            </Field>
            <Field label="Title (EN)">
              <Input value={form.title_en} onChange={(e) => set("title_en", e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="مقتطف (عربي)">
              <Textarea value={form.excerpt_ar ?? ""} onChange={(e) => set("excerpt_ar", e.target.value)} />
            </Field>
            <Field label="Excerpt (EN)">
              <Textarea value={form.excerpt_en ?? ""} onChange={(e) => set("excerpt_en", e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="النص الكامل (عربي)">
              <Textarea rows={4} value={form.body_ar ?? ""} onChange={(e) => set("body_ar", e.target.value)} />
            </Field>
            <Field label="Body (EN)">
              <Textarea rows={4} value={form.body_en ?? ""} onChange={(e) => set("body_en", e.target.value)} />
            </Field>
          </div>

          <Field label="رابط الصورة">
            <Input value={form.image_url ?? ""} onChange={(e) => set("image_url", e.target.value)} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="نص الزر (عربي)">
              <Input value={form.cta_label_ar ?? ""} onChange={(e) => set("cta_label_ar", e.target.value)} />
            </Field>
            <Field label="Button (EN)">
              <Input value={form.cta_label_en ?? ""} onChange={(e) => set("cta_label_en", e.target.value)} />
            </Field>
            <Field label="الرابط">
              <Input value={form.cta_href ?? ""} onChange={(e) => set("cta_href", e.target.value)} placeholder="/services" />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="يبدأ في">
              <Input
                type="datetime-local"
                value={toLocalInput(form.starts_at)}
                onChange={(e) => set("starts_at", fromLocalInput(e.target.value))}
              />
            </Field>
            <Field label="ينتهي في">
              <Input
                type="datetime-local"
                value={toLocalInput(form.ends_at)}
                onChange={(e) => set("ends_at", fromLocalInput(e.target.value))}
              />
            </Field>
            <Field label="الأولوية">
              <Input
                type="number"
                value={form.priority}
                onChange={(e) => set("priority", Number(e.target.value) || 0)}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="فرع مستهدف (اختياري)">
              <BranchSelect
                value={form.branch_id}
                onChange={(v) => set("branch_id", v)}
              />
            </Field>
            <Field label="تخصص مستهدف (اختياري)">
              <SpecialtySelect
                value={form.specialty_id}
                onChange={(v) => set("specialty_id", v)}
              />
            </Field>
          </div>

          <AudienceEditor
            value={(form.audience ?? {}) as AudienceValue}
            onChange={(next) => set("audience", next as Record<string, unknown>)}
          />

          <div className="flex items-center gap-3 rounded-md border p-3">
            <Switch
              id="is_promo"
              checked={form.is_promotional}
              onCheckedChange={(v) => set("is_promotional", !!v)}
            />
            <Label htmlFor="is_promo" className="text-sm">
              محتوى ترويجي (سيظهر بشارة "إعلان" ولا يمكن استخدامه في حملات الفحص/التذكير)
            </Label>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              حفظ
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StatsSheet({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "content-stats", row?.id],
    queryFn: () => getContentStats({ data: { id: row!.id, days: 30 } }),
    enabled: !!row,
  });
  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>إحصاءات (آخر 30 يومًا)</SheetTitle>
        </SheetHeader>
        {row && (
          <div className="mt-4 space-y-3">
            <div className="text-sm text-muted-foreground">{row.title_ar}</div>
            {isLoading || !data ? (
              <div className="text-sm text-muted-foreground">جاري التحميل…</div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <Metric label="مشاهدات" value={data.impressions} />
                <Metric label="نقرات" value={data.clicks} />
                <Metric label="CTR" value={`${(data.ctr * 100).toFixed(1)}%`} />
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3 text-center">
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  return new Date(v).toISOString();
}

/* ---------------------- Audience / Branch / Specialty ---------------------- */

type AudienceValue = {
  languages?: string[];
  preferredBranch?: string[];
  hasBookedSpecialty?: string[];
};

function BranchSelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const { data } = useQuery({
    queryKey: ["admin", "content-branches"],
    queryFn: () => listPublicBranches(),
    staleTime: 300_000,
  });
  return (
    <Select
      value={value ?? "__none__"}
      onValueChange={(v) => onChange(v === "__none__" ? null : v)}
    >
      <SelectTrigger><SelectValue placeholder="بدون تخصيص" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— بدون —</SelectItem>
        {(data ?? []).map((b) => (
          <SelectItem key={b.id} value={b.id}>{b.name_ar}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SpecialtySelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const { data } = useQuery({
    queryKey: ["admin", "content-specialties"],
    queryFn: () => listSpecialtiesMini(),
    staleTime: 300_000,
  });
  return (
    <Select
      value={value ?? "__none__"}
      onValueChange={(v) => onChange(v === "__none__" ? null : v)}
    >
      <SelectTrigger><SelectValue placeholder="بدون تخصيص" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— بدون —</SelectItem>
        {((data ?? []) as Array<{ id: string; name_ar: string }>).map((s) => (
          <SelectItem key={s.id} value={s.id}>{s.name_ar}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AudienceEditor({
  value,
  onChange,
}: {
  value: AudienceValue;
  onChange: (next: AudienceValue) => void;
}) {
  const { data: branches = [] } = useQuery({
    queryKey: ["admin", "content-branches"],
    queryFn: () => listPublicBranches(),
    staleTime: 300_000,
  });
  const { data: specialties = [] } = useQuery({
    queryKey: ["admin", "content-specialties"],
    queryFn: () => listSpecialtiesMini(),
    staleTime: 300_000,
  });

  const langs = value.languages ?? [];
  const branchIds = value.preferredBranch ?? [];
  const specialtyIds = value.hasBookedSpecialty ?? [];

  const toggle = (arr: string[], id: string): string[] =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  const setLangs = (l: string[]) =>
    onChange({ ...value, languages: l.length ? l : undefined });
  const setBranches = (b: string[]) =>
    onChange({ ...value, preferredBranch: b.length ? b : undefined });
  const setSpecialties = (s: string[]) =>
    onChange({ ...value, hasBookedSpecialty: s.length ? s : undefined });

  const specialtyRows = specialties as Array<{ id: string; name_ar: string }>;

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div>
        <Label className="text-sm">اللغة (اترك فارغًا للجميع)</Label>
        <div className="mt-2 flex gap-4">
          {(["ar", "en"] as const).map((l) => (
            <label key={l} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={langs.includes(l)}
                onCheckedChange={() => setLangs(toggle(langs, l))}
              />
              {l === "ar" ? "العربية" : "English"}
            </label>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-sm">الفرع المفضّل للمريض (اختياري)</Label>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {branches.map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={branchIds.includes(b.id)}
                onCheckedChange={() => setBranches(toggle(branchIds, b.id))}
              />
              <span className="truncate">{b.name_ar}</span>
            </label>
          ))}
          {branches.length === 0 && (
            <span className="text-xs text-muted-foreground">لا توجد فروع.</span>
          )}
        </div>
      </div>

      <div>
        <Label className="text-sm">حجز سابق في تخصص (اختياري)</Label>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {specialtyRows.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={specialtyIds.includes(s.id)}
                onCheckedChange={() => setSpecialties(toggle(specialtyIds, s.id))}
              />
              <span className="truncate">{s.name_ar}</span>
            </label>
          ))}
          {specialtyRows.length === 0 && (
            <span className="text-xs text-muted-foreground">لا توجد تخصصات.</span>
          )}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        يتم تطبيق كل المرشحات معًا (AND). لن يظهر العنصر إلا لمن يستوفي جميع الشروط.
      </p>
    </div>
  );
}

