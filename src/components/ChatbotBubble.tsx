import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, X, Search, Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SITE, whatsappUrl } from "@/lib/site";
import { trackEvent } from "@/lib/analytics";

/**
 * Floating chatbot bubble.
 * - Bottom-left in RTL so it doesn't collide with the existing QuickBar (right).
 * - Reads FAQs via publishable key + narrow public SELECT policy.
 * - No AI in this iteration: simple case-insensitive substring search.
 * - Fallback: WhatsApp deeplink with the user's own question pre-filled.
 * - Single source of truth for phone/WhatsApp: `@/lib/site` (SITE.whatsapp).
 */

type Faq = {
  id: string;
  question_ar: string;
  answer_ar: string;
};

export function ChatbotBubble() {
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [faqs, setFaqs] = useState<Faq[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (!open || faqs !== null) return;
    (async () => {
      const { data, error } = await supabase
        .from("faqs")
        .select("id, question_ar, answer_ar")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(50);
      if (error) {
        setFaqs([]);
        return;
      }
      setFaqs((data as Faq[]) ?? []);
    })();
  }, [open, faqs]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const results = useMemo(() => {
    if (!faqs) return [];
    const q = query.trim().toLowerCase();
    if (!q) return faqs.slice(0, 6);
    return faqs
      .filter(
        (f) => f.question_ar.toLowerCase().includes(q) || f.answer_ar.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [faqs, query]);

  const active = selected ? faqs?.find((f) => f.id === selected) : null;

  const pagePath = typeof window !== "undefined" ? window.location.pathname || "/" : "/";
  const waMessage = query.trim()
    ? `مرحبًا ${SITE.nameAr} 👋\nلدي سؤال: ${query.trim()}\n(صفحة: ${pagePath})`
    : `مرحبًا ${SITE.nameAr} 👋\nأحتاج مساعدة.\n(صفحة: ${pagePath})`;
  const waHref = whatsappUrl(waMessage);

  const handleWaClick = () => {
    trackEvent("whatsapp_chatbot_click", {
      phone: SITE.whatsapp,
      source: pagePath,
      has_query: query.trim().length > 0,
    });
  };

  if (!hydrated) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="افتح المساعد الذكي"
          className="fixed z-40 bottom-5 left-5 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-xl hover:scale-105 transition"
        >
          <MessageCircle className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-[9px] font-bold text-white ring-2 ring-background">
            ؟
          </span>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="مساعد مجمع باعشن"
          className="fixed z-40 bottom-5 left-5 w-[min(360px,calc(100vw-2.5rem))] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col max-h-[min(560px,calc(100vh-6rem))]"
        >
          <header className="flex items-center justify-between gap-2 border-b border-border bg-gradient-to-l from-primary/10 to-accent/10 px-4 py-3">
            <div>
              <div className="text-sm font-bold">مساعد باعشن</div>
              <div className="text-[11px] text-muted-foreground">أجب عن أسئلتك المتكررة فورًا</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSelected(null);
              }}
              aria-label="إغلاق"
              className="rounded-full p-1.5 hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          {selected && active ? (
            <div className="flex-1 overflow-y-auto p-4">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="mb-3 text-xs text-primary font-semibold hover:underline"
              >
                ← عودة للأسئلة
              </button>
              <h3 className="text-sm font-bold mb-2">{active.question_ar}</h3>
              <p className="text-sm text-foreground/80 leading-7 whitespace-pre-line">
                {active.answer_ar}
              </p>
            </div>
          ) : (
            <>
              <div className="p-3 border-b border-border">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="ابحث في الأسئلة الشائعة..."
                    className="w-full rounded-md border border-input bg-background pr-9 pl-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {faqs === null ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground p-4">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> جاري التحميل...
                  </div>
                ) : results.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    لم نجد إجابة مطابقة — تواصل معنا مباشرة عبر واتساب.
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {results.map((f) => (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(f.id)}
                          className="w-full text-right rounded-md px-3 py-2 text-sm hover:bg-muted transition"
                        >
                          {f.question_ar}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          <footer className="border-t border-border p-3 space-y-2">
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleWaClick}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#25D366] text-white px-3 py-2 text-sm font-semibold hover:bg-[#1EBE5D] transition"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              تحدّث معنا على واتساب · {SITE.phoneDisplay}
            </a>
            <a
              href={`tel:${SITE.phone}`}
              className="block text-center text-[11px] text-muted-foreground hover:text-primary"
            >
              أو اتصل مباشرة: {SITE.phoneDisplay}
            </a>
          </footer>
        </div>
      )}
    </>
  );
}
