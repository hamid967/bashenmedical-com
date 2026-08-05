import { CalendarPlus, Phone, MessageCircle, MapPin, Stethoscope } from "lucide-react";
import type { PublicBranch } from "@/lib/branches.functions";
import { SITE, whatsappUrl } from "@/lib/site";

type Props = {
  branch: PublicBranch;
  directionsUrl: string | null;
};

/** Compact sticky action strip under the hero — always one tap to book/call. */
export function BranchQuickBar({ branch, directionsUrl }: Props) {
  const phone = branch.phone || SITE.phone;
  const wa = whatsappUrl(`مرحباً، أرغب بحجز موعد في ${branch.name_ar}`);

  const items = [
    { href: "#services", label: "الخدمات", icon: Stethoscope, external: false },
    { href: "#book", label: "احجز", icon: CalendarPlus, external: false, primary: true },
    { href: `tel:${phone}`, label: "اتصل", icon: Phone, external: false },
    { href: wa, label: "واتساب", icon: MessageCircle, external: true },
    ...(directionsUrl
      ? [{ href: directionsUrl, label: "الموقع", icon: MapPin, external: true }]
      : []),
  ] as const;

  return (
    <div className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
      <div className="container-app flex items-center gap-2 overflow-x-auto py-2.5">
        {items.map((item) => {
          const Icon = item.icon;
          const primary = "primary" in item && item.primary;
          return (
            <a
              key={item.label}
              href={item.href}
              {...(item.external ? { target: "_blank", rel: "noreferrer" } : {})}
              className={
                primary
                  ? "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm"
                  : "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:border-primary/40 hover:text-primary"
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </a>
          );
        })}
      </div>
    </div>
  );
}
