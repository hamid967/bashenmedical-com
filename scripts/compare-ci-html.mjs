#!/usr/bin/env node
// يحوّل ci-compare.json إلى تقرير HTML مستقلّ.
import { readFileSync, writeFileSync } from "node:fs";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("usage: compare-ci-html.mjs <in.json> <out.html>");
  process.exit(2);
}

const data = JSON.parse(readFileSync(inPath, "utf8"));
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const {
  meta = {},
  local_run = {},
  ci_run = {},
  summary = {},
  errors = {},
  differences = [],
} = data;

const statusColor = summary.match ? "#16a34a" : "#dc2626";
const statusLabel = summary.match ? "مطابق ✓" : "اختلافات موجودة ✗";

const errorRow = (source, e) =>
  `<tr><td>${esc(source)}</td><td class="num">${esc(e.line)}</td><td><code>${esc(e.text)}</code></td></tr>`;

const errorsHtml = [
  ...(errors.ci || []).map((e) => errorRow("CI", e)),
  ...(errors.local || []).map((e) => errorRow("محلي", e)),
].join("\n");

const hunkHtml = (h, i) => `
  <details ${i < 3 ? "open" : ""} class="hunk">
    <summary><code>${esc(h.hunk)}</code>
      <span class="pill red">-${(h.ci_only || []).length}</span>
      <span class="pill green">+${(h.local_only || []).length}</span>
    </summary>
    <div class="diff">
      ${(h.ci_only || []).map((l) => `<div class="line del">- ${esc(l)}</div>`).join("")}
      ${(h.local_only || []).map((l) => `<div class="line add">+ ${esc(l)}</div>`).join("")}
    </div>
  </details>`;

const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>تقرير مقارنة CI ↔ محلي</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, sans-serif;
         margin: 0; padding: 24px; background: #f8fafc; color: #0f172a; }
  @media (prefers-color-scheme: dark) {
    body { background: #0f172a; color: #e2e8f0; }
    .card, .hunk, table { background: #1e293b; border-color: #334155; }
    code { background: #0f172a; }
  }
  h1 { margin: 0 0 4px; font-size: 22px; }
  .meta { color: #64748b; font-size: 13px; margin-bottom: 20px; }
  .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-bottom: 24px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
  .card .k { color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
  .card .v { font-size: 22px; font-weight: 600; margin-top: 4px; }
  .status { padding: 12px 16px; border-radius: 8px; color: #fff; font-weight: 600; margin-bottom: 20px;
            background: ${statusColor}; }
  section { margin-bottom: 28px; }
  section > h2 { font-size: 16px; margin: 0 0 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
  th, td { padding: 8px 12px; text-align: right; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  th { background: #f1f5f9; font-weight: 600; }
  td.num { font-family: ui-monospace, monospace; color: #64748b; width: 60px; }
  code { font-family: ui-monospace, "SF Mono", monospace; background: #f1f5f9; padding: 1px 5px; border-radius: 3px; font-size: 12.5px; }
  .hunk { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 10px; padding: 8px 12px; }
  .hunk summary { cursor: pointer; font-family: ui-monospace, monospace; }
  .pill { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; margin-inline-start: 8px; color: #fff; }
  .pill.red { background: #dc2626; }
  .pill.green { background: #16a34a; }
  .diff { margin-top: 10px; font-family: ui-monospace, monospace; font-size: 12.5px; direction: ltr; text-align: left; }
  .line { padding: 2px 8px; white-space: pre-wrap; word-break: break-all; border-radius: 3px; }
  .line.del { background: #fee2e2; color: #7f1d1d; }
  .line.add { background: #dcfce7; color: #14532d; }
  @media (prefers-color-scheme: dark) {
    .line.del { background: #450a0a; color: #fecaca; }
    .line.add { background: #052e16; color: #bbf7d0; }
  }
  .empty { color: #64748b; font-style: italic; padding: 12px; text-align: center; }
</style>
</head>
<body>
  <h1>تقرير مقارنة CI ↔ محلي</h1>
  <div class="meta">
    مُولَّد في ${esc(meta.generated_at)} · طريقة: <code>${esc(meta.method)}</code> · مصدر CI: <code>${esc(meta.ci_source)}</code>
  </div>

  <div class="status">${statusLabel}</div>

  <div class="grid">
    <div class="card"><div class="k">أسطر محلية</div><div class="v">${esc(local_run.line_count)}</div></div>
    <div class="card"><div class="k">أسطر CI</div><div class="v">${esc(ci_run.line_count)}</div></div>
    <div class="card"><div class="k">رمز الخروج المحلي</div><div class="v">${esc(local_run.exit_code)}</div></div>
    <div class="card"><div class="k">أخطاء محلية</div><div class="v">${esc(summary.local_error_count)}</div></div>
    <div class="card"><div class="k">أخطاء CI</div><div class="v">${esc(summary.ci_error_count)}</div></div>
    <div class="card"><div class="k">مقاطع الفروق</div><div class="v">${esc(summary.diff_hunks)}</div></div>
  </div>

  <section>
    <h2>الأخطاء (${(errors.ci || []).length + (errors.local || []).length})</h2>
    ${
      errorsHtml
        ? `<table><thead><tr><th>المصدر</th><th>السطر</th><th>النص</th></tr></thead><tbody>${errorsHtml}</tbody></table>`
        : `<div class="empty">لا أخطاء مُكتشفة في الطرفين.</div>`
    }
  </section>

  <section>
    <h2>الفروق سطرًا-بسطر (${differences.length} مقطع)</h2>
    ${
      differences.length
        ? differences.map(hunkHtml).join("\n")
        : `<div class="empty">لا فروق — المخرجات متطابقة بعد التطبيع.</div>`
    }
  </section>

  <div class="meta">${esc(meta.normalization || "")}</div>
</body>
</html>`;

writeFileSync(outPath, html);
