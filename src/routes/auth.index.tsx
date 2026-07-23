/**
 * `/auth` index — redirect to `/auth/login` while preserving the optional
 * `?next` param so post-login redirect-back keeps working from anywhere
 * that still links to the old `/auth` URL (older bookmarks, the
 * `_authenticated` layout's legacy fallback, etc.).
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

const Search = z.object({
  next: z.string().optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth/")({
  validateSearch: (s) => Search.parse(s),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/auth/login",
      search: { next: search.next ?? search.redirect ?? undefined },
    });
  },
});
