import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PortalShell } from "@/components/portal/PortalShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import {
  listMyAuditLog,
  listMyAuditActions,
  SENSITIVE_ACTIONS,
  type MyAuditRow,
} from "@/lib/portal/audit-log.functions";
import {
  ShieldAlert,
  LogIn,
  LogOut,
  Download,
  UserCog,
  KeyRound,
  FileText,
  ScrollText,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/portal/audit-log")({
  head: () => ({
    meta: [
      { title: "سجل النشاط — بوابة المريض | مجمع باعشن الطبي" },
      { name: "description", content: "سجل تفصيلي لعمليات الدخول والوصول إلى بياناتك الصحية." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "سجل النشاط — بوابة المريض" },
      { property: "og:description", content: "تتبع أنشطة حسابك الشخصي بالتفصيل." },
    ],
  }),
  component: AuditLogPage,
});

const PAGE_SIZE = 25;

const ACTION_META: Record<
  string,
  { icon: typeof ShieldAlert; ar: string; en: string; tone: "danger" | "warn" | "info" | "ok" }
> = {
  sensitive_profile_change: {
    icon: UserCog,
    ar: "تعديل بيانات حساسة",
    en: "Sensitive profile change",
    tone: "warn",
  },
  login_success: { icon: LogIn, ar: "تسجيل دخول ناجح", en: "Login success", tone: "ok" },
  login_failed: { icon: ShieldAlert, ar: "محاولة دخول فاشلة", en: "Failed login", tone: "danger" },
  "portal.session.revoked": { icon: LogOut, ar: "إنهاء جلسة", en: "Session revoked", tone: "info" },
  "portal.sessions.revoke_others": {
    icon: LogOut,
    ar: "إنهاء الجلسات الأخرى",
    en: "Revoke other sessions",
    tone: "info",
  },
  "portal.sessions.revoke_all": {
    icon: LogOut,
    ar: "إنهاء كل الجلسات",
    en: "Revoke all sessions",
    tone: "warn",
  },
  lab_report_download: {
    icon: Download,
    ar: "تنزيل تقرير مختبر",
    en: "Lab report download",
    tone: "info",
  },
  radiology_report_download: {
    icon: Download,
    ar: "تنزيل تقرير أشعة",
    en: "Radiology report download",
    tone: "info",
  },
  "consent.updated": {
    icon: FileText,
    ar: "تحديث موافقة خصوصية",
    en: "Consent updated",
    tone: "info",
  },
  "profile.password_changed": {
    icon: KeyRound,
    ar: "تغيير كلمة المرور",
    en: "Password changed",
    tone: "warn",
  },
};

function toneClasses(tone: "danger" | "warn" | "info" | "ok") {
  switch (tone) {
    case "danger":
      return "bg-[color:var(--portal-error-50)] text-[color:var(--portal-error)] border-[color:var(--portal-error)]/20";
    case "warn":
      return "bg-[color:var(--portal-warning-50)] text-[color:var(--portal-warning)] border-[color:var(--portal-warning)]/20";
    case "ok":
      return "bg-[color:var(--portal-success-50)] text-[color:var(--portal-success)] border-[color:var(--portal-success)]/20";
    default:
      return "bg-[color:var(--portal-info-50)] text-[color:var(--portal-info)] border-[color:var(--portal-info)]/20";
  }
}

function AuditLogPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const list = useServerFn(listMyAuditLog);
  const actions = useServerFn(listMyAuditActions);

  const [action, setAction] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [page, setPage] = useState(0);

  const actionsQ = useQuery({
    queryKey: ["portal", "audit", "actions"],
    queryFn: () => actions(),
  });

  const knownActions = new Set<string>([
    ...SENSITIVE_ACTIONS,
    ...((actionsQ.data ?? []) as string[]),
  ]);

  const q = useQuery({
    queryKey: ["portal", "audit", { action, from, to, page }],
    queryFn: () =>
      list({
        data: {
          action: action === "all" ? null : action,
          from: from || null,
          to: to || null,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
      }),
  });

  const rows: MyAuditRow[] = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function renderAction(row: MyAuditRow) {
    const meta = ACTION_META[row.action];
    const Icon = meta?.icon ?? ScrollText;
    const label = meta ? (ar ? meta.ar : meta.en) : row.action;
    const tone = meta?.tone ?? "info";
    return (
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${toneClasses(tone)}`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">{row.action}</span>
        </div>
      </div>
    );
  }

  function renderDetails(row: MyAuditRow) {
    const bits: string[] = [];
    const md = row.metadata as Record<string, unknown> | null;
    if (md && Array.isArray(md.fields)) {
      bits.push((ar ? "الحقول: " : "Fields: ") + (md.fields as unknown[]).join(", "));
    }
    if (row.reason) bits.push(row.reason);
    return bits.length ? bits.join(" · ") : "—";
  }

  const reset = () => {
    setAction("all");
    setFrom("");
    setTo("");
    setPage(0);
  };

  return (
    <PortalShell>
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold md:text-3xl">
              {ar ? "سجل التدقيق الشخصي" : "My Audit Log"}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {ar
              ? "استعرض العمليات الحساسة على حسابك مثل تغيير رقم الجوال/الهوية، تسجيل الدخول، الجلسات، وتنزيل التقارير."
              : "Review sensitive account activity: phone/ID changes, logins, sessions, and report downloads."}
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{ar ? "الفلاتر" : "Filters"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>{ar ? "النوع" : "Type"}</Label>
              <Select
                value={action}
                onValueChange={(v) => {
                  setAction(v);
                  setPage(0);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{ar ? "الكل" : "All"}</SelectItem>
                  {Array.from(knownActions).map((a) => {
                    const m = ACTION_META[a];
                    return (
                      <SelectItem key={a} value={a}>
                        {m ? (ar ? m.ar : m.en) : a}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{ar ? "من تاريخ" : "From"}</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{ar ? "إلى تاريخ" : "To"}</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={reset} className="w-full">
                {ar ? "إعادة ضبط" : "Reset"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {ar ? "العمليات" : "Events"}
              <Badge variant="secondary" className="ms-2">
                {total}
              </Badge>
            </CardTitle>
            {q.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </CardHeader>
          <CardContent className="p-0">
            {q.isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {ar ? "جارٍ التحميل..." : "Loading..."}
              </div>
            ) : q.isError ? (
              <div className="p-8 text-center text-sm text-[color:var(--portal-error)]">
                {(q.error as Error)?.message || (ar ? "تعذر تحميل السجل" : "Failed to load")}
              </div>
            ) : rows.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                {ar ? "لا توجد عمليات مطابقة للفلاتر." : "No events match your filters."}
              </div>
            ) : (
              <div className="divide-y">
                {rows.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-1 gap-2 p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_minmax(0,1fr)]"
                  >
                    {renderAction(row)}
                    <div className="text-xs text-muted-foreground md:text-sm">
                      <div className="truncate">{renderDetails(row)}</div>
                      {(row.ip_address || row.user_agent) && (
                        <div className="mt-1 truncate text-[11px] opacity-70">
                          {row.ip_address ? `IP: ${row.ip_address}` : null}
                          {row.ip_address && row.user_agent ? " · " : null}
                          {row.user_agent ? row.user_agent.slice(0, 80) : null}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground md:text-end">
                      {new Date(row.created_at).toLocaleString(ar ? "ar-SA" : "en-GB")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              {ar ? "السابق" : "Previous"}
            </Button>
            <span className="text-sm text-muted-foreground">
              {ar ? `صفحة ${page + 1} من ${totalPages}` : `Page ${page + 1} of ${totalPages}`}
            </span>
            <Button
              variant="outline"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {ar ? "التالي" : "Next"}
            </Button>
          </div>
        )}
      </div>
    </PortalShell>
  );
}
