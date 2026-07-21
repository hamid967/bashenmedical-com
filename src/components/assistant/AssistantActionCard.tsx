import { useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, XCircle, AlertTriangle } from "lucide-react";
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
  | { kind: "running" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

interface Props {
  action: AssistantAction;
  conversationId?: string | null;
  isAr: boolean;
}

const SUPPORTED_TOOLS = new Set(["cancel_appointment", "reschedule_appointment"]);

export function AssistantActionCard({ action, conversationId, isAr }: Props) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AssistantActionState>({ kind: "idle" });

  const t = (ar: string, en: string) => (isAr ? ar : en);
  const supported = SUPPORTED_TOOLS.has(action.tool);

  async function execute() {
    setState({ kind: "running" });
    try {
      const { data: session } = await supabase.auth.getSession();
      const bearer = session.session?.access_token;
      if (!bearer) {
        setState({
          kind: "error",
          message: t("سجّل الدخول لتنفيذ هذا الإجراء.", "Sign in to run this action."),
        });
        return;
      }
      const res = await fetch("/api/ai/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({
          tool: action.tool,
          params: action.params,
          conversation_id: conversationId ?? undefined,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (res.status === 503) {
        setState({
          kind: "error",
          message: t("الأدوات التعديلية غير مفعّلة حاليًا.", "Actions are currently disabled."),
        });
        return;
      }
      if (!res.ok || !payload.ok) {
        setState({
          kind: "error",
          message: payload.error || t("تعذّر تنفيذ الإجراء.", "Action failed."),
        });
        return;
      }
      setState({
        kind: "done",
        message:
          action.tool === "cancel_appointment"
            ? t("تم إلغاء الموعد.", "Appointment cancelled.")
            : action.tool === "reschedule_appointment"
              ? t("تم تغيير الموعد.", "Appointment rescheduled.")
              : t("تم تنفيذ الإجراء.", "Action completed."),
      });
    } catch {
      setState({
        kind: "error",
        message: t("تعذّر الاتصال بالخادم.", "Could not reach the server."),
      });
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
            onClick={() => setOpen(true)}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t("تنفيذ", "Run action")}
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
        <div className="mt-3 flex items-center gap-2 text-xs text-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {state.message}
        </div>
      )}

      {state.kind === "error" && (
        <div className="mt-3 flex items-center gap-2 text-xs text-destructive">
          <XCircle className="h-3.5 w-3.5" />
          {state.message}
        </div>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("تأكيد الإجراء", "Confirm action")}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block font-medium text-foreground">{action.label}</span>
              {action.summary && <span className="block text-sm">{action.summary}</span>}
              <span className="block text-xs">
                {t(
                  "لن يتم تنفيذ الإجراء إلا بعد ضغطك على «تأكيد». يتم تسجيل هذا الإجراء في سجل التدقيق.",
                  "The action will only run after you press Confirm. It will be recorded in the audit log.",
                )}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("إلغاء", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={cn("bg-primary text-primary-foreground hover:bg-primary/90")}
              onClick={() => void execute()}
            >
              {t("تأكيد وتنفيذ", "Confirm & run")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
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
          params:
            parsed.params && typeof parsed.params === "object" ? parsed.params : {},
        });
      }
    } catch { /* ignore malformed */ }
    return ""; // remove fence from visible body
  });
  return { body: stripped.trim(), actions };
}
