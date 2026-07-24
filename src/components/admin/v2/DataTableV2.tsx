/**
 * DataTableV2 — Reusable admin data table with:
 *  - Global search + per-column search
 *  - Advanced filters (select / multi / date-range / boolean / text)
 *  - Sortable columns (server or client)
 *  - Flexible cell rendering via `cell(row)`
 *  - Loading / empty / error states
 *  - Server-side pagination (controlled) or client-side fallback
 *
 * Fully typed generic <T>. RTL-friendly (Arabic labels).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────── */

export type SortDir = "asc" | "desc";

export type ColumnFilter =
  | { type: "text"; placeholder?: string }
  | { type: "select"; options: { label: string; value: string }[] }
  | { type: "multi"; options: { label: string; value: string }[] }
  | { type: "boolean"; trueLabel?: string; falseLabel?: string }
  | { type: "date-range" };

export type FilterValue = string | string[] | boolean | { from?: string; to?: string } | undefined;

export type ColumnDef<T> = {
  /** Unique id — also used as the filter key in `filters` state. */
  id: string;
  header: ReactNode;
  /** Cell renderer. */
  cell: (row: T, index: number) => ReactNode;
  /** Enable sort UI for this column. `sortKey` defaults to `id`. */
  sortable?: boolean;
  sortKey?: string;
  /** Enable inline per-column search input in the header row. */
  searchable?: boolean;
  /** Advanced filter descriptor shown in the Filters popover. */
  filter?: ColumnFilter;
  /** Class applied to header + cells (widths / alignment / truncate). */
  className?: string;
  /** Optional cell-only class. */
  cellClassName?: string;
  /** Optional header-only class. */
  headerClassName?: string;
  /** Hide by default (still toggleable in future — placeholder). */
  hidden?: boolean;
};

export type PaginationState = {
  page: number; // 1-based
  perPage: number;
  total: number; // total row count from server (or full client list)
};

export type SortState = { key: string; dir: SortDir } | null;

export type DataTableV2Props<T> = {
  columns: ColumnDef<T>[];
  data: T[];
  /** Stable key for each row. */
  rowKey: (row: T) => string;

  /** Loading / error states. */
  isLoading?: boolean;
  isFetching?: boolean;
  error?: unknown;
  onRetry?: () => void;

  /** Global search (controlled). */
  globalSearch?: string;
  onGlobalSearchChange?: (v: string) => void;
  globalSearchPlaceholder?: string;

  /** Per-column search (controlled map: columnId → value). */
  columnSearch?: Record<string, string>;
  onColumnSearchChange?: (columnId: string, value: string) => void;

  /** Advanced filters (controlled map: columnId → value). */
  filters?: Record<string, FilterValue>;
  onFiltersChange?: (next: Record<string, FilterValue>) => void;

  /** Sort (controlled). */
  sort?: SortState;
  onSortChange?: (next: SortState) => void;

  /** Pagination (controlled server-side). If omitted, client-side auto-paginates. */
  pagination?: PaginationState;
  onPaginationChange?: (next: PaginationState) => void;
  perPageOptions?: number[];

  /** Row interactions. */
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;

  /** Toolbar extras (buttons on the left of the toolbar). */
  toolbarLeft?: ReactNode;
  /** Toolbar extras (buttons on the right, before Filters). */
  toolbarRight?: ReactNode;

  /** Empty / labels overrides. */
  emptyTitle?: string;
  emptyDescription?: string;
  errorTitle?: string;

  /** Compact density. */
  dense?: boolean;
  /** Sticky header. */
  stickyHeader?: boolean;
  className?: string;

  /** Accessible name for the table (announced to screen readers). */
  ariaLabel?: string;
  /** Visually-hidden <caption> text summarising the table. */
  caption?: string;
};

/* ────────────────────────────────────────────────────────────
 * Component
 * ──────────────────────────────────────────────────────────── */

export function DataTableV2<T>({
  columns,
  data,
  rowKey,
  isLoading = false,
  isFetching = false,
  error,
  onRetry,
  globalSearch,
  onGlobalSearchChange,
  globalSearchPlaceholder = "بحث…",
  columnSearch,
  onColumnSearchChange,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  pagination,
  onPaginationChange,
  perPageOptions = [10, 25, 50, 100],
  onRowClick,
  rowClassName,
  toolbarLeft,
  toolbarRight,
  emptyTitle = "لا توجد بيانات",
  emptyDescription = "جرّب تعديل البحث أو الفلاتر.",
  errorTitle = "تعذّر تحميل البيانات",
  dense = false,
  stickyHeader = true,
  className,
  ariaLabel = "جدول البيانات",
  caption,
}: DataTableV2Props<T>) {
  const visibleColumns = useMemo(() => columns.filter((c) => !c.hidden), [columns]);
  const hasColumnSearch = visibleColumns.some((c) => c.searchable);
  const hasFilters = visibleColumns.some((c) => c.filter);

  /* Fallback local client-side pagination when server-side isn't wired. */
  const [localPage, setLocalPage] = useState(1);
  const [localPerPage, setLocalPerPage] = useState(perPageOptions[0] ?? 10);
  const effectivePagination: PaginationState = pagination ?? {
    page: localPage,
    perPage: localPerPage,
    total: data.length,
  };
  const updatePagination = (next: PaginationState) => {
    if (onPaginationChange) onPaginationChange(next);
    else {
      setLocalPage(next.page);
      setLocalPerPage(next.perPage);
    }
  };

  /* When server-side isn't used, slice locally. */
  const displayedRows = useMemo(() => {
    if (pagination) return data; // server already sliced
    const start = (effectivePagination.page - 1) * effectivePagination.perPage;
    return data.slice(start, start + effectivePagination.perPage);
  }, [data, pagination, effectivePagination.page, effectivePagination.perPage]);

  const totalPages = Math.max(
    1,
    Math.ceil(effectivePagination.total / effectivePagination.perPage),
  );
  const safePage = Math.min(Math.max(1, effectivePagination.page), totalPages);
  useEffect(() => {
    if (safePage !== effectivePagination.page) {
      updatePagination({ ...effectivePagination, page: safePage });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safePage]);

  const rangeStart =
    effectivePagination.total === 0 ? 0 : (safePage - 1) * effectivePagination.perPage + 1;
  const rangeEnd = Math.min(safePage * effectivePagination.perPage, effectivePagination.total);

  /* Sort handler. */
  const handleSort = (key: string) => {
    if (!onSortChange) return;
    if (!sort || sort.key !== key) onSortChange({ key, dir: "asc" });
    else if (sort.dir === "asc") onSortChange({ key, dir: "desc" });
    else onSortChange(null);
  };

  /* Active filter chips. */
  const activeFilterChips = useMemo(() => {
    if (!filters) return [] as { id: string; label: ReactNode }[];
    const chips: { id: string; label: ReactNode }[] = [];
    for (const c of visibleColumns) {
      if (!c.filter) continue;
      const v = filters[c.id];
      if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
      if (typeof v === "object" && !Array.isArray(v)) {
        const r = v as { from?: string; to?: string };
        if (!r.from && !r.to) continue;
        chips.push({
          id: c.id,
          label: (
            <>
              {c.header}: {r.from ?? "…"} → {r.to ?? "…"}
            </>
          ),
        });
        continue;
      }
      const readable = Array.isArray(v)
        ? v.join("، ")
        : typeof v === "boolean"
          ? v
            ? "نعم"
            : "لا"
          : String(v);
      chips.push({
        id: c.id,
        label: (
          <>
            {c.header}: {readable}
          </>
        ),
      });
    }
    return chips;
  }, [filters, visibleColumns]);

  const clearFilter = (id: string) => {
    if (!onFiltersChange || !filters) return;
    const { [id]: _, ...rest } = filters;
    onFiltersChange(rest);
  };
  const clearAllFilters = () => {
    if (onFiltersChange) onFiltersChange({});
  };

  /* ─── Render ─── */

  const colCount = visibleColumns.length;
  const rowPadY = dense ? "py-2" : "py-3";

  return (
    <div
      className={cn("flex flex-col gap-3", className)}
      role="region"
      aria-label={ariaLabel}
      aria-busy={isLoading || isFetching || undefined}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="أدوات الجدول">
        {toolbarLeft}
        {onGlobalSearchChange && (
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={globalSearch ?? ""}
              onChange={(e) => onGlobalSearchChange(e.target.value)}
              placeholder={globalSearchPlaceholder}
              className="h-9 pr-8"
              aria-label={globalSearchPlaceholder}
              type="search"
            />
          </div>
        )}
        <div className="ms-auto flex items-center gap-2">
          {toolbarRight}
          {hasFilters && onFiltersChange && (
            <FiltersPopover
              columns={visibleColumns}
              values={filters ?? {}}
              onChange={onFiltersChange}
            />
          )}
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              disabled={isLoading || isFetching}
              className="h-9"
            >
              <RefreshCw className={cn("ml-2 h-4 w-4", isFetching && "animate-spin")} />
              تحديث
            </Button>
          )}
        </div>
      </div>

      {/* Active filter chips */}
      {activeFilterChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {activeFilterChips.map((c) => (
            <Badge key={c.id} variant="secondary" className="gap-1 pr-1 text-xs">
              <span>{c.label}</span>
              <button
                type="button"
                onClick={() => clearFilter(c.id)}
                aria-label="إزالة الفلتر"
                className="rounded-full p-0.5 hover:bg-background/60"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAllFilters}>
            مسح الكل
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="relative overflow-hidden rounded-lg border border-border bg-card">
        {isFetching && !isLoading && (
          <div className="absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden">
            <div className="h-full w-1/3 animate-[shimmer_1.2s_linear_infinite] bg-primary/70" />
          </div>
        )}
        <div className="overflow-x-auto">
          <table
            className="w-full min-w-[720px] border-collapse text-sm"
            role="table"
            aria-rowcount={effectivePagination.total || undefined}
            aria-colcount={colCount}
          >
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead
              className={cn(
                "bg-muted/40 text-right text-xs uppercase tracking-wide text-muted-foreground",
                stickyHeader && "sticky top-0 z-10",
              )}
            >
              <tr>
                {visibleColumns.map((col) => {
                  const key = col.sortKey ?? col.id;
                  const isSorted = sort?.key === key;
                  const ariaSort: "ascending" | "descending" | "none" | undefined = col.sortable
                    ? isSorted
                      ? sort!.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                    : undefined;
                  const nextLabel = !isSorted
                    ? "ترتيب تصاعدي"
                    : sort!.dir === "asc"
                      ? "ترتيب تنازلي"
                      : "إلغاء الترتيب";
                  const headerText =
                    typeof col.header === "string" || typeof col.header === "number"
                      ? String(col.header)
                      : col.id;
                  return (
                    <th
                      key={col.id}
                      scope="col"
                      aria-sort={ariaSort}
                      className={cn(
                        "px-3 py-2.5 font-semibold",
                        col.className,
                        col.headerClassName,
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        {col.sortable && onSortChange ? (
                          <button
                            type="button"
                            onClick={() => handleSort(key)}
                            aria-label={`${headerText} — ${nextLabel}`}
                            className={cn(
                              "inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-background/60",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                              isSorted && "text-foreground",
                            )}
                          >
                            <span>{col.header}</span>
                            {isSorted ? (
                              sort!.dir === "asc" ? (
                                <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                              ) : (
                                <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                              )
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />
                            )}
                          </button>
                        ) : (
                          <span>{col.header}</span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
              {hasColumnSearch && onColumnSearchChange && (
                <tr className="bg-background/40">
                  {visibleColumns.map((col) => {
                    const headerText =
                      typeof col.header === "string" || typeof col.header === "number"
                        ? String(col.header)
                        : col.id;
                    return (
                      <th key={`s-${col.id}`} scope="col" className={cn("px-2 pb-2", col.className)}>
                        {col.searchable ? (
                          <Input
                            value={columnSearch?.[col.id] ?? ""}
                            onChange={(e) => onColumnSearchChange(col.id, e.target.value)}
                            placeholder="فلترة…"
                            aria-label={`فلترة ${headerText}`}
                            type="search"
                            className="h-7 text-xs"
                          />
                        ) : null}
                      </th>
                    );
                  })}
                </tr>
              )}
            </thead>

            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="border-t border-border" aria-hidden="true">
                    {visibleColumns.map((col) => (
                      <td key={col.id} className={cn("px-3", rowPadY)}>
                        <div className="h-3 w-full max-w-[180px] animate-pulse rounded bg-muted" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={colCount} className="px-3 py-12">
                    <div
                      role="alert"
                      aria-live="assertive"
                      className="flex flex-col items-center gap-2 text-center"
                    >
                      <div className="rounded-full bg-destructive/10 p-2 text-destructive">
                        <X className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">{errorTitle}</p>
                      <p className="max-w-md text-xs text-muted-foreground">
                        {error instanceof Error ? error.message : "خطأ غير متوقّع."}
                      </p>
                      {onRetry && (
                        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
                          <RefreshCw className="ml-2 h-4 w-4" aria-hidden="true" />
                          إعادة المحاولة
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : displayedRows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-3 py-12">
                    <div
                      role="status"
                      aria-live="polite"
                      className="flex flex-col items-center gap-1.5 text-center"
                    >
                      <p className="text-sm font-semibold text-foreground">{emptyTitle}</p>
                      <p className="max-w-md text-xs text-muted-foreground">{emptyDescription}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                displayedRows.map((row, idx) => {
                  const clickable = Boolean(onRowClick);
                  const handleKey = clickable
                    ? (e: React.KeyboardEvent<HTMLTableRowElement>) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick!(row);
                        }
                      }
                    : undefined;
                  return (
                    <tr
                      key={rowKey(row)}
                      onClick={clickable ? () => onRowClick!(row) : undefined}
                      onKeyDown={handleKey}
                      tabIndex={clickable ? 0 : undefined}
                      role={clickable ? "button" : undefined}
                      aria-rowindex={
                        (safePage - 1) * effectivePagination.perPage + idx + 1 || undefined
                      }
                      className={cn(
                        "border-t border-border transition-colors",
                        clickable &&
                          "cursor-pointer hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        rowClassName?.(row),
                      )}
                    >
                      {visibleColumns.map((col) => (
                        <td
                          key={col.id}
                          className={cn(
                            "px-3 align-middle",
                            rowPadY,
                            col.className,
                            col.cellClassName,
                          )}
                        >
                          {col.cell(row, idx)}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination footer */}
      <nav
        className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"
        aria-label="ترقيم الصفحات"
      >
        <div className="flex items-center gap-2">
          <label htmlFor="dtv2-per-page" className="sr-only">
            عدد الصفوف في كل صفحة
          </label>
          <span aria-hidden="true">عرض</span>
          <Select
            value={String(effectivePagination.perPage)}
            onValueChange={(v) =>
              updatePagination({
                ...effectivePagination,
                page: 1,
                perPage: Number(v),
              })
            }
          >
            <SelectTrigger id="dtv2-per-page" className="h-8 w-[74px] text-xs" aria-label="عدد الصفوف في كل صفحة">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {perPageOptions.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span aria-live="polite" aria-atomic="true">
            {rangeStart}-{rangeEnd} من {effectivePagination.total}
          </span>
          {isFetching && !isLoading && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-label="جاري التحديث" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={safePage <= 1 || isLoading}
            onClick={() => updatePagination({ ...effectivePagination, page: safePage - 1 })}
            aria-label="الصفحة السابقة"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
            السابق
          </Button>
          <span className="px-2" aria-current="page">
            صفحة {safePage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={safePage >= totalPages || isLoading}
            onClick={() => updatePagination({ ...effectivePagination, page: safePage + 1 })}
            aria-label="الصفحة التالية"
          >
            التالي
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </nav>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
 * FiltersPopover — advanced filters UI
 * ──────────────────────────────────────────────────────────── */

function FiltersPopover<T>({
  columns,
  values,
  onChange,
}: {
  columns: ColumnDef<T>[];
  values: Record<string, FilterValue>;
  onChange: (next: Record<string, FilterValue>) => void;
}) {
  const filterable = columns.filter((c) => c.filter);
  const activeCount = filterable.reduce((n, c) => {
    const v = values[c.id];
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) return n;
    if (typeof v === "object" && !Array.isArray(v)) {
      const r = v as { from?: string; to?: string };
      return r.from || r.to ? n + 1 : n;
    }
    return n + 1;
  }, 0);

  const setVal = (id: string, v: FilterValue) => {
    const next = { ...values };
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) {
      delete next[id];
    } else {
      next[id] = v;
    }
    onChange(next);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <SlidersHorizontal className="ml-2 h-4 w-4" />
          فلاتر
          {activeCount > 0 && (
            <Badge variant="secondary" className="ms-2 h-5 px-1.5 text-[10px]">
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">فلاتر متقدمة</p>
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange({})}>
              مسح الكل
            </Button>
          )}
        </div>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {filterable.map((col) => {
            const f = col.filter!;
            const v = values[col.id];
            return (
              <div key={col.id} className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{col.header}</label>
                {f.type === "text" && (
                  <Input
                    value={typeof v === "string" ? v : ""}
                    onChange={(e) => setVal(col.id, e.target.value)}
                    placeholder={f.placeholder ?? "…"}
                    className="h-8 text-sm"
                  />
                )}
                {f.type === "select" && (
                  <Select
                    value={typeof v === "string" ? v : "__all"}
                    onValueChange={(nv) => setVal(col.id, nv === "__all" ? undefined : nv)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">الكل</SelectItem>
                      {f.options.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {f.type === "multi" && (
                  <div className="flex flex-wrap gap-1">
                    {f.options.map((o) => {
                      const arr = Array.isArray(v) ? v : [];
                      const active = arr.includes(o.value);
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() =>
                            setVal(
                              col.id,
                              active ? arr.filter((x) => x !== o.value) : [...arr, o.value],
                            )
                          }
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-xs transition-colors",
                            active
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:bg-muted",
                          )}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                )}
                {f.type === "boolean" && (
                  <Select
                    value={v === true ? "true" : v === false ? "false" : "__all"}
                    onValueChange={(nv) =>
                      setVal(col.id, nv === "__all" ? undefined : nv === "true")
                    }
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">الكل</SelectItem>
                      <SelectItem value="true">{f.trueLabel ?? "نعم"}</SelectItem>
                      <SelectItem value="false">{f.falseLabel ?? "لا"}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {f.type === "date-range" && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <Input
                      type="date"
                      value={typeof v === "object" && v && !Array.isArray(v) ? (v.from ?? "") : ""}
                      onChange={(e) => {
                        const cur = typeof v === "object" && v && !Array.isArray(v) ? v : {};
                        setVal(col.id, { ...cur, from: e.target.value || undefined });
                      }}
                      className="h-8 text-xs"
                    />
                    <Input
                      type="date"
                      value={typeof v === "object" && v && !Array.isArray(v) ? (v.to ?? "") : ""}
                      onChange={(e) => {
                        const cur = typeof v === "object" && v && !Array.isArray(v) ? v : {};
                        setVal(col.id, { ...cur, to: e.target.value || undefined });
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
