import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Download, RefreshCw } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { exportCsv, type Column } from "@/lib/export-utils";
import { fetchAuditExport, listBranchesForAudit } from "@/lib/audit-export.functions";

export const Route = createFileRoute("/_authenticated/audit-export")({
  head: () => ({
    meta: [{ title: "تصدير السجلات الزمنية | Ranin Clinic" }],
  }),
  component: AuditExportPage,
});

type Kind =
  | "appointment_audit"
  | "security_audit_log"
  | "reminder_preference_audit"
  | "dashboard_recent_activity";

const KIND_LABEL: Record<Kind, string> = {
  appointment_audit: "تدقيق المواعيد",
  security_audit_log: "سجل الأمان",
  reminder_preference_audit: "تفضيلات التذكير",
  dashboard_recent_activity: "النشاط الأخير",
};

const EVENT_OPTIONS: Record<Kind, Array<{ value: string; label: string }>> = {
  appointment_audit: [
    { value: "", label: "كل الحالات" },
    { value: "new", label: "جديد" },
    { value: "confirmed", label: "مؤكد" },
    { value: "cancelled", label: "ملغى" },
    { value: "no_show", label: "لم يحضر" },
    { value: "completed", label: "مكتمل" },
  ],
  security_audit_log: [
    { value: "", label: "كل الأحداث" },
    { value: "login_success", label: "تسجيل دخول ناجح" },
    { value: "login_failed", label: "محاولة فاشلة" },
    { value: "role_assigned", label: "منح صلاحية" },
    { value: "role_revoked", label: "سحب صلاحية" },
  ],
  reminder_preference_audit: [
    { value: "", label: "كل الأنواع" },
    { value: "reminder_24h", label: "تذكير 24 ساعة" },
    { value: "reminder_2h", label: "تذكير ساعتين" },
  ],
  dashboard_recent_activity: [
    { value: "", label: "كل التغييرات" },
    { value: "confirmed", label: "تأكيد" },
    { value: "cancelled", label: "إلغاء" },
    { value: "no_show", label: "لم يحضر" },
    { value: "completed", label: "مكتمل" },
  ],
};

const COLUMNS: Record<Kind, Column<any>[]> = {
  appointment_audit: [
    { header: "التاريخ", accessor: (r) => new Date(r.changed_at).toLocaleString("ar") },
    { header: "المريض", accessor: (r) => r.patient_name },
    { header: "الهاتف", accessor: (r) => r.patient_phone },
    { header: "الحالة السابقة", accessor: (r) => r.old_status },
    { header: "الحالة الجديدة", accessor: (r) => r.new_status },
    { header: "الملاحظات القديمة", accessor: (r) => r.old_notes },
    { header: "الملاحظات الجديدة", accessor: (r) => r.new_notes },
    { header: "السبب", accessor: (r) => r.reason },
    { header: "الفاعل", accessor: (r) => r.actor },
  ],
  security_audit_log: [
    { header: "التاريخ", accessor: (r) => new Date(r.created_at).toLocaleString("ar") },
    { header: "الإجراء", accessor: (r) => r.action },
    { header: "الفاعل", accessor: (r) => r.actor },
    { header: "الجدول", accessor: (r) => r.table_name },
    { header: "معرف السجل", accessor: (r) => r.record_id },
    { header: "من", accessor: (r) => r.from_status },
    { header: "إلى", accessor: (r) => r.to_status },
    { header: "السبب", accessor: (r) => r.reason },
    { header: "IP", accessor: (r) => r.ip_address },
    { header: "User Agent", accessor: (r) => r.user_agent },
    { header: "بيانات إضافية", accessor: (r) => r.metadata },
  ],
  reminder_preference_audit: [
    { header: "التاريخ", accessor: (r) => new Date(r.changed_at).toLocaleString("ar") },
    { header: "المريض", accessor: (r) => r.patient_name },
    { header: "الهاتف", accessor: (r) => r.patient_phone },
    { header: "نوع التذكير", accessor: (r) => r.reminder_kind },
    { header: "القيمة السابقة", accessor: (r) => r.old_value },
    { header: "القيمة الجديدة", accessor: (r) => r.new_value },
    { header: "المصدر", accessor: (r) => r.source },
    { header: "السبب", accessor: (r) => r.reason },
    { header: "الفاعل", accessor: (r) => r.actor },
  ],
  dashboard_recent_activity: [
    { header: "التاريخ", accessor: (r) => new Date(r.changed_at).toLocaleString("ar") },
    { header: "المريض", accessor: (r) => r.patient_name },
    { header: "الحالة السابقة", accessor: (r) => r.old_status },
    { header: "الحالة الجديدة", accessor: (r) => r.new_status },
    { header: "السبب", accessor: (r) => r.reason },
  ],
};

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultTo() {
  return new Date().toISOString().slice(0, 10);
}

function AuditExportPage() {
  const [kind, setKind] = useState<Kind>("appointment_audit");
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [branchId, setBranchId] = useState<string>("");
  const [actorId, setActorId] = useState<string>("");
  const [event, setEvent] = useState<string>("");

  const listBranches = useServerFn(listBranchesForAudit);
  const runExport = useServerFn(fetchAuditExport);

  const branchesQ = useQuery({
    queryKey: ["audit-export", "branches"],
    queryFn: () => listBranches(),
  });

  const rowsQ = useQuery({
    queryKey: ["audit-export", kind, from, to, branchId, actorId, event],
    queryFn: () =>
      runExport({
        data: {
          kind,
          from: from ? `${from}T00:00:00Z` : undefined,
          to: to ? `${to}T23:59:59Z` : undefined,
          branch_id: branchId || null,
          actor_id: actorId || null,
          event: event || null,
          limit: 500,
        },
      }),
  });

  const preview = useMemo<any[]>(() => ((rowsQ.data as any[]) ?? []).slice(0, 100), [rowsQ.data]);
  const cols = COLUMNS[kind];

  async function handleExport() {
    try {
      const full = await runExport({
        data: {
          kind,
          from: from ? `${from}T00:00:00Z` : undefined,
          to: to ? `${to}T23:59:59Z` : undefined,
          branch_id: branchId || null,
          actor_id: actorId || null,
          event: event || null,
          limit: 10000,
        },
      });
      if (!full.length) {
        toast.warning("لا توجد بيانات للتصدير ضمن الفلاتر المحددة.");
        return;
      }
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      exportCsv(`${kind}-${stamp}.csv`, cols, full);
      toast.success(`تم تصدير ${full.length} سجل.`);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر التصدير.");
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-4 space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link
            to="/admin"
            className="text-muted-foreground hover:text-foreground text-sm inline-flex items-center gap-1"
          >
            <ArrowRight className="h-4 w-4" /> رجوع
          </Link>
          <h1 className="text-2xl font-bold">السجل الزمني — تصدير CSV</h1>
        </div>
      </div>

      <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full h-auto">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <TabsTrigger key={k} value={k} className="text-xs sm:text-sm">
              {KIND_LABEL[k]}
            </TabsTrigger>
          ))}
        </TabsList>

        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
          <TabsContent key={k} value={k} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">الفلاتر</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <Label className="text-xs">من تاريخ</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">إلى تاريخ</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">الفرع</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    disabled={
                      k === "dashboard_recent_activity"
                        ? false
                        : k === "security_audit_log"
                          ? false
                          : false
                    }
                  >
                    <option value="">كل الفروع</option>
                    {(branchesQ.data ?? []).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name_ar ?? b.name_en ?? b.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">معرف الفاعل (UUID)</Label>
                  <Input
                    placeholder="اختياري"
                    value={actorId}
                    onChange={(e) => setActorId(e.target.value.trim())}
                    disabled={k === "dashboard_recent_activity"}
                  />
                </div>
                <div>
                  <Label className="text-xs">النوع/الحدث</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={event}
                    onChange={(e) => setEvent(e.target.value)}
                  >
                    {EVENT_OPTIONS[k].map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => rowsQ.refetch()} disabled={rowsQ.isFetching}>
                <RefreshCw className={`h-4 w-4 ml-1 ${rowsQ.isFetching ? "animate-spin" : ""}`} />
                تحديث المعاينة
              </Button>
              <Button onClick={handleExport} disabled={rowsQ.isFetching}>
                <Download className="h-4 w-4 ml-1" />
                تصدير CSV (حتى 10,000 سجل)
              </Button>
              <span className="text-xs text-muted-foreground self-center">
                معاينة: {preview.length} من {rowsQ.data?.length ?? 0}
              </span>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">معاينة (أول 100)</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {rowsQ.isLoading ? (
                  <div className="text-sm text-muted-foreground py-8 text-center">
                    جارٍ التحميل…
                  </div>
                ) : rowsQ.isError ? (
                  <div className="text-sm text-destructive py-8 text-center">
                    {(rowsQ.error as any)?.message ?? "تعذّر التحميل."}
                  </div>
                ) : preview.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-8 text-center">
                    لا توجد سجلات.
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        {cols.map((c) => (
                          <th
                            key={c.header}
                            className="text-right py-2 px-2 font-semibold whitespace-nowrap"
                          >
                            {c.header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} className="border-b hover:bg-muted/40">
                          {cols.map((c) => {
                            const v = c.accessor(r);
                            const s = v === null || v === undefined ? "" : String(v);
                            return (
                              <td
                                key={c.header}
                                className="py-1.5 px-2 align-top max-w-[240px] truncate"
                                title={s}
                              >
                                {s}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
