import { useEffect, useRef, useState, type FormEvent } from "react";
import { MessageCircle, X, Send, Loader2, Sparkles, Trash2, PhoneCall, Bot, Square } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { whatsappUrl } from "@/lib/site";
import { classifyUserMessage } from "@/lib/ai/safety";
import { AssistantActionCard, extractActions } from "./AssistantActionCard";

type Msg = { role: "user" | "assistant"; content: string };

const CID_KEY = "baeshen.ai.cid";
const NO_SAVE_KEY = "baeshen.ai.no_save";
const SUGGESTIONS_AR = [
  "ما هي الخدمات المتوفرة في المجمع؟",
  "أبغى أحجز موعد مع طبيب أسنان",
  "ما شركات التأمين المقبولة؟",
  "متى مواعيد عمل الفروع؟",
];
const SUGGESTIONS_EN = [
  "What services do you offer?",
  "I want to book a dental appointment",
  "Which insurance plans are accepted?",
  "What are your branch working hours?",
];

export function BaeshenAssistant() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmergency, setShowEmergency] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const conversationId = useRef<string | null>(null);
  const [noSave, setNoSave] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    conversationId.current = window.localStorage.getItem(CID_KEY);
    setNoSave(window.localStorage.getItem(NO_SAVE_KEY) === "1");
  }, []);

  function toggleNoSave(next: boolean) {
    setNoSave(next);
    if (typeof window === "undefined") return;
    if (next) {
      window.localStorage.setItem(NO_SAVE_KEY, "1");
      // If disabling save, drop the current conversation id so we don't
      // append to an already-saved thread server-side.
      conversationId.current = null;
      window.localStorage.removeItem(CID_KEY);
    } else {
      window.localStorage.removeItem(NO_SAVE_KEY);
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const t = (ar: string, en: string) => (isAr ? ar : en);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setError(null);
    setInput("");
    const cls = classifyUserMessage(trimmed);
    setShowEmergency(cls.kind === "emergency");

    const next: Msg[] = [...messages, { role: "user", content: trimmed }, { role: "assistant", content: "" }];
    setMessages(next);
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const bearer = sessionRes.session?.access_token;
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({
          messages: next.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
          conversation_id: noSave ? null : conversationId.current,
          lang: isAr ? "ar" : "en",
          save_history: !noSave,
        }),
      });
      if (res.status === 503) throw new Error(t("المساعد معطّل مؤقتًا.", "Assistant is temporarily disabled."));
      if (res.status === 429) throw new Error(t("طلبات كثيرة، حاول بعد قليل.", "Too many requests, try again shortly."));
      if (res.status === 402) throw new Error(t("انتهت أرصدة الذكاء الاصطناعي.", "AI credits exhausted."));
      if (!res.ok || !res.body) throw new Error(t("تعذّر الاتصال بالمساعد.", "Failed to reach the assistant."));

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const j = JSON.parse(payload);
            const delta = j?.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              acc += delta;
              setMessages((prev) => {
                const copy = prev.slice();
                copy[copy.length - 1] = { role: "assistant", content: acc };
                return copy;
              });
            }
          } catch { /* ignore partial */ }
        }
      }
      if (!acc) {
        setMessages((prev) => {
          const copy = prev.slice();
          copy[copy.length - 1] = { role: "assistant", content: t("لم أستطع توليد رد الآن.", "No response was generated.") };
          return copy;
        });
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const msg = (err as Error).message || t("حدث خطأ.", "Something went wrong.");
      setError(msg);
      setMessages((prev) => {
        const copy = prev.slice();
        if (copy.length && copy[copy.length - 1].role === "assistant" && !copy[copy.length - 1].content) copy.pop();
        return copy;
      });
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  function stopGeneration() {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setMessages((prev) => {
      const copy = prev.slice();
      const last = copy[copy.length - 1];
      if (last && last.role === "assistant") {
        const suffix = t("\n\n_تم الإيقاف._", "\n\n_Stopped._");
        copy[copy.length - 1] = {
          role: "assistant",
          content: (last.content || "") + suffix,
        };
      }
      return copy;
    });
  }

  function newConversation() {
    abortRef.current?.abort();
    setMessages([]);
    setShowEmergency(false);
    setError(null);
    conversationId.current = null;
    if (typeof window !== "undefined") window.localStorage.removeItem(CID_KEY);
  }

  const suggestions = isAr ? SUGGESTIONS_AR : SUGGESTIONS_EN;

  return (
    <>
      <button
        type="button"
        aria-label={t("مساعد باعشن الذكي", "Baeshen AI Assistant")}
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-24 z-40 grid h-14 w-14 place-items-center rounded-full shadow-lg transition-transform",
          "bg-gradient-to-br from-primary to-primary/70 text-primary-foreground hover:scale-105",
          isAr ? "left-4" : "right-4",
        )}
      >
        <Sparkles className="h-6 w-6" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={isAr ? "left" : "right"}
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md md:max-w-lg"
        >
          <SheetHeader className="border-b bg-gradient-to-br from-primary/5 to-transparent p-4">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Bot className="h-5 w-5 text-primary" />
              {t("مساعد باعشن الذكي", "Baeshen AI Assistant")}
            </SheetTitle>
            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="min-w-0 truncate">{t("مساعد آمن للبحث والحجز. لا يقدم تشخيصًا طبيًا.", "Safe search & booking helper. Not medical advice.")}</span>
              <div className="flex shrink-0 items-center gap-1">
                <label className="inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 hover:bg-muted" title={t("لا تحفظ سجل هذه الجلسة", "Do not save this session")}>
                  <input
                    type="checkbox"
                    className="h-3 w-3 accent-primary"
                    checked={noSave}
                    onChange={(e) => toggleNoSave(e.target.checked)}
                  />
                  {t("لا تحفظ", "Don't save")}
                </label>
                <button
                  type="button"
                  onClick={newConversation}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-muted"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("محادثة جديدة", "New chat")}
                </button>
              </div>
            </div>
          </SheetHeader>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
            {showEmergency && (
              <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <div className="font-semibold text-destructive">{t("تنبيه طوارئ", "Emergency")}</div>
                <p className="mt-1 text-foreground/90">
                  {t("اتصل بالإسعاف 997 أو توجه للطوارئ فورًا.", "Call 997 or go to the nearest ER immediately.")}
                </p>
                <a
                  href="tel:997"
                  className="mt-2 inline-flex items-center gap-1 rounded bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground"
                >
                  <PhoneCall className="h-3.5 w-3.5" />
                  {t("اتصل 997", "Call 997")}
                </a>
              </div>
            )}

            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t(
                    "أهلًا بك في مجمع باعشن الطبي. كيف أقدر أساعدك اليوم؟",
                    "Welcome to Baeshen Medical Center. How can I help you today?",
                  )}
                </p>
                <div className="grid gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      className="rounded-md border bg-card px-3 py-2 text-start text-sm hover:bg-muted"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {messages.map((m, i) => {
                const { body, actions } = m.role === "assistant" ? extractActions(m.content) : { body: m.content, actions: [] };
                return (
                  <div
                    key={i}
                    className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                        m.role === "user"
                          ? "bg-primary text-primary-foreground whitespace-pre-wrap"
                          : "bg-muted text-foreground",
                      )}
                    >
                      {body ? (
                        <div className="whitespace-pre-wrap">
                          {body}
                          {m.role === "assistant" && busy && i === messages.length - 1 && (
                            <span className="ml-1 inline-block h-3 w-1.5 -mb-0.5 bg-current opacity-70 animate-pulse align-baseline" aria-hidden />
                          )}
                        </div>
                      ) : (busy && i === messages.length - 1 && !actions.length) ? (
                        <span className="inline-flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {t("يكتب...", "Thinking...")}
                        </span>
                      ) : null}
                      {actions.map((a, ai) => (
                        <AssistantActionCard
                          key={ai}
                          action={a}
                          conversationId={conversationId.current}
                          isAr={isAr}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {error && (
              <p className="mt-3 text-xs text-destructive">{error}</p>
            )}
          </div>

          <form onSubmit={onSubmit} className="border-t bg-background p-3">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                rows={2}
                placeholder={t("اكتب سؤالك هنا...", "Type your question here...")}
                className="min-h-[44px] resize-none"
                disabled={busy}
              />
              <Button
                type={busy ? "button" : "submit"}
                size="icon"
                onClick={busy ? stopGeneration : undefined}
                disabled={!busy && !input.trim()}
                aria-label={busy ? t("إيقاف التوليد", "Stop generating") : t("إرسال", "Send")}
                variant={busy ? "destructive" : "default"}
              >
                {busy ? <Square className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{t("لا تشارك بيانات الهوية أو التقارير الحساسة.", "Do not share IDs or sensitive reports.")}</span>
              <a
                href={whatsappUrl(t("أحتاج مساعدة بشرية.", "I need a human agent."))}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-primary"
              >
                <MessageCircle className="h-3 w-3" />
                {t("تحويل لموظف", "Talk to a human")}
              </a>
            </div>
          </form>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="sr-only"
            aria-label={t("إغلاق", "Close")}
          >
            <X />
          </button>
        </SheetContent>
      </Sheet>
    </>
  );
}

export default BaeshenAssistant;
