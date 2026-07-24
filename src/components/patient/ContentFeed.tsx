/**
 * Phase 6 — Patient content feed.
 * Renders a personalized set of content cards below the required-actions
 * section. Logs impressions via IntersectionObserver (once per session per
 * item) and clicks when a CTA is activated. Non-blocking — no essential
 * patient action is obscured; promotional items always display a sponsored
 * chip.
 */
import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import {
  getPatientContentFeed,
  logContentImpression,
  logContentClick,
  type ContentFeedItem,
} from "@/lib/content/content.functions";

const SESSION_KEY = "bmc.content.seen";

function markSeen(id: string): boolean {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const set = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    if (set.has(id)) return false;
    set.add(id);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...set]));
    return true;
  } catch {
    return true;
  }
}

export function ContentFeed({ surface = "dashboard_bento" }: { surface?: string }) {
  const { data } = useQuery({
    queryKey: ["patient", "content-feed", surface],
    queryFn: () => getPatientContentFeed({ data: { surface } }),
    staleTime: 60_000,
  });

  if (!data || data.length === 0) return null;

  return (
    <section aria-label="محتوى مخصص" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((item) => (
        <ContentCard key={item.id} item={item} surface={surface} />
      ))}
    </section>
  );
}

function ContentCard({ item, surface }: { item: ContentFeedItem; surface: string }) {
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && markSeen(item.id)) {
            void logContentImpression({ data: { itemId: item.id, surface } }).catch(
              () => {},
            );
            obs.disconnect();
          }
        }
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [item.id, surface]);

  const onClick = () => {
    void logContentClick({
      data: { itemId: item.id, surface, href: item.cta_href ?? undefined },
    }).catch(() => {});
  };

  const cta = item.cta_href ? (
    isInternal(item.cta_href) ? (
      <Button asChild size="sm" variant="outline" onClick={onClick}>
        <Link to={item.cta_href}>
          {item.cta_label ?? "اعرف المزيد"}
          <ArrowLeft className="ms-1 h-3 w-3" aria-hidden />
        </Link>
      </Button>
    ) : (
      <Button asChild size="sm" variant="outline" onClick={onClick}>
        <a href={item.cta_href} target="_blank" rel="noopener noreferrer">
          {item.cta_label ?? "اعرف المزيد"}
        </a>
      </Button>
    )
  ) : null;

  return (
    <Card ref={ref} className="overflow-hidden transition-shadow hover:shadow-md">
      {item.image_url && (
        <div className="aspect-video overflow-hidden bg-muted">
          <img
            src={item.image_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <TypeBadge type={item.type} />
          {item.is_promotional && (
            <Badge variant="secondary" className="text-[10px]">
              إعلان
            </Badge>
          )}
        </div>
        <div className="font-medium leading-tight">{item.title}</div>
        {item.excerpt && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {item.excerpt}
          </p>
        )}
        {cta && <div className="mt-3">{cta}</div>}
      </CardContent>
    </Card>
  );
}

function isInternal(href: string) {
  return href.startsWith("/") && !href.startsWith("//");
}

const TYPE_LABEL: Record<ContentFeedItem["type"], string> = {
  announcement: "إعلان",
  offer: "عرض",
  screening: "فحص وقائي",
  new_service: "خدمة جديدة",
  reminder: "تذكير",
  doctor_spotlight: "طبيب مميّز",
  nearest_slot: "موعد قريب",
  suggested_service: "خدمة مقترحة",
};

function TypeBadge({ type }: { type: ContentFeedItem["type"] }) {
  return (
    <Badge variant="outline" className="text-[10px] font-normal">
      {TYPE_LABEL[type]}
    </Badge>
  );
}
