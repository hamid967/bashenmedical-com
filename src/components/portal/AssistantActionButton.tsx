/**
 * Inline "quick action" button rendered from an ```action``` code block
 * emitted by the AI assistant. The button is NEVER executed automatically —
 * it opens a confirmation dialog and only runs after the user confirms.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarX,
  CheckCircle2,
  LifeBuoy,
  Loader2,
  ShieldQuestion,
  XCircle,
} from "lucide-react";
import { cancelMyAppointment } from "@/lib/portal/appointments.functions";
import { submitMyComplaint } from "@/lib/complaints.functions";
import { getMyProfile } from "@/lib/portal/portal.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export type AssistantAction =
  | {
      type: "cancel_appointment";
      id: string;
      label?: string;
    }
  | {
      type: "create_support_ticket";
      subject?: string;
      category?: "complaint" | "suggestion" | "inquiry" | "thanks";
      label?: string;
    };

type Status = "idle" | "confirming" | "running" | "done" | "failed";

export function AssistantActionButton({ action }: { action: AssistantAction }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [ticketMessage, setTicketMessage] = useState(
    action.type === "create_support_ticket" ? (action.subject ?? "") : "",
  );

  const qc = useQueryClient();
  const cancelFn = useServerFn(cancelMyAppointment);
  const submitTicketFn = useServerFn(submitMyComplaint);
  const profile = useQuery({
    queryKey: ["portal", "profile"],
    queryFn: () => getMyProfile(),
    staleTime: 60_000,
    enabled: action.type === "create_support_ticket",
  });

  const isCancel = action.type === "cancel_appointment";
  const Icon = isCancel ? CalendarX : LifeBuoy;
  const label =
    action.label ??
    (isCancel ? "إلغاء موعد" : "فتح تذكرة دعم");

  async function run() {
    setError(null);
    setStatus("running");
    try {
      if (action.type === "cancel_appointment") {
        await cancelFn({ data: { id: action.id, reason: reason.trim() || undefined } });
        qc.invalidateQueries({ queryKey: ["portal"] });
        toast.success("تم إلغاء الموعد");
      } else {
        const p = profile.data;
        const name = (p?.full_name ?? "").trim();
        const phone = (p?.phone ?? "").trim();
        if (!name || !phone) {
          throw new Error("أكمِل الاسم ورقم الجوال في ملفك الشخصي ثم أعد المحاولة.");
        }
        if (ticketMessage.trim().length < 10) {
          throw new Error("اكتب رسالة لا تقل عن 10 أحرف.");
        }
        await submitTicketFn({
          data: {
            name,
            phone,
            type: action.category ?? "complaint",
            message: ticketMessage.trim(),
          },
        });
        toast.success("تم فتح التذكرة");
      }
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تنفيذ الإجراء");
      setStatus("failed");
    }
  }

  if (status === "done") {
    return (
      <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-[color:var(--portal-success)]/25 bg-[color:var(--portal-success-50)] px-3 py-2 text-xs font-medium text-[color:var(--portal-success)]">
        <CheckCircle2 className="h-4 w-4" />
        تم التنفيذ: {label}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setStatus("confirming");
          setError(null);
        }}
        className="mt-2 inline-flex items-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-surface)] px-3 py-2 text-xs font-semibold text-[color:var(--portal-ink)] hover:bg-[color:var(--portal-surface-3)] transition"
        aria-label={`${label} — يتطلب تأكيدك`}
      >
        <Icon className="h-4 w-4" />
        {label}
        <span className="ms-1 inline-flex items-center gap-1 rounded-full bg-[color:var(--portal-warning-50)] text-[color:var(--portal-warning)] px-1.5 py-0.5 text-[10px] font-medium">
          <ShieldQuestion className="h-3 w-3" />
          يتطلب تأكيد
        </span>
      </button>

      {(status === "confirming" || status === "running" || status === "failed") && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[color:var(--portal-ink)]/40 p-4"
          role="dialog"
          aria-modal="true"
          dir="rtl"
          onClick={(e) => {
            if (e.target === e.currentTarget && status !== "running") setStatus("idle");
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-[color:var(--portal-surface)] p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-amber-50 text-amber-600 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-[color:var(--portal-ink)]">
                  تأكيد: {label}
                </h3>
                <p className="mt-1 text-xs text-[color:var(--portal-ink-2)]">
                  {isCancel
                    ? "سيتم إلغاء الموعد فورًا ولا يمكن التراجع من هنا. تابع فقط إذا كنت متأكدًا."
                    : "سيتم إنشاء تذكرة دعم باسمك وسيراجعها فريق خدمة العملاء."}
                </p>
              </div>
            </div>

            {isCancel ? (
              <label className="mt-4 block text-xs">
                <span className="text-[color:var(--portal-ink-2)]">سبب الإلغاء (اختياري)</span>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  maxLength={500}
                  disabled={status === "running"}
                  className="mt-1 w-full resize-none rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-surface-2)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--portal-primary)]/30"
                />
              </label>
            ) : (
              <label className="mt-4 block text-xs">
                <span className="text-[color:var(--portal-ink-2)]">تفاصيل التذكرة (10 أحرف على الأقل)</span>
                <textarea
                  value={ticketMessage}
                  onChange={(e) => setTicketMessage(e.target.value)}
                  rows={4}
                  maxLength={4000}
                  disabled={status === "running"}
                  className="mt-1 w-full resize-none rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-surface-2)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--portal-primary)]/30"
                />
                {profile.data && (
                  <span className="mt-1 block text-[10px] text-[color:var(--portal-ink-2)]">
                    ستُرسَل باسم: {profile.data.full_name ?? "—"} • {profile.data.phone ?? "—"}
                  </span>
                )}
              </label>
            )}

            {error && (
              <div className="mt-3 rounded-lg border border-[color:var(--portal-error)]/40 bg-[color:var(--portal-error)]/5 p-2 text-xs text-[color:var(--portal-error)] flex items-start gap-1.5">
                <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStatus("idle")}
                disabled={status === "running"}
                className="inline-flex items-center rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-surface)] px-4 h-9 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={run}
                disabled={status === "running"}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 h-9 text-xs font-semibold text-white disabled:opacity-60 ${
                  isCancel ? "bg-red-600 hover:bg-red-700" : "bg-[color:var(--portal-primary)] hover:opacity-90"
                }`}
              >
                {status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isCancel ? "تأكيد الإلغاء" : "إرسال التذكرة"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Parse assistant markdown for ```action ...``` code blocks and return
 * the cleaned text plus the list of valid actions in order.
 */
export function parseAssistantActions(raw: string): {
  clean: string;
  actions: AssistantAction[];
} {
  const actions: AssistantAction[] = [];
  const clean = raw.replace(
    /```action\s*\n([\s\S]*?)```/gi,
    (_full, body: string) => {
      body
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach((line) => {
          try {
            const parsed = JSON.parse(line);
            const a = normalizeAction(parsed);
            if (a) actions.push(a);
          } catch {
            // ignore malformed JSON lines
          }
        });
      return ""; // strip block from displayed text
    },
  );
  return { clean: clean.replace(/\n{3,}/g, "\n\n").trim(), actions };
}

function normalizeAction(v: unknown): AssistantAction | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const type = typeof r.type === "string" ? r.type : "";
  const label = typeof r.label === "string" ? r.label : undefined;
  if (type === "cancel_appointment") {
    const id = typeof r.id === "string" ? r.id : "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return { type, id, label };
  }
  if (type === "create_support_ticket") {
    const category = typeof r.category === "string" ? r.category : "complaint";
    const subject = typeof r.subject === "string" ? r.subject : undefined;
    const allowed = ["complaint", "suggestion", "inquiry", "thanks"] as const;
    return {
      type,
      subject,
      category: (allowed as readonly string[]).includes(category)
        ? (category as "complaint" | "suggestion" | "inquiry" | "thanks")
        : "complaint",
      label,
    };
  }
  return null;
}
