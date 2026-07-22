/**
 * Client-side export helpers: CSV, XLSX (SheetJS), PDF (via print window).
 * Arabic support: XLSX uses RTL view. PDF uses an HTML print window (RTL + system Arabic fonts),
 * because jsPDF requires embedding heavy Arabic fonts to render RTL text correctly.
 */
import * as XLSX from "xlsx";

export type Column<T> = {
  header: string;
  accessor: (row: T) => string | number | null | undefined;
  width?: number;
};

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  return String(v);
}

// ---------- CSV ----------
function csvEscape(v: unknown): string {
  const s = fmtCell(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportCsv<T>(filename: string, cols: Column<T>[], rows: T[]) {
  const header = cols.map((c) => csvEscape(c.header)).join(",");
  const body = rows.map((r) => cols.map((c) => csvEscape(c.accessor(r))).join(",")).join("\n");
  const csv = "\uFEFF" + header + "\n" + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, ensureExt(filename, "csv"));
}

// ---------- XLSX ----------
export function exportXlsx<T>(
  filename: string,
  cols: Column<T>[],
  rows: T[],
  sheetName = "Report",
) {
  const aoa: (string | number | null)[][] = [
    cols.map((c) => c.header),
    ...rows.map((r) =>
      cols.map((c) => {
        const v = c.accessor(r);
        if (v === null || v === undefined) return null;
        if (typeof v === "number") return v;
        return String(v);
      }),
    ),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = cols.map((c) => ({ wch: c.width ?? Math.max(12, c.header.length + 4) }));
  // Right-to-left view for Arabic
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ws as any)["!views"] = [{ RTL: true }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerDownload(blob, ensureExt(filename, "xlsx"));
}

// ---------- PDF (via print window, RTL, Arabic-safe) ----------
export function exportPdf<T>(opts: {
  filename: string;
  title: string;
  subtitle?: string;
  cols: Column<T>[];
  rows: T[];
  meta?: Record<string, string>;
}) {
  const { title, subtitle, cols, rows, meta } = opts;
  const win = window.open("", "_blank", "noopener,width=1024,height=800");
  if (!win) {
    alert("متصفحك يمنع فتح النوافذ. يرجى السماح بالنوافذ المنبثقة لتصدير PDF.");
    return;
  }
  const escapeHtml = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
    );

  const metaHtml = meta
    ? `<div class="meta">${Object.entries(meta)
        .map(([k, v]) => `<span><b>${escapeHtml(k)}:</b> ${escapeHtml(v)}</span>`)
        .join(" • ")}</div>`
    : "";

  const thead = `<tr>${cols.map((c) => `<th>${escapeHtml(c.header)}</th>`).join("")}</tr>`;
  const tbody = rows
    .map(
      (r) =>
        `<tr>${cols.map((c) => `<td>${escapeHtml(fmtCell(c.accessor(r)))}</td>`).join("")}</tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @media print { @page { size: A4 landscape; margin: 12mm; } }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", "Tahoma", "Arial", sans-serif; direction: rtl; color: #111; margin: 16px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #555; font-size: 12px; margin-bottom: 8px; }
  .meta { font-size: 11px; color: #444; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #ddd; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #ccc; padding: 5px 7px; text-align: right; vertical-align: top; }
  thead th { background: #f3f4f6; font-weight: 600; }
  tbody tr:nth-child(even) td { background: #fafafa; }
  .footer { margin-top: 12px; font-size: 10px; color: #666; text-align: center; }
  .actions { position: fixed; top: 8px; left: 8px; }
  .actions button { padding: 6px 12px; margin-inline-end: 6px; cursor: pointer; }
  @media print { .actions { display: none; } }
</style>
</head>
<body>
  <div class="actions">
    <button onclick="window.print()">طباعة / حفظ PDF</button>
    <button onclick="window.close()">إغلاق</button>
  </div>
  <h1>${escapeHtml(title)}</h1>
  ${subtitle ? `<div class="sub">${escapeHtml(subtitle)}</div>` : ""}
  ${metaHtml}
  <table>
    <thead>${thead}</thead>
    <tbody>${tbody}</tbody>
  </table>
  <div class="footer">تم إنشاؤه في ${escapeHtml(new Date().toLocaleString("ar"))} — عدد السجلات: ${rows.length}</div>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 350));</script>
</body>
</html>`;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ---------- Helpers ----------
function ensureExt(name: string, ext: string) {
  return name.toLowerCase().endsWith("." + ext) ? name : `${name}.${ext}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
