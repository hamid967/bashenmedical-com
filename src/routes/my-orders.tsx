/**
 * /my-orders — تتبّع موحّد عمومي لجميع طلبات المراجع برقم الجوال.
 *
 * يستخدم RPC `track_orders_by_phone` التي تجمع:
 *   - المواعيد (appointments)
 *   - طلبات الصيدلية (medicine_orders)
 *   - الرأي الطبي الثاني (second_opinion_requests)
 *   - الرعاية المنزلية (home_care_requests)
 *
 * الرقم يبقى في sessionStorage للتنقل السريع، ولا نُخزّنه بشكل دائم.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CalendarCheck, Pill, Stethoscope, Home as HomeIcon,
  Search, Phone, ArrowLeft, Loader2, ExternalLink, Clock,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/my-orders")({
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "طلباتي | مجمع باعشن الطبي" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "تتبع جميع طلباتك (مواعيد، صيدلية، رأي طبي ثاني، رعاية منزلية) برقم جوالك." },
      { property: "og:title", content: "طلباتي — مجمع باعشن الطبي" },
    ],
  }),
  component: MyOrdersPage,
});

import { parseOrderSummaries, OrderParseError, type OrderSummary } from "@/lib/order-types";
import { toast } from "sonner";
import { bmcOgImageMeta } from "@/lib/og-meta";
import i18n from "i18next";

type Order = OrderSummary;


const KIND_META: Record<Order["kind"], { ar: string; en: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  appointment:    { ar: "موعد طبي",        en: "Appointment",     icon: CalendarCheck, color: "bg-blue-500/10 text-blue-700 border-blue-500/30" },
  pharmacy:       { ar: "طلب صيدلية",       en: "Pharmacy",        icon: Pill,          color: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" },
  second_opinion: { ar: "رأي طبي ثاني",     en: "Second opinion",  icon: Stethoscope,   color: "bg-purple-500/10 text-purple-700 border-purple-500/30" },
  home_care:      { ar: "رعاية منزلية",     en: "Home care",       icon: HomeIcon,      color: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
};

const STATUS_AR: Record<string, string> = {
  new: "جديد",
  confirmed: "مؤكّد",
  cancelled: "ملغى",
  completed: "مكتمل",
  no_show: "لم يحضر",
  in_review: "قيد المراجعة",
  answered: "تم الرد",
  closed: "مُغلق",
  processing: "قيد المعالجة",
  ready: "جاهز",
  delivered: "تم التسليم",
  in_progress: "قيد التنفيذ",
};

const STATUS_COLOR: Record<string, string> = {
  new: "bg-primary/10 text-primary",
  confirmed: "bg-green-500/10 text-green-700",
  completed: "bg-blue-500/10 text-blue-700",
  cancelled: "bg-red-500/10 text-red-700",
  no_show: "bg-amber-500/10 text-amber-700",
};

function fmt(iso: string, lang: "ar" | "en") {
  try {
    return new Date(iso).toLocaleString(lang === "ar" ? "ar-SA" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

const STORAGE_KEY = "my-orders:phone";
const REF_KEY = "my-orders:ref";

function MyOrdersPage() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [phoneInput, setPhoneInput] = useState("");
  const [refInput, setRefInput] = useState("");
  const [queryPhone, setQueryPhone] = useState<string | null>(null);
  const [queryRef, setQueryRef] = useState<string | null>(null);

  // Restore last phone
  useEffect(() => {
    try {
      const savedPhone = sessionStorage.getItem(STORAGE_KEY);
      const savedRef = sessionStorage.getItem(REF_KEY);
      if (savedPhone) {
        setPhoneInput(savedPhone);
        setQueryPhone(savedPhone);
      }
      if (savedRef) {
        setRefInput(savedRef);
        setQueryRef(savedRef);
      }
    } catch {}
  }, []);

  const { data: orders, isLoading, isFetching, error } = useQuery({
    queryKey: ["my-orders", queryPhone, queryRef],
    queryFn: async (): Promise<Order[]> => {
      if (!queryPhone || !queryRef) return [];
      const { data, error } = await supabase.rpc("track_orders_by_phone", {
        _phone: queryPhone,
        _reference: queryRef,
      });
      if (error) throw error;
      try {
        return parseOrderSummaries(data);
      } catch (e) {
        if (e instanceof OrderParseError) {
          toast.error("تعذّر عرض بعض الطلبات", {
            description: `بيانات غير متوقعة (${e.kind ?? "؟"}/${e.status ?? "؟"}). يرجى تحديث الصفحة أو التواصل مع الاستقبال.`,
          });
        }
        throw e;
      }
    },
    enabled: !!queryPhone && !!queryRef,
    staleTime: 15_000,
    retry: (count, err) => !(err instanceof OrderParseError) && count < 2,
  });


  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedPhone = phoneInput.trim();
    const trimmedRef = refInput.trim().replace(/[^0-9a-fA-F]/g, "");
    if (trimmedPhone.replace(/\D/g, "").length < 6) return;
    if (trimmedRef.length < 6) {
      toast.error(i18n.t("myOrders:please_enter_the_order_reference_code"));
      return;
    }
    setQueryPhone(trimmedPhone);
    setQueryRef(trimmedRef);
    try {
      sessionStorage.setItem(STORAGE_KEY, trimmedPhone);
      sessionStorage.setItem(REF_KEY, trimmedRef);
    } catch {}
  };

  const clear = () => {
    setQueryPhone(null);
    setQueryRef(null);
    setPhoneInput("");
    setRefInput("");
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(REF_KEY);
    } catch {}
  };


  return (
    <div className="min-h-screen bg-muted/30">
      {/* Hero */}
      <section className="bg-primary text-primary-foreground">
        <div className="container-app py-10 md:py-14">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
              {i18n.t("myOrders:track_orders")}
            </div>
            <h1 className="text-3xl md:text-5xl font-bold">
              {i18n.t("myOrders:my_orders")}
            </h1>
            <p className="mt-3 text-primary-foreground/85">
              {i18n.t("myOrders:enter_your_phone_and_the_order_reference")}
            </p>
          </div>

          {/* Phone + reference form (both required to prevent enumeration) */}
          <form onSubmit={onSubmit} className="mx-auto mt-6 flex max-w-2xl flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="phone" className="sr-only">{i18n.t("myOrders:phone")}</Label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder={i18n.t("myOrders:05xxxxxxxx")}
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    className="ps-9 bg-background text-foreground h-12"
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="ref" className="sr-only">{i18n.t("myOrders:order_reference")}</Label>
                <Input
                  id="ref"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={i18n.t("myOrders:reference_code_8_chars")}
                  value={refInput}
                  onChange={(e) => setRefInput(e.target.value)}
                  className="bg-background text-foreground h-12 font-mono tracking-wider"
                  required
                  maxLength={16}
                />
              </div>
            </div>
            <Button type="submit" variant="premium" size="xl" disabled={isFetching} className="w-full sm:w-auto sm:self-end">
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {i18n.t("myOrders:show_my_order")}
            </Button>
          </form>
        </div>
      </section>

      <section className="container-app py-8 md:py-10">
        {!queryPhone && <QuickLinks isAr={isAr} />}

        {queryPhone && (
          <>
            <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
              <div className="text-sm text-muted-foreground">
                {i18n.t("myOrders:results_for")}
                <span className="font-semibold text-foreground" dir="ltr">{queryPhone}</span>
              </div>
              <Button variant="outline" size="sm" onClick={clear}>
                {i18n.t("myOrders:new_search")}
              </Button>
            </div>


            {isLoading ? (
              <div className="grid gap-3 md:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-32 rounded-2xl bg-card border border-border animate-pulse" />
                ))}
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-destructive">
                {i18n.t("myOrders:failed_to_load_orders")}
              </div>
            ) : (orders?.length ?? 0) === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-8 md:p-10">
                <div className="text-center">
                  <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <Search className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold">
                    {i18n.t("myOrders:no_orders_found_for_this_number")}
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                    {isAr ? (
                      <>لم نعثر على أي طلب مرتبط بالرقم <span className="font-semibold text-foreground" dir="ltr">{queryPhone}</span>. تأكّد من صحة الرقم، أو ابدأ حجزًا جديدًا الآن.</>
                    ) : (
                      <>We couldn't find any request linked to <span className="font-semibold text-foreground" dir="ltr">{queryPhone}</span>. Double-check the number or start a new request below.</>
                    )}
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    <Link to="/book"><Button variant="premium" size="lg"><CalendarCheck className="h-4 w-4" />{i18n.t("myOrders:book_an_appointment")}</Button></Link>
                    <Link to="/services"><Button variant="outline" size="lg">{i18n.t("myOrders:browse_all_services")}</Button></Link>
                    <Button variant="ghost" size="lg" onClick={clear}>{i18n.t("myOrders:change_number")}</Button>
                  </div>
                </div>
                <div className="mt-8 border-t border-border pt-6">
                  <QuickLinks isAr={isAr} />
                </div>
              </div>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {orders!.map((o) => (
                  <OrderCard key={`${o.kind}-${o.reference}`} order={o} phone={queryPhone} isAr={isAr} />
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function OrderCard({ order, phone, isAr }: { order: Order; phone: string; isAr: boolean }) {
  const meta = KIND_META[order.kind];
  const Icon = meta.icon;
  const statusLabel = STATUS_AR[order.status] ?? order.status;
  const statusCls = STATUS_COLOR[order.status] ?? "bg-muted text-muted-foreground";

  const detailHref = order.kind === "appointment"
    ? `/lookup?ref=${order.reference}&phone=${encodeURIComponent(phone)}`
    : `/orders/${order.reference}?phone=${encodeURIComponent(phone)}&kind=${order.kind}`;

  return (
    <li className="card-panel group flex flex-col gap-3 hover:border-primary/40 transition">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`h-11 w-11 rounded-xl flex items-center justify-center border ${meta.color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {isAr ? meta.ar : meta.en}
            </div>
            <div className="font-bold leading-tight">{order.title}</div>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusCls}`}>
          {statusLabel}
        </span>
      </div>

      {/* Summary-only fields — sensitive metadata is never returned by
          `track_orders_by_phone`; full detail requires ref+phone via
          `get_order_by_ref` on the detail page. */}
      <div className="text-xs text-muted-foreground space-y-1">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          <span>{i18n.t("myOrders:created")}{fmt(order.created_at,isAr ? "ar" : "en")}</span>
        </div>
        {order.scheduled_at && (
          <div className="flex items-center gap-1.5">
            <CalendarCheck className="h-3.5 w-3.5" />
            <span>{i18n.t("myOrders:scheduled")}{fmt(order.scheduled_at,isAr ? "ar" : "en")}</span>
          </div>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between pt-2 border-t border-border">
        <span className="font-mono text-[11px] text-muted-foreground">#{order.reference}</span>
        <Link to={detailHref} className="text-primary text-sm font-semibold inline-flex items-center gap-1 hover:underline">
          {i18n.t("myOrders:details")}
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </li>
  );
}

function QuickLinks({ isAr }: { isAr: boolean }) {
  const links = [
    { to: "/book",           ar: "احجز موعدًا",         en: "Book appointment", icon: CalendarCheck },
    { to: "/pharmacy",       ar: "طلب صيدلية",           en: "Pharmacy order",   icon: Pill },
    { to: "/second-opinion", ar: "رأي طبي ثاني",         en: "Second opinion",   icon: Stethoscope },
    { to: "/home-care",      ar: "رعاية منزلية",         en: "Home care",        icon: HomeIcon },
  ];
  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">
        {i18n.t("myOrders:or_start_a_new_request")}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="card-panel group hover:border-primary/40 transition">
            <l.icon className="h-6 w-6 text-primary" />
            <div className="mt-2 font-bold">{isAr ? l.ar : l.en}</div>
            <ArrowLeft className="mt-3 h-4 w-4 text-primary group-hover:-translate-x-1 rtl:group-hover:translate-x-1 transition" />
          </Link>
        ))}
      </div>
    </div>
  );
}
