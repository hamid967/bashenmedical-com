/**
 * /portal/assistant — Patient AI Assistant (Phase 11).
 * Read-only streaming chat scoped to the signed-in patient.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useRef, useEffect } from "react";
import { Send, Sparkles, AlertTriangle, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PortalPageHeader, PortalCard } from "@/components/portal/ui";
import {
  AssistantActionButton,
  parseAssistantActions,
} from "@/components/portal/AssistantActionButton";
import { streamChatWithResume, StreamHttpError } from "@/lib/ai/stream-with-resume";
import {
  budgetBlockMessage,
  checkRunningBudget,
  commitSessionCredits,
  getDefaultLimits,
  preflightBudget,
} from "@/lib/ai/budget";
import { estimateCredits, estimateTokens } from "@/lib/ai/pricing";
import { MessageCostBadge, type MessageCostMeta } from "@/components/assistant/MessageCostBadge";
import { AssistantCostMeter } from "@/components/assistant/AssistantCostMeter";
import { PreflightCostChip } from "@/components/assistant/PreflightCostChip";
import { SessionExportButton } from "@/components/assistant/SessionExportButton";

export const Route = createFileRoute("/_authenticated/portal/assistant")({
  head: () => ({
    meta: [
      { title: "المساعد الذكي | بوابة المريض" },
      { name: "description", content: "مساعد ذكي يجيب على استفساراتك حول مواعيدك وتقاريرك وطلباتك." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AssistantPage,
});

type Msg = { role: "user" | "assistant"; content: string; meta?: MessageCostMeta };

const SUGGESTIONS = [
  "متى موعدي القادم؟",
  "هل لديّ إشعارات جديدة؟",
  "كيف أعيد جدولة موعد؟",
  "أين أجد تقاريري الأخيرة؟",
];

function AssistantPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [nowTick, setNowTick] = useState(0);
  const [activeModel, setActiveModel] = useState<string | undefined>();
  const [sessionCredits, setSessionCredits] = useState(0);

  const preEstimate = useMemo(() => {
    const historyChars = messages.reduce((n, m) => n + m.content.length, 0);
    const inTok = estimateTokens(input) + Math.ceil(historyChars / 3.5);
    const outTok = Math.max(64, Math.min(512, Math.round(inTok * 0.6)));
    return { inTok, outTok, credits: estimateCredits(inTok, outTok, activeModel) };
  }, [input, messages, activeModel]);

  const lastMsg = messages[messages.length - 1];
  const lastAssistant = lastMsg && lastMsg.role === "assistant" ? lastMsg : null;
  const meterStreamedText = streaming && lastAssistant ? lastAssistant.content : "";
  const meterUsage = !streaming && lastAssistant?.meta?.usage ? lastAssistant.meta.usage : null;
  const meterModel = lastAssistant?.meta?.model ?? activeModel;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    if (!streaming) return;
    const id = window.setInterval(() => setNowTick(performance.now()), 500);
    setNowTick(performance.now());
    return () => window.clearInterval(id);
  }, [streaming]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    setError(null);
    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const startedAt = performance.now();
    const promptText = next.map((m) => `${m.role}: ${m.content}`).join("\n");
    const initialMeta: MessageCostMeta = { startedAt, promptText };

    const limits = getDefaultLimits("portal");
    const pre = preflightBudget({ surface: "portal", limits, promptText });
    if (!pre.ok) {
      setError(budgetBlockMessage(pre, "ar"));
      setStreaming(false);
      return;
    }

    const updateLastMeta = (patch: Partial<MessageCostMeta>) => {
      setMessages((m) => {
        const copy = m.slice();
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant") {
          copy[copy.length - 1] = { ...last, meta: { ...(last.meta ?? initialMeta), ...patch } };
        }
        return copy;
      });
    };

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("يجب تسجيل الدخول");

      setMessages((m) => [...m, { role: "assistant", content: "", meta: initialMeta }]);

      let currentModel: string | undefined;
      const result = await streamChatWithResume({
        surface: "portal",
        url: "/api/portal/ai-chat",
        token,
        signal: controller.signal,
        buildBody: (resumePartial) => ({
          messages: next,
          ...(resumePartial ? { resume_partial: resumePartial } : {}),
        }),
        onModel: (mdl) => { currentModel = mdl; setActiveModel(mdl); updateLastMeta({ model: mdl }); },
        onUsage: (u) => {
          const prompt = Number((u.prompt_tokens as number | undefined) ?? 0);
          const completion = Number((u.completion_tokens as number | undefined) ?? 0);
          const total = Number((u.total_tokens as number | undefined) ?? prompt + completion);
          updateLastMeta({ usage: { prompt, completion, total } });
        },
        onDelta: (_delta, acc) => {
          setMessages((m) => {
            const copy = m.slice();
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = { role: "assistant", content: acc, meta: last?.meta };
            return copy;
          });
        },
        budgetCheck: (acc) => {
          const c = checkRunningBudget({
            surface: "portal",
            limits,
            model: currentModel,
            promptText,
            outputSoFar: acc,
          });
          if (c.ok) return { ok: true };
          return { ok: false, message: budgetBlockMessage(c, "ar") };
        },
        onRetry: (phase) => {
          if (phase === "reconnecting") setError("انقطع الاتصال — جاري الاستئناف…");
          else if (phase === "resumed") setError(null);
          else if (phase === "failed") setError("تعذّر استئناف الرد.");
        },
        mapStatusError: (s) => {
          if (s === 401) return "انتهت الجلسة، أعد تسجيل الدخول";
          if (s === 429) return "عدد الطلبات كثير، حاول لاحقًا";
          if (s === 402) return "انتهت الحصة المجانية للمساعد";
          return "تعذّر الاتصال بالمساعد";
        },
      });
      updateLastMeta({ endedAt: performance.now() });
      const spent = estimateCredits(estimateTokens(promptText), estimateTokens(result.text), currentModel);
      commitSessionCredits("portal", spent);
      setSessionCredits((v) => v + spent);
      if (result.budgetStop) setError(result.budgetStop.message);
    } catch (e: unknown) {
      if ((e as Error).name === "AbortError") {
        updateLastMeta({ endedAt: performance.now() });
        return;
      }
      const msg = e instanceof StreamHttpError ? e.message : e instanceof Error ? e.message : "خطأ غير متوقع";
      setError(msg);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  return (
    <div dir="rtl">
      <PortalPageHeader
        title="المساعد الذكي"
        description="يجيب على استفساراتك ضمن بياناتك الشخصية فقط — لا يقدّم تشخيصًا أو وصفًا للعلاج."
        breadcrumbs={[{ label: "البوابة", to: "/portal" }, { label: "المساعد الذكي" }]}
      />

      <PortalCard as="section" className="p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-[color:var(--portal-border)] px-3 py-2 bg-[color:var(--portal-surface)]">
          <span className="text-[11px] text-[color:var(--portal-ink-2)]">
            {messages.length > 0
              ? `${messages.length} ${messages.length === 1 ? "رسالة" : "رسائل"}`
              : "لا توجد رسائل بعد"}
          </span>
          <SessionExportButton
            messages={messages}
            sessionCredits={sessionCredits}
            preEstimateTokens={preEstimate?.inTok}
            model={meterModel}
            surface="بوابة المريض"
            lang="ar"
          />
        </div>
        <div
          ref={scrollRef}
          className="max-h-[60vh] min-h-[280px] overflow-y-auto p-4 sm:p-6 space-y-4"
          role="log"
          aria-live="polite"
        >
          {messages.length === 0 && (
            <div className="text-center py-8">
              <Sparkles className="mx-auto h-8 w-8 text-[color:var(--portal-primary)]" />
              <p className="mt-3 text-sm text-[color:var(--portal-ink-2)]">اسأل عن مواعيدك أو تقاريرك أو خطوات الحجز.</p>
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="text-xs px-3 py-1.5 rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-surface-2)] hover:bg-[color:var(--portal-surface-3)]"
                  >{s}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            const isUser = m.role === "user";
            const parsed = isUser
              ? { clean: m.content, actions: [] as ReturnType<typeof parseAssistantActions>["actions"] }
              : parseAssistantActions(m.content);
            return (
              <div key={i} className={isUser ? "flex justify-start" : "flex justify-end"}>
                <div
                  className={
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-6 " +
                    (isUser
                      ? "bg-[color:var(--portal-primary)]/10 text-[color:var(--portal-ink)]"
                      : "bg-[color:var(--portal-surface-2)] text-[color:var(--portal-ink)] border border-[color:var(--portal-border)]")
                  }
                >
                  {parsed.clean || (streaming && !isUser ? <span className="opacity-60">…</span> : "")}
                  {!isUser && streaming && i === messages.length - 1 && parsed.clean && (
                    <span className="ml-1 inline-block h-3 w-1.5 -mb-0.5 bg-current opacity-70 animate-pulse align-baseline" aria-hidden />
                  )}
                  {parsed.actions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {parsed.actions.map((a, k) => (
                        <AssistantActionButton key={`${i}-${k}`} action={a} />
                      ))}
                    </div>
                  )}
                  {!isUser && m.meta && (parsed.clean || parsed.actions.length > 0) && (
                    <MessageCostBadge
                      meta={{ ...m.meta, outputText: parsed.clean }}
                      live={streaming && i === messages.length - 1}
                      now={nowTick}
                      lang="ar"
                    />
                  )}
                </div>
              </div>
            );
          })}

          {error && (
            <div className="mx-auto max-w-md rounded-xl border border-[color:var(--portal-error)]/40 bg-[color:var(--portal-error)]/5 p-3 text-sm text-[color:var(--portal-error)] flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <AssistantCostMeter
          streaming={streaming}
          hasInput={input.trim().length > 0}
          model={meterModel}
          preEstimate={preEstimate}
          usage={meterUsage}
          streamedText={meterStreamedText}
          sessionCredits={sessionCredits}
          lang="ar"
        />

        {!streaming && input.trim() && (
          <div className="px-3 sm:px-4 pt-2 flex justify-end bg-[color:var(--portal-surface)]">
            <PreflightCostChip
              input={input}
              streaming={streaming}
              model={currentModel}
              historyChars={messages.reduce((n, m) => n + m.content.length, 0)}
              lang="ar"
            />
          </div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="border-t border-[color:var(--portal-border)] p-3 sm:p-4 flex items-end gap-2 bg-[color:var(--portal-surface)]"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
            }}
            rows={1}
            placeholder="اكتب سؤالك…"
            disabled={streaming}
            className="flex-1 min-h-[42px] max-h-[140px] resize-none rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-surface-2)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--portal-primary)]/30"
          />
          {streaming ? (
            <button
              type="button"
              onClick={() => {
                abortRef.current?.abort();
                abortRef.current = null;
                setStreaming(false);
                setMessages((prev) => {
                  const copy = prev.slice();
                  const last = copy[copy.length - 1];
                  if (last && last.role === "assistant") {
                    copy[copy.length - 1] = { ...last, content: (last.content || "") + "\n\n_تم الإيقاف._" };
                  }
                  return copy;
                });
              }}
              aria-label="إيقاف التوليد"
              className="inline-flex items-center gap-1 h-10 px-4 rounded-full text-sm font-semibold bg-[color:var(--portal-danger)] text-white"
            >
              <Square className="h-4 w-4" />
              <span>إيقاف</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="إرسال"
              className="inline-flex items-center gap-1 h-10 px-4 rounded-full text-sm font-semibold text-[color:var(--portal-on-primary)] disabled:opacity-60"
              style={{ background: "var(--portal-gradient)" }}
            >
              <Send className="h-4 w-4" />
              <span>إرسال</span>
            </button>
          )}
        </form>
      </PortalCard>

      <p className="mt-4 text-center text-[11px] text-[color:var(--portal-ink-2)]">
        المساعد لا يقدّم تشخيصًا أو وصفًا للعلاج. للحالات الطبية تواصل مع طبيبك أو{" "}
        <a href="tel:997" className="underline">997</a> للطوارئ.
      </p>
    </div>
  );
}
