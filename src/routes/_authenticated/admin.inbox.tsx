import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { z } from "zod";

import { getUnifiedInbox, type InboxItem } from "@/lib/admin/unified-inbox.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Inbox } from "lucide-react";
import { ExportMenu } from "@/components/admin/v2/ExportMenu";
import type { Column } from "@/lib/export-utils";

const SearchSchema = z.object({
  date: z.string().optional(),
  channel: z.enum(["all", "website", "whatsapp", "booking", "phone", "other"]).optional(),
  source: z.string().optional(),
  q: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/admin/inbox")({
  validateSearch: SearchSchema,
  head: () => ({
    meta: [{ title: "الصندوق الموحد | لوحة الإدارة" }, { name: "robots", content: "noindex" }],
  }),
  component: UnifiedInboxPage,
});

const SOURCE_LABELS: Record<string, string> = {
  appointment: "موعد",
  service_inquiry: "طلب خدمة",
  home_care: "رعاية منزلية",
  corporate: "شركات",
  second_opinion: "رأي ثانٍ",
  complaint: "شكوى",
  medicine_order: "طلب دواء",
  waitlist: "قائمة انتظار",
};

const CHANNEL_LABELS: Record<string, string> = {
  website: "الموقع",
  whatsapp: "واتساب",
  booking: "الحجز",
  phone: "هاتف",
  other: "أخرى",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const INBOX_EXPORT_COLS: Column<InboxItem>[] = [
  { header: "المصدر", accessor: (r) => SOURCE_LABELS[r.source] ?? r.source },
  { header: "القناة", accessor: (r) => CHANNEL_LABELS[r.channel] ?? r.channel },
  { header: "المرجع", accessor: (r) => r.reference ?? "" },
  { header: "المريض", accessor: (r) => r.patient_name },
  { header: "الجوال", accessor: (r) => r.patient_phone ?? "" },
  { header: "الموضوع", accessor: (r) => r.subject },
  { header: "الحالة", accessor: (r) => r.status },
  { header: "الوقت", accessor: (r) => new Date(r.created_at).toLocaleString("ar-SA") },
];

function UnifiedInboxPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();
  const fetchInbox = useServerFn(getUnifiedInbox);
  const date = search.date ?? todayISO();
  const channel = search.channel && search.channel !== "all" ? search.channel : undefined;
  const source = search.source && search.source !== "all" ? search.source : undefined;
  const q = search.q ?? "";

  const queryKey = ["admin", "unified-inbox", { date, channel, source, q }];
  const { data: items } = useSuspenseQuery({
    queryKey,
    queryFn: () =>
      fetchInbox({
        data: {
          date,
          channel,
          sources: source ? [source] : undefined,
          search: q || undefined,
        },
      }),
    staleTime: 30_000,
  });

  const counts = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const it of items) acc[it.source] = (acc[it.source] ?? 0) + 1;
    return acc;
  }, [items]);

  const totalOpen = useMemo(
    () =>
      items.filter(
        (i) =>
          !["completed", "closed", "cancelled", "resolved", "signed", "declined"].includes(
            i.status,
          ),
      ).length,
    [items],
  );

  const setSearch = (patch: Partial<z.infer<typeof SearchSchema>>) =>
    navigate({ search: (prev: z.infer<typeof SearchSchema>) => ({ ...prev, ...patch }) });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">الصندوق الموحد</h1>
          <Badge variant="secondary">إجمالي: {items.length}</Badge>
          <Badge>مفتوح: {totalOpen}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu<InboxItem>
            filename={`inbox-${date}`}
            title="الصندوق الموحد"
            subtitle={`تاريخ: ${date}${channel ? ` • قناة: ${CHANNEL_LABELS[channel] ?? channel}` : ""}${source ? ` • مصدر: ${SOURCE_LABELS[source] ?? source}` : ""}${q ? ` • بحث: ${q}` : ""}`}
            meta={{ المجموع: String(items.length), المفتوح: String(totalOpen) }}
            columns={INBOX_EXPORT_COLS}
            rows={items}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["admin", "unified-inbox"] })}
          >
            <RefreshCw className="ml-2 h-4 w-4" /> تحديث
          </Button>
        </div>
      </header>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">التاريخ</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setSearch({ date: e.target.value || undefined })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">القناة</label>
            <Select
              value={search.channel ?? "all"}
              onValueChange={(v) => setSearch({ channel: v as any })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل القنوات</SelectItem>
                {Object.entries(CHANNEL_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">المصدر</label>
            <Select value={search.source ?? "all"} onValueChange={(v) => setSearch({ source: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المصادر</SelectItem>
                {Object.entries(SOURCE_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">بحث</label>
            <Input
              placeholder="اسم / جوال / مرجع"
              value={q}
              onChange={(e) => setSearch({ q: e.target.value || undefined })}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {Object.entries(SOURCE_LABELS).map(([k, l]) => (
            <Badge key={k} variant="outline">
              {l}: {counts[k] ?? 0}
            </Badge>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/50 text-right text-xs text-muted-foreground">
              <tr>
                <th className="p-3">المصدر</th>
                <th className="p-3">القناة</th>
                <th className="p-3">المرجع</th>
                <th className="p-3">المريض</th>
                <th className="p-3">الجوال</th>
                <th className="p-3">الموضوع</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">الوقت</th>
                <th className="p-3">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground">
                    لا توجد طلبات لهذا التاريخ.
                  </td>
                </tr>
              )}
              {items.map((it: InboxItem) => (
                <tr key={`${it.source}:${it.id}`} className="border-t hover:bg-muted/30">
                  <td className="p-3">
                    <Badge variant="secondary">{SOURCE_LABELS[it.source] ?? it.source}</Badge>
                  </td>
                  <td className="p-3">{CHANNEL_LABELS[it.channel] ?? it.channel}</td>
                  <td className="p-3 font-mono text-xs">{it.reference ?? "—"}</td>
                  <td className="p-3">{it.patient_name}</td>
                  <td className="p-3 font-mono text-xs">{it.patient_phone ?? "—"}</td>
                  <td className="p-3">{it.subject}</td>
                  <td className="p-3">
                    <Badge>{it.status}</Badge>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {new Date(it.created_at).toLocaleTimeString("ar-SA", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="p-3">
                    <Link to={it.href} className="text-primary underline underline-offset-2">
                      فتح
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
