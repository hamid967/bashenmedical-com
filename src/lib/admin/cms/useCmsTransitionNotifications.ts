/**
 * Realtime notifications for CMS workflow transitions.
 *
 * Subscribes to UPDATE events on `public.cms_entries` and fires a toast
 * when the row transitions from `in_review` to `approved` or `scheduled`.
 * Also invalidates the CMS query cache so the UI reflects the new state
 * without a manual refresh. Cache invalidation is enabled by default; it
 * can be safely dropped when the hook is used purely for notifications.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  id: string;
  status: string | null;
  title: string | null;
  kind: string | null;
  scheduled_at: string | null;
};

export function useCmsTransitionNotifications(options?: {
  entryId?: string;
  invalidate?: boolean;
}) {
  const qc = useQueryClient();
  const entryId = options?.entryId;
  const invalidate = options?.invalidate ?? true;

  useEffect(() => {
    const channel = supabase
      .channel(entryId ? `cms-entry-${entryId}` : "cms-transitions")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "cms_entries",
          ...(entryId ? { filter: `id=eq.${entryId}` } : {}),
        },
        (payload) => {
          const before = (payload.old ?? {}) as Partial<Row>;
          const after = (payload.new ?? {}) as Partial<Row>;
          if (before.status === after.status) return;
          if (before.status !== "in_review") return;

          const title = after.title || "عنصر CMS";
          if (after.status === "approved") {
            toast.success(`تم اعتماد: ${title}`, {
              description: "انتقل من قيد المراجعة إلى معتمد.",
            });
          } else if (after.status === "scheduled") {
            const when = after.scheduled_at
              ? new Date(after.scheduled_at).toLocaleString("ar")
              : "";
            toast.success(`تمت جدولة: ${title}`, {
              description: when ? `موعد النشر: ${when}` : undefined,
            });
          } else {
            return;
          }

          if (invalidate) {
            qc.invalidateQueries({ queryKey: ["cms"] });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [entryId, invalidate, qc]);
}
