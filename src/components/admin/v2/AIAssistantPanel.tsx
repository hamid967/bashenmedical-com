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

type Msg = { role: "user" | "assistant"; content: string };
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
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    setMessages(next);
    setStreamed("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("انتهت الجلسة، أعد تسجيل الدخول.");

      const res = await fetch("/api/admin/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: next }),
        signal: controller.signal,
      });

      if (res.status === 429) throw new Error("تم تجاوز الحد. حاول لاحقاً.");
      if (res.status === 402) throw new Error("انتهت أرصدة الذكاء الاصطناعي.");
      if (res.status === 401) throw new Error("غير مصرح بالوصول.");
      if (!res.ok || !res.body) throw new Error("تعذّر الاتصال بالمساعد.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const j = JSON.parse(payload);
            const delta = j?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) {
              acc += delta;
              setStreamed(acc);
            }
          } catch { /* ignore partial chunks */ }
        }
      }

      setMessages([...next, { role: "assistant", content: acc || "لا يوجد رد." }]);
      setStreamed("");
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setStreamed("");
      } else {
        toast.error((e as Error).message || "خطأ غير متوقع");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function clearChat() {
    setMessages([]);
    setStreamed("");
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
            <MessageBubble key={i} role={m.role} content={m.content} />
          ))}
          {streaming && streamed && <MessageBubble role="assistant" content={streamed} streaming />}
          {streaming && !streamed && (
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--ac-ink-3)" }}>
              <Loader2 className="h-4 w-4 animate-spin" /> يفكر…
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t p-3 shrink-0" style={{ borderColor: "var(--ac-line)" }}>
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
