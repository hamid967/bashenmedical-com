/**
 * MediaPicker — CMS media library dialog with inline crop/resize editor.
 *
 * Lets editors browse `public.media_library`, upload a new image, and pick
 * one to attach to a CMS field. When the source is an image, the picker
 * opens an inline editor to crop (aspect presets or free) and resize
 * (max width) before saving. The final variant is uploaded as a new
 * media_library row and its `/api/public/media/...` URL is returned via
 * `onSelect`. Admin/editor role is enforced server-side by
 * `listAdminFiles`/`uploadAdminFile`.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Upload, X, Search, Loader2, Crop, Check } from "lucide-react";
import { toast } from "sonner";
import {
  listAdminFiles,
  uploadAdminFile,
} from "@/lib/admin/files.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type MediaItem = {
  id: string;
  url: string;
  file_name: string;
  alt_text: string | null;
  mime_type: string;
  is_image: boolean;
};

type EditingSource = {
  src: string; // object URL or same-origin URL for <img>
  fileName: string;
  mime: string;
  originalItem?: MediaItem; // when picked from library, allow "use as-is"
};

const ASPECTS: { label: string; value: number | null }[] = [
  { label: "حرّ", value: null },
  { label: "1:1", value: 1 },
  { label: "16:9", value: 16 / 9 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:2", value: 3 / 2 },
];

export function MediaPicker({
  value,
  onSelect,
  imagesOnly = true,
  triggerLabel = "اختيار من المكتبة",
}: {
  value?: string;
  onSelect: (item: MediaItem) => void;
  imagesOnly?: boolean;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<EditingSource | null>(null);
  const qc = useQueryClient();
  const listFn = useServerFn(listAdminFiles);
  const uploadFn = useServerFn(uploadAdminFile);
  const inputRef = useRef<HTMLInputElement>(null);

  const kind = imagesOnly ? ("image" as const) : ("all" as const);
  const query = useQuery({
    queryKey: ["media-picker", q, kind],
    queryFn: () => listFn({ data: { q: q.trim() || undefined, kind } }),
    enabled: open && !editing,
  });

  const upload = useMutation({
    mutationFn: async (args: { fileName: string; mime: string; blob: Blob }) => {
      const buf = await args.blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const b64 = btoa(binary);
      return uploadFn({
        data: {
          file_name: args.fileName,
          mime_type: args.mime,
          data_base64: b64,
        },
      });
    },
    onSuccess: (r, args) => {
      toast.success("تم حفظ الصورة");
      qc.invalidateQueries({ queryKey: ["media-picker"] });
      qc.invalidateQueries({ queryKey: ["admin-files"] });
      onSelect({
        id: r.id,
        url: r.url,
        file_name: args.fileName,
        alt_text: null,
        mime_type: args.mime,
        is_image: args.mime.startsWith("image/"),
      });
      setEditing(null);
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || "فشل الحفظ"),
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type.startsWith("image/")) {
      const src = URL.createObjectURL(file);
      setEditing({ src, fileName: file.name, mime: file.type });
    } else {
      // non-image: upload directly, no editor
      upload.mutate({ fileName: file.name, mime: file.type || "application/octet-stream", blob: file });
    }
  };

  const openEditorFromLibrary = (row: any) => {
    if (!row.is_image) {
      onSelect({
        id: row.id,
        url: row.url,
        file_name: row.file_name,
        alt_text: row.alt_text,
        mime_type: row.mime_type,
        is_image: row.is_image,
      });
      setOpen(false);
      return;
    }
    setEditing({
      src: row.url,
      fileName: row.file_name,
      mime: row.mime_type || "image/jpeg",
      originalItem: {
        id: row.id,
        url: row.url,
        file_name: row.file_name,
        alt_text: row.alt_text,
        mime_type: row.mime_type,
        is_image: row.is_image,
      },
    });
  };

  const closeEditor = () => {
    if (editing?.src?.startsWith("blob:")) URL.revokeObjectURL(editing.src);
    setEditing(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) closeEditor();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <ImagePlus className="ms-1 h-4 w-4" aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>
            {editing ? "معاينة وقصّ الصورة" : "مكتبة الوسائط"}
          </DialogTitle>
        </DialogHeader>

        {editing ? (
          <ImageEditor
            source={editing}
            busy={upload.isPending}
            onCancel={closeEditor}
            onUseOriginal={() => {
              if (editing.originalItem) {
                onSelect(editing.originalItem);
                closeEditor();
                setOpen(false);
              }
            }}
            onSave={(blob, fileName, mime) =>
              upload.mutate({ blob, fileName, mime })
            }
          />
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search
                  className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="بحث بالاسم أو النص البديل…"
                  className="pr-8"
                />
              </div>
              <input
                ref={inputRef}
                type="file"
                accept={imagesOnly ? "image/*" : undefined}
                className="hidden"
                onChange={onPick}
              />
              <Button
                type="button"
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={upload.isPending}
              >
                {upload.isPending ? (
                  <Loader2 className="ms-1 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="ms-1 h-4 w-4" aria-hidden="true" />
                )}
                رفع جديد
              </Button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {query.isLoading && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  جارِ التحميل…
                </div>
              )}
              {query.error && (
                <div className="p-6 text-center text-sm text-destructive">
                  تعذّر جلب المكتبة
                </div>
              )}
              {query.data && query.data.rows.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  لا توجد ملفات مطابقة. ارفع ملفًا جديدًا.
                </div>
              )}
              {query.data && query.data.rows.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-1">
                  {query.data.rows.map((row: any) => {
                    const active = value && row.url === value;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => openEditorFromLibrary(row)}
                        className={`group relative flex flex-col overflow-hidden rounded-md border bg-background text-start transition hover:border-primary ${
                          active ? "ring-2 ring-primary border-primary" : ""
                        }`}
                        aria-label={`اختيار ${row.file_name}`}
                      >
                        <div className="aspect-square w-full bg-muted flex items-center justify-center overflow-hidden">
                          {row.is_image ? (
                            <img
                              src={row.url}
                              alt={row.alt_text ?? row.file_name}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {row.mime_type}
                            </span>
                          )}
                        </div>
                        <div className="p-1.5 text-[11px] truncate" title={row.file_name}>
                          {row.file_name}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Inline crop/resize editor. Pure canvas — no external deps.
 * Crop rectangle is expressed as percentages of natural image size, with
 * a draggable body and an SE resize handle. Aspect presets constrain the
 * ratio when set. A "max width" input downscales the final export.
 */
function ImageEditor({
  source,
  busy,
  onCancel,
  onUseOriginal,
  onSave,
}: {
  source: EditingSource;
  busy: boolean;
  onCancel: () => void;
  onUseOriginal: () => void;
  onSave: (blob: Blob, fileName: string, mime: string) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [tainted, setTainted] = useState(false);
  const [aspect, setAspect] = useState<number | null>(null);
  // Crop rect in percent (0-100)
  const [rect, setRect] = useState({ x: 5, y: 5, w: 90, h: 90 });
  const [maxWidth, setMaxWidth] = useState<number>(1600);
  const [format, setFormat] = useState<"image/jpeg" | "image/png" | "image/webp">(
    source.mime === "image/png" ? "image/png" : "image/jpeg",
  );
  const [quality, setQuality] = useState(0.9);

  const onImgLoad = () => {
    const el = imgRef.current;
    if (!el) return;
    setNatural({ w: el.naturalWidth, h: el.naturalHeight });
    // default max width = min(natural, 1600)
    setMaxWidth(Math.min(1600, el.naturalWidth));
  };

  // Enforce aspect on rect changes
  useEffect(() => {
    if (!aspect || !natural) return;
    setRect((r) => enforceAspect(r, aspect, natural));
  }, [aspect, natural]);

  const startDrag = (
    e: React.PointerEvent,
    mode: "move" | "resize",
  ) => {
    e.preventDefault();
    const overlay = overlayRef.current;
    if (!overlay || !natural) return;
    const parent = overlay.parentElement!;
    const bounds = parent.getBoundingClientRect();
    const start = { px: e.clientX, py: e.clientY, rx: rect.x, ry: rect.y, rw: rect.w, rh: rect.h };
    (e.target as Element).setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const dx = ((ev.clientX - start.px) / bounds.width) * 100;
      const dy = ((ev.clientY - start.py) / bounds.height) * 100;
      if (mode === "move") {
        const nx = clamp(start.rx + dx, 0, 100 - start.rw);
        const ny = clamp(start.ry + dy, 0, 100 - start.rh);
        setRect({ x: nx, y: ny, w: start.rw, h: start.rh });
      } else {
        let nw = clamp(start.rw + dx, 5, 100 - start.rx);
        let nh = clamp(start.rh + dy, 5, 100 - start.ry);
        if (aspect) {
          const pxW = (nw / 100) * natural.w;
          const pxH = pxW / aspect;
          nh = (pxH / natural.h) * 100;
          if (start.ry + nh > 100) {
            nh = 100 - start.ry;
            const pxH2 = (nh / 100) * natural.h;
            const pxW2 = pxH2 * aspect;
            nw = (pxW2 / natural.w) * 100;
          }
        }
        setRect({ x: start.rx, y: start.ry, w: nw, h: nh });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const pxCrop = useMemo(() => {
    if (!natural) return null;
    return {
      x: Math.round((rect.x / 100) * natural.w),
      y: Math.round((rect.y / 100) * natural.h),
      w: Math.round((rect.w / 100) * natural.w),
      h: Math.round((rect.h / 100) * natural.h),
    };
  }, [rect, natural]);

  const outSize = useMemo(() => {
    if (!pxCrop) return null;
    const scale = Math.min(1, maxWidth / pxCrop.w);
    return {
      w: Math.max(1, Math.round(pxCrop.w * scale)),
      h: Math.max(1, Math.round(pxCrop.h * scale)),
    };
  }, [pxCrop, maxWidth]);

  const doSave = async () => {
    if (!imgRef.current || !pxCrop || !outSize) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = outSize.w;
      canvas.height = outSize.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      // Re-load with crossOrigin to avoid taint when possible
      const img = await loadImageForCanvas(source.src);
      ctx.drawImage(
        img,
        pxCrop.x,
        pxCrop.y,
        pxCrop.w,
        pxCrop.h,
        0,
        0,
        outSize.w,
        outSize.h,
      );
      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
          format,
          format === "image/png" ? undefined : quality,
        ),
      );
      const ext =
        format === "image/png" ? "png" : format === "image/webp" ? "webp" : "jpg";
      const base = source.fileName.replace(/\.[^.]+$/, "");
      const fname = `${base}-edited-${outSize.w}x${outSize.h}.${ext}`;
      onSave(blob, fname, format);
    } catch (err) {
      console.error(err);
      setTainted(true);
      toast.error("تعذّر قصّ الصورة (قد تكون من نطاق خارجي). استخدم النسخة الأصلية.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative inline-block max-w-full overflow-hidden rounded border bg-muted">
        {/* image */}
        <img
          ref={imgRef}
          src={source.src}
          alt=""
          crossOrigin="anonymous"
          onLoad={onImgLoad}
          onError={() => setTainted(true)}
          className="block max-h-[50vh] max-w-full select-none"
          draggable={false}
        />
        {/* overlay */}
        {natural && (
          <div className="pointer-events-none absolute inset-0">
            {/* dark mask outside crop */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.45))",
                clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${rect.x}% ${rect.y}%, ${rect.x}% ${rect.y + rect.h}%, ${rect.x + rect.w}% ${rect.y + rect.h}%, ${rect.x + rect.w}% ${rect.y}%, ${rect.x}% ${rect.y}%)`,
              }}
            />
            <div
              ref={overlayRef}
              onPointerDown={(e) => startDrag(e, "move")}
              className="pointer-events-auto absolute cursor-move border-2 border-primary shadow-[0_0_0_1px_rgba(255,255,255,.6)]"
              style={{
                left: `${rect.x}%`,
                top: `${rect.y}%`,
                width: `${rect.w}%`,
                height: `${rect.h}%`,
              }}
            >
              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  startDrag(e, "resize");
                }}
                className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-se-resize rounded-sm bg-primary ring-2 ring-background"
                aria-label="تغيير الحجم"
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">نسبة العرض/الارتفاع</Label>
          <div className="mt-1 flex flex-wrap gap-1">
            {ASPECTS.map((a) => (
              <Button
                key={a.label}
                type="button"
                size="sm"
                variant={aspect === a.value ? "default" : "outline"}
                onClick={() => setAspect(a.value)}
              >
                {a.label}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs" htmlFor="mw">
            أقصى عرض للتصدير (px)
          </Label>
          <Input
            id="mw"
            type="number"
            min={64}
            max={4096}
            value={maxWidth}
            onChange={(e) => setMaxWidth(Math.max(64, Number(e.target.value) || 0))}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">صيغة التصدير</Label>
          <div className="mt-1 flex gap-1">
            {(["image/jpeg", "image/webp", "image/png"] as const).map((f) => (
              <Button
                key={f}
                type="button"
                size="sm"
                variant={format === f ? "default" : "outline"}
                onClick={() => setFormat(f)}
              >
                {f.split("/")[1].toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
        {format !== "image/png" && (
          <div>
            <Label className="text-xs" htmlFor="q">
              الجودة ({Math.round(quality * 100)}%)
            </Label>
            <input
              id="q"
              type="range"
              min={0.5}
              max={1}
              step={0.05}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        {natural && pxCrop && outSize ? (
          <>
            المصدر: {natural.w}×{natural.h} · القص:{" "}
            {pxCrop.w}×{pxCrop.h} · الناتج: {outSize.w}×{outSize.h}
          </>
        ) : (
          "جارِ تحميل الصورة…"
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          إلغاء
        </Button>
        {source.originalItem && (
          <Button
            type="button"
            variant="outline"
            onClick={onUseOriginal}
            disabled={busy}
          >
            استخدام الأصل بدون تعديل
          </Button>
        )}
        <Button type="button" onClick={doSave} disabled={busy || tainted || !natural}>
          {busy ? (
            <Loader2 className="ms-1 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="ms-1 h-4 w-4" aria-hidden="true" />
          )}
          حفظ النسخة المعدّلة
        </Button>
      </div>
      {tainted && (
        <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          <Crop className="me-1 inline h-3 w-3" aria-hidden="true" />
          لا يمكن قصّ هذه الصورة من المصدر الخارجي (CORS). يمكنك استخدام الأصل كما هو.
        </div>
      )}
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function enforceAspect(
  r: { x: number; y: number; w: number; h: number },
  aspect: number,
  natural: { w: number; h: number },
) {
  const pxW = (r.w / 100) * natural.w;
  const pxH = pxW / aspect;
  let hPct = (pxH / natural.h) * 100;
  if (r.y + hPct > 100) {
    hPct = 100 - r.y;
    const pxH2 = (hPct / 100) * natural.h;
    const pxW2 = pxH2 * aspect;
    return { ...r, w: (pxW2 / natural.w) * 100, h: hPct };
  }
  return { ...r, h: hPct };
}

async function loadImageForCanvas(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

// Helper: pointer coords stored under `_` suffix keys to avoid shadowing
// the runtime `x`/`y` in the drag start snapshot.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
}

export function MediaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://… أو /api/public/media/…"
          className="flex-1 min-w-[200px]"
        />
        <MediaPicker value={value} onSelect={(item) => onChange(item.url)} />
        {value && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange("")}
            aria-label="مسح"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
      {value && (
        <div className="mt-1 inline-block overflow-hidden rounded border bg-muted">
          <img
            src={value}
            alt=""
            className="max-h-32 max-w-[240px] object-contain"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}
    </div>
  );
}
