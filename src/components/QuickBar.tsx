import { Phone, MessageCircle, MapPin, AlertCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { SITE, whatsappUrl } from "@/lib/site";

export function QuickBar() {
  const { lang } = useI18n();
  const items = [
    {
      icon: AlertCircle,
      label: lang === "ar" ? "الطوارئ 24/7" : "Emergency 24/7",
      href: `tel:${SITE.phone}`,
      tone: "bg-destructive/10 text-destructive",
    },
    {
      icon: Phone,
      label: SITE.phoneDisplay,
      href: `tel:${SITE.phone}`,
      tone: "bg-primary/10 text-primary",
    },
    {
      icon: MessageCircle,
      label: "WhatsApp",
      href: whatsappUrl(
        lang === "ar"
          ? `مرحبًا ${SITE.nameAr}، أرغب بالاستفسار.`
          : `Hello ${SITE.nameEn}, I would like to inquire.`,
      ),
      tone: "bg-accent/15 text-accent",
    },
    {
      icon: MapPin,
      label: lang === "ar" ? "الموقع" : "Location",
      href: SITE.mapsUrl,
      tone: "bg-primary/10 text-primary",
    },
  ];
  return (
    <div className="container-app -mt-8 relative z-10">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 rounded-2xl border border-border bg-card p-3 shadow-lg">
        {items.map((it) => (
          <a
            key={it.label}
            href={it.href}
            target={it.href.startsWith("http") ? "_blank" : undefined}
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl p-3 hover:bg-muted transition"
          >
            <span className={`grid h-10 w-10 place-items-center rounded-lg ${it.tone}`}>
              <it.icon className="h-5 w-5" />
            </span>
            <span className="text-sm font-medium">{it.label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
