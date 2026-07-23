/**
 * Phase 5 — secure report viewer dialog.
 *
 * Opens a short-lived signed URL (server-issued, 60s TTL) inside an iframe
 * for in-portal preview and offers a signed download. Every open / download
 * attempt is audit-logged server-side by getMyMedicalReportFileUrl.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, ExternalLink, Eye, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getMyMedicalReportFileUrl } from "@/lib/portal/reports.functions";

export function ReportViewerDialog({
  reportId,
  title,
}: {
  reportId: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [expires, setExpires] = useState<number | null>(null);

  const getUrl = useServerFn(getMyMedicalReportFileUrl);
  const preview = useMutation({
    mutationFn: () => getUrl({ data: { id: reportId } }),
    onSuccess: (res: { url: string; expiresIn: number }) => {
      setUrl(res.url);
      setExpires(Date.now() + res.expiresIn * 1000);
    },
    onError: (e: unknown) => toast.error((e as Error).message || "تعذر فتح التقرير."),
  });

  const download = useMutation({
    mutationFn: () => getUrl({ data: { id: reportId } }),
    onSuccess: (res: { url: string }) => {
      const a = document.createElement("a");
      a.href = res.url;
      a.rel = "noopener noreferrer";
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("تم إصدار رابط تحميل موقّع.");
    },
    onError: (e: unknown) => toast.error((e as Error).message || "تعذر التحميل."),
  });

  function handleOpen(next: boolean) {
    setOpen(next);
    if (next && !url) preview.mutate();
    if (!next) {
      setUrl(null);
      setExpires(null);
    }
  }

  const secondsLeft = expires
    ? Math.max(0, Math.floor((expires - Date.now()) / 1000))
    : null;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Eye className="me-1 h-3 w-3" aria-hidden />
          فتح آمن
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            {title}
          </DialogTitle>
          <DialogDescription>
            رابط مؤقت وموقّع، صالح لمدة قصيرة. كل عملية فتح أو تحميل مُسجّلة في سجل الوصول.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[420px] rounded-md border bg-muted/30">
          {preview.isPending && (
            <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
              جارٍ إصدار رابط الفتح الآمن…
            </div>
          )}
          {url && (
            <iframe
              src={url}
              title={title}
              className="h-[520px] w-full rounded-md"
              sandbox="allow-same-origin allow-scripts"
            />
          )}
          {!preview.isPending && !url && preview.isError && (
            <div className="flex h-[420px] items-center justify-center text-sm text-destructive">
              تعذر تحميل المعاينة.
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {secondsLeft != null ? `الرابط ينتهي خلال ~${secondsLeft} ثانية` : ""}
          </div>
          <div className="flex gap-2">
            {url && (
              <Button size="sm" variant="ghost" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="me-1 h-3 w-3" aria-hidden />
                  فتح في نافذة
                </a>
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => download.mutate()}
              disabled={download.isPending}
            >
              <Download className="me-1 h-3 w-3" aria-hidden />
              تحميل موقّع
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
