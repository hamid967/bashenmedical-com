import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { bmcOgImageMeta } from "@/lib/og-meta";

const DEFAULT_OWNER = "hamid967";
const DEFAULT_REPO = "https-bashenmedical-com";
const DEFAULT_BRANCH = "main";
const STORAGE_KEY = "github-settings";

const schema = z.object({
  owner: z
    .string()
    .trim()
    .min(1, { message: "المالك مطلوب" })
    .max(39, { message: "المالك طويل جداً" })
    .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/, {
      message: "اسم المالك غير صالح",
    }),
  repo: z
    .string()
    .trim()
    .min(1, { message: "اسم المستودع مطلوب" })
    .max(100, { message: "اسم المستودع طويل جداً" })
    .regex(/^[a-zA-Z0-9._-]+$/, { message: "اسم المستودع غير صالح" }),
  branch: z
    .string()
    .trim()
    .min(1, { message: "اسم الفرع مطلوب" })
    .max(100, { message: "اسم الفرع طويل جداً" })
    .regex(/^[a-zA-Z0-9._/-]+$/, { message: "اسم الفرع غير صالح" }),
});

type Settings = z.infer<typeof schema>;

export const Route = createFileRoute("/settings/github")({
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "إعدادات GitHub — Baeshen Medical" },
      { name: "description", content: "عرض وتعديل مستودع GitHub والفرع المستخدم للتزامن." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GitHubSettingsPage,
});

function loadSettings(): Settings {
  if (typeof window === "undefined") {
    return { owner: DEFAULT_OWNER, repo: DEFAULT_REPO, branch: DEFAULT_BRANCH };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = schema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    }
  } catch {
    /* ignore */
  }
  return { owner: DEFAULT_OWNER, repo: DEFAULT_REPO, branch: DEFAULT_BRANCH };
}

function GitHubSettingsPage() {
  const [values, setValues] = useState<Settings>({
    owner: DEFAULT_OWNER,
    repo: DEFAULT_REPO,
    branch: DEFAULT_BRANCH,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Settings, string>>>({});
  const [saved, setSaved] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setValues(loadSettings());
    setHydrated(true);
  }, []);

  const repoFull = `${values.owner}/${values.repo}`;
  const repoUrl = `https://github.com/${repoFull}`;

  const update = (key: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setSaved(false);
  };

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    const result = schema.safeParse(values);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof Settings, string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof Settings;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setValues(result.data);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(result.data));
    setSaved(true);
  };

  const onReset = () => {
    const defaults = { owner: DEFAULT_OWNER, repo: DEFAULT_REPO, branch: DEFAULT_BRANCH };
    setValues(defaults);
    setErrors({});
    window.localStorage.removeItem(STORAGE_KEY);
    setSaved(true);
  };

  return (
    <div className="container mx-auto max-w-2xl px-4 py-10" dir="rtl">
      <h1 className="text-3xl font-bold mb-2">إعدادات GitHub</h1>
      <p className="text-muted-foreground mb-8">
        عدّل اسم مستودع GitHub والفرع المستخدم للتزامن. يتم حفظ القيم محلياً في متصفحك فقط.
      </p>

      <div className="rounded-lg border bg-card p-6 space-y-6 mb-6">
        <div>
          <div className="text-sm text-muted-foreground mb-1">المستودع الحالي</div>
          <div className="font-mono text-lg font-semibold">{repoFull}</div>
          <a
            href={repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline mt-1 inline-block"
          >
            فتح المستودع على GitHub ↗
          </a>
        </div>
        <div className="border-t pt-4">
          <div className="text-sm text-muted-foreground mb-1">الفرع الحالي</div>
          <div className="font-mono text-lg font-semibold">
            <span className="inline-block rounded bg-muted px-2 py-1">{values.branch}</span>
          </div>
        </div>
      </div>

      <form onSubmit={onSave} className="rounded-lg border bg-card p-6 space-y-4">
        <h2 className="text-xl font-semibold mb-2">تعديل القيم</h2>

        <div>
          <label htmlFor="owner" className="block text-sm font-medium mb-1">
            المالك (Owner)
          </label>
          <input
            id="owner"
            type="text"
            value={values.owner}
            onChange={update("owner")}
            maxLength={39}
            className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
            dir="ltr"
          />
          {errors.owner && <p className="text-sm text-destructive mt-1">{errors.owner}</p>}
        </div>

        <div>
          <label htmlFor="repo" className="block text-sm font-medium mb-1">
            اسم المستودع (Repository)
          </label>
          <input
            id="repo"
            type="text"
            value={values.repo}
            onChange={update("repo")}
            maxLength={100}
            className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
            dir="ltr"
          />
          {errors.repo && <p className="text-sm text-destructive mt-1">{errors.repo}</p>}
        </div>

        <div>
          <label htmlFor="branch" className="block text-sm font-medium mb-1">
            الفرع (Branch)
          </label>
          <input
            id="branch"
            type="text"
            value={values.branch}
            onChange={update("branch")}
            maxLength={100}
            className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
            dir="ltr"
          />
          {errors.branch && <p className="text-sm text-destructive mt-1">{errors.branch}</p>}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={!hydrated}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            حفظ
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            استعادة الافتراضي
          </button>
          {saved && <span className="text-sm text-green-600">تم الحفظ ✓</span>}
        </div>

        <p className="text-xs text-muted-foreground pt-2 border-t">
          ملاحظة: الحفظ محلي في متصفحك فقط ولا يغيّر ربط Lovable بـ GitHub الفعلي.
        </p>
      </form>
    </div>
  );
}
