/**
 * /orders/$ref — صفحة تفاصيل موحدة لأي طلب غير المواعيد.
 * الميزات:
 *   - Timeline موحّدة عبر OrderTimeline.
 *   - قسم مدخلات/نتائج مخصص لكل خدمة.
 *   - طباعة نظيفة + رمز QR يفتح رابط التتبع مباشرة.
 *   - إلغاء الطلب عبر RPC آمن (cancel_order_by_ref).
 *   - Polling كل 20 ثانية + Toast عند تغيّر الحالة.
 * الحجوزات (kind=appointment) تُوجَّه إلى /lookup.
 */
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import {
  ArrowLeft,
  Loader2,
  Pill,
  Stethoscope,
  Home as HomeIcon,
  Clock,
  MapPin,
  Phone,
  User,
  FileText,
  ClipboardList,
  Truck,
  MessageCircle,
  Package,
  Printer,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderTimeline } from "@/components/booking/OrderTimeline";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { bmcOgImageMeta } from "@/lib/og-meta";
import i18n from "i18next";

const search = z.object({
  phone: z.string(),
  kind: z.enum(["appointment", "pharmacy", "second_opinion", "home_care"]).optional(),
});

export const Route = createFileRoute("/orders/$ref")({
  validateSearch: search,
  beforeLoad: ({ params, search }) => {
    if (search.kind === "appointment") {
      throw redirect({ to: "/lookup", search: { ref: params.ref, phone: search.phone } });
    }
  },
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "تفاصيل الطلب | مجمع باعشن الطبي" },
      { name: "description", content: "تفاصيل طلبك في مجمع باعشن الطبي." },
      { property: "og:title", content: "تفاصيل الطلب" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderDetailPage,
});

type Order = {
  kind: "appointment" | "pharmacy" | "second_opinion" | "home_care";
  id: string;
  reference: string;
  title: string;
  status: string;
  created_at: string;
  scheduled_at: string | null;
  metadata: Record<string, unknown> | null;
};

const KIND_META = {
  pharmacy: { ar: "طلب صيدلية", en: "Pharmacy", icon: Pill },
  second_opinion: { ar: "رأي طبي ثاني", en: "Second opinion", icon: Stethoscope },
  home_care: { ar: "رعاية منزلية", en: "Home care", icon: HomeIcon },
  appointment: { ar: "موعد", en: "Appointment", icon: Stethoscope },
};

const STATUS_AR: Record<string, string> = {
  new: "جديد",
  confirmed: "مؤكّد",
  cancelled: "ملغى",
  completed: "مكتمل",
  in_review: "قيد المراجعة",
  answered: "تم الرد",
  closed: "مُغلق",
  in_progress: "قيد التنفيذ",
  ready: "جاهز",
  delivered: "تم التسليم",
  processing: "قيد التجهيز",
};

/** الحالات النهائية التي لا يمكن الإلغاء بعدها. تُطابق تحقّق RPC في الـ DB. */
const NOT_CANCELLABLE: Record<Order["kind"], string[]> = {
  pharmacy: ["delivered", "cancelled", "completed"],
  second_opinion: ["closed", "answered", "cancelled"],
  home_care: ["completed", "cancelled", "in_progress"],
  appointment: [],
};

function fmt(iso: string | null, lang: "ar" | "en") {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(lang === "ar" ? "ar-SA" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function OrderDetailPage() {
  const { ref } = Route.useParams();
  const { phone, kind } = Route.useSearch();
  const { lang } = useI18n();
  const isAr = lang === "ar";

  // Poll every 20s + toast on status change — but stop once the order
  // reaches a final state (avoids infinite background requests).
  const FINAL_STATES = new Set(["cancelled", "completed", "delivered", "closed", "answered"]);
  const previousStatus = useRef<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["order-detail", ref, phone, kind],
    queryFn: async () => {
      // Detail fetch requires ref + phone + kind (patient-scoped RPC).
      const { data, error } = await supabase.rpc("get_order_by_ref", {
        _ref: ref,
        _phone: phone,
        _kind: kind ?? "pharmacy",
      });
      if (error) throw error;
      const list = (data ?? []) as Order[];
      return list[0] ?? null;
    },
    staleTime: 10_000,
    // Stop polling once the order is in a terminal state.
    refetchInterval: (query) => {
      const status = (query.state.data as Order | null | undefined)?.status;
      return status && FINAL_STATES.has(status) ? false : 20_000;
    },
  });

  useEffect(() => {
    if (!data) return;
    if (previousStatus.current && previousStatus.current !== data.status) {
      const label = STATUS_AR[data.status] ?? data.status;
      toast.success(i18n.t("ordersDetail:status_updated"), {
        description: isAr ? `طلبك أصبح: ${label}` : `Your order is now: ${data.status}`,
      });
    }
    previousStatus.current = data.status;
  }, [data, isAr]);

  return (
    <div className="min-h-screen bg-muted/30 print:bg-white">
      <div className="container-app py-8 md:py-12 max-w-3xl">
        <Link
          to="/my-orders"
          className="mb-6 inline-flex items-center gap-2 text-sm text-primary hover:underline print:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
          {i18n.t("ordersDetail:back_to_my_orders")}
        </Link>

        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error || !data ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-8 text-center">
            <h1 className="text-xl font-bold text-destructive">
              {i18n.t("ordersDetail:order_not_found")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {i18n.t("ordersDetail:check_the_reference_and_phone_associated")}
            </p>
            <Link to="/my-orders" className="inline-block mt-4">
              <Button variant="outline">{i18n.t("ordersDetail:back")}</Button>
            </Link>
          </div>
        ) : (
          <OrderDetailCard order={data} phone={phone} kind={kind} isAr={isAr} />
        )}
      </div>

      {/* Print stylesheet — hide interactive chrome, expand cards. */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          body { background: #fff !important; }
          .container-app { max-width: 100% !important; padding: 0 !important; }
          .rounded-2xl { break-inside: avoid; border-color: #e5e7eb !important; box-shadow: none !important; }
        }
      `}</style>
    </div>
  );
}

function OrderDetailCard({
  order,
  phone,
  kind,
  isAr,
}: {
  order: Order;
  phone: string;
  kind?: Order["kind"];
  isAr: boolean;
}) {
  const meta = KIND_META[order.kind];
  const Icon = meta.icon;
  const meta2 = (order.metadata ?? {}) as Record<string, unknown>;
  const qc = useQueryClient();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Build the shareable tracking URL and QR
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(`/orders/${order.reference}`, window.location.origin);
    url.searchParams.set("phone", phone);
    url.searchParams.set("kind", order.kind);
    QRCode.toDataURL(url.toString(), { width: 220, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [order.reference, order.kind, phone]);

  const canCancel = !NOT_CANCELLABLE[order.kind].includes(order.status);

  const cancelMutation = useMutation({
    mutationFn: async (reason: string) => {
      const { data, error } = await supabase.rpc("cancel_order_by_ref", {
        _ref: order.reference,
        _phone: phone,
        _kind: order.kind,
        _reason: reason || undefined,
      });
      if (error) throw error;
      const res = data as { ok: boolean; error?: string; status?: string };
      if (!res?.ok) throw new Error(res?.error ?? "cancel_failed");
      return res;
    },
    onSuccess: () => {
      toast.success(i18n.t("ordersDetail:order_cancelled"));
      setCancelOpen(false);
      setCancelReason("");
      qc.invalidateQueries({ queryKey: ["order-detail", order.reference, phone, order.kind] });
      qc.invalidateQueries({ queryKey: ["my-orders"] });
    },
    onError: (err: Error) => {
      const map: Record<string, string> = {
        not_found: i18n.t("ordersDetail:order_not_found_2"),
        not_cancellable: i18n.t("ordersDetail:order_can_no_longer_be_cancelled"),
        invalid_phone: i18n.t("ordersDetail:invalid_phone"),
      };
      toast.error(map[err.message] ?? i18n.t("ordersDetail:failed_to_cancel"));
    },
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-muted-foreground">
                {isAr ? meta.ar : meta.en}
              </div>
              <h1 className="text-xl md:text-2xl font-bold leading-tight">{order.title}</h1>
              <div className="mt-1 font-mono text-xs text-muted-foreground">#{order.reference}</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="rounded-full bg-primary/10 text-primary px-3 py-1 text-sm font-semibold">
              {STATUS_AR[order.status] ?? order.status}
            </span>
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt={i18n.t("ordersDetail:tracking_qr")}
                className="h-20 w-20 rounded-md border border-border bg-white p-1"
              />
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-3 text-sm">
          <Row
            icon={<Clock className="h-4 w-4" />}
            label={i18n.t("ordersDetail:created")}
            value={fmt(order.created_at, isAr ? "ar" : "en")}
          />
          {order.scheduled_at && (
            <Row
              icon={<Clock className="h-4 w-4" />}
              label={i18n.t("ordersDetail:scheduled")}
              value={fmt(order.scheduled_at, isAr ? "ar" : "en")}
            />
          )}
          <Row
            icon={<Phone className="h-4 w-4" />}
            label={i18n.t("ordersDetail:phone")}
            value={phone}
          />
        </div>
      </div>

      {/* Unified timeline */}
      <OrderTimeline
        kind={order.kind}
        status={order.status}
        createdAt={order.created_at}
        scheduledAt={order.scheduled_at}
      />

      {/* Service-specific inputs & results */}
      <ServiceDetailsSection kind={order.kind} status={order.status} meta={meta2} isAr={isAr} />

      {/* Actions */}
      <div className="rounded-2xl border border-border bg-card p-6 print:hidden">
        <h3 className="font-bold mb-2">{i18n.t("ordersDetail:actions")}</h3>
        <p className="text-sm text-muted-foreground">
          {i18n.t("ordersDetail:you_can_print_the_receipt_or_cancel_if_e")}
        </p>
        <div className="mt-3 flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            {i18n.t("ordersDetail:print")}
          </Button>
          {canCancel ? (
            <Button variant="destructive" onClick={() => setCancelOpen(true)}>
              <XCircle className="h-4 w-4" />
              {i18n.t("ordersDetail:cancel_order")}
            </Button>
          ) : order.status !== "cancelled" ? (
            <span className="inline-flex items-center rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
              {i18n.t("ordersDetail:cannot_cancel_at_this_stage")}
            </span>
          ) : null}
          <Link to="/contact">
            <Button variant="premium">{i18n.t("ordersDetail:contact_us")}</Button>
          </Link>
          <Link to="/my-orders">
            <Button variant="ghost">{i18n.t("ordersDetail:all_my_orders")}</Button>
          </Link>
        </div>
      </div>

      {/* Cancel dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{i18n.t("ordersDetail:cancel_order_2")}</DialogTitle>
            <DialogDescription>
              {isAr
                ? `سيتم إلغاء الطلب #${order.reference}. لا يمكن التراجع عن هذا الإجراء.`
                : `This will cancel order #${order.reference}. This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-semibold">
              {i18n.t("ordersDetail:reason_optional")}
            </label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={i18n.t("ordersDetail:e_g_schedule_changed")}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelOpen(false)}
              disabled={cancelMutation.isPending}
            >
              {i18n.t("ordersDetail:keep_order")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate(cancelReason.trim())}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {i18n.t("ordersDetail:confirm_cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * قسم مدخلات/نتائج الخدمة — يعرض التفاصيل والنتائج المرتبطة بنوع الطلب:
 *   - صيدلية: نوع التسليم، العنوان، ملاحظات
 *   - رأي طبي ثاني: التخصص، البريد للرد، ملخص الرد عند توفره
 *   - رعاية منزلية: العنوان، ملاحظات المريض
 */
function ServiceDetailsSection({
  kind,
  status,
  meta,
  isAr,
}: {
  kind: Order["kind"];
  status: string;
  meta: Record<string, unknown>;
  isAr: boolean;
}) {
  const s = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : "");

  if (kind === "pharmacy") {
    const delivery = s("delivery_type");
    const address = s("address");
    const district = s("district");
    const notes = s("notes");
    return (
      <DetailsShell
        title={i18n.t("ordersDetail:pharmacy_details")}
        icon={<Package className="h-4 w-4" />}
      >
        <DetailGrid>
          {delivery && (
            <Cell
              icon={<Truck className="h-4 w-4" />}
              label={i18n.t("ordersDetail:delivery")}
              value={
                delivery === "delivery"
                  ? i18n.t("ordersDetail:home_delivery")
                  : i18n.t("ordersDetail:pickup")
              }
            />
          )}
          {address && (
            <Cell
              icon={<MapPin className="h-4 w-4" />}
              label={i18n.t("ordersDetail:address")}
              value={address}
            />
          )}
          {district && (
            <Cell
              icon={<MapPin className="h-4 w-4" />}
              label={i18n.t("ordersDetail:district")}
              value={district}
            />
          )}
        </DetailGrid>
        {notes && <Notes text={notes} isAr={isAr} />}
        <ResultBanner
          isAr={isAr}
          show={["ready", "delivered", "completed"].includes(status)}
          okAr="طلبك جاهز — سيتواصل معك فريق الصيدلية لتأكيد التسليم."
          okEn="Your order is ready — the pharmacy team will contact you to confirm delivery."
        />
      </DetailsShell>
    );
  }

  if (kind === "second_opinion") {
    const specialty = s("specialty");
    const email = s("email");
    const answer = s("answer") || s("reply");
    return (
      <DetailsShell
        title={i18n.t("ordersDetail:second_opinion_details")}
        icon={<ClipboardList className="h-4 w-4" />}
      >
        <DetailGrid>
          {specialty && (
            <Cell
              icon={<Stethoscope className="h-4 w-4" />}
              label={i18n.t("ordersDetail:specialty")}
              value={specialty}
            />
          )}
          {email && (
            <Cell
              icon={<User className="h-4 w-4" />}
              label={i18n.t("ordersDetail:reply_email")}
              value={email}
            />
          )}
        </DetailGrid>
        {answer ? (
          <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-primary">
              <MessageCircle className="h-4 w-4" />
              {i18n.t("ordersDetail:consultant_reply")}
            </div>
            <p className="whitespace-pre-line text-sm text-foreground">{answer}</p>
          </div>
        ) : (
          <ResultBanner
            isAr={isAr}
            show={status === "in_review"}
            okAr="طلبك قيد المراجعة من قِبل الاستشاري — سيصلك الرد على البريد المسجّل."
            okEn="Your request is under review — the reply will arrive at the registered email."
          />
        )}
      </DetailsShell>
    );
  }

  if (kind === "home_care") {
    const address = s("address");
    const notes = s("notes");
    return (
      <DetailsShell
        title={i18n.t("ordersDetail:home_care_details")}
        icon={<HomeIcon className="h-4 w-4" />}
      >
        <DetailGrid>
          {address && (
            <Cell
              icon={<MapPin className="h-4 w-4" />}
              label={i18n.t("ordersDetail:visit_address")}
              value={address}
            />
          )}
        </DetailGrid>
        {notes && <Notes text={notes} isAr={isAr} />}
        <ResultBanner
          isAr={isAr}
          show={["confirmed", "in_progress"].includes(status)}
          okAr="تم تأكيد الطلب — سيتواصل الفريق الطبي لتنسيق موعد الزيارة."
          okEn="Confirmed — the medical team will contact you to schedule the visit."
        />
      </DetailsShell>
    );
  }

  return null;
}

function DetailsShell({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <span className="text-primary">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function DetailGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

function Cell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-foreground break-words">{value}</div>
    </div>
  );
}

function Notes({ text, isAr }: { text: string; isAr: boolean }) {
  return (
    <div className="mt-3 rounded-xl bg-muted/50 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
        <FileText className="h-3.5 w-3.5" />
        {i18n.t("ordersDetail:notes")}
      </div>
      <p className="text-sm text-muted-foreground whitespace-pre-line">{text}</p>
    </div>
  );
}

function ResultBanner({
  show,
  isAr,
  okAr,
  okEn,
}: {
  show: boolean;
  isAr: boolean;
  okAr: string;
  okEn: string;
}) {
  if (!show) return null;
  return (
    <div className="mt-3 rounded-xl border border-green-500/30 bg-green-500/5 p-3 text-sm text-green-800 dark:text-green-300">
      {isAr ? okAr : okEn}
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/50 pb-2 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground min-w-24">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}
