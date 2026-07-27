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
  .handler(async ({ context }): Promise<{ contracts: DataContract[] }> => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const { data, error } = await context.supabase.rpc("admin_list_data_contracts" as unknown);
    if (error) throw new Error(error.message);
    return { contracts: (data ?? []) as DataContract[] };
  });
