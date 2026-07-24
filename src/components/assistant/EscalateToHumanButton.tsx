/**
 * EscalateToHumanButton — one-click "طلب مساعدة بشرية" for Baeshen assistant.
 *
 * Opens a dialog to confirm severity + short reason, then calls the
 * `escalateAiConversation` server fn which atomically:
 *   1) creates an inbox_items ticket (channel = ai_assistant)
 *   2) logs ai_safety_incidents (kind = human_escalation) linked to it
 *   3) writes an immutable inbox_events audit row
 *
 * Once a ticket exists for the active conversation, the button turns into a
 * live status chip that polls `getAiEscalationStatus` on a visibility-aware
 * interval and shows the current inbox status + last update time.
 */
import { useMemo, useState } from "react";
import { LifeBuoy, Loader2, CheckCircle2, XCircle, Clock, ExternalLink, ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  escalateAiConversation,
  getAiEscalationStatus,
  listAiSafetyIncidents,
  listAiIncidentEvents,
  type EscalationStatus,
  type SafetyIncident,
  type IncidentEvent,
} from "@/lib/ai/escalate.functions";
import { visibilityAwareInterval } from "@/lib/polling";
import { formatDateTimeInTZ } from "@/lib/datetime";

type Severity = "low" | "medium" | "high" | "critical";

interface Props {
  conversationId: string | null;
  lang: "ar" | "en";
  lastUserMessage?: string | null;
  lastAiMessage?: string | null;
  /** When true, escalation is disabled with a helpful tooltip. */
  disabledReason?: string | null;
}

type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "done"; requestNumber: string }
  | { kind: "error"; message: string };

const SEVERITIES: { value: Severity; ar: string; en: string }[] = [
  { value: "low", ar: "منخفضة", en: "Low" },
  { value: "medium", ar: "متوسطة", en: "Medium" },
  { value: "high", ar: "عالية", en: "High" },
  { value: "critical", ar: "حرجة", en: "Critical" },
];

/** Coarse bucket for badge color/label. */
type Bucket = "open" | "in_review" | "closed";

const CLOSED_STATUSES = new Set(["completed", "cancelled", "duplicate", "archived"]);
const REVIEW_STATUSES = new Set([
  "reviewed",
  "contacted",
  "awaiting_patient",
  "awaiting_approval",
  "appointment_created",
  "in_progress",
]);

function bucketOf(status: string): Bucket {
  if (CLOSED_STATUSES.has(status)) return "closed";
  if (REVIEW_STATUSES.has(status)) return "in_review";
  return "open";
}

function bucketLabel(b: Bucket, isAr: boolean) {
  if (b === "closed") return isAr ? "مغلقة" : "Closed";
  if (b === "in_review") return isAr ? "قيد المراجعة" : "In review";
  return isAr ? "مفتوحة" : "Open";
}

function bucketClass(b: Bucket) {
  if (b === "closed") return "border-muted bg-muted/50 text-muted-foreground";
  if (b === "in_review") return "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
  return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
}

export function EscalateToHumanButton({
  conversationId,
  lang,
  lastUserMessage,
  lastAiMessage,
  disabledReason,
}: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [state, setState] = useState<State>({ kind: "idle" });
  const escalate = useServerFn(escalateAiConversation);
  const getStatus = useServerFn(getAiEscalationStatus);
  const qc = useQueryClient();
  const isAr = lang === "ar";
  const t = (ar: string, en: string) => (isAr ? ar : en);

  const canQuery = !!conversationId && !disabledReason;
  const statusQuery = useQuery<EscalationStatus | null>({
    queryKey: ["ai-escalation-status", conversationId],
    queryFn: () => getStatus({ data: { conversationId: conversationId! } }),
    enabled: canQuery,
    // Poll every 20s while tab is visible, pause when hidden.
    refetchInterval: visibilityAwareInterval(20_000, false),
    refetchOnWindowFocus: true,
    staleTime: 10_000,
    retry: 1,
  });

  const listIncidents = useServerFn(listAiSafetyIncidents);
  const incidentsQuery = useQuery<SafetyIncident[]>({
    queryKey: ["ai-safety-incidents", conversationId],
    queryFn: () => listIncidents({ data: { conversationId: conversationId! } }),
    enabled: canQuery && open,
    staleTime: 15_000,
    retry: 1,
  });

  const ticket = statusQuery.data ?? null;
  const bucket = ticket ? bucketOf(ticket.status) : null;

  const disabled = !conversationId || !!disabledReason;

  async function submit() {
    if (!conversationId) return;
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setState({
        kind: "error",
        message: t("اكتب سبب التصعيد (3 أحرف على الأقل).", "Describe the reason (min 3 chars)."),
      });
      return;
    }
    setState({ kind: "submitting" });
    try {
      const res = await escalate({
        data: {
          conversationId,
          reason: trimmed,
          severity,
          lang,
          lastUserMessage: lastUserMessage ?? undefined,
          lastAiMessage: lastAiMessage ?? undefined,
        },
      });
      setState({ kind: "done", requestNumber: res.requestNumber });
      // Refresh the status chip immediately after creation.
      qc.invalidateQueries({ queryKey: ["ai-escalation-status", conversationId] });
    } catch (err) {
      const code = (err as Error)?.message ?? "";
      const message =
        code === "rate_limited"
          ? t("عدد المحاولات كثير، حاول لاحقًا.", "Too many attempts, try later.")
          : code === "forbidden"
            ? t("غير مسموح بتصعيد هذه المحادثة.", "Not allowed to escalate this conversation.")
            : code === "conversation_not_found"
              ? t("لم يتم العثور على المحادثة.", "Conversation not found.")
              : code === "reason_too_short"
                ? t("سبب التصعيد قصير جدًا.", "Reason is too short.")
                : t("تعذّر إنشاء تذكرة التصعيد.", "Could not create the escalation ticket.");
      setState({ kind: "error", message });
    }
  }

  function reset() {
    setReason("");
    setSeverity("medium");
    setState({ kind: "idle" });
  }

  // Existing ticket → show a live status chip that opens the details dialog.
  if (ticket && bucket) {
    const updatedLabel = formatDateTimeInTZ(ticket.updatedAt, isAr ? "ar" : "en", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    });
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={t("عرض حالة التذكرة", "View ticket status")}
          className={
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium " +
            bucketClass(bucket)
          }
        >
          <LifeBuoy className="h-3 w-3" />
          <span>{bucketLabel(bucket, isAr)}</span>
          <span className="opacity-60">·</span>
          <span className="font-mono">{ticket.requestNumber}</span>
        </button>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LifeBuoy className="h-4 w-4 text-primary" />
                {t("حالة تذكرة التصعيد", "Escalation ticket status")}
              </DialogTitle>
              <DialogDescription>
                {t(
                  "يتم تحديث الحالة تلقائيًا كل ٢٠ ثانية أثناء فتح النافذة.",
                  "Status auto-refreshes every 20s while this tab is open.",
                )}
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="status" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="status">{t("الحالة", "Status")}</TabsTrigger>
                <TabsTrigger value="history">
                  {t("سجل الحوادث", "Incidents")}
                  {incidentsQuery.data && incidentsQuery.data.length > 0 && (
                    <span className="ms-1.5 rounded-full bg-muted px-1.5 text-[10px]">
                      {incidentsQuery.data.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="status" className="mt-3 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("رقم الطلب", "Request number")}</span>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                    {ticket.requestNumber}
                  </code>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("الحالة", "Status")}</span>
                  <span
                    className={
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium " +
                      bucketClass(bucket)
                    }
                  >
                    {bucketLabel(bucket, isAr)}
                    <span className="opacity-60">({ticket.status})</span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("الأولوية", "Priority")}</span>
                  <span className="text-xs">{ticket.priority}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("أُنشئت", "Created")}</span>
                  <span className="text-xs">
                    {formatDateTimeInTZ(ticket.createdAt, isAr ? "ar" : "en", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {t("آخر تحديث", "Last update")}
                  </span>
                  <span className="text-xs">{updatedLabel}</span>
                </div>
                {statusQuery.isFetching && (
                  <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t("جارٍ التحديث...", "Refreshing...")}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="history" className="mt-3">
                <IncidentsList
                  isLoading={incidentsQuery.isLoading}
                  isError={incidentsQuery.isError}
                  incidents={incidentsQuery.data ?? []}
                  isAr={isAr}
                />
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => void statusQuery.refetch()}
                disabled={statusQuery.isFetching}
              >
                {t("تحديث الآن", "Refresh now")}
              </Button>
              <Button type="button" onClick={() => setOpen(false)}>
                {t("إغلاق", "Close")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // No ticket yet → original "Request human help" flow.
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        title={disabledReason || t("طلب مساعدة بشرية", "Request human help")}
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-muted disabled:opacity-50 disabled:pointer-events-none"
      >
        <LifeBuoy className="h-3.5 w-3.5" />
        {t("مساعدة بشرية", "Human help")}
      </button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LifeBuoy className="h-4 w-4 text-primary" />
              {t("تصعيد إلى فريق بشري", "Escalate to human team")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "سيتم إنشاء تذكرة في الصندوق الموحّد وربطها بمحادثتك الحالية. سيتواصل معك فريقنا خلال ساعات العمل.",
                "A ticket will be created in the unified inbox and linked to this chat. Our team will follow up during business hours.",
              )}
            </DialogDescription>
          </DialogHeader>

          {state.kind !== "done" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="esc-reason">{t("سبب التصعيد", "Reason")}</Label>
                <Textarea
                  id="esc-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t(
                    "مثال: احتاج مساعدة عاجلة في حالة طبية.",
                    "e.g., Need urgent help with a medical concern.",
                  )}
                  rows={3}
                  maxLength={500}
                  disabled={state.kind === "submitting"}
                />
                <div className="text-[11px] text-muted-foreground">
                  {reason.trim().length}/500
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{t("درجة الأولوية", "Priority")}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {SEVERITIES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setSeverity(s.value)}
                      disabled={state.kind === "submitting"}
                      className={
                        "rounded-md border px-2.5 py-1 text-xs " +
                        (severity === s.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-input hover:bg-muted")
                      }
                    >
                      {isAr ? s.ar : s.en}
                    </button>
                  ))}
                </div>
              </div>

              {state.kind === "error" && (
                <div className="flex items-center gap-2 text-xs text-destructive">
                  <XCircle className="h-3.5 w-3.5" />
                  {state.message}
                </div>
              )}
            </div>
          )}

          {state.kind === "done" && (
            <div className="space-y-2 rounded-md border bg-emerald-50 p-3 text-sm dark:bg-emerald-950/30">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-medium">
                  {t("تم إنشاء التذكرة بنجاح", "Ticket created successfully")}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {t("رقم الطلب", "Request number")}:{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                  {state.requestNumber}
                </code>
              </div>
              <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />
                {t(
                  "ستظهر حالة التذكرة أعلى المحادثة وتتحدث تلقائيًا.",
                  "Ticket status will appear above the chat and update automatically.",
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            {state.kind === "done" ? (
              <Button type="button" onClick={() => setOpen(false)}>
                {t("إغلاق", "Close")}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={state.kind === "submitting"}
                >
                  {t("إلغاء", "Cancel")}
                </Button>
                <Button
                  type="button"
                  onClick={() => void submit()}
                  disabled={state.kind === "submitting" || reason.trim().length < 3}
                >
                  {state.kind === "submitting" ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      {t("جارٍ الإرسال...", "Submitting...")}
                    </>
                  ) : (
                    t("تأكيد التصعيد", "Confirm escalation")
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function severityClass(sev: string): string {
  switch (sev) {
    case "critical":
      return "border-red-300 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300";
    case "high":
      return "border-orange-300 bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300";
    case "medium":
      return "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
    default:
      return "border-muted bg-muted/50 text-muted-foreground";
  }
}

function severityLabel(sev: string, isAr: boolean): string {
  const map: Record<string, [string, string]> = {
    low: ["منخفضة", "Low"],
    medium: ["متوسطة", "Medium"],
    high: ["عالية", "High"],
    critical: ["حرجة", "Critical"],
  };
  const pair = map[sev];
  return pair ? (isAr ? pair[0] : pair[1]) : sev;
}

function kindLabel(kind: string, isAr: boolean): string {
  const map: Record<string, [string, string]> = {
    human_escalation: ["تصعيد بشري", "Human escalation"],
    emergency_trigger: ["إنذار طوارئ", "Emergency trigger"],
    pii_leak: ["تسريب بيانات حسّاسة", "PII leak"],
    unsafe_response: ["استجابة غير آمنة", "Unsafe response"],
    policy_violation: ["مخالفة سياسة", "Policy violation"],
  };
  const pair = map[kind];
  return pair ? (isAr ? pair[0] : pair[1]) : kind;
}

function parseReasonFromDetails(details: string | null): string | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as { reason?: unknown };
    if (typeof parsed.reason === "string" && parsed.reason.trim()) return parsed.reason;
  } catch {
    /* ignore */
  }
  return null;
}

type SevFilter = "all" | "low" | "medium" | "high" | "critical";
type OutcomeFilter = "all" | "open" | "in_progress" | "resolved" | "closed" | "none";
type SortOrder = "desc" | "asc";
const PAGE_SIZE = 10;

function outcomeBucket(status: string | null): Exclude<OutcomeFilter, "all"> {
  if (!status) return "none";
  const s = status.toLowerCase();
  if (["closed", "archived", "cancelled", "canceled"].includes(s)) return "closed";
  if (["resolved", "done", "completed"].includes(s)) return "resolved";
  if (["in_progress", "in_review", "reviewing", "processing", "assigned"].includes(s))
    return "in_progress";
  return "open";
}

function IncidentsList({
  isLoading,
  isError,
  incidents,
  isAr,
}: {
  isLoading: boolean;
  isError: boolean;
  incidents: SafetyIncident[];
  isAr: boolean;
}) {
  const t = (ar: string, en: string) => (isAr ? ar : en);
  const [sev, setSev] = useState<SevFilter>("all");
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [order, setOrder] = useState<SortOrder>("desc");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<SafetyIncident | null>(null);

  const filtered = useMemo(() => {
    const arr = incidents.filter((inc) => {
      if (sev !== "all" && inc.severity !== sev) return false;
      if (outcome !== "all" && outcomeBucket(inc.inboxStatus) !== outcome) return false;
      return true;
    });
    arr.sort((a, b) => {
      const da = new Date(a.createdAt).getTime();
      const db = new Date(b.createdAt).getTime();
      return order === "desc" ? db - da : da - db;
    });
    return arr;
  }, [incidents, sev, outcome, order]);

  const shown = filtered.slice(0, visible);
  const hasMore = filtered.length > shown.length;

  // Reset pagination when filters/order change.
  function updateSev(v: SevFilter) {
    setSev(v);
    setVisible(PAGE_SIZE);
  }
  function updateOutcome(v: OutcomeFilter) {
    setOutcome(v);
    setVisible(PAGE_SIZE);
  }
  function updateOrder(v: SortOrder) {
    setOrder(v);
    setVisible(PAGE_SIZE);
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t("جارٍ تحميل السجل...", "Loading history...")}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex items-center gap-2 text-xs text-destructive py-6 justify-center">
        <XCircle className="h-3.5 w-3.5" />
        {t("تعذّر تحميل سجل الحوادث.", "Failed to load incidents.")}
      </div>
    );
  }
  if (incidents.length === 0) {
    return (
      <div className="text-center text-xs text-muted-foreground py-6">
        {t("لا توجد حوادث مسجّلة لهذه المحادثة.", "No incidents recorded for this conversation.")}
      </div>
    );
  }

  const sevOpts: { v: SevFilter; ar: string; en: string }[] = [
    { v: "all", ar: "الكل", en: "All" },
    { v: "critical", ar: "حرجة", en: "Critical" },
    { v: "high", ar: "عالية", en: "High" },
    { v: "medium", ar: "متوسطة", en: "Medium" },
    { v: "low", ar: "منخفضة", en: "Low" },
  ];
  const outcomeOpts: { v: OutcomeFilter; ar: string; en: string }[] = [
    { v: "all", ar: "الكل", en: "All" },
    { v: "open", ar: "مفتوحة", en: "Open" },
    { v: "in_progress", ar: "قيد المعالجة", en: "In progress" },
    { v: "resolved", ar: "منجزة", en: "Resolved" },
    { v: "closed", ar: "مغلقة", en: "Closed" },
    { v: "none", ar: "بلا تذكرة", en: "No ticket" },
  ];

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-3 text-[11px]">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">{t("الشدة", "Severity")}</span>
          <select
            value={sev}
            onChange={(e) => updateSev(e.target.value as SevFilter)}
            className="h-8 rounded-md border border-input bg-background px-2"
          >
            {sevOpts.map((o) => (
              <option key={o.v} value={o.v}>
                {isAr ? o.ar : o.en}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">{t("النتيجة", "Outcome")}</span>
          <select
            value={outcome}
            onChange={(e) => updateOutcome(e.target.value as OutcomeFilter)}
            className="h-8 rounded-md border border-input bg-background px-2"
          >
            {outcomeOpts.map((o) => (
              <option key={o.v} value={o.v}>
                {isAr ? o.ar : o.en}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">{t("الترتيب", "Order")}</span>
          <select
            value={order}
            onChange={(e) => updateOrder(e.target.value as SortOrder)}
            className="h-8 rounded-md border border-input bg-background px-2"
          >
            <option value="desc">{t("الأحدث أولًا", "Newest first")}</option>
            <option value="asc">{t("الأقدم أولًا", "Oldest first")}</option>
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {t("النتائج", "Results")}: {filtered.length}
        </span>
        {(sev !== "all" || outcome !== "all" || order !== "desc") && (
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => {
              setSev("all");
              setOutcome("all");
              setOrder("desc");
              setVisible(PAGE_SIZE);
            }}
          >
            {t("مسح الفلاتر", "Clear filters")}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-xs text-muted-foreground py-6">
          {t("لا توجد حوادث مطابقة للفلاتر.", "No incidents match the filters.")}
        </div>
      ) : (
        <>
          <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {shown.map((inc) => {
              const reason = parseReasonFromDetails(inc.details);
              return (
                <li
                  key={inc.id}
                  className="rounded-md border border-border bg-card p-2.5 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 font-medium">
                      <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
                      {kindLabel(inc.kind, isAr)}
                    </span>
                    <span
                      className={
                        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium " +
                        severityClass(inc.severity)
                      }
                    >
                      {severityLabel(inc.severity, isAr)}
                    </span>
                  </div>

                  {reason && (
                    <div className="text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                      {reason}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span>
                      {formatDateTimeInTZ(inc.createdAt, isAr ? "ar" : "en", {
                        hour: "2-digit",
                        minute: "2-digit",
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    {inc.requestNumber && (
                      <span className="inline-flex items-center gap-1">
                        <span>{t("التذكرة", "Ticket")}:</span>
                        <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
                          {inc.requestNumber}
                        </code>
                      </span>
                    )}
                    {inc.inboxStatus && (
                      <span>
                        {t("نتيجة المعالجة", "Outcome")}: {inc.inboxStatus}
                      </span>
                    )}
                    {inc.actionTaken && (
                      <span>
                        {t("الإجراء", "Action")}: {inc.actionTaken}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {hasMore && (
            <div className="flex justify-center pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
              >
                {t(
                  `تحميل المزيد (${filtered.length - shown.length})`,
                  `Load more (${filtered.length - shown.length})`,
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
