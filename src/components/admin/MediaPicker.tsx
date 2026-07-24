/**
 * MediaPicker — CMS media library dialog.
 *
 * Lets editors browse `public.media_library`, upload a new image, and pick
 * one to attach to a CMS field. Returns the public `/api/public/media/...`
 * URL via `onSelect`. Admin/editor role is enforced server-side by
 * `listAdminFiles`/`uploadAdminFile`.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { ImagePlus, Upload, X, Search, Loader2 } from "lucide-react";
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

export type MediaItem = {
  id: string;
  url: string;
  file_name: string;
  alt_text: string | null;
  mime_type: string;
  is_image: boolean;
};

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
  const qc = useQueryClient();
  const listFn = useServerFn(listAdminFiles);
  const uploadFn = useServerFn(uploadAdminFile);
  const inputRef = useRef<HTMLInputElement>(null);

  const kind = imagesOnly ? ("image" as const) : ("all" as const);
  const query = useQuery({
    queryKey: ["media-picker", q, kind],
    queryFn: () => listFn({ data: { q: q.trim() || undefined, kind } }),
    enabled: open,
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const b64 = btoa(binary);
      return uploadFn({
        data: {
          file_name: file.name,
          mime_type: file.type || "application/octet-stream",
          data_base64: b64,
        },
      });
    },
    onSuccess: (r, file) => {
      toast.success("تم رفع الملف");
      qc.invalidateQueries({ queryKey: ["media-picker"] });
      qc.invalidateQueries({ queryKey: ["admin-files"] });
      onSelect({
        id: r.id,
        url: r.url,
        file_name: file.name,
        alt_text: null,
        mime_type: file.type || "application/octet-stream",
        is_image: (file.type || "").startsWith("image/"),
      });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || "فشل الرفع"),
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload.mutate(file);
    e.target.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <ImagePlus className="ms-1 h-4 w-4" aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>مكتبة الوسائط</DialogTitle>
        </DialogHeader>

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
                    onClick={() => {
                      onSelect({
                        id: row.id,
                        url: row.url,
                        file_name: row.file_name,
                        alt_text: row.alt_text,
                        mime_type: row.mime_type,
                        is_image: row.is_image,
                      });
                      setOpen(false);
                    }}
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
      </DialogContent>
    </Dialog>
  );
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
