/**
 * MediaPicker — modal that lists images from the owner Media Library and
 * lets the caller upload a new one. Used from the page editor.
 *
 * Props:
 *  - open / onOpenChange: dialog control.
 *  - onPick: called with the public URL when the user selects an image.
 */
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listOwnerMedia,
  uploadOwnerMedia,
} from "@/lib/owner/media.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Upload, ImagePlus } from "lucide-react";

export type PickedMedia = { url: string; alt: string; file_name: string };

type Item = {
  id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  alt_text: string | null;
  url: string;
};

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function MediaPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (media: PickedMedia) => void;
}) {
  const listFn = useServerFn(listOwnerMedia);
  const uploadFn = useServerFn(uploadOwnerMedia);

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [alt, setAlt] = useState("");
  const [selected, setSelected] = useState<Item | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setLoading(true);
    try {
      const rows: any = await listFn({});
      setItems(rows as Item[]);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر تحميل الوسائط");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      setSelected(null);
      setAlt("");
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const data_base64 = await fileToBase64(file);
      const row: any = await uploadFn({
        data: {
          file_name: file.name,
          mime_type: file.type || "application/octet-stream",
          data_base64,
          alt_text: "",
        },
      });
      toast.success("تم رفع الصورة");
      setItems((xs) => [row as Item, ...xs]);
      setSelected(row as Item);
      setAlt("");
    } catch (err: any) {
      toast.error(err?.message ?? "تعذّر الرفع");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function confirm() {
    if (!selected) return;
    onPick({
      url: selected.url,
      alt: alt || selected.alt_text || selected.file_name,
      file_name: selected.file_name,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>مكتبة الوسائط</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 pb-3 border-b">
          <div className="text-sm text-slate-500">
            اختر صورة من المكتبة أو ارفع صورة جديدة (PNG/JPG/WEBP/GIF/SVG · أقصى 8MB).
          </div>
          <div>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              className="hidden"
              onChange={onFile}
            />
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              size="sm"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Upload className="h-4 w-4 ml-1" />}
              رفع صورة
            </Button>
          </div>
        </div>

        <div className="min-h-[280px] max-h-[420px] overflow-auto py-3">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin ml-2" /> جاري التحميل…
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <ImagePlus className="h-8 w-8 mb-2 opacity-60" />
              لا توجد صور بعد. ارفع أول صورة للبدء.
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {items.map((it) => {
                const active = selected?.id === it.id;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => {
                      setSelected(it);
                      setAlt(it.alt_text ?? "");
                    }}
                    className={`group relative aspect-square rounded-lg border overflow-hidden bg-slate-50 transition ${
                      active ? "ring-2 ring-primary border-primary" : "hover:border-slate-400"
                    }`}
                    title={it.file_name}
                  >
                    <img
                      src={it.url}
                      alt={it.alt_text ?? it.file_name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-black/50 text-white text-[10px] px-1 py-0.5 truncate">
                      {it.file_name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selected && (
          <div className="pt-3 border-t space-y-2">
            <Label className="text-xs">نص بديل (Alt) — مهم لـ SEO وإمكانية الوصول</Label>
            <Input
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder={selected.file_name}
              maxLength={200}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={confirm} disabled={!selected}>إدراج الصورة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
