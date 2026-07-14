import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { queryOptions, useSuspenseQuery, useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listMyRefunds,
  requestRefund,
  cancelMyRefund,
  logRefundReceiptDownload,
} from "@/lib/portal/refunds.functions";
import { listMyPayments } from "@/lib/portal/invoices.functions";
import {
  RotateCcw,
  Clock,
  CheckCircle2,
  XCircle,
  Ban,
  AlertCircle,
  Loader2,
  Plus,
  X,
  ReceiptText,
  Send,
  FileText,
  ChevronLeft,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Download,
} from "lucide-react";

/* ---------------- PDF receipt (print window) ---------------- */

function isFinalized(status: string) {
  return status === "processed" || status === "refunded" || status === "canceled" || status === "rejected";
}

type ReceiptFieldKey =
  | "reference"
  | "request_id"
  | "invoice"
  | "status"
  | "refund_amount"
  | "original_amount"
  | "payment_method"
  | "payment_paid_at"
  | "created_at"
  | "updated_at"
  | "processed_at"
  | "reason"
  | "decision_reason"
  | "amount_hero"
  | "footer_note";

type ReceiptField = {
  key: ReceiptFieldKey;
  label: string;
  group: "identifiers" | "amounts" | "dates" | "reasons" | "layout";
  isAvailable: (r: RefundRow) => boolean;
  defaultOn: (r: RefundRow) => boolean;
};

const RECEIPT_FIELDS: ReceiptField[] = [
  { key: "reference", label: "الرقم المرجعي للإيصال", group: "identifiers",
    isAvailable: (r) => !!r.receipt_reference, defaultOn: (r) => !!r.receipt_reference },
  { key: "request_id", label: "معرّف الطلب (UUID)", group: "identifiers",
    isAvailable: () => true, defaultOn: () => true },
  { key: "invoice", label: "رقم الفاتورة", group: "identifiers",
    isAvailable: (r) => !!r.invoice_number, defaultOn: (r) => !!r.invoice_number },
  { key: "status", label: "حالة الطلب", group: "identifiers",
    isAvailable: () => true, defaultOn: () => true },

  { key: "amount_hero", label: "بطاقة المبلغ البارزة (أعلى الإيصال)", group: "layout",
    isAvailable: () => true,
    defaultOn: (r) => r.status === "processed" || r.status === "refunded" },
  { key: "refund_amount", label: "المبلغ المُسترد", group: "amounts",
    isAvailable: () => true,
    defaultOn: (r) => r.status !== "canceled" },
  { key: "original_amount", label: "قيمة الدفعة الأصلية", group: "amounts",
    isAvailable: () => true, defaultOn: () => true },
  { key: "payment_method", label: "وسيلة الدفع", group: "amounts",
    isAvailable: (r) => !!r.payment_method, defaultOn: (r) => !!r.payment_method },

  { key: "payment_paid_at", label: "تاريخ الدفعة الأصلية", group: "dates",
    isAvailable: (r) => !!r.payment_paid_at, defaultOn: (r) => !!r.payment_paid_at },
  { key: "created_at", label: "تاريخ تقديم الطلب", group: "dates",
    isAvailable: () => true, defaultOn: () => true },
  { key: "updated_at", label: "آخر تحديث", group: "dates",
    isAvailable: () => true,
    defaultOn: (r) => r.status !== "processed" },
  { key: "processed_at", label: "تاريخ المعالجة/الصرف", group: "dates",
    isAvailable: (r) => !!r.processed_at,
    defaultOn: (r) => !!r.processed_at && (r.status === "processed" || r.status === "refunded") },

  { key: "reason", label: "سبب طلبك للاسترداد", group: "reasons",
    isAvailable: (r) => !!r.reason, defaultOn: (r) => !!r.reason },
  { key: "decision_reason", label: "قرار وملاحظة المحاسبة", group: "reasons",
    isAvailable: (r) => !!r.decision_reason,
    defaultOn: (r) => !!r.decision_reason },

  { key: "footer_note", label: "الملاحظة القانونية في الأسفل", group: "layout",
    isAvailable: () => true, defaultOn: () => true },
];

const GROUP_LABELS: Record<ReceiptField["group"], string> = {
  identifiers: "معلومات الطلب",
  amounts: "المبالغ ووسيلة الدفع",
  dates: "التواريخ",
  reasons: "السبب وقرار المحاسبة",
  layout: "تنسيق الإيصال",
};

function defaultReceiptSelection(r: RefundRow): Set<ReceiptFieldKey> {
  return new Set(
    RECEIPT_FIELDS.filter((f) => f.isAvailable(r) && f.defaultOn(r)).map((f) => f.key),
  );
}

function openRefundReceipt(r: RefundRow, selected: Set<ReceiptFieldKey>) {
  const meta = statusMeta(r.status);
  const has = (k: ReceiptFieldKey) => selected.has(k);
  const rows: Array<[string, string]> = [];
  if (has("reference") && r.receipt_reference) rows.push(["الرقم المرجعي", r.receipt_reference]);
  if (has("request_id")) rows.push(["معرّف الطلب", r.id]);
  if (has("invoice")) rows.push(["الفاتورة", r.invoice_number ? `#${r.invoice_number}` : "—"]);
  if (has("status")) rows.push(["حالة الطلب", meta.label]);
  if (has("refund_amount")) rows.push(["المبلغ المُسترد", fmtSAR(r.amount, r.currency)]);
  if (has("original_amount")) rows.push(["قيمة الدفعة الأصلية", fmtSAR(r.payment_amount, r.currency)]);
  if (has("payment_method")) rows.push(["وسيلة الدفع", r.payment_method ?? "—"]);
  if (has("payment_paid_at")) rows.push(["تاريخ الدفعة", fmtDate(r.payment_paid_at)]);
  if (has("created_at")) rows.push(["تاريخ الطلب", fmtDateTime(r.created_at)]);
  if (has("updated_at")) rows.push(["آخر تحديث", fmtDateTime(r.updated_at)]);
  if (has("processed_at") && r.processed_at) rows.push(["تاريخ المعالجة", fmtDateTime(r.processed_at)]);
  if (has("reason")) rows.push(["سبب الطلب", r.reason || "—"]);
  if (has("decision_reason")) rows.push(["قرار المحاسبة", r.decision_reason || "—"]);

  const showHero = has("amount_hero");
  const showNote = has("footer_note");

  const html = `<!doctype html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"/>
<title>إيصال استرداد ${r.receipt_reference ?? r.invoice_number ?? r.id.slice(0, 8)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;600;700&family=Noto+Kufi+Arabic:wght@600;700;800&display=swap">
<style>
  @page { size: A4; margin: 16mm 14mm; }
  html, body { direction: rtl; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: "Noto Naskh Arabic", "SF Arabic", "Geeza Pro", "Segoe UI", Tahoma, Arial, sans-serif;
    color: #0f172a;
    margin: 0;
    background: #e2e8f0;
    line-height: 1.85;
    font-size: 13.5px;
    text-align: right;
    font-feature-settings: "kern", "liga", "calt";
    unicode-bidi: plaintext;
  }
  h1, .brand, .badge, .amount .val, .grid td.k, .grid td.v {
    font-family: "Noto Kufi Arabic", "Noto Naskh Arabic", "SF Arabic", "Segoe UI", Tahoma, sans-serif;
  }
  .num, .mono, .ref {
    font-family: "SFMono-Regular", ui-monospace, Menlo, Consolas, monospace;
    direction: ltr;
    unicode-bidi: isolate;
    white-space: nowrap;
    letter-spacing: 0;
  }

  /* ---- Preview shell (screen only) ---- */
  .toolbar {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; padding: 12px 20px;
    background: rgba(15, 23, 42, 0.95); color: #f8fafc;
    backdrop-filter: blur(8px);
    box-shadow: 0 2px 12px rgba(0,0,0,0.15);
    font-family: "Noto Kufi Arabic", "SF Arabic", sans-serif;
  }
  .toolbar .title { font-size: 13px; font-weight: 700; opacity: 0.95; }
  .toolbar .title .hint { font-weight: 400; font-size: 11px; opacity: 0.7; margin-inline-start: 8px; }
  .toolbar .group { display: inline-flex; align-items: center; gap: 8px; }
  .tbtn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 14px; border-radius: 999px;
    background: rgba(255,255,255,0.1); color: #f8fafc;
    border: 1px solid rgba(255,255,255,0.15);
    font-weight: 600; font-size: 12.5px; cursor: pointer;
    font-family: inherit; transition: background .15s;
  }
  .tbtn:hover { background: rgba(255,255,255,0.18); }
  .tbtn.primary { background: #f8fafc; color: #0f172a; border-color: #f8fafc; font-weight: 700; }
  .tbtn.primary:hover { background: #fff; }
  .tbtn.icon { padding: 8px 10px; }
  .zoom-lbl { font-size: 12px; opacity: 0.8; min-width: 42px; text-align: center; }

  .preview-stage {
    padding: 28px 20px 48px;
    display: flex; justify-content: center;
    overflow: auto;
  }
  .sheet-wrap {
    transform-origin: top center;
    transition: transform .15s ease;
  }
  /* A4 sheet: 210mm x 297mm with 16/14mm margins baked in as padding */
  .sheet {
    width: 210mm; min-height: 297mm;
    padding: 16mm 14mm;
    background: #fff;
    box-shadow: 0 8px 40px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.08);
    border-radius: 2px;
    position: relative;
  }
  .rtl-badge {
    position: absolute; top: 10px; inset-inline-start: 10px;
    padding: 3px 8px; border-radius: 6px;
    background: #f1f5f9; color: #64748b;
    font-size: 10px; font-weight: 700; letter-spacing: .04em;
    font-family: "SFMono-Regular", ui-monospace, monospace;
  }

  /* ---- Sheet content ---- */
  .hd {
    display: flex; justify-content: space-between; align-items: flex-end;
    border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 22px;
    gap: 16px; page-break-inside: avoid; break-inside: avoid;
  }
  .brand { font-size: 22px; font-weight: 800; letter-spacing: 0; line-height: 1.4; }
  .sub { font-size: 11.5px; color: #64748b; margin-top: 4px; line-height: 1.6; }
  .badge {
    display: inline-block; padding: 6px 14px; border-radius: 999px;
    font-size: 12px; font-weight: 700; background: #f1f5f9; color: #0f172a;
    white-space: nowrap;
  }
  .grid { width: 100%; border-collapse: collapse; margin-top: 16px; table-layout: fixed; }
  .grid tr { page-break-inside: avoid; break-inside: avoid; }
  .grid td {
    padding: 11px 14px; border-bottom: 1px solid #e2e8f0;
    font-size: 13px; vertical-align: top; text-align: right;
    word-break: break-word; overflow-wrap: anywhere; hyphens: auto;
    line-height: 1.8;
  }
  .grid td.k { width: 38%; color: #64748b; font-weight: 600; white-space: normal; }
  .grid td.v { color: #0f172a; font-weight: 600; }
  .grid td.v .ref { display: inline-block; background: #f8fafc; padding: 2px 8px; border-radius: 6px; }
  .amount {
    margin-top: 22px; padding: 18px 20px; background: #f8fafc;
    border: 1px solid #e2e8f0; border-radius: 14px;
    display: flex; justify-content: space-between; align-items: center;
    gap: 20px; page-break-inside: avoid; break-inside: avoid;
  }
  .amount .lbl { font-size: 12px; color: #64748b; margin-bottom: 6px; }
  .amount .val { font-size: 26px; font-weight: 800; line-height: 1.3; white-space: nowrap; }
  .amount .side { text-align: left; }
  .amount .side .val-sm { font-weight: 700; font-size: 15px; white-space: nowrap; }
  .ft {
    margin-top: 28px; padding-top: 12px; border-top: 1px solid #e2e8f0;
    font-size: 10.5px; color: #94a3b8; text-align: center; line-height: 1.7;
  }
  .note {
    margin-top: 14px; padding: 12px 14px; font-size: 12px; color: #475569;
    background: #f8fafc; border-right: 3px solid #cbd5e1; border-radius: 8px;
    line-height: 1.9; text-align: justify; text-justify: inter-word;
    page-break-inside: avoid; break-inside: avoid;
  }

  @media print {
    body { background: #fff; }
    .noprint { display: none !important; }
    .preview-stage { padding: 0; display: block; overflow: visible; }
    .sheet-wrap { transform: none !important; }
    .sheet { width: auto; min-height: 0; padding: 0; box-shadow: none; border-radius: 0; }
    .rtl-badge { display: none; }
    a { color: inherit; text-decoration: none; }
  }
  @media (max-width: 820px) {
    .toolbar { flex-wrap: wrap; padding: 10px 12px; }
    .toolbar .title { font-size: 12px; }
    .preview-stage { padding: 16px 8px 32px; }
  }
</style></head>
<body>
  <div class="toolbar noprint" role="toolbar" aria-label="أدوات معاينة الإيصال">
    <div class="title">
      معاينة الإيصال قبل الطباعة
      <span class="hint">اتجاه RTL · مقاس A4</span>
    </div>
    <div class="group">
      <button class="tbtn icon" type="button" onclick="zoom(-0.1)" aria-label="تصغير">−</button>
      <span class="zoom-lbl" id="zoomLbl">100%</span>
      <button class="tbtn icon" type="button" onclick="zoom(0.1)" aria-label="تكبير">+</button>
      <button class="tbtn" type="button" onclick="fitWidth()" title="ملاءمة العرض">ملاءمة</button>
      <button class="tbtn primary" type="button" onclick="window.print()">طباعة / حفظ PDF</button>
      <button class="tbtn" type="button" onclick="window.close()" aria-label="إغلاق">إغلاق</button>
    </div>
  </div>

  <div class="preview-stage" id="stage">
    <div class="sheet-wrap" id="wrap">
      <article class="sheet" dir="rtl" lang="ar">
        <span class="rtl-badge" aria-hidden="true">RTL · A4</span>
        <div class="hd">
          <div style="min-width:0;flex:1">
            <div class="brand">إيصال طلب استرداد</div>
            ${r.receipt_reference ? `<div class="sub">المرجع: <span class="ref">${r.receipt_reference}</span></div>` : ""}
            <div class="sub">مستخرج بتاريخ <span class="num">${fmtDateTime(new Date().toISOString())}</span></div>
          </div>
          <span class="badge">${meta.label}</span>
        </div>
        ${showHero ? `<div class="amount">
          <div>
            <div class="lbl">المبلغ المُسترد</div>
            <div class="val num">${fmtSAR(r.amount, r.currency)}</div>
          </div>
          <div class="side">
            <div class="lbl">من دفعة أصلية</div>
            <div class="val-sm num">${fmtSAR(r.payment_amount, r.currency)}</div>
          </div>
        </div>` : ""}
        ${rows.length ? `<table class="grid">
          ${rows.map(([k, v]) => {
            const safe = String(v).replace(/</g, "&lt;");
            const isNumeric = /^[\d\s.,+\-/:%#SARر\.س]+$/.test(safe.trim()) && safe.trim().length > 0;
            const looksRef = /^(RF-|[0-9a-f-]{8,})/i.test(safe.trim());
            const cls = looksRef ? "ref" : isNumeric ? "num" : "";
            const inner = cls ? `<span class="${cls}">${safe}</span>` : safe;
            return `<tr><td class="k">${k}</td><td class="v">${inner}</td></tr>`;
          }).join("")}
        </table>` : ""}
        ${showNote ? `<div class="note">هذا الإيصال مُستخرج تلقائيًا من بوابة المريض ويعكس حالة طلب الاسترداد وقت التنزيل. للاستفسار يُرجى التواصل مع قسم المحاسبة والإشارة إلى معرّف الطلب أعلاه.</div>` : ""}
        <div class="ft">Bashen Medical · بوابة المريض · إيصال إلكتروني لا يستلزم توقيعًا</div>
      </article>
    </div>
  </div>

  <script>
    (function () {
      var scale = 1;
      var wrap = document.getElementById('wrap');
      var stage = document.getElementById('stage');
      var lbl = document.getElementById('zoomLbl');
      function apply() {
        wrap.style.transform = 'scale(' + scale + ')';
        lbl.textContent = Math.round(scale * 100) + '%';
      }
      window.zoom = function (d) {
        scale = Math.min(2, Math.max(0.5, scale + d));
        apply();
      };
      window.fitWidth = function () {
        var sheetPx = 210 * (96 / 25.4); // A4 width in px @96dpi
        var avail = stage.clientWidth - 32;
        scale = Math.max(0.5, Math.min(1.4, avail / sheetPx));
        apply();
      };
      // Initial fit once fonts settle
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { setTimeout(window.fitWidth, 60); });
      } else {
        window.addEventListener('load', function () { setTimeout(window.fitWidth, 200); });
      }
      window.addEventListener('resize', function () { setTimeout(window.fitWidth, 80); });
    })();
  <\/script>
</body></html>`;
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) {
    toast.error("متصفحك يمنع النوافذ المنبثقة. فعّلها لتنزيل الإيصال.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

const refundsQuery = queryOptions({
  queryKey: ["portal", "refunds"],
  queryFn: () => listMyRefunds(),
  staleTime: 15_000,
});
const paymentsQuery = queryOptions({
  queryKey: ["portal", "payments"],
  queryFn: () => listMyPayments(),
  staleTime: 30_000,
});

const searchSchema = z.object({
  status: fallback(z.string(), "all").default("all"),
  sort: fallback(z.string(), "updated_desc").default("updated_desc"),
  receipt: fallback(z.string().optional(), undefined).optional(),
});

export const Route = createFileRoute("/_authenticated/portal/refunds")({
  validateSearch: zodValidator(searchSchema),
  loader: async ({ context }) =>
    context.queryClient.ensureQueryData(refundsQuery),
  head: () => ({
    meta: [
      { title: "طلبات الاسترداد | بوابة المريض" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalRefundsPage,
});

/* ---------------- helpers ---------------- */

function fmtSAR(n: number, currency = "SAR") {
  try {
    return new Intl.NumberFormat("ar-SA", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SA", { year: "numeric", month: "short", day: "numeric" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}
function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}
type Status = "pending" | "approved" | "processed" | "rejected" | "canceled";
const STATUS_META: Record<Status, { label: string; cls: string; icon: any }> = {
  pending: { label: "قيد المراجعة", cls: "bg-amber-50 text-amber-700", icon: Clock },
  approved: { label: "معتمدة (قيد الصرف)", cls: "bg-sky-50 text-sky-700", icon: CheckCircle2 },
  processed: { label: "تمت المعالجة", cls: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  rejected: { label: "مرفوضة", cls: "bg-red-50 text-[color:var(--mag-danger)]", icon: XCircle },
  canceled: { label: "أُلغيت", cls: "bg-slate-100 text-slate-600", icon: Ban },
};
function statusMeta(s: string) {
  return STATUS_META[(s as Status)] ?? { label: s, cls: "bg-slate-100 text-slate-600", icon: AlertCircle };
}

/* ---------------- page ---------------- */

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: "all", label: "الكل" },
  { key: "pending", label: "قيد المراجعة" },
  { key: "approved", label: "معتمدة" },
  { key: "processed", label: "مُستردة" },
  { key: "rejected", label: "مرفوضة" },
  { key: "canceled", label: "ملغاة" },
];
const SORT_OPTIONS: Array<{ key: string; label: string; icon: any }> = [
  { key: "updated_desc", label: "آخر تحديث (الأحدث)", icon: ArrowDownWideNarrow },
  { key: "updated_asc", label: "آخر تحديث (الأقدم)", icon: ArrowUpWideNarrow },
  { key: "created_desc", label: "تاريخ الطلب (الأحدث)", icon: ArrowDownWideNarrow },
  { key: "created_asc", label: "تاريخ الطلب (الأقدم)", icon: ArrowUpWideNarrow },
];

function PortalRefundsPage() {
  const { data } = useSuspenseQuery(refundsQuery);
  const { status, sort, receipt } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [openNew, setOpenNew] = useState(false);
  const [prefillPaymentId, setPrefillPaymentId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const receiptRefund = useMemo(
    () => (receipt ? data.refunds.find((r) => r.id === receipt && isFinalized(r.status)) ?? null : null),
    [data.refunds, receipt],
  );
  const closeReceipt = () =>
    navigate({ search: (prev: any) => ({ ...prev, receipt: undefined }), replace: true });

  const safeStatus = STATUS_TABS.some((t) => t.key === status) ? status : "all";
  const safeSort = SORT_OPTIONS.some((s) => s.key === sort) ? sort : "updated_desc";

  const kpis = useMemo(() => {
    const list = data.refunds;
    const pending = list.filter((r) => r.status === "pending").length;
    const processed = list.filter((r) => r.status === "processed");
    const refundedTotal = processed.reduce((s, r) => s + Number(r.amount ?? 0), 0);
    return { count: list.length, pending, refunded: refundedTotal };
  }, [data.refunds]);

  const statusCounts = useMemo(() => {
    const map: Record<string, number> = { all: data.refunds.length };
    for (const r of data.refunds) map[r.status] = (map[r.status] ?? 0) + 1;
    return map;
  }, [data.refunds]);

  const visible = useMemo(() => {
    const filtered = safeStatus === "all"
      ? data.refunds
      : data.refunds.filter((r) => r.status === safeStatus);
    const lastAt = (r: RefundRow) => new Date(r.processed_at ?? r.updated_at).getTime();
    const createdAt = (r: RefundRow) => new Date(r.created_at).getTime();
    const sorted = [...filtered];
    switch (safeSort) {
      case "updated_asc": sorted.sort((a, b) => lastAt(a) - lastAt(b)); break;
      case "created_desc": sorted.sort((a, b) => createdAt(b) - createdAt(a)); break;
      case "created_asc": sorted.sort((a, b) => createdAt(a) - createdAt(b)); break;
      case "updated_desc":
      default: sorted.sort((a, b) => lastAt(b) - lastAt(a));
    }
    return sorted;
  }, [data.refunds, safeStatus, safeSort]);

  const selected = useMemo(
    () => data.refunds.find((r) => r.id === detailsId) ?? null,
    [data.refunds, detailsId],
  );

  const setStatus = (key: string) =>
    navigate({ search: (prev: any) => ({ ...prev, status: key }), replace: true });
  const setSort = (key: string) =>
    navigate({ search: (prev: any) => ({ ...prev, sort: key }), replace: true });

  return (
    <div className="portal-magazine min-h-full">
      <div className="max-w-6xl mx-auto px-4 lg:px-6 py-8 space-y-8">
        {/* Header */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-[color:var(--mag-ink-3)] font-semibold">
              الاسترداد والإلغاء
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold mt-1">طلبات الاسترداد</h1>
            <p className="text-sm text-[color:var(--mag-ink-3)] mt-2 max-w-2xl">
              اطلب استرداد أي دفعة سبق تسديدها، وتابع حالة الطلب حتى الصرف. يخضع كل طلب لمراجعة قسم
              المحاسبة قبل التنفيذ.
            </p>
          </div>
          <button
            onClick={() => { setPrefillPaymentId(null); setOpenNew(true); }}
            className="inline-flex items-center gap-2 h-11 px-5 rounded-full text-sm font-semibold text-white bg-[color:var(--mag-accent)] hover:bg-[color:var(--mag-accent-ink)]"
          >
            <Plus className="h-4 w-4" />
            طلب استرداد جديد
          </button>
        </header>

        {/* KPIs */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard icon={RotateCcw} label="إجمالي الطلبات" value={String(kpis.count)} />
          <KpiCard icon={Clock} label="قيد المراجعة" value={String(kpis.pending)} tone="warn" />
          <KpiCard icon={CheckCircle2} label="مبالغ مُستردة" value={fmtSAR(kpis.refunded)} tone="success" />
        </section>

        {/* Filters + sort */}
        {data.refunds.length > 0 && (
          <section className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="فلترة حسب الحالة">
              {STATUS_TABS.map((t) => {
                const active = safeStatus === t.key;
                const count = statusCounts[t.key] ?? 0;
                return (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setStatus(t.key)}
                    className={[
                      "h-9 px-3 rounded-full text-xs font-semibold border inline-flex items-center gap-1.5 transition-colors",
                      active
                        ? "bg-[color:var(--mag-accent)] text-white border-[color:var(--mag-accent)]"
                        : "bg-white text-[color:var(--mag-ink-2)] border-[color:var(--mag-line)] hover:bg-[color:var(--mag-subtle)]",
                    ].join(" ")}
                  >
                    {t.label}
                    <span className={[
                      "min-w-5 h-5 px-1.5 grid place-items-center rounded-full text-[10px] font-bold",
                      active ? "bg-white/20 text-white" : "bg-[color:var(--mag-subtle)] text-[color:var(--mag-ink-3)]",
                    ].join(" ")}>{count}</span>
                  </button>
                );
              })}
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-[color:var(--mag-ink-3)]">
              <span>الفرز:</span>
              <select
                value={safeSort}
                onChange={(e) => setSort(e.target.value)}
                className="h-9 ps-3 pe-8 rounded-full border border-[color:var(--mag-line)] bg-white text-xs font-semibold text-[color:var(--mag-ink-2)] outline-none focus:border-[color:var(--mag-accent)]"
                aria-label="ترتيب النتائج"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </label>
          </section>
        )}

        {/* List */}
        {data.refunds.length === 0 ? (
          <EmptyState onNew={() => { setPrefillPaymentId(null); setOpenNew(true); }} />
        ) : visible.length === 0 ? (
          <div className="mag-card p-8 text-center text-sm text-[color:var(--mag-ink-2)]">
            لا توجد طلبات تطابق الفلتر الحالي.
            <button
              onClick={() => setStatus("all")}
              className="ms-2 underline text-[color:var(--mag-accent)] font-semibold"
            >
              عرض الكل
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {visible.map((r) => (
              <RefundRow key={r.id} r={r} onOpen={() => setDetailsId(r.id)} />
            ))}
          </ul>
        )}
      </div>

      {openNew && (
        <NewRefundDrawer
          onClose={() => setOpenNew(false)}
          prefillPaymentId={prefillPaymentId}
        />
      )}
      {selected && (
        <RefundDetailsDrawer r={selected} onClose={() => setDetailsId(null)} />
      )}
      {receiptRefund && (
        <ReceiptCustomizerModal r={receiptRefund} onClose={closeReceipt} />
      )}
    </div>
  );
}

/* ---------------- KPI ---------------- */

function KpiCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "default" | "success" | "warn";
}) {
  const toneCls =
    tone === "success" ? "bg-emerald-50 text-emerald-700"
    : tone === "warn" ? "bg-amber-50 text-amber-700"
    : "bg-[color:var(--mag-subtle)] text-[color:var(--mag-ink-2)]";
  return (
    <div className="mag-card p-5">
      <div className={`h-10 w-10 rounded-xl grid place-items-center ${toneCls}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        <div className="text-sm text-[color:var(--mag-ink-2)] mt-1">{label}</div>
      </div>
    </div>
  );
}

/* ---------------- row ---------------- */

type RefundRow = Awaited<ReturnType<typeof listMyRefunds>>["refunds"][number];

function RefundRow({ r, onOpen }: { r: RefundRow; onOpen: () => void }) {
  const qc = useQueryClient();
  const cancelFn = useServerFn(cancelMyRefund);
  const meta = statusMeta(r.status);
  const Icon = meta.icon;
  const canCancel = r.status === "pending";
  const lastUpdate = r.processed_at ?? r.updated_at;
  const [receiptOpen, setReceiptOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () => cancelFn({ data: { id: r.id } }),
    onSuccess: () => {
      toast.success("تم إلغاء الطلب");
      qc.invalidateQueries({ queryKey: ["portal", "refunds"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر إلغاء الطلب"),
  });

  return (
    <li className="mag-card mag-card-hover p-4 sm:p-5 flex flex-wrap items-center gap-4">
      <button
        onClick={onOpen}
        className={`h-11 w-11 rounded-xl grid place-items-center ${meta.cls} hover:opacity-90`}
        aria-label="تفاصيل الطلب"
      >
        <Icon className="h-5 w-5" />
      </button>
      <button onClick={onOpen} className="flex-1 min-w-[220px] text-start">
        <div className="font-semibold flex items-center gap-2">
          <ReceiptText className="h-4 w-4 text-[color:var(--mag-ink-3)]" />
          {r.invoice_number ? `فاتورة #${r.invoice_number}` : "دفعة"}
          <span className="text-xs text-[color:var(--mag-ink-3)] font-normal">
            · {r.payment_method ?? "—"}
          </span>
        </div>
        {r.reason && (
          <div className="text-xs text-[color:var(--mag-ink-3)] mt-1 line-clamp-2 max-w-lg">
            السبب: {r.reason}
          </div>
        )}
        <div className="text-[11px] text-[color:var(--mag-ink-3)] mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {r.receipt_reference && (
            <span className="font-mono font-semibold text-[color:var(--mag-ink-2)] bg-[color:var(--mag-subtle)] px-1.5 py-0.5 rounded">
              {r.receipt_reference}
            </span>
          )}
          <span>طُلب في {fmtDate(r.created_at)}</span>
          <span>· آخر تحديث: {fmtDateTime(lastUpdate)}</span>
        </div>
      </button>
      <div className="text-end">
        <div className="text-lg font-bold">{fmtSAR(r.amount, r.currency)}</div>
        <div className="text-xs text-[color:var(--mag-ink-3)]">
          من دفعة {fmtSAR(r.payment_amount, r.currency)}
        </div>
      </div>
      <span className={`mag-chip ${meta.cls}`}>{meta.label}</span>
      <button
        onClick={onOpen}
        className="h-9 px-3 rounded-full border border-[color:var(--mag-line)] bg-white text-xs font-semibold text-[color:var(--mag-ink-2)] hover:bg-[color:var(--mag-subtle)] inline-flex items-center gap-1"
      >
        <FileText className="h-3.5 w-3.5" />
        التفاصيل
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      {isFinalized(r.status) && (
        <button
          onClick={() => setReceiptOpen(true)}
          className="h-9 px-3 rounded-full border border-[color:var(--mag-line)] bg-white text-xs font-semibold text-[color:var(--mag-ink-2)] hover:bg-[color:var(--mag-subtle)] inline-flex items-center gap-1"
          title="تخصيص وتنزيل إيصال PDF"
        >
          <Download className="h-3.5 w-3.5" />
          الإيصال
        </button>
      )}
      {canCancel && (
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="h-9 px-3 rounded-full border border-[color:var(--mag-line)] bg-white text-xs font-semibold text-[color:var(--mag-danger)] hover:bg-red-50 disabled:opacity-60 inline-flex items-center gap-1"
        >
          {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
          إلغاء الطلب
        </button>
      )}
      {receiptOpen && (
        <ReceiptCustomizerModal r={r} onClose={() => setReceiptOpen(false)} />
      )}
    </li>
  );
}

/* ---------------- details drawer with timeline ---------------- */

type TimelineStep = {
  key: string;
  title: string;
  at: string | null;
  note?: string | null;
  state: "done" | "current" | "upcoming" | "skipped" | "failed";
  icon: any;
};

function buildTimeline(r: RefundRow): TimelineStep[] {
  const status = r.status as Status;
  const lastAt = r.processed_at ?? r.updated_at;

  const submitted: TimelineStep = {
    key: "submitted",
    title: "تم إرسال الطلب",
    at: r.created_at,
    note: r.reason ? `سبب الطلب: ${r.reason}` : null,
    state: "done",
    icon: Send,
  };

  if (status === "pending") {
    return [
      submitted,
      { key: "review", title: "قيد مراجعة المحاسبة", at: null, state: "current", icon: Clock,
        note: "سيتم مراجعة الطلب خلال أيام العمل الرسمية." },
      { key: "processed", title: "المعالجة والصرف", at: null, state: "upcoming", icon: CheckCircle2 },
    ];
  }

  if (status === "approved") {
    return [
      submitted,
      { key: "review", title: "تمت الموافقة على الطلب", at: lastAt, state: "done", icon: CheckCircle2,
        note: r.decision_reason ?? null },
      { key: "processed", title: "قيد الصرف", at: null, state: "current", icon: RotateCcw,
        note: "جارٍ تحويل المبلغ إلى وسيلة الدفع الأصلية." },
    ];
  }

  if (status === "processed") {
    return [
      submitted,
      { key: "review", title: "تمت الموافقة على الطلب", at: null, state: "done", icon: CheckCircle2 },
      { key: "processed", title: "تمت معالجة الاسترداد", at: lastAt, state: "done", icon: CheckCircle2,
        note: r.decision_reason ?? "تم إعادة المبلغ إلى وسيلة الدفع الأصلية." },
    ];
  }

  if (status === "rejected") {
    return [
      submitted,
      { key: "review", title: "تم رفض الطلب", at: lastAt, state: "failed", icon: XCircle,
        note: r.decision_reason ?? "لم يتم ذكر سبب. يرجى التواصل مع قسم المحاسبة." },
      { key: "processed", title: "لن تتم المعالجة", at: null, state: "skipped", icon: Ban },
    ];
  }

  // canceled
  return [
    submitted,
    { key: "review", title: "تم إلغاء الطلب", at: lastAt, state: "failed", icon: Ban,
      note: r.decision_reason ?? "تم إلغاء الطلب قبل اكتمال المراجعة." },
    { key: "processed", title: "لن تتم المعالجة", at: null, state: "skipped", icon: Ban },
  ];
}

function RefundDetailsDrawer({ r, onClose }: { r: RefundRow; onClose: () => void }) {
  const qc = useQueryClient();
  const cancelFn = useServerFn(cancelMyRefund);
  const meta = statusMeta(r.status);
  const steps = useMemo(() => buildTimeline(r), [r]);
  const canCancel = r.status === "pending";
  const [receiptOpen, setReceiptOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () => cancelFn({ data: { id: r.id } }),
    onSuccess: () => {
      toast.success("تم إلغاء الطلب");
      qc.invalidateQueries({ queryKey: ["portal", "refunds"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر إلغاء الطلب"),
  });

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative ms-auto h-full w-full max-w-lg bg-white shadow-xl flex flex-col">
        <div className="h-14 px-5 flex items-center justify-between border-b border-[color:var(--mag-line)]">
          <div className="font-bold">تفاصيل طلب الاسترداد</div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-[color:var(--mag-subtle)]" aria-label="إغلاق">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Summary */}
          <section className="mag-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-[color:var(--mag-ink-3)]">
                {r.invoice_number ? `فاتورة #${r.invoice_number}` : "دفعة"}
              </div>
              <span className={`mag-chip ${meta.cls}`}>{meta.label}</span>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[11px] text-[color:var(--mag-ink-3)]">المبلغ المطلوب استرداده</div>
                <div className="text-2xl font-bold">{fmtSAR(r.amount, r.currency)}</div>
              </div>
              <div className="text-end">
                <div className="text-[11px] text-[color:var(--mag-ink-3)]">من دفعة</div>
                <div className="text-sm font-semibold">{fmtSAR(r.payment_amount, r.currency)}</div>
                <div className="text-[11px] text-[color:var(--mag-ink-3)] mt-0.5">
                  {r.payment_method ?? "—"} · دُفعت في {fmtDate(r.payment_paid_at)}
                </div>
              </div>
            </div>
            <div className="pt-2 mt-1 border-t border-[color:var(--mag-line)] text-[11px] text-[color:var(--mag-ink-3)] flex flex-wrap gap-x-4 gap-y-1">
              {r.receipt_reference && (
                <span>الرقم المرجعي: <span className="font-mono font-semibold text-[color:var(--mag-ink-1)]">{r.receipt_reference}</span></span>
              )}
              <span>معرّف الطلب: <span className="font-mono">{r.id.slice(0, 8)}…</span></span>
              <span>آخر تحديث: {fmtDateTime(r.processed_at ?? r.updated_at)}</span>
            </div>
          </section>

          {/* Timeline */}
          <section>
            <div className="text-sm font-semibold mb-3">مراحل الطلب</div>
            <ol className="relative ms-3 border-s-2 border-[color:var(--mag-line)] space-y-5 ps-5">
              {steps.map((s) => {
                const Icon = s.icon;
                const dot =
                  s.state === "done" ? "bg-emerald-500 text-white"
                  : s.state === "current" ? "bg-amber-500 text-white animate-pulse"
                  : s.state === "failed" ? "bg-[color:var(--mag-danger)] text-white"
                  : s.state === "skipped" ? "bg-slate-200 text-slate-400"
                  : "bg-white text-[color:var(--mag-ink-3)] border border-[color:var(--mag-line)]";
                const titleCls =
                  s.state === "upcoming" || s.state === "skipped"
                    ? "text-[color:var(--mag-ink-3)]"
                    : "text-[color:var(--mag-ink-1)]";
                return (
                  <li key={s.key} className="relative">
                    <span className={`absolute -start-[34px] top-0 h-7 w-7 rounded-full grid place-items-center ${dot}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className={`font-semibold text-sm ${titleCls}`}>{s.title}</div>
                    <div className="text-[11px] text-[color:var(--mag-ink-3)] mt-0.5">
                      {s.at ? fmtDateTime(s.at) : s.state === "current" ? "الآن" : "—"}
                    </div>
                    {s.note && (
                      <div className={[
                        "mt-2 text-xs rounded-lg p-3",
                        s.state === "failed"
                          ? "bg-red-50 text-[color:var(--mag-danger)]"
                          : "bg-[color:var(--mag-subtle)] text-[color:var(--mag-ink-2)]",
                      ].join(" ")}>
                        {s.note}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        {(canCancel || isFinalized(r.status)) && (
          <div className="p-4 border-t border-[color:var(--mag-line)] flex items-center gap-3">
            <button
              onClick={onClose}
              className="h-11 px-4 rounded-full border border-[color:var(--mag-line)] bg-white text-sm font-semibold"
            >
              إغلاق
            </button>
            {isFinalized(r.status) && (
              <button
                onClick={() => setReceiptOpen(true)}
                className="flex-1 h-11 rounded-full text-sm font-semibold border border-[color:var(--mag-line)] bg-white text-[color:var(--mag-ink-1)] hover:bg-[color:var(--mag-subtle)] inline-flex items-center justify-center gap-2"
              >
                <Download className="h-4 w-4" />
                تخصيص وتنزيل الإيصال (PDF)
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="flex-1 h-11 rounded-full text-sm font-semibold text-white bg-[color:var(--mag-danger)] hover:opacity-90 disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                إلغاء طلب الاسترداد
              </button>
            )}
          </div>
        )}
      </div>
      {receiptOpen && (
        <ReceiptCustomizerModal r={r} onClose={() => setReceiptOpen(false)} />
      )}
    </div>
  );
}

function ReceiptCustomizerModal({ r, onClose }: { r: RefundRow; onClose: () => void }) {
  const meta = statusMeta(r.status);
  const available = useMemo(() => RECEIPT_FIELDS.filter((f) => f.isAvailable(r)), [r]);
  const [selected, setSelected] = useState<Set<ReceiptFieldKey>>(() => defaultReceiptSelection(r));
  const logDownload = useServerFn(logRefundReceiptDownload);

  const toggle = (k: ReceiptFieldKey) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  const setAll = (on: boolean) =>
    setSelected(on ? new Set(available.map((f) => f.key)) : new Set());
  const resetDefaults = () => setSelected(defaultReceiptSelection(r));

  const grouped = useMemo(() => {
    const map = new Map<ReceiptField["group"], ReceiptField[]>();
    for (const f of available) {
      const arr = map.get(f.group) ?? [];
      arr.push(f);
      map.set(f.group, arr);
    }
    return Array.from(map.entries());
  }, [available]);

  const generate = () => {
    if (selected.size === 0) {
      toast.error("اختر حقلًا واحدًا على الأقل.");
      return;
    }
    const fields = Array.from(selected);
    openRefundReceipt(r, selected);
    // Fire-and-forget audit log — never block the download on logging errors
    logDownload({
      data: {
        refund_id: r.id,
        status: r.status,
        fields,
        field_count: fields.length,
      },
    }).catch(() => {
      /* silent: audit logging failure shouldn't disrupt the user */
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="h-14 px-5 flex items-center justify-between border-b border-[color:var(--mag-line)]">
          <div>
            <div className="font-bold text-sm">تخصيص حقول الإيصال</div>
            <div className="text-[11px] text-[color:var(--mag-ink-3)] mt-0.5">
              حسب الحالة: <span className="font-semibold">{meta.label}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-[color:var(--mag-subtle)]" aria-label="إغلاق">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 pt-3 pb-2 flex flex-wrap items-center gap-2 border-b border-[color:var(--mag-line)]">
          <button onClick={() => setAll(true)}
            className="h-8 px-3 rounded-full border border-[color:var(--mag-line)] text-xs font-semibold hover:bg-[color:var(--mag-subtle)]">
            تحديد الكل
          </button>
          <button onClick={() => setAll(false)}
            className="h-8 px-3 rounded-full border border-[color:var(--mag-line)] text-xs font-semibold hover:bg-[color:var(--mag-subtle)]">
            إلغاء التحديد
          </button>
          <button onClick={resetDefaults}
            className="h-8 px-3 rounded-full border border-[color:var(--mag-line)] text-xs font-semibold hover:bg-[color:var(--mag-subtle)]">
            الافتراضي حسب الحالة
          </button>
          <span className="ms-auto text-[11px] text-[color:var(--mag-ink-3)]">
            {selected.size} / {available.length} حقلاً
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {grouped.map(([group, fields]) => (
            <div key={group}>
              <div className="text-[11px] uppercase tracking-wider font-bold text-[color:var(--mag-ink-3)] mb-2">
                {GROUP_LABELS[group]}
              </div>
              <div className="space-y-1.5">
                {fields.map((f) => {
                  const on = selected.has(f.key);
                  return (
                    <label key={f.key}
                      className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[color:var(--mag-subtle)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(f.key)}
                        className="h-4 w-4 accent-[color:var(--mag-accent)]"
                      />
                      <span className="text-sm text-[color:var(--mag-ink-1)] font-medium">{f.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          {!r.decision_reason && (r.status === "processed" || r.status === "rejected" || r.status === "canceled") && (
            <div className="text-[11px] text-[color:var(--mag-ink-3)] p-2.5 rounded-lg bg-[color:var(--mag-subtle)]">
              لا يوجد قرار محاسبي مسجّل لهذا الطلب، لذا لا يظهر خيار «قرار المحاسبة».
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[color:var(--mag-line)] flex items-center gap-3">
          <button onClick={onClose}
            className="h-11 px-4 rounded-full border border-[color:var(--mag-line)] bg-white text-sm font-semibold">
            إلغاء
          </button>
          <button onClick={generate}
            disabled={selected.size === 0}
            className="flex-1 h-11 rounded-full text-sm font-semibold text-white bg-[color:var(--mag-accent)] hover:bg-[color:var(--mag-accent-ink)] disabled:opacity-60 inline-flex items-center justify-center gap-2">
            <Download className="h-4 w-4" />
            توليد الإيصال
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="mag-card p-10 text-center">
      <div className="mx-auto h-14 w-14 rounded-2xl bg-[color:var(--mag-subtle)] grid place-items-center text-[color:var(--mag-ink-3)] mb-3">
        <RotateCcw className="h-7 w-7" />
      </div>
      <p className="text-[color:var(--mag-ink-2)]">لا توجد طلبات استرداد.</p>
      <button
        onClick={onNew}
        className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-full text-sm font-semibold text-white bg-[color:var(--mag-accent)] hover:bg-[color:var(--mag-accent-ink)]"
      >
        <Plus className="h-4 w-4" /> إنشاء طلب
      </button>
    </div>
  );
}

/* ---------------- new refund drawer ---------------- */

function NewRefundDrawer({
  onClose,
  prefillPaymentId,
}: {
  onClose: () => void;
  prefillPaymentId: string | null;
}) {
  const qc = useQueryClient();
  const { data: paysRes, isLoading } = useQuery(paymentsQuery);
  const { data: refundsRes } = useQuery(refundsQuery);
  const requestFn = useServerFn(requestRefund);

  // Only refundable, non-mock payments
  const refundable = useMemo(() => {
    const list = paysRes?.payments ?? [];
    return list.filter(
      (p) =>
        !p.is_mock &&
        ["succeeded", "completed", "paid", "partially_refunded"].includes(p.status),
    );
  }, [paysRes?.payments]);

  const [paymentId, setPaymentId] = useState<string>(prefillPaymentId ?? "");
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  const selected = useMemo(
    () => refundable.find((p) => p.id === paymentId) ?? null,
    [refundable, paymentId],
  );

  // Deductions breakdown for the selected payment
  const breakdown = useMemo(() => {
    if (!selected) return null;
    const gross = Number(selected.amount ?? 0);
    const rows = (refundsRes?.refunds ?? []).filter((r) => r.payment_id === selected.id);
    const sumBy = (statuses: string[]) =>
      rows
        .filter((r) => statuses.includes(r.status))
        .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const processed = sumBy(["processed"]);
    const inFlight = sumBy(["pending", "approved"]);
    const deducted = processed + inFlight;
    const available = Math.max(0, gross - deducted);
    const pendingCount = rows.filter((r) => r.status === "pending").length;
    const approvedCount = rows.filter((r) => r.status === "approved").length;
    const processedCount = rows.filter((r) => r.status === "processed").length;
    return {
      gross,
      processed,
      inFlight,
      available,
      pendingCount,
      approvedCount,
      processedCount,
      hasHistory: rows.length > 0,
    };
  }, [selected, refundsRes?.refunds]);

  const amountNum = amount ? Number(amount) : NaN;
  const exceedsMax =
    !!breakdown && !Number.isNaN(amountNum) && amountNum > breakdown.available + 0.01;
  const noAvailable = !!breakdown && breakdown.available <= 0;

  const mutation = useMutation({
    mutationFn: () =>
      requestFn({
        data: {
          payment_id: paymentId,
          reason: reason.trim(),
          amount: amount ? Number(amount) : undefined,
        },
      }),
    onSuccess: (res: any) => {
      const ref = res?.receipt_reference;
      toast.success(
        ref
          ? `تم إرسال طلب الاسترداد. رقمك المرجعي: ${ref}`
          : "تم إرسال طلب الاسترداد. سيتم مراجعته من قبل قسم المحاسبة.",
      );
      qc.invalidateQueries({ queryKey: ["portal", "refunds"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر إرسال الطلب"),
  });

  const canSubmit =
    !!paymentId &&
    reason.trim().length >= 3 &&
    !mutation.isPending &&
    !exceedsMax &&
    !noAvailable;

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative ms-auto h-full w-full max-w-lg bg-white shadow-xl flex flex-col">
        <div className="h-14 px-5 flex items-center justify-between border-b border-[color:var(--mag-line)]">
          <div className="font-bold">طلب استرداد جديد</div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-[color:var(--mag-subtle)]" aria-label="إغلاق">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {isLoading ? (
            <div className="flex items-center gap-2 text-[color:var(--mag-ink-3)]">
              <Loader2 className="h-4 w-4 animate-spin" /> جاري تحميل الدفعات…
            </div>
          ) : refundable.length === 0 ? (
            <div className="mag-card p-5 text-sm text-[color:var(--mag-ink-2)] flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                لا توجد دفعات قابلة للاسترداد على حسابك حاليًا. الدفعات التجريبية (وضع محاكاة)
                لا يمكن استردادها عبر البوابة.
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="text-sm font-semibold block mb-2">الدفعة</label>
                <div className="space-y-2">
                  {refundable.map((p) => {
                    const active = paymentId === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setPaymentId(p.id)}
                        className={[
                          "w-full text-start p-3 rounded-xl border transition-colors",
                          active
                            ? "border-[color:var(--mag-accent)] bg-[color:var(--mag-accent-soft)]"
                            : "border-[color:var(--mag-line)] bg-white hover:bg-[color:var(--mag-subtle)]",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-sm">
                              {p.invoice_number ? `فاتورة #${p.invoice_number}` : "دفعة"} · {p.method}
                            </div>
                            <div className="text-xs text-[color:var(--mag-ink-3)] mt-0.5">
                              {fmtDate(p.paid_at ?? p.created_at)} · {p.status}
                            </div>
                          </div>
                          <div className="text-sm font-bold">
                            {fmtSAR(Number(p.amount), p.currency)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selected && breakdown && (
                <section className="mag-card p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">تفصيل المبلغ</div>
                    <div className="text-[11px] text-[color:var(--mag-ink-3)]">
                      {selected.currency ?? "SAR"}
                    </div>
                  </div>
                  <dl className="text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <dt className="text-[color:var(--mag-ink-3)]">قيمة الدفعة الأصلية</dt>
                      <dd className="font-semibold">{fmtSAR(breakdown.gross, selected.currency)}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-[color:var(--mag-ink-3)]">
                        مُسترد سابقًا
                        {breakdown.processedCount > 0 && (
                          <span className="ms-1 text-[10px]">({breakdown.processedCount})</span>
                        )}
                      </dt>
                      <dd className="font-semibold text-emerald-700">
                        − {fmtSAR(breakdown.processed, selected.currency)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-[color:var(--mag-ink-3)]">
                        طلبات جارية
                        {(breakdown.pendingCount + breakdown.approvedCount) > 0 && (
                          <span className="ms-1 text-[10px]">
                            (قيد المراجعة: {breakdown.pendingCount} · معتمدة: {breakdown.approvedCount})
                          </span>
                        )}
                      </dt>
                      <dd className="font-semibold text-amber-700">
                        − {fmtSAR(breakdown.inFlight, selected.currency)}
                      </dd>
                    </div>
                  </dl>
                  <div className="pt-3 border-t border-[color:var(--mag-line)] flex items-end justify-between gap-3">
                    <div>
                      <div className="text-[11px] text-[color:var(--mag-ink-3)]">المتاح للاسترداد الآن</div>
                      <div className={[
                        "text-xl font-bold",
                        breakdown.available > 0 ? "text-[color:var(--mag-ink-1)]" : "text-[color:var(--mag-danger)]",
                      ].join(" ")}>
                        {fmtSAR(breakdown.available, selected.currency)}
                      </div>
                    </div>
                    {breakdown.available > 0 && (
                      <button
                        type="button"
                        onClick={() => setAmount(breakdown.available.toFixed(2))}
                        className="h-9 px-3 rounded-full border border-[color:var(--mag-line)] bg-white text-xs font-semibold text-[color:var(--mag-accent)] hover:bg-[color:var(--mag-accent-soft)]"
                      >
                        استرداد الكامل المتاح
                      </button>
                    )}
                  </div>
                  {noAvailable && (
                    <div className="text-xs rounded-lg p-2.5 bg-red-50 text-[color:var(--mag-danger)] flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>لا يوجد مبلغ متاح للاسترداد على هذه الدفعة (تمت تغطية كامل المبلغ بطلبات سابقة أو جارية).</span>
                    </div>
                  )}
                </section>
              )}

              <div>
                <label className="text-sm font-semibold block mb-2">
                  المبلغ المطلوب استرداده
                  <span className="text-xs text-[color:var(--mag-ink-3)] font-normal ms-2">
                    (اتركه فارغًا لاسترداد كامل المتاح)
                  </span>
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  max={breakdown ? breakdown.available : undefined}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={noAvailable}
                  placeholder={breakdown ? breakdown.available.toFixed(2) : "—"}
                  className={[
                    "w-full h-11 px-3 rounded-xl border bg-white text-sm outline-none",
                    exceedsMax
                      ? "border-[color:var(--mag-danger)] focus:border-[color:var(--mag-danger)]"
                      : "border-[color:var(--mag-line)] focus:border-[color:var(--mag-accent)]",
                    noAvailable ? "opacity-60 cursor-not-allowed" : "",
                  ].join(" ")}
                />
                {exceedsMax && breakdown && (
                  <div className="mt-1.5 text-[11px] text-[color:var(--mag-danger)]">
                    يتجاوز المبلغ الحد الأقصى المتاح ({fmtSAR(breakdown.available, selected?.currency)}).
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-semibold block mb-2">سبب الطلب</label>
                <textarea
                  rows={4}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="اذكر سبب طلب الاسترداد (لن يقل عن 3 أحرف)"
                  className="w-full min-h-[100px] p-3 rounded-xl border border-[color:var(--mag-line)] bg-white text-sm outline-none focus:border-[color:var(--mag-accent)] resize-y"
                />
              </div>

              <div className="mag-card p-3 bg-[color:var(--mag-accent-soft)] text-xs text-[color:var(--mag-ink-2)]">
                يتم تحويل الطلب فور إرساله إلى قسم المحاسبة للمراجعة. عند اعتماد الطلب ومعالجته،
                يتم تحديث حالة الفاتورة والدفعة تلقائيًا.
              </div>
            </>
          )}
        </div>

        {refundable.length > 0 && (
          <div className="p-4 border-t border-[color:var(--mag-line)] flex items-center gap-3">
            <button
              onClick={onClose}
              className="h-11 px-4 rounded-full border border-[color:var(--mag-line)] bg-white text-sm font-semibold"
            >
              إلغاء
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={!canSubmit}
              className="flex-1 h-11 rounded-full text-sm font-semibold text-white bg-[color:var(--mag-accent)] hover:bg-[color:var(--mag-accent-ink)] disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              إرسال طلب الاسترداد
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
