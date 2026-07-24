/**
 * ui-v3 DataTable — canonical re-export of the existing DataTableV2 implementation.
 * Kept as a single re-export so pages import tables from the unified ui-v3 layer
 * without spawning a second table primitive.
 */
export { DataTableV2 as DataTable } from "@/components/admin/v2/DataTableV2";
export type * from "@/components/admin/v2/DataTableV2";
