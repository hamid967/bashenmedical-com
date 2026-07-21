/**
 * /portal/assistant — Patient AI Assistant (Phase 11).
 * Read-only streaming chat scoped to the signed-in patient.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, AlertTriangle, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PortalPageHeader, PortalCard } from "@/components/portal/ui";
import {
  AssistantActionButton,
  parseAssistantActions,
} from "@/components/portal/AssistantActionButton";
import { streamChatWithResume, StreamHttpError } from "@/lib/ai/stream-with-resume";
import { MessageCostBadge, type MessageCostMeta } from "@/components/assistant/MessageCostBadge";

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

type Msg = { role: "user" | "assistant"; content: string };

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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

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

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("يجب تسجيل الدخول");

      setMessages((m) => [...m, { role: "assistant", content: "" }]);

      await streamChatWithResume({
        url: "/api/portal/ai-chat",
        token,
        signal: controller.signal,
        buildBody: (resumePartial) => ({
          messages: next,
          ...(resumePartial ? { resume_partial: resumePartial } : {}),
        }),
        onDelta: (_delta, acc) => {
          setMessages((m) => {
            const copy = m.slice();
            copy[copy.length - 1] = { role: "assistant", content: acc };
            return copy;
          });
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
    } catch (e: unknown) {
      if ((e as Error).name === "AbortError") return;
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
