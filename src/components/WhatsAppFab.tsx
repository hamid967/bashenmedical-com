/**
 * WhatsAppFab — floating WhatsApp contact button.
 */
import { MessageCircle } from "lucide-react";

const WHATSAPP_NUMBER = "966500000000";

export function WhatsAppFab() {
  const href = `https://wa.me/${WHATSAPP_NUMBER}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="WhatsApp"
      className="fixed bottom-6 end-6 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/20 transition hover:scale-105 hover:bg-[#1ebe5b] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#25D366]"
    >
      <MessageCircle className="h-6 w-6" />
    </a>
  );
}

export default WhatsAppFab;
