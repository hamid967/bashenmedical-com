import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { z } from "zod";
import {
  listInboxItems,
  INBOX_STATUSES,
  INBOX_CHANNELS,
  INBOX_PRIORITIES,
  type InboxItem,
  type InboxStatus,
  type InboxChannel,
  type InboxPriority,
} from "@/lib/admin/inbox.functions";
import { Card } from "@/components/ui-v3";
import { Badge } from "@/components/ui-v3";
import { Input } from "@/components/ui-v3";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui-v3";
import { Inbox, AlertTriangle, RefreshCw } from "lucide-react";

const SearchSchema = z.object({
  status: z.enum(INBOX_STATUSES).optional(),
  channel: z.enum(INBOX_CHANNELS).optional(),
  priority: z.enum(INBOX_PRIORITIES).optional(),
  q: z.string().optional(),
  archived: z.boolean().optional(),
});
type SearchIn = z.infer<typeof SearchSchema>;

export const STATUS_LABELS: Record<InboxStatus, string> = {
  new: "جديد",
  reviewed: "تمت المراجعة",
  contacted: "تم التواصل",
  awaiting_patient: "بانتظار المريض",
  awaiting_approval: "بانتظار الموافقة",
  appointment_created: "تم إنشاء موعد",
  in_progress: "قيد المعالجة",
  completed: "مكتمل",
  cancelled: "ملغى",
  duplicate: "مكرر",
  archived: "مؤرشف",
};

export const CHANNEL_LABELS: Record<InboxChannel, string> = {
  website: "الموقع",
  booking: "الحجز",
  patient_portal: "بوابة المريض",
  whatsapp: "واتساب",
  contact_form: "نموذج التواصل",
  reception: "الاستقبال",
  phone: "الهاتف",
  campaign: "حملة",
  support: "الدعم",
  other: "أخرى",
};

export const PRIORITY_LABELS: Record<InboxPriority, string> = {
  low: "منخفض",
  normal: "عادي",
  high: "مرتفع",
  urgent: "عاجل",
};

const PRIORITY_TONE: Record<InboxPriority, string> = {
  low: "bg-slate-100 text-slate-700",
  normal: "bg-blue-50 text-blue-700",
  high: "bg-amber-50 text-amber-700",
  urgent: "bg-red-50 text-red-700",
};

const STATUS_TONE: Record<InboxStatus, string> = {
  new: "bg-blue-50 text-blue-700",
  reviewed: "bg-slate-100 text-slate-700",
  contacted: "bg-indigo-50 text-indigo-700",
  awaiting_patient: "bg-amber-50 text-amber-700",
  awaiting_approval: "bg-amber-50 text-amber-700",
  appointment_created: "bg-emerald-50 text-emerald-700",
  in_progress: "bg-cyan-50 text-cyan-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-600",
  duplicate: "bg-slate-100 text-slate-600",
  archived: "bg-slate-100 text-slate-500",
};

export function maskPhone(p?: string | null): string {
  if (!p) return "—";
  const trimmed = p.trim();
  if (trimmed.length < 5) return "•".repeat(trimmed.length);
  return `${trimmed.slice(0, 3)}${"•".repeat(Math.max(trimmed.length - 6, 3))}${trimmed.slice(-3)}`;
}

function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export const Route = createFileRoute("/_authenticated/admin/inbox")({
  validateSearch: SearchSchema,
  loaderDeps: ({ search }) => search,
  loader: () => null,
  head: () => ({
    meta: [
      { title: "الصندوق الموحّد | لوحة الإدارة" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل الصندوق الموحّد</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
  component: UnifiedInboxPage,
});

export function UnifiedInboxPage() {
  const search = Route.useSearch() as SearchIn;
  const navigate = Route.useNavigate();

  const list = useServerFn(listInboxItems);
  const queryKey = useMemo(
    () => [
      "admin-inbox",
      search.status ?? "any",
      search.channel ?? "any",
      search.priority ?? "any",
      search.q ?? "",
      search.archived ? "1" : "0",
    ],
    [search],
  );
  const { data: items } = useSuspenseQuery({
    queryKey,
    queryFn: () =>
      list({
        data: {
          status: search.status,
          channel: search.channel,
          priority: search.priority,
          search: search.q,
          include_archived: !!search.archived,
        },
      }),
    staleTime: 15_000,
  });

  const patch = (p: Partial<SearchIn>) =>
    navigate({ search: (prev: SearchIn) => ({ ...prev, ...p }) });

  return (
    <div className="ac-card p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Inbox className="h-6 w-6" /> الصندوق الموحّد
          </h1>
          <p className="text-sm text-[color:var(--ac-ink-3)] mt-1">
            كل طلبات العمليات من الموقع، الحجز، بوابة المريض، واتساب، الاستقبال، الهاتف، الحملات والدعم — في مكان واحد.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate({ search: {} as SearchIn })}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" /> إعادة تعيين
        </button>
      </header>

      <div className="grid gap-3 md:grid-cols-5">
        <Input
          placeholder="ابحث برقم الطلب، الاسم، الجوال، الخدمة…"
          defaultValue={search.q ?? ""}
          onChange={(e) => patch({ q: e.target.value || undefined })}
        />
        <Select
          value={search.status ?? "all"}
          onValueChange={(v) =>
            patch({ status: v === "all" ? undefined : (v as InboxStatus) })
          }
        >
          <SelectTrigger><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {INBOX_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={search.channel ?? "all"}
          onValueChange={(v) =>
            patch({ channel: v === "all" ? undefined : (v as InboxChannel) })
          }
        >
          <SelectTrigger><SelectValue placeholder="القناة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل القنوات</SelectItem>
            {INBOX_CHANNELS.map((c) => (
              <SelectItem key={c} value={c}>{CHANNEL_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={search.priority ?? "all"}
          onValueChange={(v) =>
            patch({ priority: v === "all" ? undefined : (v as InboxPriority) })
          }
        >
          <SelectTrigger><SelectValue placeholder="الأولوية" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأولويات</SelectItem>
            {INBOX_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!search.archived}
            onChange={(e) => patch({ archived: e.target.checked || undefined })}
          />
          إظهار المؤرشف
        </label>
      </div>

      {items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-[color:var(--ac-ink-3)]">
          لا توجد طلبات مطابقة.
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-right">
              <tr>
                <th className="p-2">رقم الطلب</th>
                <th className="p-2">المريض</th>
                <th className="p-2">الجوال</th>
                <th className="p-2">الخدمة</th>
                <th className="p-2">القناة</th>
                <th className="p-2">الأولوية</th>
                <th className="p-2">الحالة</th>
                <th className="p-2">القسم</th>
                <th className="p-2">المسنَد</th>
                <th className="p-2">إُنشئ</th>
                <th className="p-2">آخر تحديث</th>
                <th className="p-2">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it: InboxItem) => (
                <tr key={it.id} className="border-t hover:bg-muted/30">
                  <td className="p-2 font-mono text-xs">
                    <Link
                      to="/admin/inbox/$id"
                      params={{ id: it.id }}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {it.request_number}
                    </Link>
                  </td>
                  <td className="p-2">{it.patient_name ?? "—"}</td>
                  <td className="p-2 font-mono ltr:text-left rtl:text-right">
                    {maskPhone(it.patient_phone)}
                  </td>
                  <td className="p-2">{it.service_label ?? it.subject ?? "—"}</td>
                  <td className="p-2">
                    <Badge variant="outline">{CHANNEL_LABELS[it.channel]}</Badge>
                  </td>
                  <td className="p-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${PRIORITY_TONE[it.priority]}`}>
                      {PRIORITY_LABELS[it.priority]}
                    </span>
                  </td>
                  <td className="p-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_TONE[it.status]}`}>
                      {STATUS_LABELS[it.status]}
                    </span>
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {it.department ?? "—"}
                  </td>
                  <td className="p-2 font-mono text-[11px] text-muted-foreground">
                    {it.assigned_to ? it.assigned_to.slice(0, 8) : "غير مسند"}
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {fmtDateTime(it.created_at)}
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {fmtDateTime(it.last_action_at ?? it.updated_at)}
                  </td>
                  <td className="p-2 text-xs">
                    {it.required_action ?? "—"}
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
