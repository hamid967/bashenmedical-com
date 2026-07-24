import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertHasRole } from "@/lib/admin/_guard";

export type DataContractColumn = {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
};

export type DataContractPolicy = {
  name: string;
  cmd: string;
  roles: string[];
  qual: string | null;
  with_check: string | null;
};

export type DataContract = {
  table: string;
  rls_enabled: boolean;
  columns: DataContractColumn[];
  policies: DataContractPolicy[];
};

export const listDataContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: tables, error: tablesError } = await supabaseAdmin
      .from("pg_tables" as any)
      .select("tablename, rowsecurity")
      .eq("schemaname", "public");
    if (tablesError) throw new Error(tablesError.message);

    const results: DataContract[] = [];
    for (const t of (tables ?? []) as Array<{ tablename: string; rowsecurity: boolean }>) {
      const { data: cols } = await supabaseAdmin.rpc("pg_temp_noop" as any).select().then(
        () => ({ data: null }),
        () => ({ data: null }),
      );
      // Use information_schema via a direct SQL query — pull columns + policies for each table
      const [{ data: columns }, { data: policies }] = await Promise.all([
        supabaseAdmin
          .from("information_schema.columns" as any)
          .select("column_name, data_type, is_nullable, column_default")
          .eq("table_schema", "public")
          .eq("table_name", t.tablename)
          .order("ordinal_position"),
        supabaseAdmin
          .from("pg_policies" as any)
          .select("policyname, cmd, roles, qual, with_check")
          .eq("schemaname", "public")
          .eq("tablename", t.tablename),
      ]);

      results.push({
        table: t.tablename,
        rls_enabled: !!t.rowsecurity,
        columns: ((columns ?? []) as any[]).map((c) => ({
          name: c.column_name,
          type: c.data_type,
          nullable: c.is_nullable === "YES",
          default: c.column_default,
        })),
        policies: ((policies ?? []) as any[]).map((p) => ({
          name: p.policyname,
          cmd: p.cmd,
          roles: Array.isArray(p.roles) ? p.roles : [],
          qual: p.qual,
          with_check: p.with_check,
        })),
      });
      // suppress unused
      void cols;
    }

    results.sort((a, b) => a.table.localeCompare(b.table));
    return { contracts: results };
  });
