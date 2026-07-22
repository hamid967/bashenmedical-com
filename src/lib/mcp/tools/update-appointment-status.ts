import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { logMcpInvocation } from "../log-invocation";

export default defineTool({
  name: "update_appointment_status",
  title: "Cancel or confirm an appointment",
  description:
    "Update an appointment's status to `cancelled` or `confirmed`. Row-level security decides who can do what: patients can cancel their own upcoming appointments (matched by phone); confirming an appointment requires staff (admin/reception) with branch access.",
  inputSchema: {
    appointment_id: z.string().uuid().describe("Appointment UUID to update."),
    status: z
      .enum(["cancelled", "confirmed"])
      .describe(
        "New status. `cancelled` for patients cancelling their own; `confirmed` for staff.",
      ),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async ({ appointment_id, status }, ctx: ToolContext) => {
    const startedAt = Date.now();
    const args = { appointment_id, status };
    if (!ctx.isAuthenticated()) {
      return {
        content: [{ type: "text" as const, text: "Not authenticated" }],
        isError: true,
      };
    }

    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );

    const { data, error } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", appointment_id)
      .select(
        "id, status, appointment_date, appointment_time, patient_name, patient_phone, doctor_id, branch_id",
      )
      .maybeSingle();

    let result: {
      content: Array<{ type: "text"; text: string }>;
      isError?: boolean;
      structuredContent?: Record<string, unknown>;
    };
    if (error) {
      result = {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    } else if (!data) {
      result = {
        content: [
          {
            type: "text",
            text: "No appointment was updated. Either the ID does not exist or your account is not authorized to change it (RLS).",
          },
        ],
        isError: true,
      };
    } else {
      result = {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        structuredContent: { appointment: data },
      };
    }

    await logMcpInvocation({
      ctx,
      toolName: "update_appointment_status",
      args,
      result,
      startedAt,
    });
    return result;
  },
});
