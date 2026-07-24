import { useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, XCircle, AlertTriangle, FileClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export type AssistantAction = {
  tool: string;
  label: string;
  summary?: string;
  params: Record<string, unknown>;
};

export type AssistantActionState =
  | { kind: "idle" }
  | { kind: "preparing" }
  | { kind: "prepared"; summary: string; expiresAt: number; confirmToken: string }
  | { kind: "running" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

interface Props {
  action: AssistantAction;
  conversationId?: string | null;
  isAr: boolean;
}

// Patient-scope single-phase tools use /api/ai/action.
const PATIENT_TOOLS = new Set(["cancel_appointment", "reschedule_appointment"]);
// Staff-scope two-phase tools use /api/ai/staff-action (prepare → execute).
const STAFF_TOOLS = new Set(["staff_add_inbox_note"]);

export function AssistantActionCard({ action, conversationId, isAr }: Props) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AssistantActionState>({ kind: "idle" });

  const t = (ar: string, en: string) => (isAr ? ar : en);
  const isStaff = STAFF_TOOLS.has(action.tool);
  const isPatient = PATIENT_TOOLS.has(action.tool);
  const supported = isStaff || isPatient;

  async function bearerOrFail(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    const bearer = data.session?.access_token;
    if (!bearer) {
      setState({
        kind: "error",
        message: t("سجّل الدخول لتنفيذ هذا الإجراء.", "Sign in to run this action."),
      });
      return null;
    }
    return bearer;
  }

  /** Open the confirm dialog. For staff tools we first fetch prepare(). */
  async function openConfirm() {
    setOpen(true);
    if (!isStaff) {
      // Patient tools: dialog shows the model-provided summary directly.
      setState({ kind: "idle" });
      return;
    }
    setState({ kind: "preparing" });
    const bearer = await bearerOrFail();
    if (!bearer) return;
    try {
      const res = await fetch("/api/ai/staff-action", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ phase: "prepare", tool: action.tool, params: action.params }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        summary?: string;
        confirm_token?: string;
        expires_at?: number;
        error?: string;
      };
      if (!res.ok || !payload.confirm_token || !payload.summary) {
        setState({
          kind: "error",
          message: mapStaffError(payload.error, res.status, t),
        });
        return;
      }
      setState({
        kind: "prepared",
        summary: payload.summary,
        expiresAt: payload.expires_at ?? Date.now() + 5 * 60 * 1000,
        confirmToken: payload.confirm_token,
      });
    } catch {
      setState({ kind: "error", message: t("تعذّر الاتصال بالخادم.", "Could not reach the server.") });
    }
  }

  /** Patient path: one call to /api/ai/action. */
  async function executePatient() {
    setState({ kind: "running" });
    const bearer = await bearerOrFail();
    if (!bearer) return;
    try {
      const res = await fetch("/api/ai/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({
          tool: action.tool,
          params: action.params,
          conversation_id: conversationId ?? undefined,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.status === 503) {
        setState({
          kind: "error",
          message: t("الأدوات التعديلية غير مفعّلة حاليًا.", "Actions are currently disabled."),
        });
        return;
      }
      if (!res.ok || !payload.ok) {
        setState({ kind: "error", message: payload.error || t("تعذّر تنفيذ الإجراء.", "Action failed.") });
        return;
      }
      setState({ kind: "done", message: successMessage(action.tool, t) });
    } catch {
      setState({ kind: "error", message: t("تعذّر الاتصال بالخادم.", "Could not reach the server.") });
    }
  }

  /** Staff path: second call with confirm_token. */
  async function executeStaff(confirmToken: string) {
    setState({ kind: "running" });
    const bearer = await bearerOrFail();
    if (!bearer) return;
    try {
      const res = await fetch("/api/ai/staff-action", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({
          phase: "execute",
          tool: action.tool,
          params: action.params,
          confirm_token: confirmToken,
          confirm: true,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        setState({ kind: "error", message: mapStaffError(payload.error, res.status, t) });
        return;
      }
      setState({ kind: "done", message: successMessage(action.tool, t) });
    } catch {
      setState({ kind: "error", message: t("تعذّر الاتصال بالخادم.", "Could not reach the server.") });
    }
  }

  function onConfirmClick() {
    if (isStaff && state.kind === "prepared") {
      void executeStaff(state.confirmToken);
    } else if (isPatient) {
      void executePatient();
    }
  }

  if (!supported) {
    return (
      <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
        <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
        {t("إجراء غير مدعوم", "Unsupported action")}: <code>{action.tool}</code>
      </div>
    );
  }

  const dialogSummary =
    state.kind === "prepared" ? state.summary : action.summary ?? "";
  const canConfirm =
    (isPatient && state.kind !== "running") ||
    (isStaff && state.kind === "prepared");

  return (
    <div className="mt-2 rounded-lg border bg-card p-3">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
        <div className="flex-1 space-y-1">
          <div className="text-sm font-medium">{action.label}</div>
          {action.summary && <p className="text-xs text-muted-foreground">{action.summary}</p>}
        </div>
      </div>

      {state.kind === "idle" && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void openConfirm()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t("مراجعة وتنفيذ", "Review & run")}
          </button>
          <span className="text-[11px] text-muted-foreground">
            {t("يتطلب تأكيدًا صريحًا.", "Requires explicit confirmation.")}
          </span>
        </div>
      )}

      {state.kind === "running" && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("قيد التنفيذ...", "Running...")}
        </div>
      )}

      {state.kind === "done" && (
        <div className="mt-3 space-y-1">
          <div className="flex items-center gap-2 text-xs text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {state.message}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <FileClock className="h-3 w-3" />
            {t("تم تسجيل هذا الإجراء في سجل التدقيق.", "This action was recorded in the audit log.")}
          </div>
        </div>
      )}

      {state.kind === "error" && (
        <div className="mt-3 flex items-center gap-2 text-xs text-destructive">
          <XCircle className="h-3.5 w-3.5" />
          {state.message}
        </div>
      )}

      <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v && state.kind === "prepared") setState({ kind: "idle" }); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("تأكيد الإجراء", "Confirm action")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <span className="block font-medium text-foreground">{action.label}</span>

                {state.kind === "preparing" && (
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("جارٍ إعداد ملخص التغيير...", "Preparing change summary...")}
                  </span>
                )}

                {(state.kind === "prepared" || (!isStaff && dialogSummary)) && (
                  <div className="rounded-md border bg-muted/40 p-2 text-sm">
                    <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t("سيتم تنفيذ التغييرات التالية:", "The following changes will be applied:")}
                    </div>
                    <div className="whitespace-pre-wrap text-foreground">{dialogSummary}</div>
                  </div>
                )}

                {state.kind === "prepared" && (
                  <span className="block text-[11px] text-muted-foreground">
                    {t("ينتهي هذا التأكيد في", "This confirmation expires at")}{" "}
                    {new Date(state.expiresAt).toLocaleTimeString(isAr ? "ar" : "en", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    .
                  </span>
                )}

                {state.kind === "error" && (
                  <span className="block text-xs text-destructive">{state.message}</span>
                )}

                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <FileClock className="h-3 w-3" />
                  {t(
                    "سيتم تسجيل هذا الإرسال في سجل التدقيق قبل وبعد التنفيذ.",
                    "This submission is recorded in the audit log before and after execution.",
                  )}
                </span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("إلغاء", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canConfirm}
              className={cn(
                "bg-primary text-primary-foreground hover:bg-primary/90",
                !canConfirm && "opacity-50 pointer-events-none",
              )}
              onClick={onConfirmClick}
            >
              {t("تأكيد وتنفيذ", "Confirm & run")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function successMessage(tool: string, t: (ar: string, en: string) => string): string {
  switch (tool) {
    case "cancel_appointment":
      return t("تم إلغاء الموعد.", "Appointment cancelled.");
    case "reschedule_appointment":
      return t("تم تغيير الموعد.", "Appointment rescheduled.");
    case "staff_add_inbox_note":
      return t("تمت إضافة الملاحظة إلى الصندوق الموحّد.", "Note added to the unified inbox.");
    default:
      return t("تم تنفيذ الإجراء.", "Action completed.");
  }
}

function mapStaffError(
  code: string | undefined,
  status: number,
  t: (ar: string, en: string) => string,
): string {
  switch (code) {
    case "unauthenticated":
      return t("سجّل الدخول أولاً.", "Sign in first.");
    case "feature_disabled":
      return t("إجراءات الموظف غير مفعّلة حاليًا.", "Staff actions are disabled.");
    case "not_staff":
      return t("هذا الإجراء متاح للموظفين فقط.", "This action is limited to staff.");
    case "tool_not_allowed":
      return t("الأداة غير مسموح باستدعائها.", "Tool is not allowed.");
    case "invalid_params":
      return t("بيانات الإجراء غير صالحة.", "Invalid action parameters.");
    case "confirmation_required":
      return t("مطلوب تأكيد صريح.", "Explicit confirmation is required.");
    case "token_expired":
      return t("انتهت صلاحية التأكيد، أعد المحاولة.", "Confirmation expired, try again.");
    case "token_bad_signature":
    case "token_malformed":
    case "token_mismatch":
      return t("تعذّر التحقق من التأكيد.", "Confirmation could not be verified.");
    case "execute_failed":
      return t("فشل التنفيذ.", "Execution failed.");
    default:
      return code || (status === 429
        ? t("عدد المحاولات كثير، حاول لاحقًا.", "Too many attempts, try later.")
        : t("تعذّر تنفيذ الإجراء.", "Action failed."));
  }
}

/** Extract ```action fenced JSON blocks and return the surrounding text. */
export function extractActions(text: string): { body: string; actions: AssistantAction[] } {
  const actions: AssistantAction[] = [];
  const stripped = text.replace(/```action\s*([\s\S]*?)```/g, (_m, inner: string) => {
    try {
      const parsed = JSON.parse(inner.trim());
      if (parsed && typeof parsed === "object" && typeof parsed.tool === "string") {
        actions.push({
          tool: String(parsed.tool),
          label: String(parsed.label ?? parsed.tool),
          summary: parsed.summary ? String(parsed.summary) : undefined,
          params: parsed.params && typeof parsed.params === "object" ? parsed.params : {},
        });
      }
    } catch {
      /* ignore malformed */
    }
    return ""; // remove fence from visible body
  });
  return { body: stripped.trim(), actions };
}
