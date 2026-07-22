import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listMyAiConversations,
  listMyAiMessages,
  deleteMyAiConversation,
  clearMyAiConversations,
} from "@/lib/ai/assistant.functions";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Bot, Trash2, MessageSquare, Loader2, ShieldOff, Info } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/my/ai-history")({
  component: AiHistoryPage,
  head: () => ({
    meta: [
      { title: "سجل محادثاتي — مساعد باعشن | Baeshen AI History" },
      {
        name: "description",
        content:
          "استعرض سجل محادثاتك مع مساعد باعشن الذكي، احذف أي محادثة، أو عطّل حفظ السجل لجلساتك.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type ConversationRow = {
  id: string;
  title: string | null;
  lang: string | null;
  started_at: string;
  last_activity_at: string;
};

type MessageRow = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

const NO_SAVE_KEY = "baeshen.ai.no_save";

function AiHistoryPage() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const t = (ar: string, en: string) => (isAr ? ar : en);
  const router = useRouter();

  const listConv = useServerFn(listMyAiConversations);
  const listMsgs = useServerFn(listMyAiMessages);
  const delOne = useServerFn(deleteMyAiConversation);
  const clearAll = useServerFn(clearMyAiConversations);

  const [items, setItems] = useState<ConversationRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [noSave, setNoSave] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setNoSave(window.localStorage.getItem(NO_SAVE_KEY) === "1");
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    try {
      const rows = (await listConv()) as ConversationRow[];
      setItems(rows);
      if (rows.length > 0 && !selectedId) void openConv(rows[0].id);
      else if (rows.length === 0) {
        setSelectedId(null);
        setMessages([]);
      }
    } catch (e) {
      toast.error(t("تعذّر تحميل السجل.", "Failed to load history."));
      setItems([]);
    }
  }

  async function openConv(id: string) {
    setSelectedId(id);
    setLoadingMsgs(true);
    try {
      const res = (await listMsgs({ data: { conversationId: id } })) as {
        messages: MessageRow[];
      };
      setMessages(res.messages ?? []);
    } catch {
      setMessages([]);
      toast.error(t("تعذّر تحميل المحادثة.", "Failed to load conversation."));
    } finally {
      setLoadingMsgs(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("حذف هذه المحادثة نهائيًا؟", "Delete this conversation permanently?"))) return;
    try {
      await delOne({ data: { id } });
      toast.success(t("تم الحذف.", "Deleted."));
      if (selectedId === id) {
        setSelectedId(null);
        setMessages([]);
      }
      void refresh();
    } catch {
      toast.error(t("تعذّر الحذف.", "Delete failed."));
    }
  }

  async function handleClearAll() {
    if (
      !confirm(
        t(
          "سيتم حذف كل محادثاتك مع المساعد نهائيًا. متابعة؟",
          "This will permanently delete ALL your assistant conversations. Continue?",
        ),
      )
    )
      return;
    try {
      await clearAll();
      toast.success(t("تم مسح السجل بالكامل.", "History cleared."));
      setSelectedId(null);
      setMessages([]);
      void refresh();
    } catch {
      toast.error(t("تعذّر المسح.", "Clear failed."));
    }
  }

  function toggleNoSave(next: boolean) {
    setNoSave(next);
    if (typeof window === "undefined") return;
    if (next) {
      window.localStorage.setItem(NO_SAVE_KEY, "1");
      window.localStorage.removeItem("baeshen.ai.cid");
    } else {
      window.localStorage.removeItem(NO_SAVE_KEY);
    }
    // Broadcast so open assistant sheets refresh their setting (if desired).
    router.invalidate();
  }

  return (
    <main dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-6xl px-4 py-6 md:py-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Bot className="h-6 w-6 text-primary" />
            {t("سجل محادثاتي مع المساعد", "My assistant history")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "استعرض محادثاتك السابقة، احذف أي محادثة، أو عطّل حفظ السجل للجلسات القادمة.",
              "Review past chats, delete any conversation, or disable saving for future sessions.",
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={handleClearAll}
          disabled={!items || items.length === 0}
        >
          <Trash2 className="me-2 h-4 w-4" />
          {t("حذف كل السجل", "Clear all history")}
        </Button>
      </header>

      <section className="mb-6 rounded-lg border bg-card p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-primary"
            checked={noSave}
            onChange={(e) => toggleNoSave(e.target.checked)}
          />
          <span className="flex-1">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ShieldOff className="h-4 w-4 text-primary" />
              {t("لا تحفظ سجل الجلسات القادمة", "Don't save future sessions")}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {t(
                "عند التفعيل، لن يتم حفظ رسائلك مع المساعد في الخادم. يتم تخزين التفضيل في هذا المتصفح فقط.",
                "When enabled, new assistant messages will not be stored on the server. This preference is kept in this browser only.",
              )}
            </span>
          </span>
        </label>
      </section>

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <aside className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
            <span>{t("المحادثات", "Conversations")}</span>
            <span>{items?.length ?? 0}</span>
          </div>
          <ul className="max-h-[65vh] divide-y overflow-y-auto">
            {items === null && (
              <li className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />{" "}
                {t("جارٍ التحميل...", "Loading...")}
              </li>
            )}
            {items && items.length === 0 && (
              <li className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Info className="h-3.5 w-3.5" />
                {t("لا توجد محادثات محفوظة.", "No saved conversations.")}
              </li>
            )}
            {items?.map((c) => (
              <li
                key={c.id}
                className={cn(
                  "group flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/60",
                  selectedId === c.id && "bg-muted",
                )}
              >
                <button
                  type="button"
                  onClick={() => void openConv(c.id)}
                  className="flex-1 truncate text-start"
                >
                  <div className="truncate font-medium text-foreground">
                    {c.title || t("محادثة بدون عنوان", "Untitled chat")}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(c.last_activity_at).toLocaleString(isAr ? "ar-SA" : "en-US")}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(c.id)}
                  aria-label={t("حذف", "Delete")}
                  className="rounded p-1 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="rounded-lg border bg-card p-4">
          {!selectedId && (
            <div className="grid h-full min-h-[300px] place-items-center text-sm text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-60" />
                {t("اختر محادثة لعرض تفاصيلها.", "Select a conversation to view it.")}
              </div>
            </div>
          )}
          {selectedId && loadingMsgs && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />{" "}
              {t("تحميل الرسائل...", "Loading messages...")}
            </div>
          )}
          {selectedId && !loadingMsgs && (
            <div className="space-y-3">
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {t("لا توجد رسائل في هذه المحادثة.", "No messages in this conversation.")}
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground",
                    )}
                  >
                    {m.content}
                    <div className="mt-1 text-[10px] opacity-70">
                      {new Date(m.created_at).toLocaleString(isAr ? "ar-SA" : "en-US")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
