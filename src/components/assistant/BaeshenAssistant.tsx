import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { MessageCircle, X, Send, Loader2, Sparkles, Trash2, PhoneCall, Bot, Square } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { whatsappUrl } from "@/lib/site";
import { classifyUserMessage } from "@/lib/ai/safety";
import { streamChatWithResume, StreamHttpError } from "@/lib/ai/stream-with-resume";
import {
  budgetBlockMessage,
  checkRunningBudget,
  commitSessionCredits,
  getDefaultLimits,
  preflightBudget,
} from "@/lib/ai/budget";
import { estimateCredits, estimateTokens } from "@/lib/ai/pricing";
import { recordUsageSample } from "@/lib/ai/token-calibration";
import { notifyMessageThresholds } from "@/lib/ai/message-alerts";
import { AssistantActionCard, extractActions } from "./AssistantActionCard";
import { MessageCostBadge, type MessageCostMeta } from "./MessageCostBadge";
import { AssistantCostMeter } from "./AssistantCostMeter";
import { PreflightCostChip } from "./PreflightCostChip";
import { SessionExportButton } from "./SessionExportButton";

type Msg = { role: "user" | "assistant"; content: string; meta?: MessageCostMeta };

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
  const [nowTick, setNowTick] = useState(0);
  const [activeModel, setActiveModel] = useState<string | undefined>();
  const [sessionCredits, setSessionCredits] = useState(0);

  // Live pre-flight estimate from composer input + running history.
  const preEstimate = useMemo(() => {
    const historyChars = messages.reduce((n, m) => n + m.content.length, 0);
    const inTok = estimateTokens(input) + Math.ceil(historyChars / 3.5);
    const outTok = Math.max(64, Math.min(512, Math.round(inTok * 0.6)));
    return { inTok, outTok, credits: estimateCredits(inTok, outTok, activeModel) };
  }, [input, messages, activeModel]);

  const lastMsg = messages[messages.length - 1];
  const lastAssistant = lastMsg && lastMsg.role === "assistant" ? lastMsg : null;
  const meterStreamedText = busy && lastAssistant ? lastAssistant.content : "";
  const meterUsage = !busy && lastAssistant?.meta?.usage ? lastAssistant.meta.usage : null;
  const meterModel = lastAssistant?.meta?.model ?? activeModel;

  // Tick every 500ms while streaming so the elapsed-time badge updates smoothly.
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => setNowTick(performance.now()), 500);
    setNowTick(performance.now());
    return () => window.clearInterval(id);
  }, [busy]);

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

    const startedAt = performance.now();
    const historyForPrompt: Msg[] = [...messages, { role: "user", content: trimmed }];
    const promptText = historyForPrompt
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    // Pre-flight budget check — block obviously oversized prompts before we spend anything.
    const limits = getDefaultLimits("public");
    const pre = preflightBudget({ surface: "public", limits, promptText });
    if (!pre.ok) {
      setError(budgetBlockMessage(pre, isAr ? "ar" : "en"));
      return;
    }

    const initialMeta: MessageCostMeta = { startedAt, promptText };
    const next2: Msg[] = [...messages, { role: "user", content: trimmed }, { role: "assistant", content: "", meta: initialMeta }];
    setMessages(next2);
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const updateLastMeta = (patch: Partial<MessageCostMeta>) => {
      setMessages((prev) => {
        const copy = prev.slice();
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant") {
          copy[copy.length - 1] = { ...last, meta: { ...(last.meta ?? initialMeta), ...patch } };
        }
        return copy;
      });
    };

    let currentModel: string | undefined;
    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const bearer = sessionRes.session?.access_token;
      const result = await streamChatWithResume({
        surface: "public",
        url: "/api/ai/chat",
        token: bearer,
        signal: controller.signal,
        buildBody: (resumePartial) => ({
          messages: next2.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
          conversation_id: noSave ? null : conversationId.current,
          lang: isAr ? "ar" : "en",
          save_history: !noSave,
          ...(resumePartial ? { resume_partial: resumePartial } : {}),
        }),
        onModel: (m) => { currentModel = m; setActiveModel(m); updateLastMeta({ model: m }); },
        onUsage: (u) => {
          const prompt = Number((u.prompt_tokens as number | undefined) ?? 0);
          const completion = Number((u.completion_tokens as number | undefined) ?? 0);
          const total = Number((u.total_tokens as number | undefined) ?? prompt + completion);
          updateLastMeta({ usage: { prompt, completion, total } });
        },
        onDelta: (_delta, acc) => {
          setMessages((prev) => {
            const copy = prev.slice();
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = { role: "assistant", content: acc, meta: last?.meta };
            return copy;
          });
        },
        budgetCheck: (acc) => {
          const c = checkRunningBudget({
            surface: "public",
            limits,
            model: currentModel,
            promptText,
            outputSoFar: acc,
          });
          if (c.ok) return { ok: true };
          return { ok: false, message: budgetBlockMessage(c, isAr ? "ar" : "en") };
        },
        onRetry: (phase) => {
          if (phase === "reconnecting") setError(t("انقطع الاتصال — جاري الاستئناف…", "Connection lost — resuming…"));
          else if (phase === "resumed") setError(null);
          else if (phase === "failed") setError(t("تعذّر استئناف الرد.", "Could not resume the response."));
        },
        mapStatusError: (s) => {
          if (s === 503) return t("المساعد معطّل مؤقتًا.", "Assistant is temporarily disabled.");
          if (s === 429) return t("طلبات كثيرة، حاول بعد قليل.", "Too many requests, try again shortly.");
          if (s === 402) return t("انتهت أرصدة الذكاء الاصطناعي.", "AI credits exhausted.");
          if (s === 401) return t("انتهت الجلسة، أعد تسجيل الدخول.", "Session expired, please sign in again.");
          return t("تعذّر الاتصال بالمساعد.", "Failed to reach the assistant.");
        },
      });
      const endedAt = performance.now();
      updateLastMeta({ endedAt });
      // Commit estimated credits for the session running total.
      const promptTok = estimateTokens(promptText);
      const outTok = estimateTokens(result.text);
      const spent = estimateCredits(promptTok, outTok, currentModel);
      commitSessionCredits("public", spent);
      setSessionCredits((v) => v + spent);
      notifyMessageThresholds({
        credits: spent,
        elapsedMs: endedAt - startedAt,
        lang: isAr ? "ar" : "en",
        surface: "public",
      });
      if (result.budgetStop) {
        setError(result.budgetStop.message);
      }
      if (!result.text) {
        setMessages((prev) => {
          const copy = prev.slice();
          const last = copy[copy.length - 1];
          copy[copy.length - 1] = { role: "assistant", content: t("لم أستطع توليد رد الآن.", "No response was generated."), meta: last?.meta };
          return copy;
        });
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        updateLastMeta({ endedAt: performance.now() });
        return;
      }
      const msg = err instanceof StreamHttpError
        ? err.message
        : (err as Error).message || t("حدث خطأ.", "Something went wrong.");
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
                <SessionExportButton
                  messages={messages}
                  sessionCredits={sessionCredits}
                  preEstimateTokens={preEstimate?.inTok}
                  model={meterModel}
                  conversationId={conversationId.current}
                  surface={isAr ? "المساعد العام" : "Public Assistant"}
                  lang={isAr ? "ar" : "en"}
                />
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
                      {m.role === "assistant" && m.meta && (body || actions.length > 0) && (
                        <MessageCostBadge
                          meta={{ ...m.meta, outputText: body }}
                          live={busy && i === messages.length - 1}
                          now={nowTick}
                          lang={isAr ? "ar" : "en"}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {error && (
              <p className="mt-3 text-xs text-destructive">{error}</p>
            )}
          </div>

          <AssistantCostMeter
            streaming={busy}
            hasInput={input.trim().length > 0}
            model={meterModel}
            preEstimate={preEstimate}
            usage={meterUsage}
            streamedText={meterStreamedText}
            sessionCredits={sessionCredits}
            lang={isAr ? "ar" : "en"}
          />

          <form onSubmit={onSubmit} className="border-t bg-background p-3">
            {!busy && input.trim() && (
              <div className="mb-2 flex justify-end">
                <PreflightCostChip
                  input={input}
                  streaming={busy}
                  model={activeModel}
                  historyChars={messages.reduce((n, m) => n + m.content.length, 0)}
                  lang={lang === "en" ? "en" : "ar"}
                />
              </div>
            )}
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
