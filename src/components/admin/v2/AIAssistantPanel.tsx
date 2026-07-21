import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, X, Send, Loader2, AlertCircle, RotateCcw, Coins } from "lucide-react";
import { toast } from "sonner";
import {
  estimateTokens,
  estimateCredits,
  formatCredits,
  formatTokens,
} from "@/lib/ai/pricing";
import {
  budgetBlockMessage,
  checkRunningBudget,
  commitSessionCredits,
  getDefaultLimits,
  preflightBudget,
} from "@/lib/ai/budget";
import { streamChatWithResume, StreamHttpError } from "@/lib/ai/stream-with-resume";
import { MessageCostBadge, type MessageCostMeta } from "@/components/assistant/MessageCostBadge";

type Msg = { role: "user" | "assistant"; content: string; meta?: MessageCostMeta };
type Usage = { prompt: number; completion: number; total: number };

const STORAGE_KEY = "admin-ai-panel-messages-v1";

export function AIAssistantPanel({
  open,
  onOpenChange,
  initialPrompt,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialPrompt?: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamed, setStreamed] = useState("");
  const [model, setModel] = useState<string>("google/gemini-2.5-flash");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [resumeNotice, setResumeNotice] = useState<string | null>(null);
  const [sessionCredits, setSessionCredits] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [streamMeta, setStreamMeta] = useState<MessageCostMeta | null>(null);
  const [nowTick, setNowTick] = useState(0);

  useEffect(() => {
    if (!streaming) return;
    const id = window.setInterval(() => setNowTick(performance.now()), 500);
    setNowTick(performance.now());
    return () => window.clearInterval(id);
  }, [streaming]);

  // Live pre-flight estimate from the composer input + conversation history
  const preEstimate = useMemo(() => {
    const historyChars = messages.reduce((n, m) => n + m.content.length, 0);
    const inTok = estimateTokens(input) + Math.ceil(historyChars / 3.5);
    const outTok = Math.max(64, Math.min(512, Math.round(inTok * 0.6)));
    return {
      inTok,
      outTok,
      credits: estimateCredits(inTok, outTok, model),
    };
  }, [input, messages, model]);

  // Load from localStorage once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // Persist
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch { /* ignore */ }
  }, [messages]);

  // Autoscroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamed]);

  // Focus + prefill
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      if (initialPrompt) setInput(initialPrompt);
    } else {
      abortRef.current?.abort();
      abortRef.current = null;
      setStreaming(false);
    }
  }, [open, initialPrompt]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content: text }];
    const startedAt = performance.now();
    const promptText = next.map((m) => `${m.role}: ${m.content}`).join("\n");

    const limits = getDefaultLimits("admin");
    const pre = preflightBudget({ surface: "admin", limits, model, promptText });
    if (!pre.ok) {
      toast.error(budgetBlockMessage(pre, "ar"));
      return;
    }

    setMessages(next);
    setStreamed("");
    setStreaming(true);
    setUsage(null);
    setResumeNotice(null);

    const meta0: MessageCostMeta = { startedAt, promptText, model };
    setStreamMeta(meta0);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("انتهت الجلسة، أعد تسجيل الدخول.");

      let liveUsage: Usage | null = null;
      let currentModel = model;

      const result = await streamChatWithResume({
        surface: "admin",
        url: "/api/admin/ai-chat",
        token,
        signal: controller.signal,
        buildBody: (resumePartial) => ({
          messages: next,
          ...(resumePartial ? { resume_partial: resumePartial } : {}),
        }),
        onModel: (m) => {
          currentModel = m;
          setModel(m);
          setStreamMeta((prev) => (prev ? { ...prev, model: m } : prev));
        },
        onDelta: (_delta, acc) => setStreamed(acc),
        budgetCheck: (acc) => {
          const c = checkRunningBudget({
            surface: "admin",
            limits,
            model: currentModel,
            promptText,
            outputSoFar: acc,
          });
          if (c.ok) return { ok: true };
          return { ok: false, message: budgetBlockMessage(c, "ar") };
        },
        onUsage: (u) => {
          liveUsage = {
            prompt: Number((u.prompt_tokens as number | undefined) ?? 0),
            completion: Number((u.completion_tokens as number | undefined) ?? 0),
            total: Number(
              (u.total_tokens as number | undefined) ??
                ((u.prompt_tokens as number | undefined) ?? 0) +
                  ((u.completion_tokens as number | undefined) ?? 0),
            ),
          };
          setUsage(liveUsage);
          setStreamMeta((prev) => (prev ? { ...prev, usage: liveUsage ?? undefined } : prev));
        },
        onRetry: (phase, attempt) => {
          if (phase === "reconnecting") setResumeNotice(`انقطع الاتصال — استئناف (${attempt})…`);
          else if (phase === "resumed") setResumeNotice(null);
          else if (phase === "failed") setResumeNotice("تعذّر استئناف الرد.");
        },
        mapStatusError: (s) => {
          if (s === 429) return "تم تجاوز الحد. حاول لاحقاً.";
          if (s === 402) return "انتهت أرصدة الذكاء الاصطناعي.";
          if (s === 401) return "غير مصرح بالوصول.";
          return "تعذّر الاتصال بالمساعد.";
        },
      });

      const acc = result.text;
      // Fallback: estimate output tokens from streamed text if gateway omitted usage
      if (!liveUsage && acc) {
        const promptTok = estimateTokens(next.map((m) => m.content).join("\n"));
        const compTok = estimateTokens(acc);
        liveUsage = { prompt: promptTok, completion: compTok, total: promptTok + compTok };
        setUsage(liveUsage);
      }
      if (liveUsage) {
        const spent = estimateCredits(liveUsage.prompt, liveUsage.completion, currentModel);
        setSessionCredits((c) => c + spent);
        commitSessionCredits("admin", spent);
      }

      if (result.budgetStop) toast.warning(result.budgetStop.message);


      const finalMeta: MessageCostMeta = {
        startedAt,
        endedAt: performance.now(),
        model: currentModel,
        promptText,
        usage: liveUsage ?? undefined,
      };
      setMessages([...next, { role: "assistant", content: acc || "لا يوجد رد.", meta: finalMeta }]);
      setStreamed("");
      setStreamMeta(null);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setStreamed("");
        setStreamMeta(null);
      } else {
        const msg = e instanceof StreamHttpError ? e.message : (e as Error).message || "خطأ غير متوقع";
        toast.error(msg);
        setStreamMeta(null);
      }
    } finally {
      setStreaming(false);
      setResumeNotice(null);
      abortRef.current = null;
    }
  }

  function clearChat() {
    setMessages([]);
    setStreamed("");
    setUsage(null);
    setSessionCredits(0);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  return (
    <>
      {/* Backdrop for mobile */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => onOpenChange(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={[
          "fixed top-0 bottom-0 z-50 w-full sm:w-[420px]",
          "transition-transform duration-300 ease-out",
          "border-s flex flex-col",
          // In RTL, panel slides from LEFT edge (since sidebar is on right)
          "left-0",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
        style={{
          background: "var(--ac-surface)",
          borderColor: "var(--ac-line-strong)",
          boxShadow: open ? "0 0 60px rgba(0,0,0,0.15)" : "none",
        }}
        aria-hidden={!open}
      >
        {/* Header */}
        <header
          className="h-16 flex items-center gap-3 px-4 border-b shrink-0"
          style={{ borderColor: "var(--ac-line)" }}
        >
          <div
            className="h-9 w-9 rounded-xl grid place-items-center"
            style={{ background: "var(--ac-accent-soft)", color: "var(--ac-accent-ink)" }}
          >
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold" style={{ color: "var(--ac-ink)" }}>مساعد حامد الذكي</div>
            <div className="text-[11px]" style={{ color: "var(--ac-ink-3)" }}>Wave 1 · للقراءة فقط</div>
          </div>
          <button
            onClick={clearChat}
            className="p-2 rounded-md hover:bg-black/5 transition"
            title="محادثة جديدة"
            aria-label="محادثة جديدة"
            disabled={messages.length === 0 || streaming}
          >
            <RotateCcw className="h-4 w-4" style={{ color: "var(--ac-ink-2)" }} />
          </button>
          <button
            onClick={() => onOpenChange(false)}
            className="p-2 rounded-md hover:bg-black/5 transition"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" style={{ color: "var(--ac-ink-2)" }} />
          </button>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && !streaming && (
            <div className="text-center py-12 space-y-3">
              <div
                className="mx-auto h-14 w-14 rounded-2xl grid place-items-center"
                style={{ background: "var(--ac-accent-soft)", color: "var(--ac-accent-ink)" }}
              >
                <Sparkles className="h-7 w-7" />
              </div>
              <div>
                <div className="text-base font-semibold" style={{ color: "var(--ac-ink)" }}>
                  كيف يمكنني مساعدتك؟
                </div>
                <p className="mt-1 text-sm" style={{ color: "var(--ac-ink-3)" }}>
                  اسأل عن العمليات، لخّص التقارير، أو اطلب مساعدة في التنقل.
                </p>
              </div>
              <div className="mt-4 space-y-1.5 max-w-xs mx-auto text-start">
                {[
                  "لخّص وضع المواعيد اليوم",
                  "ما أفضل الممارسات لتقليل الغياب؟",
                  "كيف أراجع طلبات الواتساب؟",
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 20); }}
                    className="w-full text-start text-[13px] px-3 py-2 rounded-lg border transition hover:opacity-80"
                    style={{ borderColor: "var(--ac-line)", color: "var(--ac-ink-2)" }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div
                className="mt-6 flex items-start gap-2 mx-auto max-w-xs text-start p-3 rounded-lg"
                style={{ background: "var(--ac-subtle)", color: "var(--ac-ink-3)" }}
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed">
                  لا يقدّم المساعد تشخيصاً طبياً. لا يصل إلى بيانات المرضى في هذه المرحلة.
                </p>
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i}>
              <MessageBubble role={m.role} content={m.content} />
              {m.role === "assistant" && m.meta && (
                <div className="mt-1 pr-2">
                  <MessageCostBadge meta={{ ...m.meta, outputText: m.content }} lang="ar" />
                </div>
              )}
            </div>
          ))}
          {streaming && streamed && (
            <div>
              <MessageBubble role="assistant" content={streamed} streaming />
              {streamMeta && (
                <div className="mt-1 pr-2">
                  <MessageCostBadge
                    meta={{ ...streamMeta, outputText: streamed }}
                    live
                    now={nowTick}
                    lang="ar"
                  />
                </div>
              )}
            </div>
          )}
          {streaming && !streamed && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm" style={{ color: "var(--ac-ink-3)" }}>
                <Loader2 className="h-4 w-4 animate-spin" /> يفكر…
              </div>
              {streamMeta && (
                <MessageCostBadge meta={streamMeta} live now={nowTick} lang="ar" />
              )}
            </div>
          )}
          {resumeNotice && (
            <div
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs"
              style={{ borderColor: "var(--ac-warning, #d97706)", color: "var(--ac-warning, #d97706)" }}
              role="status"
              aria-live="polite"
            >
              <RotateCcw className="h-3.5 w-3.5 animate-spin" />
              {resumeNotice}
            </div>
          )}
        </div>

        {/* Cost transparency meter */}
        <CostMeter
          streaming={streaming}
          model={model}
          preEstimate={preEstimate}
          usage={usage}
          streamedText={streamed}
          sessionCredits={sessionCredits}
          hasInput={input.trim().length > 0}
        />

        {/* Composer */}
        <div className="border-t p-3 shrink-0" style={{ borderColor: "var(--ac-line)" }}>
          {!streaming && input.trim() && (
            <div className="mb-2 flex justify-end">
              <PreflightCostChip
                input={input}
                streaming={streaming}
                model={model}
                historyChars={messages.reduce((n, m) => n + m.content.length, 0)}
                lang="ar"
              />
            </div>
          )}
          <div
            className="rounded-xl border flex items-end gap-2 p-2"
            style={{ borderColor: "var(--ac-line-strong)", background: "var(--ac-bg)" }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="اكتب سؤالك…"
              disabled={streaming}
              className="flex-1 resize-none bg-transparent outline-none text-sm py-1.5 px-2 max-h-32 min-h-[36px]"
              style={{ color: "var(--ac-ink)" }}
            />
            {streaming ? (
              <button
                onClick={() => abortRef.current?.abort()}
                className="h-9 w-9 rounded-lg grid place-items-center text-white transition"
                style={{ background: "var(--ac-danger)" }}
                aria-label="إيقاف"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim()}
                className="h-9 w-9 rounded-lg grid place-items-center text-white disabled:opacity-40 transition"
                style={{ background: "var(--ac-accent)" }}
                aria-label="إرسال"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px]" style={{ color: "var(--ac-muted)" }}>
            ↵ للإرسال · Shift+↵ لسطر جديد
          </p>
        </div>
      </aside>
    </>
  );
}

function MessageBubble({
  role,
  content,
  streaming,
}: {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words",
          streaming ? "ac-caret" : "",
        ].join(" ")}
        style={
          isUser
            ? { background: "var(--ac-accent)", color: "#fff" }
            : { background: "var(--ac-subtle)", color: "var(--ac-ink)" }
        }
      >
        {content}
      </div>
    </div>
  );
}

function CostMeter({
  streaming,
  model,
  preEstimate,
  usage,
  streamedText,
  sessionCredits,
  hasInput,
}: {
  streaming: boolean;
  model: string;
  preEstimate: { inTok: number; outTok: number; credits: number };
  usage: Usage | null;
  streamedText: string;
  sessionCredits: number;
  hasInput: boolean;
}) {
  const liveOutTok = streaming ? estimateTokens(streamedText) : 0;
  const liveCredits = streaming
    ? estimateCredits(preEstimate.inTok, liveOutTok, model)
    : 0;

  let state: "idle" | "pre" | "live" | "final" = "idle";
  if (usage) state = "final";
  else if (streaming) state = "live";
  else if (hasInput) state = "pre";

  const label = {
    idle: "شفافية التكلفة",
    pre: "قبل الإرسال · تقدير",
    live: "أثناء التوليد",
    final: "بعد الاكتمال · فعلي",
  }[state];

  const stateColor = {
    idle: "var(--ac-ink-3)",
    pre: "var(--ac-ink-2)",
    live: "var(--ac-accent-ink)",
    final: "var(--ac-success, var(--ac-accent-ink))",
  }[state];

  return (
    <div
      className="px-3 py-2 border-t text-[11px] flex flex-wrap items-center gap-x-3 gap-y-1"
      style={{ borderColor: "var(--ac-line)", background: "var(--ac-subtle)", color: "var(--ac-ink-2)" }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-1.5 font-semibold" style={{ color: stateColor }}>
        <Coins className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>

      {state === "pre" && (
        <>
          <Metric label="مدخلات" value={`~${formatTokens(preEstimate.inTok)}`} />
          <Metric label="مخرجات متوقعة" value={`~${formatTokens(preEstimate.outTok)}`} />
          <Metric label="التكلفة" value={`~${formatCredits(preEstimate.credits)} ائتمان`} strong />
        </>
      )}

      {state === "live" && (
        <>
          <Metric label="مدخلات" value={`~${formatTokens(preEstimate.inTok)}`} />
          <Metric label="مخرجات" value={formatTokens(liveOutTok)} />
          <Metric label="جارٍ" value={`~${formatCredits(liveCredits)} ائتمان`} strong />
        </>
      )}

      {state === "final" && usage && (
        <>
          <Metric label="مدخلات" value={formatTokens(usage.prompt)} />
          <Metric label="مخرجات" value={formatTokens(usage.completion)} />
          <Metric
            label="التكلفة"
            value={`${formatCredits(estimateCredits(usage.prompt, usage.completion, model))} ائتمان`}
            strong
          />
        </>
      )}

      {sessionCredits > 0 && (
        <span className="ms-auto opacity-80">
          الإجمالي: {formatCredits(sessionCredits)} ائتمان
        </span>
      )}
    </div>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="opacity-70">{label}:</span>
      <span style={{ fontWeight: strong ? 700 : 500, color: strong ? "var(--ac-ink)" : undefined }}>
        {value}
      </span>
    </span>
  );
}
