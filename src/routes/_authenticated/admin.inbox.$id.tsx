import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getMyRoles } from "@/lib/admin.functions";
import { isActionAllowedForRoles, type StaffRole } from "@/lib/admin/inbox.functions";
import {
  getInboxItem,
  assignInboxItem,
  transferInboxItem,
  changeInboxPriority,
  changeInboxStatus,
  addInboxNote,
  contactPatientOnInbox,
  requestInboxDocuments,
  linkInboxAppointment,
  notifyInboxPatient,
  mergeInboxDuplicate,
  archiveInboxItem,
  reopenInboxItem,
  INBOX_STATUSES,
  INBOX_PRIORITIES,
  type InboxStatus,
  type InboxPriority,
  type InboxEvent,
} from "@/lib/admin/inbox.functions";
import {
  STATUS_LABELS,
  CHANNEL_LABELS,
  PRIORITY_LABELS,
  maskPhone,
} from "./admin.inbox";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/inbox/$id")({
  head: () => ({
    meta: [
      { title: "تفاصيل الطلب | الصندوق الموحّد" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل الطلب</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="container-app py-16 text-center text-sm text-muted-foreground">
      الطلب غير موجود.
    </div>
  ),
  component: InboxDetailPage,
});

function fmt(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function InboxDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const getItem = useServerFn(getInboxItem);

  const queryKey = ["admin-inbox", "item", id] as const;
  const { data } = useSuspenseQuery({
    queryKey,
    queryFn: () => getItem({ data: { id } }),
    staleTime: 10_000,
  });
  const { item, events } = data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-inbox"] });

  // ----- mutation hooks -----
  const doAssign = useServerFn(assignInboxItem);
  const doTransfer = useServerFn(transferInboxItem);
  const doPriority = useServerFn(changeInboxPriority);
  const doStatus = useServerFn(changeInboxStatus);
  const doNote = useServerFn(addInboxNote);
  const doContact = useServerFn(contactPatientOnInbox);
  const doDocs = useServerFn(requestInboxDocuments);
  const doLink = useServerFn(linkInboxAppointment);
  const doNotify = useServerFn(notifyInboxPatient);
  const doMerge = useServerFn(mergeInboxDuplicate);
  const doArchive = useServerFn(archiveInboxItem);
  const doReopen = useServerFn(reopenInboxItem);

  // ----- caller roles → UI action gating (server still re-checks) -----
  const fetchRoles = useServerFn(getMyRoles);
  const { data: rolesData } = useQuery({
    queryKey: ["my-roles"],
    queryFn: () => fetchRoles(),
    staleTime: 60_000,
  });
  const roles = (rolesData?.roles ?? []) as StaffRole[];
  const canMerge = isActionAllowedForRoles(roles, "merge_duplicate");
  const canArchive = isActionAllowedForRoles(roles, "archive");
  const canReopen = isActionAllowedForRoles(roles, "reopen");

  const [busy, setBusy] = useState<string | null>(null);
  async function run(label: string, fn: () => Promise<any>) {
    try {
      setBusy(label);
      await fn();
      toast.success("تم تنفيذ الإجراء");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر تنفيذ الإجراء");
    } finally {
      setBusy(null);
    }
  }

  // form state
  const [assignee, setAssignee] = useState<string>(item.assigned_to ?? "");
  const [department, setDepartment] = useState<string>(item.department ?? "");
  const [branch, setBranch] = useState<string>(item.branch_id ?? "");
  const [priority, setPriority] = useState<InboxPriority>(item.priority);
  const [status, setStatus] = useState<InboxStatus>(item.status);
  const [note, setNote] = useState("");
  const [contactChannel, setContactChannel] = useState<
    "phone" | "whatsapp" | "sms" | "email" | "in_person"
  >("phone");
  const [contactOutcome, setContactOutcome] = useState<
    "no_answer" | "reached" | "left_message" | "other"
  >("reached");
  const [docs, setDocs] = useState("");
  const [apptId, setApptId] = useState(item.linked_appointment_id ?? "");
  const [notifyChannel, setNotifyChannel] = useState<
    "sms" | "whatsapp" | "email" | "push"
  >("whatsapp");
  const [notifyTemplate, setNotifyTemplate] = useState("");
  const [mergeInto, setMergeInto] = useState("");

  const isArchived = item.status === "archived";

  return (
    <div className="ac-card p-6 space-y-6">
      <Link
        to="/admin/inbox"
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowRight className="h-4 w-4 rtl:rotate-180" /> عودة للصندوق الموحّد
      </Link>

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            الطلب <span className="font-mono">{item.request_number}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {CHANNEL_LABELS[item.channel]} · {fmt(item.created_at)}
          </p>
        </div>
        <div className="text-right space-y-1">
          <div className="text-xs text-muted-foreground">آخر تحديث</div>
          <div className="text-sm">{fmt(item.last_action_at ?? item.updated_at)}</div>
        </div>
      </header>

      {/* Snapshot */}
      <Card className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <Field label="المريض" value={item.patient_name ?? "—"} />
        <Field label="الجوال" value={<span className="font-mono">{maskPhone(item.patient_phone)}</span>} />
        <Field label="الخدمة" value={item.service_label ?? item.subject ?? "—"} />
        <Field label="الفرع" value={item.branch_id ?? "—"} />
        <Field label="القسم" value={item.department ?? "—"} />
        <Field label="الحالة" value={STATUS_LABELS[item.status]} />
        <Field label="الأولوية" value={PRIORITY_LABELS[item.priority]} />
        <Field
          label="الموعد المرتبط"
          value={
            item.linked_appointment_id ? (
              <Link
                to="/admin/appointments/$id"
                params={{ id: item.linked_appointment_id }}
                className="text-primary hover:underline font-mono text-xs"
              >
                {item.linked_appointment_id.slice(0, 8)}…
              </Link>
            ) : (
              "—"
            )
          }
        />
      </Card>

      {isArchived && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          هذا الطلب مؤرشف. معظم الإجراءات معطّلة — استخدم «إعادة الفتح» لاستئنافه.
        </div>
      )}

      {/* Actions grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="الإسناد">
          <Input
            placeholder="UUID المستخدم (اتركه فارغًا لإلغاء الإسناد)"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          />
          <ActionButton
            busy={busy === "assign"}
            disabled={isArchived}
            onClick={() =>
              run("assign", () =>
                doAssign({
                  data: {
                    id,
                    assignee: assignee.trim() || null,
                    note: note.trim() || undefined,
                  },
                }),
              )
            }
          >
            حفظ الإسناد
          </ActionButton>
        </Panel>

        <Panel title="التحويل (قسم/فرع)">
          <Input
            placeholder="القسم"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />
          <Input
            placeholder="UUID الفرع"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          />
          <ActionButton
            busy={busy === "transfer"}
            disabled={isArchived}
            onClick={() =>
              run("transfer", () =>
                doTransfer({
                  data: {
                    id,
                    department: department.trim() || null,
                    branch_id: branch.trim() || null,
                    note: note.trim() || undefined,
                  },
                }),
              )
            }
          >
            تحويل
          </ActionButton>
        </Panel>

        <Panel title="الأولوية">
          <Select
            value={priority}
            onValueChange={(v) => setPriority(v as InboxPriority)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {INBOX_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ActionButton
            busy={busy === "priority"}
            disabled={isArchived}
            onClick={() =>
              run("priority", () =>
                doPriority({
                  data: { id, priority, note: note.trim() || undefined },
                }),
              )
            }
          >
            تغيير الأولوية
          </ActionButton>
        </Panel>

        <Panel title="الحالة">
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as InboxStatus)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {INBOX_STATUSES.filter((s) => s !== "archived").map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ActionButton
            busy={busy === "status"}
            disabled={isArchived || status === "archived"}
            onClick={() =>
              run("status", () =>
                doStatus({
                  data: { id, status, note: note.trim() || undefined },
                }),
              )
            }
          >
            تغيير الحالة
          </ActionButton>
        </Panel>

        <Panel title="تواصل مع المريض">
          <Select
            value={contactChannel}
            onValueChange={(v) => setContactChannel(v as typeof contactChannel)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="phone">هاتف</SelectItem>
              <SelectItem value="whatsapp">واتساب</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="email">بريد إلكتروني</SelectItem>
              <SelectItem value="in_person">حضوري</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={contactOutcome}
            onValueChange={(v) => setContactOutcome(v as typeof contactOutcome)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="reached">تم التواصل</SelectItem>
              <SelectItem value="no_answer">لم يرد</SelectItem>
              <SelectItem value="left_message">تركنا رسالة</SelectItem>
              <SelectItem value="other">أخرى</SelectItem>
            </SelectContent>
          </Select>
          <ActionButton
            busy={busy === "contact"}
            disabled={isArchived}
            onClick={() =>
              run("contact", () =>
                doContact({
                  data: {
                    id,
                    channel: contactChannel,
                    outcome: contactOutcome,
                    note: note.trim() || undefined,
                  },
                }),
              )
            }
          >
            تسجيل محاولة تواصل
          </ActionButton>
        </Panel>

        <Panel title="طلب مستندات">
          <Textarea
            placeholder="مستند لكل سطر (مثال: بطاقة تأمين)"
            value={docs}
            rows={3}
            onChange={(e) => setDocs(e.target.value)}
          />
          <ActionButton
            busy={busy === "docs"}
            disabled={isArchived}
            onClick={() => {
              const docList = docs
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter(Boolean);
              if (!docList.length) {
                toast.error("أدخل مستندًا واحدًا على الأقل.");
                return;
              }
              run("docs", () =>
                doDocs({
                  data: {
                    id,
                    documents: docList,
                    note: note.trim() || undefined,
                  },
                }),
              );
            }}
          >
            طلب المستندات
          </ActionButton>
        </Panel>

        <Panel title="ربط الموعد">
          <Input
            placeholder="UUID الموعد (اتركه فارغًا لإلغاء الربط)"
            value={apptId}
            onChange={(e) => setApptId(e.target.value)}
          />
          <ActionButton
            busy={busy === "link"}
            disabled={isArchived}
            onClick={() =>
              run("link", () =>
                doLink({
                  data: {
                    id,
                    appointment_id: apptId.trim() || null,
                    note: note.trim() || undefined,
                  },
                }),
              )
            }
          >
            حفظ الربط
          </ActionButton>
        </Panel>

        <Panel title="إرسال إشعار">
          <Select
            value={notifyChannel}
            onValueChange={(v) => setNotifyChannel(v as typeof notifyChannel)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="whatsapp">واتساب</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="email">بريد إلكتروني</SelectItem>
              <SelectItem value="push">إشعار داخل التطبيق</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="اسم القالب (اختياري)"
            value={notifyTemplate}
            onChange={(e) => setNotifyTemplate(e.target.value)}
          />
          <ActionButton
            busy={busy === "notify"}
            disabled={isArchived}
            onClick={() =>
              run("notify", () =>
                doNotify({
                  data: {
                    id,
                    channel: notifyChannel,
                    template: notifyTemplate.trim() || undefined,
                    note: note.trim() || undefined,
                  },
                }),
              )
            }
          >
            تسجيل الإرسال
          </ActionButton>
        </Panel>

        {canMerge && (
        <Panel title="دمج مكرر">
          <Input
            placeholder="UUID الطلب الأصلي (سيتم دمج هذا الطلب فيه)"
            value={mergeInto}
            onChange={(e) => setMergeInto(e.target.value)}
          />
          <ActionButton
            busy={busy === "merge"}
            disabled={isArchived || !mergeInto.trim()}
            onClick={() =>
              run("merge", () =>
                doMerge({
                  data: {
                    id,
                    into_id: mergeInto.trim(),
                    note: note.trim() || undefined,
                  },
                }),
              )
            }
          >
            دمج
          </ActionButton>
        </Panel>
        )}

        {(canArchive || canReopen) && (
        <Panel title="أرشفة / إعادة فتح">
          {isArchived ? (
            canReopen && (
            <ActionButton
              busy={busy === "reopen"}
              onClick={() =>
                run("reopen", () =>
                  doReopen({ data: { id, note: note.trim() || undefined } }),
                )
              }
            >
              إعادة فتح الطلب
            </ActionButton>
            )
          ) : (
            canArchive && (
            <ActionButton
              busy={busy === "archive"}
              variant="destructive"
              onClick={() =>
                run("archive", () =>
                  doArchive({ data: { id, note: note.trim() || undefined } }),
                )
              }
            >
              أرشفة (بدون حذف)
            </ActionButton>
            )
          )}
        </Panel>
        )}
      </div>

      {/* Shared note */}
      <div className="space-y-2">
        <label className="text-sm font-medium">ملاحظة داخلية (تُلحق بأي إجراء أعلاه)</label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="اكتب ملاحظة يراها فريق العمل فقط…"
        />
        <div className="flex justify-end">
          <ActionButton
            busy={busy === "note"}
            disabled={!note.trim()}
            onClick={() =>
              run("note", async () => {
                await doNote({ data: { id, note: note.trim() } });
                setNote("");
              })
            }
          >
            حفظ ملاحظة فقط
          </ActionButton>
        </div>
      </div>

      {/* History */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">سجل الإجراءات (غير قابل للتعديل)</h2>
        {events.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            لا توجد أحداث بعد.
          </Card>
        ) : (
          <ol className="space-y-2">
            {events.map((ev: InboxEvent) => (
              <li key={ev.id} className="border rounded-md p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-semibold">{ev.action}</span>
                  <span className="text-xs text-muted-foreground">
                    {fmt(ev.created_at)} · {ev.actor_user_id ? ev.actor_user_id.slice(0, 8) : "نظام"}
                  </span>
                </div>
                {ev.note && <p className="mt-1 text-muted-foreground">{ev.note}</p>}
                {(ev.from_value || ev.to_value) && (
                  <pre className="mt-2 text-xs bg-muted/40 p-2 rounded overflow-x-auto">
{JSON.stringify({ from: ev.from_value, to: ev.to_value }, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4 space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </Card>
  );
}

function ActionButton({
  busy,
  disabled,
  onClick,
  children,
  variant,
}: {
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  variant?: "default" | "destructive";
}) {
  return (
    <Button
      type="button"
      variant={variant ?? "default"}
      disabled={busy || disabled}
      onClick={onClick}
      className="w-full"
    >
      {busy ? "جارٍ التنفيذ…" : children}
    </Button>
  );
}
