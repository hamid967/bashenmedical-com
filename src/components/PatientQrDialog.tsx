import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode, Printer, Download, X, User, Star } from "lucide-react";

const CLINIC_NAME = "مجمع باعشن الطبي";

type Props = {
  patientId: string;
  mrn: string;
  fullNameAr: string;
  branchNameAr?: string | null;
  branchId?: string | null;
  doctorId?: string | null;
  /** Rendered trigger. Defaults to a small icon button. */
  variant?: "icon" | "button";
};

export function PatientQrDialog({
  patientId,
  mrn,
  fullNameAr,
  branchNameAr,
  branchId,
  doctorId,
  variant = "icon",
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="بطاقة QR للمريض"
          aria-label="بطاقة QR للمريض"
          className="inline-flex items-center justify-center rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
        >
          <QrCode className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-muted"
        >
          <QrCode className="h-4 w-4 text-primary" />
          بطاقة QR
        </button>
      )}

      {open && (
        <QrModal
          patientId={patientId}
          mrn={mrn}
          fullNameAr={fullNameAr}
          branchNameAr={branchNameAr}
          branchId={branchId ?? null}
          doctorId={doctorId ?? null}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function QrModal({
  patientId,
  mrn,
  fullNameAr,
  branchNameAr,
  branchId,
  doctorId,
  onClose,
}: {
  patientId: string;
  mrn: string;
  fullNameAr: string;
  branchNameAr?: string | null;
  branchId: string | null;
  doctorId: string | null;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"file" | "rating">("file");
  const [dataUrl, setDataUrl] = useState("");
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const fileUrl = `${origin}/patients/${patientId}?src=qr`;
  const rateParams = new URLSearchParams();
  if (branchId) rateParams.set("branch", branchId);
  if (doctorId) rateParams.set("doctor", doctorId);
  const rateUrl = `${origin}/rate${rateParams.toString() ? `?${rateParams}` : ""}`;

  const url = mode === "file" ? fileUrl : rateUrl;
  const isRating = mode === "rating";
  const accent = isRating ? "amber" : "primary";
  const accentBorder = isRating ? "border-amber-500/40" : "border-primary/30";
  const accentBg = isRating ? "from-amber-500/10 to-amber-500/5" : "from-primary/10 to-primary/5";
  const accentText = isRating ? "text-amber-600" : "text-primary";

  useEffect(() => {
    QRCode.toDataURL(url, { width: 400, margin: 1, errorCorrectionLevel: "M" })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [url]);

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `qr-${isRating ? "rate" : mrn || fullNameAr.replace(/\s+/g, "-")}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const printCard = () => {
    const w = window.open("", "_blank", "width=700,height=900");
    if (!w) return;
    const borderColor = isRating ? "#f59e0b" : "#3b82f6";
    const title = isRating ? "قيّم تجربتك" : fullNameAr;
    const heading = isRating ? "قيّم تجربتك معنا" : fullNameAr;
    const sub = isRating ? "رأيك يهمّنا ويساعدنا على التحسين" : `رقم الملف: ${mrn}`;
    const hint = isRating ? "امسح الرمز لتقييم زيارتك" : "امسح لفتح ملف المريض والتقارير";
    w.document
      .write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>
        body { font-family: -apple-system, "Segoe UI", Tahoma, sans-serif; margin:0; padding:40px; display:flex; align-items:center; justify-content:center; min-height:100vh; background:#f5f5f5; }
        .card { width: 360px; padding: 32px; border-radius: 20px; background:#fff; box-shadow: 0 8px 30px rgba(0,0,0,.08); text-align:center; border: 2px solid ${borderColor}; }
        .clinic { font-size: 11px; color:#666; letter-spacing: 2px; text-transform: uppercase; margin-bottom:8px; }
        h1 { font-size: 22px; margin: 8px 0; }
        .sub { color:#666; font-size: 14px; margin-bottom: 20px; }
        img { width: 240px; height: 240px; margin: 0 auto; display:block; }
        .hint { margin-top: 16px; font-size: 13px; color: #444; }
        .footer { margin-top: 20px; padding-top: 16px; border-top: 1px solid #eee; color:#888; font-size: 12px; }
        @media print { body { background:#fff; padding:0; } .card { box-shadow:none; } }
      </style></head><body>
      <div class="card">
        <div class="clinic">${esc(CLINIC_NAME)}</div>
        <h1>${esc(heading)}</h1>
        <div class="sub">${esc(sub)}</div>
        <img src="${dataUrl}" alt="Patient appointment QR code" />
        <div class="hint">${esc(hint)}</div>
        <div class="footer">${esc(branchNameAr ?? CLINIC_NAME)}</div>
      </div>
      <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <QrCode className={`h-5 w-5 ${accentText}`} /> بطاقة QR
          </h3>
          <button onClick={onClose} aria-label="إغلاق" className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode switcher */}
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setMode("file")}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${mode === "file" ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <User className="h-3.5 w-3.5" /> ملف المريض
          </button>
          <button
            type="button"
            onClick={() => setMode("rating")}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${mode === "rating" ? "bg-card shadow-sm text-amber-600" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Star className="h-3.5 w-3.5" /> تقييم الزيارة
          </button>
        </div>

        <div
          className={`rounded-2xl border-2 ${accentBorder} bg-gradient-to-br ${accentBg} p-6 text-center`}
        >
          <p className={`text-[10px] uppercase tracking-widest ${accentText} font-bold mb-2`}>
            {CLINIC_NAME}
          </p>
          {isRating ? (
            <>
              <h2 className="text-xl font-bold">قيّم تجربتك معنا</h2>
              <p className="text-sm text-muted-foreground mt-1">{fullNameAr}</p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold">{fullNameAr}</h2>
              <p className="text-sm text-muted-foreground mt-1 font-mono">رقم الملف: {mrn}</p>
            </>
          )}
          <div className="mt-5 mx-auto w-56 h-56 bg-white rounded-xl p-3 shadow-inner grid place-items-center">
            {dataUrl ? (
              <img src={dataUrl} alt="Patient appointment QR code" className="w-full h-full" />
            ) : (
              <p className="text-xs text-muted-foreground">جارٍ توليد الرمز…</p>
            )}
          </div>
          <p className="mt-4 text-sm font-medium">
            {isRating ? "امسح الرمز لتقييم زيارتك" : "امسح لفتح الملف والتقارير"}
          </p>
          <p
            className="mt-3 text-[11px] text-muted-foreground border-t pt-3 break-all font-mono"
            dir="ltr"
          >
            {url}
          </p>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={printCard}
            disabled={!dataUrl}
            className={`flex-1 inline-flex items-center justify-center gap-2 rounded-md ${isRating ? "bg-amber-500 hover:bg-amber-600" : "bg-primary hover:opacity-90"} text-white px-4 py-2 text-sm disabled:opacity-40`}
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
    </div>
  );
}

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
