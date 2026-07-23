/**
 * Dialog to submit and track relationship verification requests for a
 * dependent. Guardians can:
 *   - Start a new verification request (relationship, ID last 4, notes)
 *   - Upload/delete supporting documents
 *   - Cancel their open request
 *   - See status timeline for previous submissions with reviewer notes
 */
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  submitDependentVerification,
  requestVerificationUploadUrl,
  registerVerificationDocument,
  deleteVerificationDocument,
  cancelVerificationRequest,
  listDependentVerificationRequests,
  VERIFICATION_LIMITS,
  type VerificationRequest,
  type VerificationStatus,
} from "@/lib/portal/dependent-verification.functions";
import type { Dependent } from "@/lib/portal/dependents.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BadgeCheck,
  Loader2,
  Paperclip,
  ShieldAlert,
  Trash2,
  Upload,
  X,
  Clock,
  FileText,
  ExternalLink,
  History,
} from "lucide-react";

const RELATION_LABEL: Record<string, string> = {
  child: "ابن/ابنة",
  spouse: "زوج/زوجة",
  parent: "والد/والدة",
  sibling: "أخ/أخت",
  other: "قريب آخر",
};

const STATUS_LABEL: Record<VerificationStatus, string> = {
  submitted: "قيد الانتظار",
  under_review: "قيد المراجعة",
  approved: "تم التوثيق",
  rejected: "مرفوض",
  cancelled: "ملغى",
};

function StatusBadge({ status }: { status: VerificationStatus }) {
  if (status === "approved")
    return (
      <Badge className="gap-1">
        <BadgeCheck className="h-3 w-3" aria-hidden /> {STATUS_LABEL[status]}
      </Badge>
    );
  if (status === "rejected")
    return (
      <Badge variant="destructive" className="gap-1">
        <ShieldAlert className="h-3 w-3" aria-hidden /> {STATUS_LABEL[status]}
      </Badge>
    );
  if (status === "cancelled")
    return <Badge variant="outline">{STATUS_LABEL[status]}</Badge>;
  return (
    <Badge variant="secondary" className="gap-1">
      <Clock className="h-3 w-3" aria-hidden /> {STATUS_LABEL[status]}
    </Badge>
  );
}

function StatusTimeline({ status }: { status: VerificationStatus }) {
  const steps: VerificationStatus[] = ["submitted", "under_review", "approved"];
  const activeIndex =
    status === "approved" ? 2 : status === "under_review" ? 1 : 0;
  const rejected = status === "rejected";
  return (
    <ol className="flex items-center gap-2">
      {steps.map((s, i) => {
        const active = !rejected && i <= activeIndex;
        return (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                rejected && i === activeIndex
                  ? "bg-destructive"
                  : active
                    ? "bg-primary"
                    : "bg-muted"
              }`}
            />
            <span
              className={`text-xs ${active ? "text-foreground" : "text-muted-foreground"}`}
            >
              {STATUS_LABEL[s]}
            </span>
            {i < steps.length - 1 ? (
              <span className="mx-1 h-px flex-1 bg-border" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 102.4) / 10} KB`;
  return `${Math.round(n / (1024 * 102.4)) / 10} MB`;
}

export function DependentVerificationDialog({
  dependent,
  open,
  onOpenChange,
}: {
  dependent: Dependent;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const queryKey = ["dependent", "verification", dependent.id];

  const requestsQ = useQuery({
    queryKey,
    queryFn: () =>
      listDependentVerificationRequests({ data: { dependent_id: dependent.id } }),
    enabled: open,
    staleTime: 15_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });
  const invalidateFamily = () =>
    qc.invalidateQueries({ queryKey: ["patient", "family"] });

  const activeReq: VerificationRequest | undefined = useMemo(
    () =>
      (requestsQ.data ?? []).find(
        (r) => r.status === "submitted" || r.status === "under_review",
      ),
    [requestsQ.data],
  );
  const history = useMemo(
    () =>
      (requestsQ.data ?? []).filter(
        (r) => r.id !== activeReq?.id && r.status !== "cancelled",
      ),
    [requestsQ.data, activeReq],
  );

  const [relationship, setRelationship] = useState<Dependent["relationship"]>(
    dependent.relationship,
  );
  const [idLast4, setIdLast4] = useState(
    (dependent.national_id ?? "").slice(-4),
  );
  const [notes, setNotes] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingName, setUploadingName] = useState<string | null>(null);

  const submitMut = useMutation({
    mutationFn: () =>
      submitDependentVerification({
        data: {
          dependent_id: dependent.id,
          relationship_claimed: relationship,
          national_id_last4: idLast4.length === 4 ? idLast4 : null,
          guardian_notes: notes.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("تم إرسال طلب التوثيق");
      setNotes("");
      invalidate();
      invalidateFamily();
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر إرسال الطلب"),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelVerificationRequest({ data: { id } }),
    onSuccess: () => {
      toast.success("تم إلغاء الطلب");
      invalidate();
      invalidateFamily();
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر الإلغاء"),
  });

  const deleteDocMut = useMutation({
    mutationFn: (id: string) => deleteVerificationDocument({ data: { id } }),
    onSuccess: () => {
      toast.success("تم حذف المرفق");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر الحذف"),
  });

  async function uploadFiles(files: FileList | null) {
    if (!files || !activeReq) return;
    for (const f of Array.from(files)) {
      if (f.size > VERIFICATION_LIMITS.maxBytes) {
        toast.error(`${f.name}: الحجم يتجاوز 10 ميغابايت`);
        continue;
      }
      if (
        !VERIFICATION_LIMITS.allowedContentTypes.includes(f.type.toLowerCase())
      ) {
        toast.error(`${f.name}: نوع الملف غير مسموح`);
        continue;
      }
      try {
        setUploadingName(f.name);
        const signed = await requestVerificationUploadUrl({
          data: {
            request_id: activeReq.id,
            content_type: f.type,
            size_bytes: f.size,
          },
        });
        const put = await fetch(signed.upload_url, {
          method: "PUT",
          headers: { "Content-Type": f.type },
          body: f,
        });
        if (!put.ok) throw new Error(`رفع الملف فشل (${put.status})`);
        await registerVerificationDocument({
          data: {
            request_id: activeReq.id,
            storage_path: signed.storage_path,
            file_name: f.name,
            content_type: f.type,
            size_bytes: f.size,
          },
        });
        toast.success(`تم رفع ${f.name}`);
        invalidate();
      } catch (e: any) {
        toast.error(e?.message ?? `تعذّر رفع ${f.name}`);
      } finally {
        setUploadingName(null);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>توثيق صلة القرابة — {dependent.full_name}</DialogTitle>
          <DialogDescription>
            أرسل نسخة من وثيقة تُثبت الصلة (بطاقة عائلة، شهادة ميلاد، إلخ). يراجع فريق الاستقبال الطلب خلال 24 ساعة.
          </DialogDescription>
        </DialogHeader>

        {requestsQ.isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          </div>
        ) : activeReq ? (
          <ActiveRequestView
            req={activeReq}
            fileRef={fileRef}
            uploadingName={uploadingName}
            onUpload={uploadFiles}
            onDeleteDoc={(id) => deleteDocMut.mutate(id)}
            onCancel={() => cancelMut.mutate(activeReq.id)}
            cancelling={cancelMut.isPending}
          />
        ) : (
          <NewRequestForm
            relationship={relationship}
            setRelationship={setRelationship}
            idLast4={idLast4}
            setIdLast4={setIdLast4}
            notes={notes}
            setNotes={setNotes}
          />
        )}

        {history.length > 0 ? (
          <section className="border-t pt-3">
            <h4 className="mb-2 flex items-center gap-1 text-sm font-semibold text-muted-foreground">
              <History className="h-3.5 w-3.5" aria-hidden /> سجل الطلبات السابقة
            </h4>
            <ul className="space-y-2 max-h-40 overflow-y-auto">
              {history.map((h) => (
                <li key={h.id} className="rounded-md border p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <StatusBadge status={h.status} />
                    <span className="text-muted-foreground">
                      {new Date(h.created_at).toLocaleDateString("ar-SA")}
                    </span>
                  </div>
                  {h.decision_notes ? (
                    <p className="mt-1 text-muted-foreground">
                      ملاحظة المراجع: {h.decision_notes}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <DialogFooter>
          {activeReq ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              إغلاق
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitMut.isPending}
              >
                إلغاء
              </Button>
              <Button
                onClick={() => submitMut.mutate()}
                disabled={submitMut.isPending}
              >
                {submitMut.isPending ? (
                  <Loader2 className="me-1 h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                إرسال طلب التوثيق
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewRequestForm({
  relationship,
  setRelationship,
  idLast4,
  setIdLast4,
  notes,
  setNotes,
}: {
  relationship: Dependent["relationship"];
  setRelationship: (v: Dependent["relationship"]) => void;
  idLast4: string;
  setIdLast4: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
}) {
  return (
    <div className="grid gap-3 py-1">
      <div className="grid gap-1.5">
        <Label>صلة القرابة المُعلنة</Label>
        <Select value={relationship} onValueChange={(v) => setRelationship(v as any)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(RELATION_LABEL).map(([v, l]) => (
              <SelectItem key={v} value={v}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="idlast4">آخر 4 أرقام من الهوية</Label>
        <Input
          id="idlast4"
          inputMode="numeric"
          maxLength={4}
          value={idLast4}
          onChange={(e) => setIdLast4(e.target.value.replace(/\D/g, ""))}
          dir="ltr"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="notes">ملاحظات (اختياري)</Label>
        <Textarea
          id="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
          placeholder="أي تفاصيل مفيدة لفريق المراجعة"
        />
      </div>
      <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
        بعد إرسال الطلب ستتمكن من رفع الوثائق الداعمة (حتى {VERIFICATION_LIMITS.maxDocs} ملفات).
      </p>
    </div>
  );
}

function ActiveRequestView({
  req,
  fileRef,
  uploadingName,
  onUpload,
  onDeleteDoc,
  onCancel,
  cancelling,
}: {
  req: VerificationRequest;
  fileRef: React.RefObject<HTMLInputElement | null>;
  uploadingName: string | null;
  onUpload: (files: FileList | null) => void;
  onDeleteDoc: (id: string) => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  return (
    <div className="grid gap-4 py-1">
      <StatusTimeline status={req.status} />

      <div className="grid grid-cols-2 gap-2 rounded-md border p-3 text-xs">
        <div>
          <div className="text-muted-foreground">الصلة</div>
          <div className="font-medium">
            {RELATION_LABEL[req.relationship_claimed] ?? req.relationship_claimed}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">تاريخ الإرسال</div>
          <div className="font-medium">
            {new Date(req.created_at).toLocaleString("ar-SA")}
          </div>
        </div>
        {req.national_id_last4 ? (
          <div>
            <div className="text-muted-foreground">آخر 4 أرقام</div>
            <div className="font-mono" dir="ltr">
              ****{req.national_id_last4}
            </div>
          </div>
        ) : null}
        {req.guardian_notes ? (
          <div className="col-span-2">
            <div className="text-muted-foreground">ملاحظاتك</div>
            <div>{req.guardian_notes}</div>
          </div>
        ) : null}
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="flex items-center gap-1 text-sm font-semibold">
            <Paperclip className="h-3.5 w-3.5" aria-hidden /> الوثائق ({req.documents.length}/
            {VERIFICATION_LIMITS.maxDocs})
          </h4>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={
              !!uploadingName ||
              req.documents.length >= VERIFICATION_LIMITS.maxDocs
            }
          >
            {uploadingName ? (
              <Loader2 className="me-1 h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <Upload className="me-1 h-3 w-3" aria-hidden />
            )}
            رفع ملف
          </Button>
          <input
            ref={fileRef}
            type="file"
            hidden
            multiple
            accept={VERIFICATION_LIMITS.allowedAcceptAttr}
            onChange={(e) => onUpload(e.target.files)}
          />
        </div>

        {req.documents.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
            لم يتم رفع أي وثيقة بعد. أضف بطاقة العائلة أو أي مستند يُثبت الصلة.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {req.documents.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-md border p-2 text-xs"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{d.file_name}</span>
                  <span className="text-muted-foreground">
                    ({formatBytes(d.size_bytes)})
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {d.download_url ? (
                    <a
                      href={d.download_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded p-1 hover:bg-muted"
                      aria-label="فتح"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex items-center rounded p-1 text-destructive hover:bg-destructive/10"
                    onClick={() => onDeleteDoc(d.id)}
                    aria-label="حذف"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex justify-end">
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={onCancel}
          disabled={cancelling}
        >
          {cancelling ? (
            <Loader2 className="me-1 h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <X className="me-1 h-3 w-3" aria-hidden />
          )}
          إلغاء الطلب
        </Button>
      </div>
    </div>
  );
}
