/**
 * /admin/release-gate — Single-pane view of the Production Release Gate.
 *
 * Fetches the machine-readable `/release-status.json` artifact produced by
 * the CI job `.github/workflows/deploy-netlify.yml → release-gate` and
 * renders each NO-GO condition with pass / fail / warn / unknown, staleness,
 * detail, and evidence link. When the verdict is `NO_GO`, deploy is blocked
 * — this page is the single source of truth the release captain consults.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Info,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { evaluateGate, type CheckResult, type GateEvaluation } from "@/lib/release/gate";

export const Route = createFileRoute("/_authenticated/admin/release-gate")({
  head: () => ({
    meta: [
      { title: "بوابة الإصدار — لوحة الإدارة | مجمع باعشن الطبي" },
      {
        name: "description",
        content: "حالة شروط بوابة النشر إلى الإنتاج: Pentest وDR وCAPTCHA والاختبارات والاعتمادات.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "بوابة الإصدار — لوحة الإدارة" },
      {
        property: "og:description",
        content: "لوحة موحدة لشروط GO/NO-GO لنشر الإنتاج.",
      },
      { property: "og:url", content: "https://bashenmedical.com/admin/release-gate" },
    ],
    links: [{ rel: "canonical", href: "https://bashenmedical.com/admin/release-gate" }],
  }),
  component: ReleaseGatePage,
});

interface ReleaseStatusFile {
  generatedAt: string;
  commitSha: string | null;
  runId: string | null;
  runUrl: string | null;
  evaluation: GateEvaluation;
}

function formatAge(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function StatusPill({ status, stale }: { status: CheckResult["effectiveStatus"]; stale: boolean }) {
  const map = {
    pass: {
      cls: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      label: "PASS",
    },
    fail: {
      cls: "bg-rose-50 text-rose-700 ring-rose-200",
      icon: <XCircle className="h-3.5 w-3.5" />,
      label: "FAIL",
    },
    warn: {
      cls: "bg-amber-50 text-amber-800 ring-amber-200",
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      label: "WARN",
    },
    unknown: {
      cls: "bg-slate-100 text-slate-700 ring-slate-200",
      icon: <Info className="h-3.5 w-3.5" />,
      label: "UNKNOWN",
    },
  }[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${map.cls}`}
    >
      {map.icon}
      {map.label}
      {stale ? <span className="ms-1 text-[10px] font-normal opacity-70">(stale)</span> : null}
    </span>
  );
}

function VerdictBanner({ evaluation }: { evaluation: GateEvaluation }) {
  const go = evaluation.verdict === "GO";
  return (
    <div
      className={`rounded-xl border p-4 ${
        go ? "border-emerald-300 bg-emerald-50" : "border-rose-300 bg-rose-50"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        {go ? (
          <ShieldCheck className="h-6 w-6 text-emerald-700" />
        ) : (
          <ShieldAlert className="h-6 w-6 text-rose-700" />
        )}
        <div>
          <div className={`text-lg font-bold ${go ? "text-emerald-900" : "text-rose-900"}`}>
            {go ? "GO — Production deploy مسموح" : "NO-GO — Production deploy محظور"}
          </div>
          <div className="text-sm text-slate-700">
            آخر تقييم: {new Date(evaluation.evaluatedAt).toLocaleString("en-GB")}
            {evaluation.blockingFailures.length > 0
              ? ` · مانع: ${evaluation.blockingFailures.join(", ")}`
              : ""}
            {evaluation.advisoryWarnings.length > 0
              ? ` · تنبيه: ${evaluation.advisoryWarnings.join(", ")}`
              : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReleaseGatePage() {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; data: ReleaseStatusFile }
    | { kind: "empty"; evaluation: GateEvaluation }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  async function load() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/release-status.json", { cache: "no-store" });
      if (res.status === 404) {
        // No CI artifact yet — show an evaluation over "unknown" inputs so the page
        // still communicates NO-GO with a clear reason.
        const evaluation = evaluateGate(
          [
            { id: "pentest" },
            { id: "dr_drill" },
            { id: "captcha" },
            { id: "unit_tests" },
            { id: "eslint" },
            { id: "staging_approval" },
          ],
          Date.now(),
        );
        setState({ kind: "empty", evaluation });
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ReleaseStatusFile;
      setState({ kind: "ready", data });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "unknown error" });
    }
  }

  useEffect(() => {
    load();
  }, []);

  const evaluation =
    state.kind === "ready" ? state.data.evaluation : state.kind === "empty" ? state.evaluation : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8" dir="rtl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">بوابة الإصدار (Release Gate)</h1>
          <p className="text-sm text-slate-600">
            شروط NO-GO لأي نشر إلى الإنتاج. أي شرط blocking غير <code>pass</code> يوقف الـDeploy تلقائيًا.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" /> تحديث
        </button>
      </header>

      {state.kind === "loading" ? <p className="text-slate-600">جاري التحميل…</p> : null}

      {state.kind === "error" ? (
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-rose-900">
          فشل تحميل حالة البوابة: {state.message}
        </div>
      ) : null}

      {evaluation ? (
        <>
          <VerdictBanner evaluation={evaluation} />

          {state.kind === "empty" ? (
            <p className="mt-3 text-sm text-slate-600">
              لم تُنتَج <code>public/release-status.json</code> بعد. شغّل الـCI أو ارفع الشروط يدويًا عبر
              <code> workflow_dispatch</code>.
            </p>
          ) : null}

          <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-start text-slate-600">
                <tr>
                  <th className="p-3 text-start">الشرط</th>
                  <th className="p-3 text-start">الأهمية</th>
                  <th className="p-3 text-start">الحالة</th>
                  <th className="p-3 text-start">آخر قياس</th>
                  <th className="p-3 text-start">تفاصيل</th>
                  <th className="p-3 text-start">دليل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {evaluation.checks.map((c) => (
                  <tr key={c.id}>
                    <td className="p-3 font-medium text-slate-900">{c.label}</td>
                    <td className="p-3 text-slate-700">
                      {c.severity === "blocking" ? "مانع" : "تنبيه"}
                    </td>
                    <td className="p-3">
                      <StatusPill status={c.effectiveStatus} stale={c.stale} />
                    </td>
                    <td className="p-3 text-slate-700">
                      {c.measuredAt ? new Date(c.measuredAt).toLocaleString("en-GB") : "—"}
                      <div className="text-xs text-slate-500">قبل {formatAge(c.ageSeconds)}</div>
                    </td>
                    <td className="p-3 text-slate-700">{c.detail ?? "—"}</td>
                    <td className="p-3">
                      {c.evidenceUrl ? (
                        <a
                          href={c.evidenceUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 text-sky-700 hover:underline"
                        >
                          فتح <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {state.kind === "ready" && state.data.runUrl ? (
            <p className="mt-4 text-xs text-slate-600">
              تم الإنشاء من CI:{" "}
              <a href={state.data.runUrl} className="text-sky-700 hover:underline" target="_blank" rel="noreferrer">
                {state.data.commitSha?.slice(0, 7) ?? "run"} ↗
              </a>{" "}
              في {new Date(state.data.generatedAt).toLocaleString("en-GB")}
            </p>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
