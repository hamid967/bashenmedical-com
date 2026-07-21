/**
 * /portal/assistant — Patient AI Assistant (Phase 11).
 * Read-only streaming chat scoped to the signed-in patient.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PortalPageHeader, PortalCard } from "@/components/portal/ui";
import {
  AssistantActionButton,
  parseAssistantActions,
} from "@/components/portal/AssistantActionButton";

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

      const res = await fetch("/api/portal/ai-chat", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: next }),
      });

      if (res.status === 401) throw new Error("انتهت الجلسة، أعد تسجيل الدخول");
      if (res.status === 429) throw new Error("عدد الطلبات كثير، حاول لاحقًا");
      if (res.status === 402) throw new Error("انتهت الحصة المجانية للمساعد");
      if (!res.ok || !res.body) throw new Error("تعذّر الاتصال بالمساعد");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      setMessages((m) => [...m, { role: "assistant", content: "" }]);

      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t || !t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            const delta = json?.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              assistantText += delta;
              setMessages((m) => {
                const copy = m.slice();
                copy[copy.length - 1] = { role: "assistant", content: assistantText };
                return copy;
              });
            }
          } catch { /* ignore parse errors on partial frames */ }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "خطأ غير متوقع");
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

          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-start" : "flex justify-end"}>
              <div
                className={
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-6 " +
                  (m.role === "user"
                    ? "bg-[color:var(--portal-primary)]/10 text-[color:var(--portal-ink)]"
                    : "bg-[color:var(--portal-surface-2)] text-[color:var(--portal-ink)] border border-[color:var(--portal-border)]")
                }
              >
                {m.content || (streaming ? <span className="opacity-60">…</span> : "")}
              </div>
            </div>
          ))}

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
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            aria-label="إرسال"
            className="inline-flex items-center gap-1 h-10 px-4 rounded-full text-sm font-semibold text-[color:var(--portal-on-primary)] disabled:opacity-60"
            style={{ background: "var(--portal-gradient)" }}
          >
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span>إرسال</span>
          </button>
        </form>
      </PortalCard>

      <p className="mt-4 text-center text-[11px] text-[color:var(--portal-ink-2)]">
        المساعد لا يقدّم تشخيصًا أو وصفًا للعلاج. للحالات الطبية تواصل مع طبيبك أو{" "}
        <a href="tel:997" className="underline">997</a> للطوارئ.
      </p>
    </div>
  );
}
