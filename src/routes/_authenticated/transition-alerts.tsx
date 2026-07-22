import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bell,
  Plus,
  Trash2,
  Save,
  Pencil,
  X,
  Check,
  AlertTriangle,
  CheckCircle2,
  Power,
  Share2,
  Lock,
  Filter,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getTransitionsStats, listBranchesForAnalytics } from "@/lib/patients-analytics.functions";

import {
  evaluateRules,
  STATUS_LABEL,
  SCOPE_LABEL,
  SEVERITY_LABEL,
  SEVERITY_STYLES,
  type AlertRule,
  type AlertScope,
  type AlertStatus,
} from "@/lib/transition-alerts";
import {
  listAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
} from "@/lib/transition-alerts.functions";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export const Route = createFileRoute("/_authenticated/transition-alerts")({
  head: () => ({
    meta: [
      { title: "إدارة قواعد تنبيهات الانتقالات | مجمع باعشن الطبي" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TransitionAlertsPage,
});

const STATUS_OPTIONS: AlertStatus[] = ["any", "active", "inactive", "archived", "deceased"];
const SCOPE_OPTIONS: AlertScope[] = ["branch", "actor", "any"];

type Draft = {
  label: string;
  scope: AlertScope;
  status: AlertStatus;
  threshold: number;
  enabled: boolean;
  is_shared: boolean;
};
const EMPTY_DRAFT: Draft = {
  label: "",
  scope: "branch",
  status: "inactive",
  threshold: 10,
  enabled: true,
  is_shared: false,
};

const RULES_KEY = ["transition-alert-rules"] as const;

function TransitionAlertsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAlertRules);
  const createFn = useServerFn(createAlertRule);
  const updateFn = useServerFn(updateAlertRule);
  const deleteFn = useServerFn(deleteAlertRule);

  const rulesQ = useQuery({
    queryKey: RULES_KEY,
    queryFn: () => listFn(),
    staleTime: 15_000,
  });
  const rules: AlertRule[] = useMemo(() => rulesQ.data ?? [], [rulesQ.data]);

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const [filterMine, setFilterMine] = useState<"all" | "mine" | "shared">("all");

  const branchesFn = useServerFn(listBranchesForAnalytics);
  const statsFn = useServerFn(getTransitionsStats);

  const branchesQ = useQuery({
    queryKey: ["ta-branches"],
    queryFn: () => branchesFn(),
    staleTime: 60_000,
  });

  const statsQ = useQuery({
    queryKey: ["ta-stats", branchId, from, to],
    queryFn: () => statsFn({ data: { branchId, from, to } }),
    placeholderData: keepPreviousData,
  });

  const triggered = useMemo(
    () => (statsQ.data ? evaluateRules(rules, statsQ.data) : []),
    [rules, statsQ.data],
  );
  const triggeredByRule = useMemo(() => {
    const m = new Map<string, typeof triggered>();
    for (const t of triggered) {
      const arr = m.get(t.ruleId) ?? [];
      arr.push(t);
      m.set(t.ruleId, arr);
    }
    return m;
  }, [triggered]);

  const filteredRules = useMemo(() => {
    if (filterMine === "mine") return rules.filter((r) => r.is_owner);
    if (filterMine === "shared") return rules.filter((r) => r.is_shared);
    return rules;
  }, [rules, filterMine]);

  const invalidate = () => qc.invalidateQueries({ queryKey: RULES_KEY });

  const createM = useMutation({
    mutationFn: (d: Draft) =>
      createFn({
        data: {
          label: d.label?.trim() || null,
          scope: d.scope,
          status: d.status,
          threshold: d.threshold,
          enabled: d.enabled,
          is_shared: d.is_shared,
        },
      }),
    onSuccess: () => {
      invalidate();
      toast.success("تم إنشاء القاعدة");
      setDraft(EMPTY_DRAFT);
    },
    onError: (e: Error) => toast.error(e.message || "فشل الإنشاء"),
  });

  const updateM = useMutation({
    mutationFn: (payload: { id: string } & Partial<Draft>) =>
      updateFn({
        data: {
          id: payload.id,
          label: payload.label !== undefined ? payload.label?.trim() || null : undefined,
          scope: payload.scope,
          status: payload.status,
          threshold: payload.threshold,
          enabled: payload.enabled,
          is_shared: payload.is_shared,
        },
      }),
    onSuccess: () => {
      invalidate();
      toast.success("تم الحفظ");
    },
    onError: (e: Error) => toast.error(e.message || "فشل التعديل"),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("تم الحذف");
    },
    onError: (e: Error) => toast.error(e.message || "فشل الحذف"),
  });

  const addRule = () => {
    if (!draft.threshold || draft.threshold < 1) return;
    createM.mutate(draft);
  };
  const startEdit = (r: AlertRule) => {
    setEditingId(r.id);
    setEditDraft({
      label: r.label ?? "",
      scope: r.scope,
      status: r.status,
      threshold: r.threshold,
      enabled: r.enabled,
      is_shared: r.is_shared === true,
    });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(EMPTY_DRAFT);
  };
  const saveEdit = () => {
    if (!editingId) return;
    updateM.mutate({ id: editingId, ...editDraft });
    cancelEdit();
  };
  const toggleRule = (r: AlertRule) => updateM.mutate({ id: r.id, enabled: !r.enabled });

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center gap-3 flex-wrap">
          <Link
            to="/transitions-stats"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            إحصائيات الانتقالات
          </Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-lg md:text-xl font-bold flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            إدارة قواعد تنبيهات الانتقالات
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-4">
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground flex items-center gap-4 flex-wrap">
          <span className="font-semibold text-foreground">مستويات الشدة (حسب نسبة التجاوز):</span>
          {(["low", "medium", "high"] as const).map((sev) => {
            const s = SEVERITY_STYLES[sev];
            const range = sev === "low" ? "< ×1.5" : sev === "medium" ? "×1.5 – ×2.5" : "≥ ×2.5";
            return (
              <span
                key={sev}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${s.badge}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                {SEVERITY_LABEL[sev]} <span className="opacity-70">({range})</span>
              </span>
            );
          })}
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        <Tabs defaultValue="rules">
          <TabsList className="grid grid-cols-2 sm:inline-flex h-auto">
            <TabsTrigger value="rules">
              <Bell className="h-4 w-4 ml-1" /> القواعد
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Filter className="h-4 w-4 ml-1" /> الإعدادات وإضافة قاعدة
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="mt-4">
            <Accordion type="multiple" defaultValue={["window", "new"]} className="space-y-3">
              {/* Evaluation window (collapsed by default) */}
              <AccordionItem
                value="window"
                className="rounded-xl border border-border bg-card px-4"
              >
                <AccordionTrigger className="text-sm font-bold hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-primary" />
                    نافذة التقييم
                    <span className="text-xs font-normal text-muted-foreground">
                      ({from} → {to}
                      {branchId ? " · فرع محدد" : " · كل الفروع"})
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 pb-4">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">الفرع</label>
                      <select
                        value={branchId ?? ""}
                        onChange={(e) => setBranchId(e.target.value || null)}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      >
                        <option value="">كل الفروع</option>
                        {(branchesQ.data ?? []).map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name_ar}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">من</label>
                      <input
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">إلى</label>
                      <input
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="flex items-end gap-2 flex-wrap">
                      {[7, 30, 90].map((n) => (
                        <button
                          key={n}
                          onClick={() => {
                            setFrom(daysAgoISO(n));
                            setTo(todayISO());
                          }}
                          className="rounded-md border border-border bg-background px-3 py-2 text-xs hover:bg-muted"
                        >
                          آخر {n} يوم
                        </button>
                      ))}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Add new rule (collapsed by default) */}
              <AccordionItem value="new" className="rounded-xl border border-border bg-card px-4">
                <AccordionTrigger className="text-sm font-bold hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Plus className="h-4 w-4 text-primary" />
                    إضافة قاعدة جديدة
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-2 pt-2 pb-4">
                    <div className="md:col-span-2">
                      <label className="text-xs text-muted-foreground mb-1 block">
                        اسم القاعدة (اختياري)
                      </label>
                      <input
                        type="text"
                        value={draft.label ?? ""}
                        onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                        placeholder="مثال: تنبيه الأرشفة الشهرية"
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">النطاق</label>
                      <select
                        value={draft.scope}
                        onChange={(e) =>
                          setDraft({ ...draft, scope: e.target.value as AlertScope })
                        }
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      >
                        {SCOPE_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {SCOPE_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">الحالة</label>
                      <select
                        value={draft.status}
                        onChange={(e) =>
                          setDraft({ ...draft, status: e.target.value as AlertStatus })
                        }
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">العتبة (≥)</label>
                      <input
                        type="number"
                        min={1}
                        value={draft.threshold}
                        onChange={(e) =>
                          setDraft({ ...draft, threshold: Number(e.target.value) || 0 })
                        }
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={addRule}
                        disabled={createM.isPending}
                        className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90 disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" />
                        {createM.isPending ? "جارٍ الحفظ…" : "حفظ"}
                      </button>
                    </div>
                    <div className="md:col-span-6 flex items-center gap-2 pt-1">
                      <input
                        id="shared-new"
                        type="checkbox"
                        checked={draft.is_shared}
                        onChange={(e) => setDraft({ ...draft, is_shared: e.target.checked })}
                        className="h-4 w-4 accent-primary"
                      />
                      <label
                        htmlFor="shared-new"
                        className="text-xs text-muted-foreground flex items-center gap-1 cursor-pointer"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        مشاركة هذه القاعدة مع بقية الموظفين
                      </label>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </TabsContent>

          <TabsContent value="rules" className="mt-4 space-y-4">
            {/* Rules list */}
            <section className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-sm font-bold">
                  قواعد التنبيهات ({filteredRules.length}/{rules.length})
                </h2>
                <div className="flex items-center gap-1 text-xs">
                  {(["all", "mine", "shared"] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setFilterMine(k)}
                      className={`rounded-md border px-2 py-1 ${filterMine === k ? "bg-primary text-primary-foreground border-primary" : "border-border bg-background hover:bg-muted"}`}
                    >
                      {k === "all" ? "الكل" : k === "mine" ? "قواعدي" : "مشتركة"}
                    </button>
                  ))}
                </div>
              </div>
              {rulesQ.isLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">جارٍ التحميل…</div>
              ) : rulesQ.error ? (
                <div className="p-4 text-sm text-destructive">
                  تعذر التحميل: {(rulesQ.error as Error).message}
                </div>
              ) : filteredRules.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  لا توجد قواعد ضمن هذا الفلتر.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredRules.map((r) => {
                    const isEditing = editingId === r.id;
                    const canEdit = r.is_owner === true;
                    const hits = triggeredByRule.get(r.id) ?? [];
                    return (
                      <div key={r.id} className={`p-4 ${r.enabled ? "" : "opacity-60"}`}>
                        {isEditing ? (
                          <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                            <div className="md:col-span-2">
                              <label className="text-xs text-muted-foreground mb-1 block">
                                اسم
                              </label>
                              <input
                                type="text"
                                value={editDraft.label ?? ""}
                                onChange={(e) =>
                                  setEditDraft({ ...editDraft, label: e.target.value })
                                }
                                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">
                                النطاق
                              </label>
                              <select
                                value={editDraft.scope}
                                onChange={(e) =>
                                  setEditDraft({
                                    ...editDraft,
                                    scope: e.target.value as AlertScope,
                                  })
                                }
                                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                              >
                                {SCOPE_OPTIONS.map((s) => (
                                  <option key={s} value={s}>
                                    {SCOPE_LABEL[s]}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">
                                الحالة
                              </label>
                              <select
                                value={editDraft.status}
                                onChange={(e) =>
                                  setEditDraft({
                                    ...editDraft,
                                    status: e.target.value as AlertStatus,
                                  })
                                }
                                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                              >
                                {STATUS_OPTIONS.map((s) => (
                                  <option key={s} value={s}>
                                    {STATUS_LABEL[s]}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">
                                العتبة
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={editDraft.threshold}
                                onChange={(e) =>
                                  setEditDraft({
                                    ...editDraft,
                                    threshold: Number(e.target.value) || 0,
                                  })
                                }
                                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={saveEdit}
                                className="flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="md:col-span-6 flex items-center gap-2">
                              <input
                                id={`shared-${r.id}`}
                                type="checkbox"
                                checked={editDraft.is_shared}
                                onChange={(e) =>
                                  setEditDraft({ ...editDraft, is_shared: e.target.checked })
                                }
                                className="h-4 w-4 accent-primary"
                              />
                              <label
                                htmlFor={`shared-${r.id}`}
                                className="text-xs text-muted-foreground flex items-center gap-1"
                              >
                                <Share2 className="h-3.5 w-3.5" />
                                مشاركة مع بقية الموظفين
                              </label>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="text-sm flex-1 min-w-0">
                              <div className="font-semibold flex items-center gap-2 flex-wrap">
                                {r.label || `${SCOPE_LABEL[r.scope]} · ${STATUS_LABEL[r.status]}`}
                                {r.is_shared ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] bg-teal-500/15 text-teal-700 border border-teal-500/30 px-1.5 py-0.5 rounded-full">
                                    <Share2 className="h-3 w-3" /> مشتركة
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] bg-muted text-muted-foreground border border-border px-1.5 py-0.5 rounded-full">
                                    <Lock className="h-3 w-3" /> خاصة
                                  </span>
                                )}
                                {!canEdit && (
                                  <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                                    من موظف آخر
                                  </span>
                                )}
                                {!r.enabled && (
                                  <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                                    معطّلة
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {SCOPE_LABEL[r.scope]} · {STATUS_LABEL[r.status]} · العتبة ≥{" "}
                                {r.threshold}
                              </div>
                              {r.enabled &&
                                (hits.length === 0 ? (
                                  <div className="text-xs text-emerald-600 flex items-center gap-1 mt-2">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    ضمن الحد
                                  </div>
                                ) : (
                                  (() => {
                                    const order = { high: 0, medium: 1, low: 2 } as const;
                                    const maxSev = hits.reduce<keyof typeof order>(
                                      (acc, h) =>
                                        order[h.severity] < order[acc] ? h.severity : acc,
                                      "low",
                                    );
                                    const s = SEVERITY_STYLES[maxSev];
                                    return (
                                      <div className={`mt-2 rounded-md border p-2 ${s.ring}`}>
                                        <div
                                          className={`text-xs font-semibold flex items-center gap-2 mb-1 ${s.text}`}
                                        >
                                          <AlertTriangle className="h-3.5 w-3.5" />
                                          تجاوز في {hits.length}{" "}
                                          {hits.length === 1 ? "حالة" : "حالات"}
                                          <span
                                            className={`inline-flex items-center gap-1 rounded-full text-[10px] px-1.5 py-0.5 font-semibold border ${s.badge}`}
                                          >
                                            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                                            أعلى: {SEVERITY_LABEL[maxSev]}
                                          </span>
                                        </div>
                                        <ul className="space-y-1 text-xs">
                                          {hits.slice(0, 5).map((h, i) => {
                                            const hs = SEVERITY_STYLES[h.severity];
                                            return (
                                              <li
                                                key={i}
                                                className="flex justify-between items-center gap-2"
                                              >
                                                <span className="flex items-center gap-2 min-w-0">
                                                  <span
                                                    className={`inline-flex items-center gap-1 rounded-full text-[10px] px-1.5 py-0.5 font-semibold border ${hs.badge}`}
                                                  >
                                                    <span
                                                      className={`h-1.5 w-1.5 rounded-full ${hs.dot}`}
                                                    />
                                                    {SEVERITY_LABEL[h.severity]}
                                                  </span>
                                                  <span className="truncate">{h.subjectName}</span>
                                                </span>
                                                <span
                                                  className={`font-mono font-semibold ${hs.text}`}
                                                >
                                                  {h.count}
                                                  <span className="text-muted-foreground">
                                                    {" "}
                                                    ×{h.ratio.toFixed(1)}
                                                  </span>
                                                </span>
                                              </li>
                                            );
                                          })}
                                          {hits.length > 5 && (
                                            <li className="text-muted-foreground">
                                              …و {hits.length - 5} أخرى
                                            </li>
                                          )}
                                        </ul>
                                      </div>
                                    );
                                  })()
                                ))}
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => toggleRule(r)}
                                disabled={!canEdit}
                                title={canEdit ? (r.enabled ? "تعطيل" : "تفعيل") : "لا تملك صلاحية"}
                                className="rounded-md border border-border p-2 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <Power
                                  className={`h-4 w-4 ${r.enabled ? "text-emerald-600" : "text-muted-foreground"}`}
                                />
                              </button>
                              <button
                                onClick={() => startEdit(r)}
                                disabled={!canEdit}
                                title={canEdit ? "تعديل" : "لا تملك صلاحية"}
                                className="rounded-md border border-border p-2 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm("حذف هذه القاعدة؟")) deleteM.mutate(r.id);
                                }}
                                disabled={!canEdit || deleteM.isPending}
                                title={canEdit ? "حذف" : "لا تملك صلاحية"}
                                className="rounded-md border border-border p-2 hover:bg-destructive/10 text-destructive disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {statsQ.isLoading && (
              <p className="text-sm text-muted-foreground">جارٍ تقييم القواعد…</p>
            )}
            {statsQ.error && (
              <p className="text-sm text-destructive">
                تعذر تحميل الإحصائيات: {(statsQ.error as Error).message}
              </p>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
