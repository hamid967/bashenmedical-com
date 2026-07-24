
CREATE TABLE public.sla_alert_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  enabled boolean NOT NULL DEFAULT false,
  webhook_url text,
  email_recipients text[] NOT NULL DEFAULT '{}',
  min_priority text NOT NULL DEFAULT 'high' CHECK (min_priority IN ('urgent','high','normal','low')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.sla_alert_config TO authenticated;
GRANT ALL ON public.sla_alert_config TO service_role;
ALTER TABLE public.sla_alert_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sla_alert_config admin read"
  ON public.sla_alert_config FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "sla_alert_config admin write"
  ON public.sla_alert_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

INSERT INTO public.sla_alert_config (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE public.sla_alert_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('response','resolution')),
  priority text NOT NULL,
  channel text NOT NULL,
  overdue_ms bigint NOT NULL,
  webhook_status int,
  email_status text,
  notified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(item_id, kind)
);
CREATE INDEX sla_alert_log_notified_at_idx ON public.sla_alert_log (notified_at DESC);
GRANT SELECT ON public.sla_alert_log TO authenticated;
GRANT ALL ON public.sla_alert_log TO service_role;
ALTER TABLE public.sla_alert_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sla_alert_log admin read"
  ON public.sla_alert_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
