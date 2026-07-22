import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  QrCode,
  ArrowLeft,
  Printer,
  Download,
  User,
  Stethoscope,
  Star,
  Search,
  Building2,
  Users,
  FileText,
  X,
} from "lucide-react";
import { jsPDF } from "jspdf";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listBranchesForRatings, listDoctorsForRatings } from "@/lib/ratings.functions";
import { listPatientsAdvanced } from "@/lib/patients-mgmt.functions";

export const Route = createFileRoute("/_authenticated/qr-cards")({
  head: () => ({
    meta: [{ title: "بطاقات QR | مجمع باعشن الطبي" }, { name: "robots", content: "noindex" }],
  }),
  component: QrCardsPage,
});

const CLINIC_NAME = "مجمع باعشن الطبي";

function QrCardsPage() {
  return (
    <div className="container-app py-10 space-y-8" dir="rtl">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <QrCode className="h-6 w-6 shrink-0 text-primary" />
            <span className="truncate">بطاقات QR السريعة</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            بطاقات للطباعة أو التنزيل — لمساعدة المرضى على الوصول السريع للملف أو الحجز أو التقييم.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/ratings"
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
            <Star className="h-4 w-4 text-amber-500" /> التقييمات
          </Link>
          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" /> لوحة التحكم
          </Link>
        </div>
      </div>

      <Tabs defaultValue="patient" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 sm:w-auto sm:inline-flex">
          <TabsTrigger value="patient">
            <User className="h-4 w-4 ml-1.5" />
            بطاقة مريض
          </TabsTrigger>
          <TabsTrigger value="batch">
            <Users className="h-4 w-4 ml-1.5" />
            دفعة مرضى
          </TabsTrigger>
          <TabsTrigger value="booking">
            <Stethoscope className="h-4 w-4 ml-1.5" />
            بطاقة حجز
          </TabsTrigger>
          <TabsTrigger value="rating">
            <Star className="h-4 w-4 ml-1.5" />
            بطاقة تقييم
          </TabsTrigger>
        </TabsList>

        <TabsContent value="patient">
          <PatientCardTab />
        </TabsContent>
        <TabsContent value="batch">
          <BatchCardsTab />
        </TabsContent>
        <TabsContent value="booking">
          <BookingCardTab />
        </TabsContent>
        <TabsContent value="rating">
          <RatingCardTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ----------------------------- Patient MRN card ----------------------------- */

function PatientCardTab() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<{
    id: string;
    mrn: string;
    full_name_ar: string;
    branch_name_ar?: string | null;
  } | null>(null);
  const listFn = useServerFn(listPatientsAdvanced);

  const searchQ = useQuery({
    queryKey: ["qr-patients", q],
    queryFn: () => listFn({ data: { q: q || undefined, page: 1, pageSize: 20 } }),
    enabled: q.length >= 2,
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = selected ? `${origin}/patients/${selected.id}?src=qr` : "";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <label className="text-sm font-semibold flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          ابحث عن مريض (اسم / رقم ملف / جوال)
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="اكتب حرفين على الأقل…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <div className="max-h-96 overflow-auto rounded-md border border-border divide-y divide-border">
          {q.length < 2 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">ابدأ بالكتابة للبحث…</p>
          ) : searchQ.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground text-center">جارٍ البحث…</p>
          ) : (searchQ.data?.rows ?? []).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">لا نتائج.</p>
          ) : (
            (searchQ.data?.rows ?? []).map((p) => (
              <button
                key={p.id}
                onClick={() =>
                  setSelected({
                    id: p.id,
                    mrn: p.mrn,
                    full_name_ar: p.full_name_ar,
                    branch_name_ar: p.branch_name_ar,
                  })
                }
                className={`w-full text-right px-3 py-2 hover:bg-muted transition ${selected?.id === p.id ? "bg-primary/10" : ""}`}
              >
                <p className="text-sm font-medium">{p.full_name_ar}</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {p.mrn}
                  {p.phone ? ` · ${p.phone}` : ""}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      <div>
        {selected ? (
          <CardPreview
            title={selected.full_name_ar}
            subtitle={`رقم الملف: ${selected.mrn}`}
            footer={selected.branch_name_ar ?? CLINIC_NAME}
            url={url}
            hint="امسح لفتح ملف المريض"
            tone="primary"
          />
        ) : (
          <EmptyPreview label="اختر مريضًا لعرض البطاقة" />
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Booking card ------------------------------- */

function BookingCardTab() {
  const doctorsFn = useServerFn(listDoctorsForRatings);
  const doctorsQ = useQuery({
    queryKey: ["qr-doctors"],
    queryFn: () => doctorsFn(),
    staleTime: 60_000,
  });
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const selected = useMemo(
    () => (doctorsQ.data ?? []).find((d) => d.id === doctorId),
    [doctorsQ.data, doctorId],
  );
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = selected ? `${origin}/book?doctor=${selected.id}` : "";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <label className="text-sm font-semibold flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-primary" />
          اختر الطبيب
        </label>
        <select
          value={doctorId ?? ""}
          onChange={(e) => setDoctorId(e.target.value || null)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">—</option>
          {(doctorsQ.data ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name_ar}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          امسح QR ليفتح المريض صفحة الحجز مباشرة عند هذا الطبيب.
        </p>
      </div>
      <div>
        {selected ? (
          <CardPreview
            title={selected.name_ar}
            subtitle={selected.name_en ?? ""}
            footer="احجز موعدك الآن"
            url={url}
            hint="امسح للحجز"
            tone="emerald"
          />
        ) : (
          <EmptyPreview label="اختر طبيبًا لعرض البطاقة" />
        )}
      </div>
    </div>
  );
}

/* -------------------------------- Rating card ------------------------------- */

function RatingCardTab() {
  const branchesFn = useServerFn(listBranchesForRatings);
  const doctorsFn = useServerFn(listDoctorsForRatings);
  const branchesQ = useQuery({
    queryKey: ["qr-r-branches"],
    queryFn: () => branchesFn(),
    staleTime: 60_000,
  });
  const doctorsQ = useQuery({
    queryKey: ["qr-r-doctors"],
    queryFn: () => doctorsFn(),
    staleTime: 60_000,
  });

  const [branchId, setBranchId] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);

  const filteredDoctors = useMemo(
    () =>
      branchId
        ? (doctorsQ.data ?? []).filter((d) => d.branch_id === branchId)
        : (doctorsQ.data ?? []),
    [doctorsQ.data, branchId],
  );

  const branch = (branchesQ.data ?? []).find((b) => b.id === branchId);
  const doctor = (doctorsQ.data ?? []).find((d) => d.id === doctorId);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const params = new URLSearchParams();
  if (branchId) params.set("branch", branchId);
  if (doctorId) params.set("doctor", doctorId);
  const url = branchId || doctorId ? `${origin}/rate?${params.toString()}` : "";

  const title = doctor?.name_ar || branch?.name_ar || "";
  const subtitle = doctor && branch ? branch.name_ar : "";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> الفرع
          </label>
          <select
            value={branchId ?? ""}
            onChange={(e) => {
              setBranchId(e.target.value || null);
              setDoctorId(null);
            }}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {(branchesQ.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name_ar}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1.5">
            <Stethoscope className="h-3.5 w-3.5" /> الطبيب (اختياري)
          </label>
          <select
            value={doctorId ?? ""}
            onChange={(e) => setDoctorId(e.target.value || null)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {filteredDoctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name_ar}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">
          امسح QR لفتح صفحة التقييم مع تحديد الفرع/الطبيب مسبقًا.
        </p>
      </div>
      <div>
        {url ? (
          <CardPreview
            title={title || "قيّم تجربتك"}
            subtitle={subtitle}
            footer="رأيك يهمنا"
            url={url}
            hint="امسح للتقييم"
            tone="amber"
          />
        ) : (
          <EmptyPreview label="اختر الفرع أو الطبيب لعرض البطاقة" />
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Batch patients ------------------------------ */

type BatchPatient = {
  id: string;
  mrn: string;
  full_name_ar: string;
  branch_name_ar?: string | null;
};

function BatchCardsTab() {
  const [q, setQ] = useState("");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, BatchPatient>>({});
  const [busy, setBusy] = useState<null | "print" | "pdf">(null);

  const listFn = useServerFn(listPatientsAdvanced);
  const branchesFn = useServerFn(listBranchesForRatings);

  const branchesQ = useQuery({
    queryKey: ["qr-batch-branches"],
    queryFn: () => branchesFn(),
    staleTime: 60_000,
  });
  const searchQ = useQuery({
    queryKey: ["qr-batch-patients", q, branchId],
    queryFn: () =>
      listFn({
        data: { q: q || undefined, branchId: branchId || undefined, page: 1, pageSize: 50 },
      }),
  });

  const rows = searchQ.data?.rows ?? [];
  const selectedList = Object.values(selected);
  const allShownSelected = rows.length > 0 && rows.every((r) => selected[r.id]);

  const toggle = (p: BatchPatient) =>
    setSelected((s) => {
      const next = { ...s };
      if (next[p.id]) delete next[p.id];
      else next[p.id] = p;
      return next;
    });

  const toggleAllShown = () =>
    setSelected((s) => {
      const next = { ...s };
      if (allShownSelected) rows.forEach((r) => delete next[r.id]);
      else
        rows.forEach(
          (r) =>
            (next[r.id] = {
              id: r.id,
              mrn: r.mrn,
              full_name_ar: r.full_name_ar,
              branch_name_ar: r.branch_name_ar,
            }),
        );
      return next;
    });

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const buildCards = async () => {
    return Promise.all(
      selectedList.map(async (p) => ({
        p,
        dataUrl: await QRCode.toDataURL(`${origin}/patients/${p.id}?src=qr`, {
          width: 400,
          margin: 1,
          errorCorrectionLevel: "M",
        }),
      })),
    );
  };

  const printSheet = async () => {
    if (selectedList.length === 0) return;
    setBusy("print");
    try {
      const cards = await buildCards();
      const w = window.open("", "_blank", "width=900,height=1200");
      if (!w) return;
      const items = cards
        .map(
          ({ p, dataUrl }) => `
        <div class="card">
          <div class="clinic">${escapeHtml(CLINIC_NAME)}</div>
          <div class="name">${escapeHtml(p.full_name_ar)}</div>
          <div class="mrn">رقم الملف: ${escapeHtml(p.mrn)}</div>
          <img src="${dataUrl}" alt="Patient appointment QR code" />
          <div class="hint">امسح لفتح ملف المريض</div>
          <div class="branch">${escapeHtml(p.branch_name_ar ?? CLINIC_NAME)}</div>
        </div>`,
        )
        .join("");
      w.document
        .write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>بطاقات QR</title>
        <style>
          @page { size: A4; margin: 10mm; }
          body { font-family: -apple-system, "Segoe UI", Tahoma, sans-serif; margin:0; padding:8mm; background:#f5f5f5; }
          .grid { display:grid; grid-template-columns: repeat(2, 1fr); gap: 8mm; }
          .card { border: 2px solid #3b82f6; border-radius: 12px; padding: 14px; background:#fff; text-align:center; break-inside: avoid; }
          .clinic { font-size: 9px; color:#666; letter-spacing: 2px; text-transform: uppercase; }
          .name { font-size: 15px; font-weight: 700; margin-top: 4px; }
          .mrn { font-size: 11px; color:#666; font-family: monospace; margin-bottom: 8px; }
          img { width: 150px; height: 150px; display:block; margin: 0 auto; }
          .hint { margin-top: 8px; font-size: 11px; color:#444; }
          .branch { margin-top: 6px; padding-top: 6px; border-top: 1px solid #eee; font-size: 10px; color:#888; }
          @media print { body { background:#fff; padding:0; } }
        </style></head><body>
        <div class="grid">${items}</div>
        <script>window.onload = () => setTimeout(() => window.print(), 400);</script>
        </body></html>`);
      w.document.close();
    } finally {
      setBusy(null);
    }
  };

  const downloadPdf = async () => {
    if (selectedList.length === 0) return;
    setBusy("pdf");
    try {
      const cards = await buildCards();
      // A4 portrait, 2 cols × 3 rows = 6 per page
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const pageW = 210;
      const pageH = 297;
      const margin = 10;
      const cols = 2;
      const rows = 3;
      const perPage = cols * rows;
      const cellW = (pageW - margin * 2) / cols;
      const cellH = (pageH - margin * 2) / rows;

      cards.forEach(({ p, dataUrl }, i) => {
        if (i > 0 && i % perPage === 0) pdf.addPage();
        const idx = i % perPage;
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const x = margin + col * cellW;
        const y = margin + row * cellH;
        // border
        pdf.setDrawColor(59, 130, 246);
        pdf.setLineWidth(0.5);
        pdf.roundedRect(x + 2, y + 2, cellW - 4, cellH - 4, 3, 3);
        // QR image centered
        const qrSize = 55;
        const qrX = x + (cellW - qrSize) / 2;
        const qrY = y + 20;
        pdf.addImage(dataUrl, "PNG", qrX, qrY, qrSize, qrSize);
        // texts (Arabic may render as boxes in default font; MRN + id are safe)
        pdf.setFontSize(9);
        pdf.setTextColor(102);
        pdf.text(CLINIC_NAME, x + cellW / 2, y + 10, { align: "center" });
        pdf.setFontSize(11);
        pdf.setTextColor(20);
        pdf.text(p.full_name_ar, x + cellW / 2, y + 16, { align: "center" });
        pdf.setFontSize(9);
        pdf.setTextColor(102);
        pdf.text(`MRN: ${p.mrn}`, x + cellW / 2, qrY + qrSize + 6, { align: "center" });
      });

      pdf.save(`patient-qr-cards-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5" /> بحث (اسم / MRN / جوال)
            </label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="اختياري…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> الفرع
            </label>
            <select
              value={branchId ?? ""}
              onChange={(e) => setBranchId(e.target.value || null)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">الكل</option>
              {(branchesQ.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name_ar}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={toggleAllShown}
            disabled={rows.length === 0}
            className="rounded-md border border-input px-2.5 py-1 hover:bg-muted disabled:opacity-40"
          >
            {allShownSelected ? "إلغاء اختيار المعروض" : "اختيار كل المعروض"}
          </button>
          <span className="text-muted-foreground">
            {rows.length} نتيجة · محدد: <b className="text-foreground">{selectedList.length}</b>
          </span>
        </div>

        <div className="max-h-[420px] overflow-auto rounded-md border border-border divide-y divide-border">
          {searchQ.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground text-center">جارٍ التحميل…</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">لا نتائج.</p>
          ) : (
            rows.map((p) => {
              const isSel = !!selected[p.id];
              return (
                <label
                  key={p.id}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted ${isSel ? "bg-primary/10" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() =>
                      toggle({
                        id: p.id,
                        mrn: p.mrn,
                        full_name_ar: p.full_name_ar,
                        branch_name_ar: p.branch_name_ar,
                      })
                    }
                    className="h-4 w-4 accent-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.full_name_ar}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {p.mrn}
                      {p.phone ? ` · ${p.phone}` : ""}
                      {p.branch_name_ar ? ` · ${p.branch_name_ar}` : ""}
                    </p>
                  </div>
                </label>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4 self-start">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> المحدَّدون
          </h3>
          {selectedList.length > 0 && (
            <button
              onClick={() => setSelected({})}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <X className="h-3 w-3" /> مسح
            </button>
          )}
        </div>

        {selectedList.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            اختر مريضًا أو أكثر من القائمة.
          </p>
        ) : (
          <div className="max-h-56 overflow-auto space-y-1.5">
            {selectedList.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{p.full_name_ar}</p>
                  <p className="text-muted-foreground font-mono">{p.mrn}</p>
                </div>
                <button
                  onClick={() => toggle(p)}
                  aria-label="إزالة"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2 pt-2 border-t border-border">
          <button
            onClick={printSheet}
            disabled={selectedList.length === 0 || busy !== null}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm hover:opacity-90 disabled:opacity-40"
          >
            <Printer className="h-4 w-4" />
            {busy === "print" ? "جارٍ التجهيز…" : `طباعة ${selectedList.length || ""} بطاقة`}
          </button>
          <button
            onClick={downloadPdf}
            disabled={selectedList.length === 0 || busy !== null}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-muted disabled:opacity-40"
          >
            <FileText className="h-4 w-4" />
            {busy === "pdf" ? "جارٍ التوليد…" : "تنزيل PDF"}
          </button>
          <p className="text-[11px] text-muted-foreground text-center">
            6 بطاقات في كل صفحة A4 · QR يفتح ملف المريض داخل النظام.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- Shared ---------------------------------- */

function EmptyPreview({ label }: { label: string }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-border p-12 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function CardPreview({
  title,
  subtitle,
  footer,
  url,
  hint,
  tone,
}: {
  title: string;
  subtitle: string;
  footer: string;
  url: string;
  hint: string;
  tone: "primary" | "emerald" | "amber";
}) {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { width: 400, margin: 1, errorCorrectionLevel: "M" })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [url]);

  const toneMap = {
    primary: {
      bg: "from-primary/10 to-primary/5",
      accent: "text-primary",
      ring: "border-primary/30",
    },
    emerald: {
      bg: "from-emerald-500/10 to-emerald-500/5",
      accent: "text-emerald-600",
      ring: "border-emerald-500/30",
    },
    amber: {
      bg: "from-amber-500/10 to-amber-500/5",
      accent: "text-amber-600",
      ring: "border-amber-500/30",
    },
  }[tone];

  const printCard = () => {
    const w = window.open("", "_blank", "width=700,height=900");
    if (!w) return;
    w.document
      .write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title}</title>
      <style>
        body { font-family: -apple-system, "Segoe UI", Tahoma, sans-serif; margin:0; padding:40px; display:flex; align-items:center; justify-content:center; min-height:100vh; background:#f5f5f5; }
        .card { width: 360px; padding: 32px; border-radius: 20px; background:#fff; box-shadow: 0 8px 30px rgba(0,0,0,.08); text-align:center; border: 2px solid ${tone === "primary" ? "#3b82f6" : tone === "emerald" ? "#10b981" : "#f59e0b"}; }
        .clinic { font-size: 11px; color:#666; letter-spacing: 2px; text-transform: uppercase; margin-bottom:8px; }
        h1 { font-size: 22px; margin: 8px 0; }
        .sub { color:#666; font-size: 14px; margin-bottom: 20px; }
        img { width: 240px; height: 240px; margin: 0 auto; display:block; }
        .hint { margin-top: 16px; font-size: 13px; color: #444; }
        .footer { margin-top: 20px; padding-top: 16px; border-top: 1px solid #eee; color:#888; font-size: 12px; }
        @media print { body { background:#fff; padding:0; } .card { box-shadow:none; } }
      </style></head><body>
      <div class="card">
        <div class="clinic">${CLINIC_NAME}</div>
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<div class="sub">${escapeHtml(subtitle)}</div>` : ""}
        <img src="${dataUrl}" alt="Patient appointment QR code" />
        <div class="hint">${escapeHtml(hint)}</div>
        <div class="footer">${escapeHtml(footer)}</div>
      </div>
      <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
      </body></html>`);
    w.document.close();
  };

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `qr-${title.replace(/\s+/g, "-")}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-4">
      <div
        className={`rounded-2xl border-2 ${toneMap.ring} bg-gradient-to-br ${toneMap.bg} p-8 text-center shadow-sm`}
      >
        <p className={`text-[10px] uppercase tracking-widest ${toneMap.accent} font-bold mb-2`}>
          {CLINIC_NAME}
        </p>
        <h2 className="text-xl font-bold">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        <div className="mt-5 mx-auto w-56 h-56 bg-white rounded-xl p-3 shadow-inner grid place-items-center">
          {dataUrl ? (
            <img src={dataUrl} alt="Patient appointment QR code" className="w-full h-full" />
          ) : (
            <p className="text-xs text-muted-foreground">جارٍ توليد الرمز…</p>
          )}
        </div>
        <p className="mt-4 text-sm font-medium">{hint}</p>
        <p
          className="mt-3 text-[11px] text-muted-foreground border-t pt-3 break-all font-mono"
          dir="ltr"
        >
          {url}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={printCard}
          disabled={!dataUrl}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm hover:opacity-90 disabled:opacity-40"
        >
          <Printer className="h-4 w-4" /> طباعة
        </button>
        <button
          onClick={download}
          disabled={!dataUrl}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-muted disabled:opacity-40"
        >
          <Download className="h-4 w-4" /> تنزيل PNG
        </button>
      </div>
    </div>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
