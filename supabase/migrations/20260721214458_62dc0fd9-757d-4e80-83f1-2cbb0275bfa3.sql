create table if not exists public.ai_stream_events (
  id uuid primary key default gen_random_uuid(),
  surface text not null check (surface in ('public','portal','admin')),
  model text,
  latency_ms integer not null default 0 check (latency_ms >= 0),
  ttfb_ms integer check (ttfb_ms is null or ttfb_ms >= 0),
  delta_count integer not null default 0 check (delta_count >= 0),
  resume_attempts integer not null default 0 check (resume_attempts >= 0),
  completed boolean not null default false,
  aborted boolean not null default false,
  error_status integer,
  error_type text,
  prompt_tokens integer,
  completion_tokens integer,
  user_id uuid,
  created_at timestamptz not null default now()
);

grant select on public.ai_stream_events to authenticated;
grant insert on public.ai_stream_events to anon, authenticated;
grant all on public.ai_stream_events to service_role;

alter table public.ai_stream_events enable row level security;

create policy "ai_stream_events insert anon"
  on public.ai_stream_events for insert
  to anon, authenticated
  with check (true);

create policy "ai_stream_events read admin"
  on public.ai_stream_events for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  );

create index if not exists ai_stream_events_created_idx
  on public.ai_stream_events (created_at desc);
create index if not exists ai_stream_events_surface_created_idx
  on public.ai_stream_events (surface, created_at desc);
create index if not exists ai_stream_events_errors_idx
  on public.ai_stream_events (created_at desc)
  where completed = false or error_status is not null;