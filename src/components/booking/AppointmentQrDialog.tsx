/**
 * AppointmentQrDialog
 *
 * Renders a QR code + shareable verification link built ONLY from an
 * appointment's public reference number ("BMC-YYYYMMDD-XXXX"). The
 * database UUID is never accepted here and never encoded into the QR,
 * so a printed/scanned code cannot leak internal IDs.
 *
 * The encoded URL points to /verify?ref=... — a public page that requires
 * the last 4 digits of the patient phone before revealing non-PII details.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Copy, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppointmentQrDialog({
  reference,
  open,
  onClose,
}: {
  reference: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dataUrl, setDataUrl] = useState<string>("");

  const verifyUrl = useMemo(() => {
    if (typeof window === "undefined" || !reference) return "";
    const p = new URLSearchParams({ ref: reference });
    return `${window.location.origin}/verify?${p.toString()}`;
  }, [reference]);

  useEffect(() => {
    if (!open || !reference || !verifyUrl) return;
    if (canvasRef.current) {
      void QRCode.toCanvas(canvasRef.current, verifyUrl, {
        width: 240,
        margin: 1,
        errorCorrectionLevel: "M",
      });
    }
    void QRCode.toDataURL(verifyUrl, { width: 512, margin: 1 }).then(setDataUrl);
  }, [open, reference, verifyUrl]);

  if (!open || !reference) return null;

  const copyRef = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      toast.success("تم نسخ رقم الحجز");
    } catch {
      toast.error("تعذّر النسخ");
    }
  };
  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `appointment-${reference}-qr.png`;
    a.click();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="رمز التحقق من الحجز"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">رمز التحقق من الحجز</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              اعرض هذا الرمز عند الاستقبال للتحقق من موعدك.
            </p>
          </div>
          <button
            type="button"
            aria-label="إغلاق"
            onClick={onClose}
            className="p-1 rounded hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-col items-center gap-3">
          <div className="rounded-xl border p-3 bg-white">
            <canvas ref={canvasRef} className="block" />
          </div>
          <div
            className="font-mono text-sm font-bold tracking-wider text-center"
            dir="ltr"
          >
            {reference}
          </div>
          <p className="text-[11px] text-muted-foreground text-center px-2">
            يفتح الرمز صفحة تحقق تطلب آخر 4 أرقام من رقم جوّال المريض قبل عرض
            التفاصيل. لا يُكشف أي معرّف داخلي.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={copyRef}>
            <Copy className="h-4 w-4 me-1" /> نسخ الرقم
          </Button>
          <Button variant="outline" size="sm" onClick={download} disabled={!dataUrl}>
            <Download className="h-4 w-4 me-1" /> تنزيل PNG
          </Button>
        </div>
      </div>
    </div>
  );
}
