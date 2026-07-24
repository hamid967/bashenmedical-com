create table if not exists public.client_error_events (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  release text,
  route text not null,
  message text not null,
  stack text,
  mechanism text not null check (mechanism in ('onerror','unhandledrejection','react_error_boundary','manual')),
  severity text not null default 'error' check (severity in ('error','warning','info')),
  user_agent text,
  correlation_id text,
  fingerprint text generated always as (
    substr(md5(coalesce(message,'') || '|' || coalesce(route,'') || '|' || coalesce(mechanism,'')), 1, 16)
  ) stored,
  user_id uuid references auth.users(id) on delete set null,
  extra jsonb
);

create index if not exists client_error_events_ts_idx on public.client_error_events (ts desc);
create index if not exists client_error_events_fingerprint_idx on public.client_error_events (fingerprint, ts desc);
create index if not exists client_error_events_route_idx on public.client_error_events (route, ts desc);

grant select on public.client_error_events to authenticated;
grant insert on public.client_error_events to anon, authenticated;
grant all on public.client_error_events to service_role;

alter table public.client_error_events enable row level security;

drop policy if exists "admins read client errors" on public.client_error_events;
create policy "admins read client errors"
on public.client_error_events
for select
to authenticated
using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'));

drop policy if exists "anyone reports client errors" on public.client_error_events;
create policy "anyone reports client errors"
on public.client_error_events
for insert
to anon, authenticated
with check (
  length(message) between 1 and 2000
  and length(route) between 1 and 512
  and (stack is null or length(stack) <= 8000)
);