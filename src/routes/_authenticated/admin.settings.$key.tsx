import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  Settings,
  Save,
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";
import { getSystemSetting, updateSystemSetting } from "@/lib/admin/system-settings.functions";

export const Route = createFileRoute("/_authenticated/admin/settings/$key")({
  head: ({ params }) => ({
    meta: [
      { title: `الإعداد ${params.key} | لوحة الإدارة` },
      { name: "description", content: `تفاصيل قيمة الإعداد ${params.key}.` },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل الإعداد</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
      >
        <RefreshCw className="h-4 w-4" /> إعادة المحاولة
      </button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="container-app py-16 text-center text-muted-foreground">الإعداد غير موجود.</div>
  ),
  component: SettingDetail,
});

function formatValue(v: unknown): string {
  if (v == null) return "null";
  if (typeof v === "string") return JSON.stringify(v, null, 2);
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function SettingDetail() {
  const { key } = Route.useParams();
  const fn = useServerFn(getSystemSetting);
  const updateFn = useServerFn(updateSystemSetting);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin-system-setting", key],
    queryFn: () => fn({ data: { key } }),
  });

  const [isEditing, setIsEditing] = useState(false);
  const [valueDraft, setValueDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [successAt, setSuccessAt] = useState<number | null>(null);

  useEffect(() => {
    if (query.data && !isEditing) {
      setValueDraft(formatValue(query.data.value));
      setDescDraft(query.data.description ?? "");
    }
  }, [query.data, isEditing]);

  const mutation = useMutation({
    mutationFn: (input: { value_json: string; description: string | null }) =>
      updateFn({
        data: {
          key,
          value_json: input.value_json,
          description: input.description,
        },
      }),
    onSuccess: () => {
      setSuccessAt(Date.now());
      setIsEditing(false);
      setJsonError(null);
      queryClient.invalidateQueries({ queryKey: ["admin-system-setting", key] });
      queryClient.invalidateQueries({ queryKey: ["admin-system-settings"] });
    },
  });

  const validateJson = (raw: string): boolean => {
    try {
      JSON.parse(raw);
      setJsonError(null);
      return true;
    } catch (e) {
      setJsonError((e as Error).message);
      return false;
    }
  };

  const handleSave = () => {
    if (!validateJson(valueDraft)) return;
    mutation.mutate({
      value_json: valueDraft,
      description: descDraft.trim() ? descDraft.trim() : null,
    });
  };

  const handleCancel = () => {
    if (query.data) {
      setValueDraft(formatValue(query.data.value));
      setDescDraft(query.data.description ?? "");
    }
    setJsonError(null);
    setIsEditing(false);
    mutation.reset();
  };

  return (
    <div className="container-app py-6 space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/admin/settings" className="hover:text-foreground inline-flex items-center gap-1">
          <ArrowRight className="h-4 w-4" /> إعدادات النظام
        </Link>
        <span>/</span>
        <span className="text-foreground font-mono">{key}</span>
      </div>

      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-primary" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-semibold font-mono">{key}</h1>
            <p className="text-sm text-muted-foreground">تفاصيل قيمة الإعداد</p>
          </div>
        </div>
        {query.data && !isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Save className="h-4 w-4" /> تعديل
          </button>
        )}
      </header>

      {successAt && !isEditing && (
        <div
          role="status"
          className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-2"
        >
          <CheckCircle2 className="h-4 w-4" /> تم حفظ التغييرات بنجاح.
        </div>
      )}

      {query.isLoading ? (
        <div className="rounded-lg border bg-card p-6 space-y-3" aria-busy="true">
          <div className="h-4 w-1/3 rounded-md bg-muted/60 animate-pulse" />
          <div className="h-4 w-2/3 rounded-md bg-muted/60 animate-pulse" />
          <div className="h-48 rounded-md bg-muted/50 animate-pulse" />
        </div>
      ) : query.isError ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-destructive">
          <AlertTriangle className="mx-auto h-8 w-8 mb-2" />
          {(query.error as Error)?.message ?? "تعذّر التحميل"}
        </div>
      ) : query.data ? (
        <>
          <section className="rounded-lg border bg-card p-4 space-y-2">
            <MetaRow label="الفئة" value={query.data.category} />
            {!isEditing && <MetaRow label="الوصف" value={query.data.description ?? "—"} />}
            <MetaRow
              label="آخر تحديث"
              value={new Date(query.data.updated_at).toLocaleString("ar-SA")}
            />
            <MetaRow
              label="بواسطة"
              value={query.data.updated_by_name ?? query.data.updated_by ?? "—"}
              mono={!query.data.updated_by_name && !!query.data.updated_by}
            />
          </section>

          {isEditing ? (
            <section className="space-y-4">
              {mutation.isError && (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive inline-flex items-center gap-2"
                >
                  <AlertTriangle className="h-4 w-4" />
                  {(mutation.error as Error)?.message ?? "تعذّر الحفظ"}
                </div>
              )}

              <div>
                <label htmlFor="setting-description" className="block text-sm font-medium mb-1.5">
                  الوصف
                </label>
                <input
                  id="setting-description"
                  type="text"
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  disabled={mutation.isPending}
                  maxLength={500}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
                  placeholder="وصف اختياري"
                />
              </div>

              <div>
                <label htmlFor="setting-value" className="block text-sm font-medium mb-1.5">
                  القيمة (JSON)
                </label>
                <textarea
                  id="setting-value"
                  value={valueDraft}
                  onChange={(e) => {
                    setValueDraft(e.target.value);
                    if (jsonError) validateJson(e.target.value);
                  }}
                  onBlur={(e) => validateJson(e.target.value)}
                  disabled={mutation.isPending}
                  spellCheck={false}
                  aria-invalid={jsonError ? true : undefined}
                  aria-describedby={jsonError ? "setting-value-err" : undefined}
                  className={`font-mono w-full rounded-md border bg-muted/30 px-3 py-2 text-xs min-h-[280px] focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 ${
                    jsonError ? "border-destructive" : ""
                  }`}
                />
                {jsonError && (
                  <p id="setting-value-err" role="alert" className="mt-1 text-xs text-destructive">
                    JSON غير صالح: {jsonError}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={mutation.isPending || !!jsonError}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {mutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {mutation.isPending ? "جاري الحفظ..." : "حفظ"}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={mutation.isPending}
                  className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
                >
                  <X className="h-4 w-4" /> إلغاء
                </button>
              </div>
            </section>
          ) : (
            <section>
              <h2 className="text-sm font-medium text-muted-foreground mb-2">القيمة</h2>
              <pre className="rounded-lg border bg-muted/40 p-4 text-xs whitespace-pre-wrap break-words max-h-[500px] overflow-auto">
                {formatValue(query.data.value)}
              </pre>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1 border-b last:border-b-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={`text-sm text-right ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
