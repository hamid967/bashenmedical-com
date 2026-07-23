import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail, MessageSquare, MessageCircle, CheckCircle2, XCircle, Loader2, HelpCircle } from "lucide-react";

type Channel = "sms" | "whatsapp" | "email";
type Status = "sent" | "failed" | "pending" | "unknown";
type ChannelStatus = { channel: Channel; status: Status; updated_at: string | null; attempts: number };

const ICONS: Record<Channel, React.ComponentType<{ className?: string }>> = {
  sms: MessageSquare,
  whatsapp: MessageCircle,
  email: Mail,
};

function StatusIcon({ status }: { status: Status }) {
  switch (status) {
    case "sent":
      return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5" aria-hidden />;
    case "pending":
      return <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />;
    default:
      return <HelpCircle className="h-3.5 w-3.5" aria-hidden />;
  }
}

function chipClasses(status: Status): string {
  switch (status) {
    case "sent":
      return "border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-700/60 dark:text-emerald-200";
    case "failed":
      return "border-rose-300/60 bg-rose-50 text-rose-800 dark:bg-rose-900/20 dark:border-rose-700/60 dark:text-rose-200";
    case "pending":
      return "border-amber-300/60 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700/60 dark:text-amber-200";
    default:
      return "border-muted bg-muted/40 text-muted-foreground";
  }
}

const TERMINAL: Status[] = ["sent", "failed"];

export function NotificationStatusChips({
  reference,
  phone,
}: {
  reference: string | null;
  phone: string;
}) {
  const { t } = useTranslation("booking");
  const [items, setItems] = useState<ChannelStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const phoneLast4 = (phone.match(/\d/g) ?? []).slice(-4).join("");

  useEffect(() => {
    if (!reference || phoneLast4.length !== 4) return;
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const MAX_ATTEMPTS = 20; // ~2 minutes total

    const poll = async () => {
      attempt += 1;
      try {
        const res = await fetch("/api/public/book/notification-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference, phone_last4: phoneLast4 }),
        });
        if (!res.ok) {
          if (!cancelled) setError("unavailable");
        } else {
          const j = (await res.json()) as
            | { ok: true; channels: ChannelStatus[] }
            | { ok: false; message?: string };
          if (!cancelled && j.ok) {
            setItems(j.channels);
            setError(null);
          }
        }
      } catch {
        if (!cancelled) setError("unavailable");
      }

      if (cancelled) return;
      const allDone =
        items !== null &&
        items.length > 0 &&
        items.every((c) => TERMINAL.includes(c.status) || c.status === "unknown");
      if (attempt < MAX_ATTEMPTS && !allDone) {
        // Backoff: 3s, 3s, 5s, 5s, 8s, 8s, then 10s.
        const delay = attempt <= 2 ? 3000 : attempt <= 4 ? 5000 : attempt <= 6 ? 8000 : 10000;
        timer = setTimeout(poll, delay);
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference, phoneLast4]);

  if (!reference || phoneLast4.length !== 4) return null;
  if (error && !items) return null; // silent fail — booking success still shown

  const list =
    items ??
    (["sms", "whatsapp", "email"] as Channel[]).map<ChannelStatus>((c) => ({
      channel: c,
      status: "pending",
      updated_at: null,
      attempts: 0,
    }));

  return (
    <div
      className="mt-6 rounded-xl border bg-card/50 p-4 text-start"
      role="region"
      aria-label={t("success.notifTitle", "حالة تسليم الإشعارات")}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">
          {t("success.notifTitle", "حالة تسليم الإشعارات")}
        </h3>
        <span className="text-[10px] text-muted-foreground">
          {t("success.notifAutoRefresh", "يتم التحديث تلقائيًا")}
        </span>
      </div>
      <ul className="flex flex-wrap gap-2">
        {list.map((c) => {
          const Icon = ICONS[c.channel];
          const label = t(`success.notifChannel.${c.channel}`, c.channel.toUpperCase());
          const statusLabel = t(
            `success.notifStatus.${c.status}`,
            c.status,
          );
          return (
            <li
              key={c.channel}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${chipClasses(c.status)}`}
              aria-label={`${label}: ${statusLabel}`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              <span>{label}</span>
              <span className="opacity-60">·</span>
              <span className="inline-flex items-center gap-1">
                <StatusIcon status={c.status} />
                <span>{statusLabel}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {t(
          "success.notifHint",
          "قد يستغرق تسليم الرسائل حتى دقيقتين. سنستمر بالتحديث تلقائيًا.",
        )}
      </p>
    </div>
  );
}
