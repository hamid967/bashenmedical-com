/**
 * Phase 5 — /patient/family — in-portal dependents CRUD + booking gate.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  queryOptions,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listDependents,
  createDependent,
  updateDependent,
  deleteDependent,
  type Dependent,
} from "@/lib/portal/dependents.functions";
import { DependentVerificationDialog } from "@/components/patient/DependentVerificationDialog";
import { EmptyState, LoadingState } from "@/components/states";
import { InlineStateBanner } from "@/components/states/InlineStateBanner";
import { patientRouteStates } from "@/components/states/patient-route-states";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Users,
  UserPlus,
  Pencil,
  Trash2,
  CalendarPlus,
  BadgeCheck,
  ShieldAlert,
  Loader2,
} from "lucide-react";

const dependentsQuery = queryOptions({
  queryKey: ["patient", "family"],
  queryFn: () => listDependents(),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/patient/family")({
  loader: ({ context }) => context.queryClient.ensureQueryData(dependentsQuery),
  head: () => ({
    meta: [
      { title: "أفراد الأسرة | بوابة المريض" },
      { name: "description", content: "إدارة أفراد الأسرة والتوابع والحجز نيابةً عنهم." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FamilyPage,
  ...patientRouteStates({ skeleton: "list", rows: 3 }),
});

const RELATION_LABEL: Record<string, string> = {
  child: "ابن/ابنة",
  spouse: "زوج/زوجة",
  parent: "والد/والدة",
  sibling: "أخ/أخت",
  other: "قريب آخر",
};

type FormState = {
  full_name: string;
  relationship: Dependent["relationship"];
  gender: "male" | "female" | "";
  date_of_birth: string;
  national_id: string;
  phone: string;
};

const emptyForm: FormState = {
  full_name: "",
  relationship: "child",
  gender: "",
  date_of_birth: "",
  national_id: "",
  phone: "",
};

function toPayload(f: FormState) {
  return {
    full_name: f.full_name.trim(),
    relationship: f.relationship,
    gender: f.gender ? f.gender : null,
    date_of_birth: f.date_of_birth || null,
    national_id: f.national_id.trim() || null,
    phone: f.phone.trim() || null,
  };
}

function FamilyPage() {
  const { data } = useSuspenseQuery(dependentsQuery);
  const items = (data ?? []) as Dependent[];
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [dialogMode, setDialogMode] = useState<"closed" | "create" | "edit">("closed");
  const [editing, setEditing] = useState<Dependent | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState<Dependent | null>(null);
  const [verifyFor, setVerifyFor] = useState<Dependent | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["patient", "family"] });

  const createMut = useMutation({
    mutationFn: (v: FormState) => createDependent({ data: toPayload(v) as any }),
    onSuccess: () => {
      toast.success("تمت إضافة التابع");
      setDialogMode("closed");
      setForm(emptyForm);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذر إضافة التابع"),
  });

  const updateMut = useMutation({
    mutationFn: (v: FormState & { id: string }) =>
      updateDependent({ data: { id: v.id, ...toPayload(v) } as any }),
    onSuccess: () => {
      toast.success("تم تحديث البيانات");
      setDialogMode("closed");
      setEditing(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذر التحديث"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteDependent({ data: { id } }),
    onSuccess: () => {
      toast.success("تم حذف التابع");
      setConfirmDelete(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذر الحذف"),
  });


  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogMode("create");
  };
  const openEdit = (d: Dependent) => {
    setEditing(d);
    setForm({
      full_name: d.full_name ?? "",
      relationship: d.relationship,
      gender: (d.gender as any) ?? "",
      date_of_birth: d.date_of_birth ?? "",
      national_id: d.national_id ?? "",
      phone: d.phone ?? "",
    });
    setDialogMode("edit");
  };

  const bookFor = (d: Dependent) => {
    navigate({ to: "/book", search: { subject: d.id } as any });
  };

  const submit = () => {
    if (!form.full_name.trim() || form.full_name.trim().length < 2) {
      toast.error("الاسم مطلوب");
      return;
    }
    if (dialogMode === "create") createMut.mutate(form);
    else if (dialogMode === "edit" && editing) updateMut.mutate({ ...form, id: editing.id });
  };

  const busy = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">أفراد الأسرة</h1>
        <Button size="sm" onClick={openCreate}>
          <UserPlus className="me-1 h-4 w-4" aria-hidden />
          إضافة تابع
        </Button>
      </header>

      {deleteMut.error ? (
        <InlineStateBanner
          error={deleteMut.error}
          onRetry={() => confirmDelete && deleteMut.mutate(confirmDelete.id)}
        />
      ) : null}


      {items.length === 0 ? (
        <EmptyState
          title="لا يوجد أفراد أسرة مضافون"
          description="أضف أحد أفراد أسرتك لإدارة مواعيده وحجوزاته."
          action={
            <Button onClick={openCreate}>
              <UserPlus className="me-1 h-4 w-4" aria-hidden />
              إضافة تابع
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((d) => {
            const verified = d.verification_status === "verified" || d.verified;
            const canBook = verified && d.access_scopes?.booking !== false;
            return (
              <Card key={d.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary">
                      <Users className="h-5 w-5" aria-hidden />
                    </div>
                    <div>
                      <div className="font-semibold">{d.full_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {RELATION_LABEL[d.relationship] ?? d.relationship}
                        {d.date_of_birth ? ` · ${d.date_of_birth}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {verified ? (
                      <Badge className="gap-1">
                        <BadgeCheck className="h-3 w-3" aria-hidden />
                        موثّق
                      </Badge>
                    ) : d.verification_status === "rejected" ? (
                      <Badge variant="destructive" className="gap-1">
                        <ShieldAlert className="h-3 w-3" aria-hidden />
                        مرفوض
                      </Badge>
                    ) : (
                      <Badge variant="outline">قيد التحقق</Badge>
                    )}

                    {canBook ? (
                      <Button size="sm" onClick={() => bookFor(d)}>
                        <CalendarPlus className="me-1 h-4 w-4" aria-hidden />
                        احجز لهذا التابع
                      </Button>
                    ) : !verified ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setVerifyFor(d)}
                      >
                        {d.verification_status === "pending"
                          ? "متابعة طلب التوثيق"
                          : "طلب توثيق"}
                      </Button>
                    ) : null}

                    <Button size="sm" variant="outline" onClick={() => openEdit(d)}>
                      <Pencil className="me-1 h-3 w-3" aria-hidden />
                      تعديل
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setConfirmDelete(d)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={dialogMode !== "closed"}
        onOpenChange={(o) => {
          if (!o) {
            setDialogMode("closed");
            setEditing(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialogMode === "edit" ? "تعديل بيانات التابع" : "إضافة تابع"}</DialogTitle>
            <DialogDescription>
              أدخل بيانات فرد الأسرة. التحقق من صلة القرابة يتم عبر الاستقبال قبل تفعيل الحجز.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="full_name">الاسم الكامل *</Label>
              <Input
                id="full_name"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                maxLength={120}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>صلة القرابة *</Label>
                <Select
                  value={form.relationship}
                  onValueChange={(v) => setForm({ ...form, relationship: v as any })}
                >
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
                <Label>الجنس</Label>
                <Select
                  value={form.gender || undefined}
                  onValueChange={(v) => setForm({ ...form, gender: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">ذكر</SelectItem>
                    <SelectItem value="female">أنثى</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="dob">تاريخ الميلاد</Label>
                <Input
                  id="dob"
                  type="date"
                  value={form.date_of_birth}
                  onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="nid">رقم الهوية</Label>
                <Input
                  id="nid"
                  inputMode="numeric"
                  pattern="\d{10}"
                  maxLength={10}
                  value={form.national_id}
                  onChange={(e) =>
                    setForm({ ...form, national_id: e.target.value.replace(/\D/g, "") })
                  }
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="phone">رقم الجوال</Label>
              <Input
                id="phone"
                type="tel"
                dir="ltr"
                placeholder="05XXXXXXXX"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode("closed")} disabled={busy}>
              إلغاء
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="me-1 h-4 w-4 animate-spin" aria-hidden /> : null}
              {dialogMode === "edit" ? "حفظ" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف التابع؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إزالة {confirmDelete?.full_name} من قائمة أفراد أسرتك. لا يمكن التراجع عن هذه العملية.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && deleteMut.mutate(confirmDelete.id)}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? (
                <Loader2 className="me-1 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {verifyFor ? (
        <DependentVerificationDialog
          dependent={verifyFor}
          open={!!verifyFor}
          onOpenChange={(o) => !o && setVerifyFor(null)}
        />
      ) : null}
    </div>
  );
}
