import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/doctor/")({
  beforeLoad: () => {
    throw redirect({ to: "/doctor/workspace" });
  },
});
