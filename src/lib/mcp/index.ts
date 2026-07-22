import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listBranches from "./tools/list-branches";
import listDoctors from "./tools/list-doctors";
import listMyAppointments from "./tools/list-my-appointments";
import createAppointment from "./tools/create-appointment";
import updateAppointmentStatus from "./tools/update-appointment-status";

// The OAuth issuer MUST be the direct Supabase host — the .lovable.cloud proxy
// URL is rejected by mcp-js as an issuer mismatch. Read the project ref from
// the Vite-inlined literal so publish and preview both produce the correct URL.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "baeshen-medical-mcp",
  title: "Baeshen Medical MCP",
  version: "0.1.0",
  instructions:
    "Tools for Baeshen Medical Complex. Use `list_branches` and `list_doctors` for public directory data. Use `list_my_appointments` to view the signed-in user's appointments, `create_appointment` to book a new one, and `update_appointment_status` to cancel or confirm an appointment (row-level security applies).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listBranches,
    listDoctors,
    listMyAppointments,
    createAppointment,
    updateAppointmentStatus,
  ],
});
