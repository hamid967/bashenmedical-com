/**
 * Export the current AI chat session as CSV or a printable PDF (via window.print).
 * Zero dependencies — uses Blob for CSV and a new-window HTML document for PDF.
 * Distinguishes input/output token usage and reports pre/live/post estimates.
 */
import {
  estimateCredits,
  estimateTokens,
  formatCredits,
  getRate,
} from "@/lib/ai/pricing";
import type { MessageCostMeta } from "@/components/assistant/MessageCostBadge";

export type ExportMsg = {
  role: "user" | "assistant";
  content: string;
  meta?: MessageCostMeta;
};

export type SessionExportOptions = {
  messages: ExportMsg[];
  sessionCredits: number;
  /** Live pre-flight token estimate for the composer at export time. */
  preEstimateTokens?: number;
  model?: string;
  lang?: "ar" | "en";
  conversationId?: string | null;
  surface?: string;
};

type Row = {
  index: number;
  role: "user" | "assistant";
  content: string;
  model: string;
  inTokens: number;
  outTokens: number;
  totalTokens: number;
  credits: number;
  elapsedMs: number;
  source: "server" | "estimate";
  timestamp: string;
};

function computeRows(messages: ExportMsg[]): Row[] {
  return messages.map((m, i) => {
    const model = m.meta?.model ?? "";
    const inTok = m.meta?.usage?.prompt ?? estimateTokens(m.meta?.promptText ?? (m.role === "user" ? m.content : ""));
    const outTok = m.meta?.usage?.completion ?? estimateTokens(m.role === "assistant" ? m.content : "");
    const total = m.meta?.usage?.total ?? inTok + outTok;
    const credits = estimateCredits(inTok, outTok, model || undefined);
    const elapsedMs = m.meta && "elapsedMs" in (m.meta as Record<string, unknown>)
      ? (m.meta as unknown as { elapsedMs: number }).elapsedMs
      : m.meta?.endedAt && m.meta?.startedAt
        ? Math.max(0, m.meta.endedAt - m.meta.startedAt)
        : 0;
    return {
      index: i + 1,
      role: m.role,
      content: m.content,
      model,
      inTokens: inTok,
      outTokens: outTok,
      totalTokens: total,
      credits,
      elapsedMs,
      source: m.meta?.usage ? "server" : "estimate",
      timestamp: new Date().toISOString(),
    };
  });
}

function csvEscape(v: string | number): string {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function tsSlug(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function exportSessionCSV(opts: SessionExportOptions) {
  const rows = computeRows(opts.messages);
  const totals = rows.reduce(
    (a, r) => ({
      inTokens: a.inTokens + r.inTokens,
      outTokens: a.outTokens + r.outTokens,
      totalTokens: a.totalTokens + r.totalTokens,
      credits: a.credits + r.credits,
    }),
    { inTokens: 0, outTokens: 0, totalTokens: 0, credits: 0 },
  );
  const isAr = opts.lang === "ar";
  const header = isAr
    ? ["#", "الدور", "النموذج", "توكن مدخل", "توكن مخرج", "الإجمالي", "الرصيد", "الزمن(ث)", "المصدر", "الوقت", "المحتوى"]
    : ["#", "role", "model", "input_tokens", "output_tokens", "total_tokens", "credits", "elapsed_s", "source", "timestamp", "content"];

  const dataLines = rows.map((r) =>
    [
      r.index,
      r.role,
      r.model,
      r.inTokens,
      r.outTokens,
      r.totalTokens,
      r.credits.toFixed(4),
      (r.elapsedMs / 1000).toFixed(2),
      r.source,
      r.timestamp,
      r.content.replace(/\s+/g, " ").trim(),
    ].map(csvEscape).join(","),
  );

  const summary = [
    "",
    csvEscape(isAr ? "— ملخص الجلسة —" : "-- session summary --"),
    [csvEscape(isAr ? "إجمالي الرسائل" : "messages"), csvEscape(rows.length)].join(","),
    [csvEscape(isAr ? "إجمالي المدخلات" : "total_input_tokens"), csvEscape(totals.inTokens)].join(","),
    [csvEscape(isAr ? "إجمالي المخرجات" : "total_output_tokens"), csvEscape(totals.outTokens)].join(","),
    [csvEscape(isAr ? "إجمالي التوكنات" : "total_tokens"), csvEscape(totals.totalTokens)].join(","),
    [csvEscape(isAr ? "الرصيد المقدر" : "estimated_credits"), csvEscape(totals.credits.toFixed(4))].join(","),
    [csvEscape(isAr ? "رصيد الجلسة (مسجل)" : "session_credits_tracked"), csvEscape(opts.sessionCredits.toFixed(4))].join(","),
    [csvEscape(isAr ? "تقدير المسودة الحالي" : "pre_estimate_tokens_pending"), csvEscape(opts.preEstimateTokens ?? 0)].join(","),
    [csvEscape(isAr ? "النموذج النشط" : "active_model"), csvEscape(opts.model ?? "")].join(","),
    [csvEscape(isAr ? "المحادثة" : "conversation_id"), csvEscape(opts.conversationId ?? "")].join(","),
    [csvEscape(isAr ? "الواجهة" : "surface"), csvEscape(opts.surface ?? "")].join(","),
    [csvEscape(isAr ? "تم التصدير" : "exported_at"), csvEscape(new Date().toISOString())].join(","),
  ].join("\n");

  // Prepend UTF-8 BOM so Excel opens Arabic correctly.
  const csv = "\uFEFF" + [header.map(csvEscape).join(","), ...dataLines, summary].join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `baeshen-ai-session-${tsSlug()}.csv`);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function exportSessionPDF(opts: SessionExportOptions) {
  const rows = computeRows(opts.messages);
  const totals = rows.reduce(
    (a, r) => ({
      inTokens: a.inTokens + r.inTokens,
      outTokens: a.outTokens + r.outTokens,
      totalTokens: a.totalTokens + r.totalTokens,
      credits: a.credits + r.credits,
    }),
    { inTokens: 0, outTokens: 0, totalTokens: 0, credits: 0 },
  );
  const isAr = (opts.lang ?? "ar") === "ar";
  const dir = isAr ? "rtl" : "ltr";
  const rate = getRate(opts.model);
  const pre = opts.preEstimateTokens ?? 0;
  const preCreditsRough = estimateCredits(pre, 0, opts.model);

  const T = (ar: string, en: string) => (isAr ? ar : en);

  const rowsHtml = rows
    .map((r) => {
      const roleLabel = r.role === "user" ? T("مستخدم", "user") : T("مساعد", "assistant");
      const roleColor = r.role === "user" ? "#0284c7" : "#059669";
      return `
        <tr>
          <td class="c">${r.index}</td>
          <td style="color:${roleColor};font-weight:600">${esc(roleLabel)}</td>
          <td class="mono">${esc(r.model || "—")}</td>
          <td class="c mono in">${r.inTokens.toLocaleString()}</td>
          <td class="c mono out">${r.outTokens.toLocaleString()}</td>
          <td class="c mono">${r.totalTokens.toLocaleString()}</td>
          <td class="c mono">${formatCredits(r.credits)}</td>
          <td class="c mono">${(r.elapsedMs / 1000).toFixed(1)}s</td>
          <td class="c">${r.source === "server" ? T("فعلي", "server") : T("تقدير", "est.")}</td>
          <td class="content">${esc(r.content).slice(0, 800)}${r.content.length > 800 ? "…" : ""}</td>
        </tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="${isAr ? "ar" : "en"}" dir="${dir}">
<head>
<meta charset="utf-8" />
<title>${esc(T("تقرير جلسة المساعد الذكي", "AI Session Report"))}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: ${isAr ? '"Noto Naskh Arabic", "Segoe UI"' : '"Inter", "Segoe UI"'}, system-ui, sans-serif; color:#111; margin:24px; }
  h1 { font-size:20px; margin:0 0 4px; }
  .sub { color:#666; font-size:12px; margin-bottom:16px; }
  .grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin:12px 0 20px; }
  .card { border:1px solid #e5e7eb; border-radius:8px; padding:10px 12px; background:#f9fafb; }
  .card .k { font-size:10.5px; color:#666; margin-bottom:2px; }
  .card .v { font-size:15px; font-weight:700; font-family:ui-monospace,monospace; }
  .card.in { border-color:#7dd3fc; background:#f0f9ff; }
  .card.out { border-color:#6ee7b7; background:#ecfdf5; }
  .card.credit { border-color:#fcd34d; background:#fffbeb; }
  table { width:100%; border-collapse:collapse; font-size:11px; }
  th, td { border:1px solid #e5e7eb; padding:6px 8px; vertical-align:top; }
  th { background:#f3f4f6; text-align:${isAr ? "right" : "left"}; font-weight:600; }
  .c { text-align:center; }
  .mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
  .in { color:#0369a1; }
  .out { color:#047857; }
  .content { max-width:280px; color:#374151; white-space:pre-wrap; word-break:break-word; }
  .foot { margin-top:16px; font-size:11px; color:#666; display:flex; justify-content:space-between; }
  .legend { margin:8px 0 14px; font-size:11px; color:#555; }
  .legend span { display:inline-block; padding:2px 8px; border-radius:999px; margin-inline-end:6px; }
  .legend .li { background:#e0f2fe; color:#0369a1; }
  .legend .lo { background:#d1fae5; color:#047857; }
  @media print { body { margin:14mm; } button { display:none; } }
  .actions { position:fixed; top:12px; inset-inline-end:12px; }
  .actions button { background:#111; color:#fff; border:0; border-radius:6px; padding:8px 14px; font-size:12px; cursor:pointer; }
</style>
</head>
<body>
<div class="actions"><button onclick="window.print()">${esc(T("طباعة / حفظ PDF", "Print / Save PDF"))}</button></div>

<h1>${esc(T("تقرير جلسة المساعد الذكي — مجمع باعشن الطبي", "AI Assistant Session Report — Baeshen Medical"))}</h1>
<div class="sub">
  ${esc(T("تم التصدير", "Exported"))}: ${esc(new Date().toLocaleString(isAr ? "ar-SA" : "en-US"))}
  ${opts.surface ? ` · ${esc(T("الواجهة", "Surface"))}: ${esc(opts.surface)}` : ""}
  ${opts.conversationId ? ` · ${esc(T("المحادثة", "Conversation"))}: <span class="mono">${esc(opts.conversationId)}</span>` : ""}
</div>

<div class="legend">
  <span class="li">${esc(T("مدخلات (Input)", "Input tokens"))}</span>
  <span class="lo">${esc(T("مخرجات (Output)", "Output tokens"))}</span>
  ${esc(T("الأسعار المطبقة لكل مليون توكن — دخل:", "Rate per 1M tokens — in:"))}
  <span class="mono">${rate.inPer1M}</span> · ${esc(T("خرج:", "out:"))} <span class="mono">${rate.outPer1M}</span>
  · ${esc(T("النموذج:", "Model:"))} <span class="mono">${esc(opts.model || "—")}</span>
</div>

<div class="grid">
  <div class="card"><div class="k">${esc(T("عدد الرسائل", "Messages"))}</div><div class="v">${rows.length}</div></div>
  <div class="card in"><div class="k">${esc(T("إجمالي المدخلات", "Total input tokens"))}</div><div class="v">${totals.inTokens.toLocaleString()}</div></div>
  <div class="card out"><div class="k">${esc(T("إجمالي المخرجات", "Total output tokens"))}</div><div class="v">${totals.outTokens.toLocaleString()}</div></div>
  <div class="card"><div class="k">${esc(T("مجموع التوكنات", "Total tokens"))}</div><div class="v">${totals.totalTokens.toLocaleString()}</div></div>
  <div class="card credit"><div class="k">${esc(T("رصيد مقدر لكل الرسائل", "Estimated credits (all)"))}</div><div class="v">${formatCredits(totals.credits)}</div></div>
  <div class="card credit"><div class="k">${esc(T("رصيد الجلسة المسجل", "Tracked session credits"))}</div><div class="v">${formatCredits(opts.sessionCredits)}</div></div>
  <div class="card"><div class="k">${esc(T("تقدير قبل الإرسال", "Pending pre-estimate"))}</div><div class="v">${pre.toLocaleString()} <span style="font-size:10px;color:#666">${esc(T("توكن ≈", "tok ≈"))} ${formatCredits(preCreditsRough)}</span></div></div>
  <div class="card"><div class="k">${esc(T("متوسط لكل رسالة", "Avg / message"))}</div><div class="v">${rows.length ? formatCredits(totals.credits / rows.length) : "0"}</div></div>
</div>

<table>
  <thead>
    <tr>
      <th>#</th>
      <th>${esc(T("الدور", "Role"))}</th>
      <th>${esc(T("النموذج", "Model"))}</th>
      <th class="c">${esc(T("مدخل", "In"))}</th>
      <th class="c">${esc(T("مخرج", "Out"))}</th>
      <th class="c">${esc(T("الإجمالي", "Total"))}</th>
      <th class="c">${esc(T("رصيد", "Credits"))}</th>
      <th class="c">${esc(T("الزمن", "Latency"))}</th>
      <th class="c">${esc(T("المصدر", "Source"))}</th>
      <th>${esc(T("المحتوى (مقتطف)", "Content (excerpt)"))}</th>
    </tr>
  </thead>
  <tbody>${rowsHtml || `<tr><td colspan="10" class="c" style="padding:20px;color:#888">${esc(T("لا توجد رسائل بعد", "No messages yet"))}</td></tr>`}</tbody>
</table>

<div class="foot">
  <span>${esc(T("جميع القيم للعرض فقط. الأرقام المعلمة (تقدير) قد تختلف عن الفواتير الفعلية.", "All values are display-only. Rows marked (est.) may differ from actual billing."))}</span>
  <span class="mono">${esc(new Date().toISOString())}</span>
</div>
<script>window.addEventListener("load", () => setTimeout(() => window.print(), 350));</script>
</body></html>`;

  const w = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768");
  if (!w) {
    // Popup blocked — fall back to download.
    downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `baeshen-ai-session-${tsSlug()}.html`);
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
