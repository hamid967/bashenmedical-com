/**
 * Appointment audit history — shows the patient the change log for a booking.
 * Uses RPC `list_appointment_audit_by_ref` (SECURITY DEFINER) which validates
 * reference + phone before returning rows.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { History, User, Bot, UserCog, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useI18n } from "@/lib/i18n";

type Row = {
  changed_at: string;
  old_status: string | null;
  new_status: string | null;
  old_notes: string | null;
  new_notes: string | null;
  reason: string | null;
  actor_kind: string;
};

function fmt(iso: string, lang: "ar" | "en") {
  try {
    return new Date(iso).toLocaleString(lang === "ar" ? "ar-SA" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function ActorBadge({ kind }: { kind: string }) {
  const { t } = useTranslation("booking");
  const map: Record<string, { icon: React.ReactNode; cls: string }> = {
    staff: { icon: <UserCog className="h-3 w-3" />, cls: "bg-primary/10 text-primary" },
    self_service: { icon: <User className="h-3 w-3" />, cls: "bg-emerald-500/10 text-emerald-700" },
    system: { icon: <Bot className="h-3 w-3" />, cls: "bg-muted text-muted-foreground" },
  };
  const m = map[kind] ?? map.system;
  const label = t(`audit.actor.${kind in map ? kind : "system"}`);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.cls}`}>
      {m.icon}
      {label}
    </span>
  );
}

export function AppointmentAuditHistory({ refId, phone }: { refId: string; phone: string }) {
  const { lang } = useI18n();
  const { t } = useTranslation("booking");

  const { data, isLoading } = useQuery({
    queryKey: ["appt-audit", refId, phone],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_appointment_audit_by_ref", {
        _ref: refId,
        _phone: phone,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    enabled: !!refId && !!phone,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="h-4 w-40 bg-muted animate-pulse rounded" />
      </div>
    );
  }
  if (!data || data.length === 0) return null;

  const statusLabel = (s: string) => t(`audit.statusValues.${s}`, { defaultValue: s });

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <History className="h-5 w-5 text-primary" />
        <h3 className="font-bold">{t("audit.title")}</h3>
      </div>
      <ol className="relative space-y-4 border-s-2 border-border ps-5">
        {data.map((r, i) => {
          const statusChanged = r.old_status !== r.new_status && (r.old_status || r.new_status);
          const notesChanged = (r.old_notes ?? "") !== (r.new_notes ?? "") && (r.old_notes || r.new_notes);
          return (
            <li key={i} className="relative">
              <span className="absolute -start-[27px] top-1.5 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <time>{fmt(r.changed_at, lang)}</time>
                <ActorBadge kind={r.actor_kind} />
              </div>
              {statusChanged && (
                <div className="mt-1 text-sm font-medium flex items-center gap-2 flex-wrap">
                  <span className="text-muted-foreground">{t("audit.status")}</span>
                  {r.old_status && (
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{statusLabel(r.old_status)}</span>
                  )}
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  {r.new_status && (
                    <span className="rounded-md bg-primary/10 text-primary px-2 py-0.5 text-xs font-semibold">
                      {statusLabel(r.new_status)}
                    </span>
                  )}
                </div>
              )}
              {notesChanged && (
                <div className="mt-1 text-sm text-muted-foreground">{t("audit.notesUpdated")}</div>
              )}
              {r.reason && (
                <div className="mt-1 rounded-md bg-muted/50 px-3 py-1.5 text-xs">
                  <span className="font-semibold">{t("audit.reason")}</span>
                  {r.reason}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
