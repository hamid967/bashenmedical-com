import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout for /branches and /branches/$slug.
 * List content lives in branches.index.tsx so the detail page can render
 * through <Outlet /> (Andalusia-style branch hub).
 */
export const Route = createFileRoute("/branches")({
  component: () => <Outlet />,
});
