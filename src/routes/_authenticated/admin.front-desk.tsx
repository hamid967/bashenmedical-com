/**
 * Phase 3 — Front Desk + Queue Board.
 *
 * One page, two tabs:
 *   - "front-desk": today's appointments with Check-in / No-show / Cancel
 *   - "queue":      today's queue board grouped by doctor with
 *                    Call / Start / Complete / Skip
 *
 * Realtime: subscribes to `public.queue_entries` and invalidates the two
 * queries on any INSERT/UPDATE so multiple reception stations stay in sync.
 * Guarded server-side to admin / super_admin / reception / branch_manager;
 * the shared _authenticated gate handles the sign-in redirect.
 */
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Loader2,
  PhoneCall,
  RefreshCw,
  Search,
  SkipForward,
  UserCheck,
  UserX,
  XCircle,
} from "lucide-react";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui-v3";
import { useActiveBranch } from "@/lib/active-branch";
import {
  listQueue,
  listTodayAppointments,
  updateAppointmentStatus,
  updateQueueStatus,
} from "@/lib/admin/front-desk.functions";

const searchSchema = z.object({
  tab: z.enum(["front-desk", "queue"]).default("front-desk"),
});

export const Route = createFileRoute("/_authenticated/admin/front-desk")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "الاستقبال والطابور — لوحة الإدارة" },
      {
        name: "description",
        content:
          "شاشة الاستقبال اليومية: تسجيل الحضور، إلغاء، عدم الحضور، وإدارة طابور المرضى.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل الاستقبال</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <button
        onClick={reset}
        className="mt-4 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
      >
        <RefreshCw className="h-4 w-4" /> إعادة المحاولة
      </button>
    </div>
  ),
  component: FrontDeskPage,
});

function FrontDeskPage() {
  const { tab } = useSearch({ from: "/_authenticated/admin/front-desk" });
  const navigate = Route.useNavigate();
  const { branchId } = useActiveBranch();
  const qc = useQueryClient();

  // Realtime: any change to queue_entries in this branch invalidates both
  // datasets — the appointments list joins the queue row, so it needs to
  // refresh too.
  useEffect(() => {
    const channel = supabase
      .channel("admin-front-desk")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_entries" },
        () => {
          qc.invalidateQueries({ queryKey: ["front-desk", "today"] });
          qc.invalidateQueries({ queryKey: ["front-desk", "queue"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "appointments" },
        () => {
          qc.invalidateQueries({ queryKey: ["front-desk", "today"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return (
    <div className="container-app py-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">الاستقبال</h1>
        <p className="text-sm text-muted-foreground">
          حجوزات اليوم وطابور المرضى — التحديثات فورية بين محطات الاستقبال.
        </p>
      </header>

      <Tabs
        value={tab}
        onValueChange={(v) =>
          navigate({ search: { tab: v as "front-desk" | "queue" }, replace: true })
        }
      >
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="front-desk" className="gap-2">
            <ClipboardList className="h-4 w-4" aria-hidden /> حجوزات اليوم
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-2">
            <UserCheck className="h-4 w-4" aria-hidden /> الطابور
          </TabsTrigger>
        </TabsList>

        <TabsContent value="front-desk" className="mt-4">
          {tab === "front-desk" && <FrontDeskTab branchId={branchId} />}
        </TabsContent>
        <TabsContent value="queue" className="mt-4">
          {tab === "queue" && <QueueTab branchId={branchId} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------------- Tab 1: Front Desk ---------------------- */

function FrontDeskTab({ branchId }: { branchId: string | null }) {
  const listFn = useServerFn(listTodayAppointments);
  const statusFn = useServerFn(updateAppointmentStatus);
  const [q, setQ] = useState("");
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["front-desk", "today", branchId, q],
    queryFn: () =>
      listFn({
        data: {
          branch_id: branchId || undefined,
          q: q.trim() || undefined,
        },
      }),
    refetchInterval: 30_000,
  });

  const mutate = useMutation({
    mutationFn: (input: {
      appointment_id: string;
      status: "checked_in" | "cancelled" | "no_show" | "completed";
      reason?: string;
    }) => statusFn({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["front-desk", "today"] });
      qc.invalidateQueries({ queryKey: ["front-desk", "queue"] });
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute start-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث بالاسم / الجوال / الرقم المرجعي"
            className="h-9 w-72 rounded-md border bg-background ps-8 pe-2 text-sm"
          />
        </div>
        <button
          onClick={() => query.refetch()}
          className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" /> تحديث
        </button>
        {mutate.isError ? (
          <span className="text-xs text-destructive">
            {(mutate.error as Error).message}
          </span>
        ) : null}
      </div>

      {query.isLoading ? (
        <SkeletonRows />
      ) : query.isError ? (
        <ErrorBanner message={(query.error as Error).message} />
      ) : !query.data || query.data.rows.length === 0 ? (
        <EmptyState message="لا توجد حجوزات لهذا اليوم." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-start">الوقت</th>
                <th className="p-3 text-start">المرجع</th>
                <th className="p-3 text-start">المريض</th>
                <th className="p-3 text-start">الجوال</th>
                <th className="p-3 text-start">الطبيب</th>
                <th className="p-3 text-start">الحالة</th>
                <th className="p-3 text-start">الطابور</th>
                <th className="p-3 text-end">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {query.data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs">{r.appointment_time ?? "—"}</td>
                  <td className="p-3 font-mono text-xs">
                    {r.reference_number ?? r.id.slice(0, 8)}
                  </td>
                  <td className="p-3">{r.patient_name ?? "—"}</td>
                  <td className="p-3 font-mono text-xs">{r.patient_phone ?? "—"}</td>
                  <td className="p-3">
                    {r.doctor?.name_ar ?? r.doctor?.name_en ?? "—"}
                  </td>
                  <td className="p-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="p-3">
                    {r.queue ? (
                      <span className="font-mono text-xs">
                        #{r.queue.queue_number} · {r.queue.status}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap justify-end gap-1">
                      <ActionBtn
                        disabled={
                          mutate.isPending ||
                          ["checked_in", "in_progress", "completed", "cancelled", "no_show"].includes(
                            r.status,
                          )
                        }
                        onClick={() =>
                          mutate.mutate({
                            appointment_id: r.id,
                            status: "checked_in",
                          })
                        }
                        icon={<UserCheck className="h-3.5 w-3.5" />}
                        label="حضور"
                      />
                      <ActionBtn
                        disabled={mutate.isPending || r.status === "no_show"}
                        onClick={() =>
                          mutate.mutate({
                            appointment_id: r.id,
                            status: "no_show",
                          })
                        }
                        icon={<UserX className="h-3.5 w-3.5" />}
                        label="لم يحضر"
                        variant="warn"
                      />
                      <ActionBtn
                        disabled={mutate.isPending || r.status === "cancelled"}
                        onClick={() => {
                          const reason = window.prompt("سبب الإلغاء (اختياري):") ?? undefined;
                          mutate.mutate({
                            appointment_id: r.id,
                            status: "cancelled",
                            reason,
                          });
                        }}
                        icon={<XCircle className="h-3.5 w-3.5" />}
                        label="إلغاء"
                        variant="danger"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------------- Tab 2: Queue Board ---------------------- */

function QueueTab({ branchId }: { branchId: string | null }) {
  const listFn = useServerFn(listQueue);
  const statusFn = useServerFn(updateQueueStatus);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["front-desk", "queue", branchId],
    queryFn: () => listFn({ data: { branch_id: branchId || undefined } }),
    refetchInterval: 15_000,
  });

  const mutate = useMutation({
    mutationFn: (input: {
      queue_id: string;
      status: "called" | "in_service" | "completed" | "skipped" | "cancelled";
    }) => statusFn({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["front-desk", "queue"] });
      qc.invalidateQueries({ queryKey: ["front-desk", "today"] });
    },
  });

  if (query.isLoading) return <SkeletonRows />;
  if (query.isError) return <ErrorBanner message={(query.error as Error).message} />;
  if (!query.data || query.data.rows.length === 0)
    return <EmptyState message="طابور اليوم فارغ." />;

  // Group by doctor
  const groups = new Map<string, { doctor: any; rows: any[] }>();
  for (const row of query.data.rows as any[]) {
    const key = row.doctor?.id ?? "unknown";
    const g = groups.get(key) ?? { doctor: row.doctor, rows: [] };
    g.rows.push(row);
    groups.set(key, g);
  }

  return (
    <div className="space-y-6">
      {mutate.isError ? (
        <ErrorBanner message={(mutate.error as Error).message} />
      ) : null}
      {Array.from(groups.values()).map((g) => (
        <section
          key={g.doctor?.id ?? "unknown"}
          className="rounded-lg border bg-card"
        >
          <header className="flex items-center justify-between border-b p-3">
            <h2 className="text-sm font-semibold">
              {g.doctor?.name_ar ?? g.doctor?.name_en ?? "بدون طبيب"}
            </h2>
            <span className="text-xs text-muted-foreground">
              {g.rows.length} مريض
            </span>
          </header>
          <ul className="divide-y">
            {g.rows.map((r: any) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-3 p-3 text-sm"
              >
                <span className="inline-flex h-8 w-10 items-center justify-center rounded-md bg-muted font-mono text-xs">
                  #{r.queue_number}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {r.appointment?.patient_name ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.appointment?.appointment_time ?? "—"} ·{" "}
                    {r.appointment?.reference_number ?? "—"}
                  </div>
                </div>
                <QueueStatusBadge status={r.status} />
                <div className="flex flex-wrap gap-1">
                  <ActionBtn
                    disabled={mutate.isPending || r.status !== "waiting"}
                    onClick={() =>
                      mutate.mutate({ queue_id: r.id, status: "called" })
                    }
                    icon={<PhoneCall className="h-3.5 w-3.5" />}
                    label="نداء"
                  />
                  <ActionBtn
                    disabled={
                      mutate.isPending ||
                      !["called", "waiting"].includes(r.status)
                    }
                    onClick={() =>
                      mutate.mutate({ queue_id: r.id, status: "in_service" })
                    }
                    icon={<Loader2 className="h-3.5 w-3.5" />}
                    label="ابدأ"
                  />
                  <ActionBtn
                    disabled={mutate.isPending || r.status === "completed"}
                    onClick={() =>
                      mutate.mutate({ queue_id: r.id, status: "completed" })
                    }
                    icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    label="أنهِ"
                    variant="success"
                  />
                  <ActionBtn
                    disabled={mutate.isPending || r.status !== "waiting"}
                    onClick={() =>
                      mutate.mutate({ queue_id: r.id, status: "skipped" })
                    }
                    icon={<SkipForward className="h-3.5 w-3.5" />}
                    label="تخطٍ"
                    variant="warn"
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ---------------------- Presentational bits ---------------------- */

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-md bg-muted/50" />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      {message}
    </div>
  );
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = status ?? "—";
  const tone =
    s === "completed"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : s === "cancelled" || s === "no_show"
        ? "bg-destructive/10 text-destructive"
        : s === "checked_in" || s === "in_progress"
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>{s}</span>
  );
}

function QueueStatusBadge({ status }: { status: string }) {
  const tone =
    status === "completed"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : status === "in_service"
        ? "bg-primary/10 text-primary"
        : status === "called"
          ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : status === "skipped" || status === "cancelled"
            ? "bg-destructive/10 text-destructive"
            : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>{status}</span>
  );
}

function ActionBtn({
  onClick,
  disabled,
  icon,
  label,
  variant = "default",
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  variant?: "default" | "success" | "warn" | "danger";
}) {
  const tone =
    variant === "success"
      ? "border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
      : variant === "warn"
        ? "border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
        : variant === "danger"
          ? "border-destructive/40 text-destructive hover:bg-destructive/10"
          : "hover:bg-muted";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-40 ${tone}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
