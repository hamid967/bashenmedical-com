/**
 * FloatingWhatsAppButton — Jazan-heritage inspired WhatsApp inquiry widget.
 *
 * - RTL: fixed bottom-left  (uses `start-4` which flips automatically).
 * - LTR: fixed bottom-right (same class, direction-aware).
 * - Recreated with HTML/CSS + inline SVG for the Jazan geometric pattern;
 *   no large screenshot image is shipped.
 * - Session-dismissible via a small close button (persists in sessionStorage).
 * - Clicking the button opens <ServiceInquiryDialog />.
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ServiceInquiryDialog } from "./ServiceInquiryDialog";

const DISMISS_KEY = "bmc-wa-widget-dismissed";

/** Small inline SVG that echoes the Jazan geometric pattern in the reference image. */
function JazanPattern({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 96" aria-hidden="true" className={className} preserveAspectRatio="none">
      <defs>
        <pattern id="jazan-diamonds" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M12 2 L22 12 L12 22 L2 12 Z" fill="none" stroke="#0f5d4a" strokeWidth="1.2" />
          <path d="M12 6 L18 12 L12 18 L6 12 Z" fill="#c9a24b" opacity="0.7" />
          <path d="M12 9 L15 12 L12 15 L9 12 Z" fill="#b34a2a" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="24" height="96" fill="url(#jazan-diamonds)" />
    </svg>
  );
}

/** Full-color WhatsApp glyph, no external network. */
function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <circle cx="16" cy="16" r="16" fill="#25D366" />
      <path
        fill="#fff"
        d="M23.3 8.7A10.4 10.4 0 0 0 5.9 20.4L4.8 24.5l4.2-1.1a10.4 10.4 0 0 0 14.3-14.7ZM16 22.9a8.6 8.6 0 0 1-4.4-1.2l-.3-.2-2.5.7.7-2.4-.2-.3A8.6 8.6 0 1 1 16 22.9Zm4.7-6.4c-.3-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a7 7 0 0 1-3.5-3c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.5s-.6-1.5-.8-2-.4-.5-.6-.5h-.5c-.2 0-.5.1-.7.3s-1 .9-1 2.3 1 2.7 1.2 2.9 2.1 3.2 5.1 4.4c1.8.7 2.5.8 3.4.7.5-.1 1.5-.6 1.7-1.2s.2-1.1.2-1.2-.2-.2-.5-.3Z"
      />
    </svg>
  );
}

export function FloatingWhatsAppButton() {
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {
      /* ignore */
    }
  }, []);

  if (dismissed) return null;

  return (
    <>
      <div
        className="fixed bottom-6 start-4 z-40 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-500"
        role="region"
        aria-label="استفسر عن خدمات مجمع باعشن عبر واتساب"
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="استفسر عن خدمات مجمع باعشن عبر واتساب"
          className="group relative flex items-stretch overflow-hidden rounded-full border border-[#c9a24b]/60 bg-gradient-to-br from-[#faf6ec] to-[#f2eadb] shadow-lg shadow-black/10 transition-transform hover:scale-[1.03] hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0f5d4a] focus-visible:ring-offset-2"
        >
          {/* Chevron */}
          <span className="hidden sm:flex items-center px-3 text-[#0f5d4a]">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 rtl:rotate-180"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 6 15 12 9 18" />
            </svg>
          </span>
          {/* Jazan pattern strip */}
          <span className="hidden sm:block w-4 self-stretch">
            <JazanPattern className="h-full w-full" />
          </span>
          {/* Text */}
          <span className="flex flex-col items-end justify-center px-3 py-2 sm:px-4 sm:py-2.5">
            <span className="text-sm sm:text-base font-extrabold text-[#0f5d4a] leading-tight">
              اضغط هنا
            </span>
            <span className="text-[10px] sm:text-xs font-medium text-[#a37a25] leading-tight">
              استفسر عن الخدمات
            </span>
          </span>
          {/* WhatsApp badge */}
          <span className="flex items-center justify-center pe-2 ps-1 sm:pe-3">
            <span className="relative grid h-10 w-10 sm:h-11 sm:w-11 place-items-center rounded-full ring-2 ring-[#c9a24b]/50">
              <WhatsAppGlyph className="h-10 w-10 sm:h-11 sm:w-11" />
            </span>
          </span>
        </button>
        {/* Dismiss */}
        <button
          type="button"
          onClick={() => {
            try {
              sessionStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* ignore */
            }
            setDismissed(true);
          }}
          aria-label="إخفاء زر واتساب لهذه الجلسة"
          className="grid h-6 w-6 place-items-center rounded-full border border-border bg-background/90 text-muted-foreground shadow hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <ServiceInquiryDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export default FloatingWhatsAppButton;
