import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  getCmsEntry, saveCmsVersion, submitCmsForReview, reviewCmsEntry,
  publishCmsEntry, scheduleCmsEntry, archiveCmsEntry, rollbackCmsVersion,
  createCmsPreviewToken, listCmsAudit, getCmsRoleInfo, getCmsVersion,
} from "@/lib/admin/cms/cms.functions";
import { CMS_KINDS, type CmsKind, type FieldDef } from "@/lib/admin/cms/schemas";
import { Card } from "@/components/ui-v3";
import { Button } from "@/components/ui-v3";
import { Badge } from "@/components/ui-v3";
import { toast } from "sonner";
import { MediaField } from "@/components/admin/MediaPicker";
import { useCmsTransitionNotifications } from "@/lib/admin/cms/useCmsTransitionNotifications";

export const Route = createFileRoute("/_authenticated/admin/cms/$kind/$id")({
  head: () => ({ meta: [{ title: "محرر المحتوى" }] }),
  component: CmsEditor,
});

type Tab = "ar" | "en" | "seo" | "schedule" | "history";

function CmsEditor() {
  const { kind, id } = Route.useParams() as { kind: CmsKind; id: string };
  useCmsTransitionNotifications({ entryId: id });
  const def = CMS_KINDS[kind];
  const qc = useQueryClient();
  const getFn = useServerFn(getCmsEntry);
  const saveFn = useServerFn(saveCmsVersion);
  const submitFn = useServerFn(submitCmsForReview);
  const reviewFn = useServerFn(reviewCmsEntry);
  const publishFn = useServerFn(publishCmsEntry);
  const scheduleFn = useServerFn(scheduleCmsEntry);
  const archiveFn = useServerFn(archiveCmsEntry);
  const rollbackFn = useServerFn(rollbackCmsVersion);
  const previewFn = useServerFn(createCmsPreviewToken);
  const auditFn = useServerFn(listCmsAudit);
  const roleFn = useServerFn(getCmsRoleInfo);
  const versionFn = useServerFn(getCmsVersion);

  const { data } = useSuspenseQuery({
    queryKey: ["cms", "entry", id],
    queryFn: () => getFn({ data: { id } }),
  });
  const { data: roleInfo } = useSuspenseQuery({
    queryKey: ["cms", "role"],
    queryFn: () => roleFn(),
  });

  const canPublish = roleInfo.role === "admin" || roleInfo.role === "super_admin";

  const [tab, setTab] = useState<Tab>("ar");
  const [ar, setAr] = useState<Record<string, any>>({});
  const [en, setEn] = useState<Record<string, any>>({});
  const [seo, setSeo] = useState<Record<string, string>>({});
  const [ogImage, setOgImage] = useState<string>("");
  const [note, setNote] = useState("");
  const [publishAt, setPublishAt] = useState<string>("");

  useEffect(() => {
    setAr((data.current?.payload_ar as any) ?? {});
    setEn((data.current?.payload_en as any) ?? {});
    setSeo((data.current?.seo as any) ?? {});
    setOgImage((data.current?.og_image_url as string) ?? "");
  }, [data.current?.id]);

  const save = useMutation({
    mutationFn: () => saveFn({
      data: {
        entry_id: id,
        payload_ar: ar,
        payload_en: en,
        seo,
        og_image_url: ogImage || null,
        note: note || undefined,
      },
    }),
    onSuccess: (r) => {
      toast.success(`تم الحفظ (v${r.version_no})`);
      setNote("");
      qc.invalidateQueries({ queryKey: ["cms"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل الحفظ"),
  });

  const runAction = (fn: () => Promise<any>, ok: string) =>
    fn()
      .then(() => { toast.success(ok); qc.invalidateQueries({ queryKey: ["cms"] }); })
      .catch((e: any) => toast.error(e?.message ?? "فشل"));

  const preview = useMutation({
    mutationFn: () => previewFn({ data: { entry_id: id } }),
    onSuccess: (r) => {
      navigator.clipboard?.writeText(r.token).catch(() => {});
      toast.success("تم إنشاء رمز المعاينة (نُسخ للحافظة)");
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل"),
  });

  const status = data.entry.status as string;

  if (!def) return <div className="p-6">نوع محتوى غير معروف</div>;

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <div className="flex items-center gap-3 flex-wrap">
        <Link to="/admin/cms/$kind" params={{ kind }} className="text-sm underline">
          ← {def.label}
        </Link>
        <h1 className="text-xl font-bold">{data.entry.title ?? "(بدون عنوان)"}</h1>
        <Badge variant="outline">{status}</Badge>
        <span className="text-[11px] text-muted-foreground">
          AR {(data.entry.locale_completeness as any)?.ar ?? 0}% · EN {(data.entry.locale_completeness as any)?.en ?? 0}%
        </span>
        <div className="flex-1" />
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>حفظ نسخة</Button>
        <Button size="sm" variant="outline" onClick={() => preview.mutate()}>معاينة</Button>
        <Button size="sm" variant="outline"
          onClick={() => runAction(() => submitFn({ data: { entry_id: id } }), "تم التقديم للمراجعة")}
          disabled={status !== "draft"}>
          تقديم للمراجعة
        </Button>
        {canPublish && (
          <>
            <Button size="sm"
              onClick={() => runAction(() => reviewFn({ data: { entry_id: id, decision: "approved" } }), "تم الاعتماد")}
              disabled={status !== "in_review"}>
              اعتماد
            </Button>
            <Button size="sm" variant="outline"
              onClick={() => {
                const c = window.prompt("سبب الرفض (مطلوب):", "");
                if (!c || c.trim().length < 3) { toast.error("يجب إدخال سبب الرفض"); return; }
                runAction(() => reviewFn({ data: { entry_id: id, decision: "rejected", comment: c.trim() } }), "تم الرفض");
              }}
              disabled={status !== "in_review"}>
              رفض
            </Button>
            <Button size="sm" variant="outline"
              onClick={() => {
                const c = window.prompt("طلب تعديلات — الملاحظات (مطلوب):", "");
                if (!c || c.trim().length < 3) { toast.error("يجب إدخال ملاحظات التعديل"); return; }
                runAction(() => reviewFn({ data: { entry_id: id, decision: "changes_requested", comment: c.trim() } }), "أُعيد إلى المسودة");
              }}
              disabled={status !== "in_review"}>
              طلب تعديلات
            </Button>
            <Button size="sm"
              onClick={() => runAction(() => publishFn({ data: { entry_id: id } }), "تم النشر")}
              disabled={!["approved", "scheduled", "draft"].includes(status)}>
              نشر الآن
            </Button>
            <Button size="sm" variant="outline"
              onClick={() => runAction(() => archiveFn({ data: { entry_id: id } }), "تمت الأرشفة")}>
              أرشفة
            </Button>
          </>
        )}
      </div>

      <div className="flex gap-2 border-b">
        {(["ar", "en", "seo", "schedule", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm ${tab === t ? "border-b-2 border-primary font-semibold" : "text-muted-foreground"}`}
          >
            {t === "ar" ? "عربي" : t === "en" ? "English" : t === "seo" ? "SEO/OG" : t === "schedule" ? "جدولة" : "السجل"}
          </button>
        ))}
      </div>

      {tab === "ar" && <FieldsEditor fields={def.fields} value={ar} onChange={setAr} dir="rtl" />}
      {tab === "en" && <FieldsEditor fields={def.fields} value={en} onChange={setEn} dir="ltr" />}

      {tab === "seo" && (
        <Card className="p-4 space-y-3">
          <TextInput label="Title (SEO)" value={seo.title ?? ""} onChange={(v) => setSeo({ ...seo, title: v })} />
          <TextInput label="Description (SEO)" value={seo.description ?? ""} onChange={(v) => setSeo({ ...seo, description: v })} textarea />
          <TextInput label="Canonical URL" value={seo.canonical ?? ""} onChange={(v) => setSeo({ ...seo, canonical: v })} />
          <TextInput label="og:title" value={seo.og_title ?? ""} onChange={(v) => setSeo({ ...seo, og_title: v })} />
          <TextInput label="og:description" value={seo.og_description ?? ""} onChange={(v) => setSeo({ ...seo, og_description: v })} textarea />
          <MediaField label="og:image" value={ogImage} onChange={setOgImage} />
        </Card>
      )}

      {tab === "schedule" && (
        <Card className="p-4 space-y-3">
          <TextInput label="نشر تلقائي في (UTC)" value={publishAt} onChange={setPublishAt} placeholder="2026-08-01T09:00:00Z" />
          <div className="flex gap-2">
            <Button size="sm"
              disabled={!canPublish || !publishAt}
              onClick={() =>
                runAction(
                  () => scheduleFn({ data: { entry_id: id, publish_at: new Date(publishAt).toISOString() } }),
                  "تمت الجدولة",
                )
              }
            >
              جدولة
            </Button>
            {!canPublish && <span className="text-xs text-muted-foreground">تحتاج صلاحية مسؤول للجدولة.</span>}
          </div>
          {data.entry.scheduled_at && (
            <div className="text-xs text-muted-foreground">
              مجدولة حاليًا: {new Date(data.entry.scheduled_at).toLocaleString("ar")}
            </div>
          )}
        </Card>
      )}

      {tab === "history" && (
        <HistoryPanel
          entryId={id}
          versions={data.versions}
          currentId={data.entry.current_version_id}
          canPublish={canPublish}
          onRollback={(vid) =>
            runAction(
              () => rollbackFn({ data: { entry_id: id, version_id: vid } }),
              "تم الاسترجاع والنشر",
            )
          }
          fetchAudit={() => auditFn({ data: { entry_id: id, limit: 100 } })}
          fetchVersion={(vid) => versionFn({ data: { entry_id: id, version_id: vid } })}
        />
      )}

      <div className="flex items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ملاحظة للحفظ (اختياري)"
          className="border rounded px-2 py-1 bg-background text-sm flex-1"
        />
      </div>
    </div>
  );
}

function FieldsEditor({
  fields, value, onChange, dir,
}: {
  fields: FieldDef[]; value: Record<string, any>;
  onChange: (v: Record<string, any>) => void; dir: "rtl" | "ltr";
}) {
  return (
    <Card className="p-4 space-y-3" dir={dir}>
      {fields.map((f) => {
        const v = value[f.name];
        const set = (nv: any) => onChange({ ...value, [f.name]: nv });
        if (f.type === "boolean") {
          return (
            <label key={f.name} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!v} onChange={(e) => set(e.target.checked)} />
              {f.label}
            </label>
          );
        }
        if (f.type === "list") {
          return <ListField key={f.name} f={f} value={Array.isArray(v) ? v : []} onChange={set} />;
        }
        if (f.type === "image") {
          return <MediaField key={f.name} label={f.label + (f.required ? " *" : "")} value={v ?? ""} onChange={set} />;
        }
        const textarea = f.type === "textarea" || f.type === "rich";
        return (
          <TextInput
            key={f.name}
            label={f.label + (f.required ? " *" : "")}
            value={v ?? ""}
            onChange={set}
            textarea={textarea}
            placeholder={f.type === "url" ? "https://…" : undefined}
          />
        );
      })}
    </Card>
  );
}

function ListField({ f, value, onChange }: { f: FieldDef; value: any[]; onChange: (v: any[]) => void }) {
  const cols = f.itemFields ?? [];
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{f.label}</div>
      {value.map((row, i) => (
        <div key={i} className="grid gap-2 md:grid-cols-2 border rounded p-2">
          {cols.map((c) => (
            <TextInput
              key={c.name}
              label={c.label}
              value={row[c.name] ?? ""}
              onChange={(nv) => {
                const next = value.slice();
                next[i] = { ...next[i], [c.name]: nv };
                onChange(next);
              }}
              textarea={c.type === "textarea"}
            />
          ))}
          <button
            type="button"
            className="text-xs text-red-600 justify-self-start"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            حذف
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-sm underline"
        onClick={() => onChange([...value, {}])}
      >
        + إضافة عنصر
      </button>
    </div>
  );
}

function TextInput({
  label, value, onChange, textarea, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  textarea?: boolean; placeholder?: string;
}) {
  return (
    <label className="text-sm block">
      <span className="block text-xs text-muted-foreground mb-1">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className="w-full border rounded px-2 py-1 bg-background text-sm"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border rounded px-2 py-1 bg-background text-sm"
        />
      )}
    </label>
  );
}

function HistoryPanel({
  versions, currentId, canPublish, onRollback, fetchAudit,
}: {
  entryId: string;
  versions: any[];
  currentId: string | null;
  canPublish: boolean;
  onRollback: (versionId: string) => void;
  fetchAudit: () => Promise<any[]>;
}) {
  const [audit, setAudit] = useState<any[] | null>(null);
  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-bold mb-2">النسخ</h3>
        <ul className="space-y-1 text-sm">
          {versions.map((v) => (
            <li key={v.id} className="flex items-center justify-between border-b py-1 last:border-0">
              <span>
                <span className="font-mono">v{v.version_no}</span>
                <span className="text-muted-foreground ms-2">{new Date(v.created_at).toLocaleString("ar")}</span>
                {v.note && <span className="text-muted-foreground ms-2">— {v.note}</span>}
                {v.id === currentId && <Badge className="ms-2" variant="secondary">الحالية</Badge>}
              </span>
              {canPublish && v.id !== currentId && (
                <Button size="sm" variant="outline" onClick={() => onRollback(v.id)}>
                  استرجاع
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold">سجل التدقيق</h3>
          <Button size="sm" variant="outline" onClick={() => fetchAudit().then(setAudit)}>
            تحميل
          </Button>
        </div>
        {audit && (
          <ul className="space-y-1 text-xs font-mono">
            {audit.map((a: any) => (
              <li key={a.id} className="border-b py-1 last:border-0">
                <span className="text-muted-foreground">{new Date(a.created_at).toLocaleString("ar")}</span>
                {" · "}
                <span>{a.action}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
