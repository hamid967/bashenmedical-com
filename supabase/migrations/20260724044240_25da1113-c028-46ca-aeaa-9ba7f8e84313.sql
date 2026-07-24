-- Retry Phase 8 with ::text casts on every potentially-enum source column.

DO $$ BEGIN
  CREATE TYPE public.inbox_status AS ENUM (
    'new','reviewed','contacted','awaiting_patient','awaiting_approval',
    'appointment_created','in_progress','completed','cancelled',
    'duplicate','archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.inbox_priority AS ENUM ('low','normal','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.inbox_channel AS ENUM (
    'website','booking','patient_portal','whatsapp',
    'contact_form','reception','phone','campaign','support','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.inbox_action AS ENUM (
    'created','assign','transfer','change_priority','change_status',
    'add_note','contact_patient','request_documents','link_appointment',
    'send_notification','merge_duplicate','archive','reopen'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SEQUENCE IF NOT EXISTS public.inbox_request_seq;

CREATE TABLE IF NOT EXISTS public.inbox_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text NOT NULL UNIQUE
                 DEFAULT ('INB-' || to_char(now(),'YYMMDD') || '-'
                          || lpad(nextval('public.inbox_request_seq')::text, 5, '0')),
  source_table   text NOT NULL,
  source_id      uuid,
  channel        public.inbox_channel NOT NULL DEFAULT 'other',
  patient_id     uuid,
  patient_name   text,
  patient_phone  text,
  service_label  text,
  subject        text,
  branch_id      uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  department     text,
  priority       public.inbox_priority NOT NULL DEFAULT 'normal',
  status         public.inbox_status   NOT NULL DEFAULT 'new',
  assigned_to    uuid,
  linked_appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  required_action text,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_action_at timestamptz,
  archived_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_id)
);

CREATE INDEX IF NOT EXISTS idx_inbox_items_status_created
  ON public.inbox_items (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_items_branch   ON public.inbox_items (branch_id);
CREATE INDEX IF NOT EXISTS idx_inbox_items_channel  ON public.inbox_items (channel);
CREATE INDEX IF NOT EXISTS idx_inbox_items_assigned ON public.inbox_items (assigned_to);
CREATE INDEX IF NOT EXISTS idx_inbox_items_priority ON public.inbox_items (priority);

GRANT SELECT, INSERT, UPDATE ON public.inbox_items TO authenticated;
GRANT ALL ON public.inbox_items TO service_role;

ALTER TABLE public.inbox_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inbox_items_staff_select ON public.inbox_items;
CREATE POLICY inbox_items_staff_select ON public.inbox_items
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'reception')
    OR public.has_role(auth.uid(),'support_agent')
  );

DROP POLICY IF EXISTS inbox_items_staff_insert ON public.inbox_items;
CREATE POLICY inbox_items_staff_insert ON public.inbox_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'reception')
    OR public.has_role(auth.uid(),'support_agent')
  );

DROP POLICY IF EXISTS inbox_items_staff_update ON public.inbox_items;
CREATE POLICY inbox_items_staff_update ON public.inbox_items
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'reception')
    OR public.has_role(auth.uid(),'support_agent')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'reception')
    OR public.has_role(auth.uid(),'support_agent')
  );

CREATE OR REPLACE FUNCTION public.inbox_items_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_inbox_items_touch ON public.inbox_items;
CREATE TRIGGER trg_inbox_items_touch
  BEFORE UPDATE ON public.inbox_items
  FOR EACH ROW EXECUTE FUNCTION public.inbox_items_touch();

CREATE TABLE IF NOT EXISTS public.inbox_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        uuid NOT NULL REFERENCES public.inbox_items(id) ON DELETE CASCADE,
  actor_user_id  uuid,
  action         public.inbox_action NOT NULL,
  from_value     jsonb,
  to_value       jsonb,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbox_events_item
  ON public.inbox_events (item_id, created_at DESC);

GRANT SELECT, INSERT ON public.inbox_events TO authenticated;
GRANT ALL ON public.inbox_events TO service_role;

ALTER TABLE public.inbox_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inbox_events_staff_select ON public.inbox_events;
CREATE POLICY inbox_events_staff_select ON public.inbox_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'reception')
    OR public.has_role(auth.uid(),'support_agent')
  );

DROP POLICY IF EXISTS inbox_events_staff_insert ON public.inbox_events;
CREATE POLICY inbox_events_staff_insert ON public.inbox_events
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'reception')
      OR public.has_role(auth.uid(),'support_agent')
    )
    AND (actor_user_id IS NULL OR actor_user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.inbox_events_block_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'inbox_events is append-only'; END $$;

DROP TRIGGER IF EXISTS trg_inbox_events_no_update ON public.inbox_events;
CREATE TRIGGER trg_inbox_events_no_update
  BEFORE UPDATE ON public.inbox_events
  FOR EACH ROW EXECUTE FUNCTION public.inbox_events_block_mutation();

DROP TRIGGER IF EXISTS trg_inbox_events_no_delete ON public.inbox_events;
CREATE TRIGGER trg_inbox_events_no_delete
  BEFORE DELETE ON public.inbox_events
  FOR EACH ROW EXECUTE FUNCTION public.inbox_events_block_mutation();

CREATE OR REPLACE FUNCTION public.inbox_log_event(
  _item_id uuid,
  _action  public.inbox_action,
  _from    jsonb DEFAULT NULL,
  _to      jsonb DEFAULT NULL,
  _note    text  DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.inbox_events (item_id, actor_user_id, action, from_value, to_value, note)
  VALUES (_item_id, auth.uid(), _action, _from, _to, _note)
  RETURNING id INTO _id;
  UPDATE public.inbox_items SET last_action_at = now() WHERE id = _item_id;
  RETURN _id;
END $$;

GRANT EXECUTE ON FUNCTION public.inbox_log_event(uuid,public.inbox_action,jsonb,jsonb,text)
  TO authenticated;

-- ==== Ingestion triggers (always cast enum source columns to text) ====
CREATE OR REPLACE FUNCTION public.inbox_ingest_appointment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.inbox_items
    (source_table, source_id, channel, patient_id, patient_name, patient_phone,
     service_label, subject, branch_id, status, metadata)
  VALUES
    ('appointments', NEW.id, 'booking', NEW.patient_id, NEW.patient_name, NEW.patient_phone,
     COALESCE(NEW.reason::text, 'حجز موعد'),
     'موعد ' || NEW.appointment_date::text || ' ' || to_char(NEW.appointment_time,'HH24:MI'),
     NEW.branch_id, 'new',
     jsonb_build_object('appointment_date', NEW.appointment_date,
                        'appointment_time', NEW.appointment_time,
                        'doctor_id', NEW.doctor_id))
  ON CONFLICT (source_table, source_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.inbox_ingest_service_inquiry() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _src text := lower(coalesce(NEW.source::text,''));
  _channel public.inbox_channel;
BEGIN
  _channel := CASE _src
                WHEN 'whatsapp'       THEN 'whatsapp'::public.inbox_channel
                WHEN 'reception'      THEN 'reception'::public.inbox_channel
                WHEN 'phone'          THEN 'phone'::public.inbox_channel
                WHEN 'campaign'       THEN 'campaign'::public.inbox_channel
                WHEN 'contact_form'   THEN 'contact_form'::public.inbox_channel
                WHEN 'patient_portal' THEN 'patient_portal'::public.inbox_channel
                ELSE 'website'::public.inbox_channel
              END;
  INSERT INTO public.inbox_items
    (source_table, source_id, channel, patient_name, patient_phone,
     service_label, subject, branch_id, status, metadata)
  VALUES
    ('service_inquiries', NEW.id, _channel, NEW.full_name, NEW.mobile_e164,
     NEW.service_label, NEW.service_label, NEW.branch_id, 'new',
     jsonb_build_object('request_number', NEW.request_number))
  ON CONFLICT (source_table, source_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.inbox_ingest_home_care() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _svc text := NEW.service::text;
BEGIN
  INSERT INTO public.inbox_items
    (source_table, source_id, channel, patient_name, patient_phone,
     service_label, subject, branch_id, status)
  VALUES
    ('home_care_requests', NEW.id, 'website', NEW.patient_name, NEW.patient_phone,
     coalesce(_svc,'رعاية منزلية'),
     'رعاية منزلية' || CASE WHEN _svc IS NULL THEN '' ELSE ' — ' || _svc END,
     NEW.branch_id, 'new')
  ON CONFLICT (source_table, source_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.inbox_ingest_corporate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _st text := NEW.service_type::text;
BEGIN
  INSERT INTO public.inbox_items
    (source_table, source_id, channel, patient_name, patient_phone,
     service_label, subject, status)
  VALUES
    ('corporate_requests', NEW.id, 'website',
     NEW.company_name || ' — ' || NEW.contact_name, NEW.phone,
     _st, 'طلب شركات — ' || coalesce(_st,''), 'new')
  ON CONFLICT (source_table, source_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.inbox_ingest_second_opinion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sp text := NEW.specialty::text;
BEGIN
  INSERT INTO public.inbox_items
    (source_table, source_id, channel, patient_name, patient_phone,
     service_label, subject, status)
  VALUES
    ('second_opinion_requests', NEW.id, 'website', NEW.patient_name, NEW.phone,
     _sp, 'رأي طبي ثانٍ — ' || coalesce(_sp,''), 'new')
  ON CONFLICT (source_table, source_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.inbox_ingest_complaint() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tp text := NEW.type::text;
BEGIN
  INSERT INTO public.inbox_items
    (source_table, source_id, channel, patient_name, patient_phone,
     service_label, subject, status, priority)
  VALUES
    ('complaints', NEW.id, 'support', NEW.patient_name, NEW.patient_phone,
     coalesce(_tp,'شكوى'), 'شكوى — ' || coalesce(_tp,''),
     'new', 'high')
  ON CONFLICT (source_table, source_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.inbox_ingest_medicine_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _dt text := NEW.delivery_type::text;
BEGIN
  INSERT INTO public.inbox_items
    (source_table, source_id, channel, patient_name, patient_phone,
     service_label, subject, status)
  VALUES
    ('medicine_orders', NEW.id, 'patient_portal', NEW.patient_name, NEW.patient_phone,
     'صيدلية', 'طلب دواء (' || coalesce(_dt,'') || ')', 'new')
  ON CONFLICT (source_table, source_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.inbox_ingest_waitlist() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.inbox_items
    (source_table, source_id, channel, patient_name, patient_phone,
     service_label, subject, branch_id, status)
  VALUES
    ('appointment_waitlist', NEW.id, 'booking', NEW.patient_name, NEW.patient_phone,
     'قائمة انتظار', 'قائمة انتظار', NEW.branch_id, 'new')
  ON CONFLICT (source_table, source_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_inbox_ingest_appointments ON public.appointments;
CREATE TRIGGER trg_inbox_ingest_appointments
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.inbox_ingest_appointment();

DROP TRIGGER IF EXISTS trg_inbox_ingest_service_inquiries ON public.service_inquiries;
CREATE TRIGGER trg_inbox_ingest_service_inquiries
  AFTER INSERT ON public.service_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.inbox_ingest_service_inquiry();

DROP TRIGGER IF EXISTS trg_inbox_ingest_home_care ON public.home_care_requests;
CREATE TRIGGER trg_inbox_ingest_home_care
  AFTER INSERT ON public.home_care_requests
  FOR EACH ROW EXECUTE FUNCTION public.inbox_ingest_home_care();

DROP TRIGGER IF EXISTS trg_inbox_ingest_corporate ON public.corporate_requests;
CREATE TRIGGER trg_inbox_ingest_corporate
  AFTER INSERT ON public.corporate_requests
  FOR EACH ROW EXECUTE FUNCTION public.inbox_ingest_corporate();

DROP TRIGGER IF EXISTS trg_inbox_ingest_second_opinion ON public.second_opinion_requests;
CREATE TRIGGER trg_inbox_ingest_second_opinion
  AFTER INSERT ON public.second_opinion_requests
  FOR EACH ROW EXECUTE FUNCTION public.inbox_ingest_second_opinion();

DROP TRIGGER IF EXISTS trg_inbox_ingest_complaints ON public.complaints;
CREATE TRIGGER trg_inbox_ingest_complaints
  AFTER INSERT ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.inbox_ingest_complaint();

DROP TRIGGER IF EXISTS trg_inbox_ingest_medicine_orders ON public.medicine_orders;
CREATE TRIGGER trg_inbox_ingest_medicine_orders
  AFTER INSERT ON public.medicine_orders
  FOR EACH ROW EXECUTE FUNCTION public.inbox_ingest_medicine_order();

DROP TRIGGER IF EXISTS trg_inbox_ingest_waitlist ON public.appointment_waitlist;
CREATE TRIGGER trg_inbox_ingest_waitlist
  AFTER INSERT ON public.appointment_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.inbox_ingest_waitlist();

-- ==== Backfill (last 90 days), all enum columns cast to text ====
INSERT INTO public.inbox_items
  (source_table, source_id, channel, patient_id, patient_name, patient_phone,
   service_label, subject, branch_id, status, created_at, metadata)
SELECT 'appointments', a.id, 'booking', a.patient_id, a.patient_name, a.patient_phone,
       COALESCE(a.reason::text,'حجز موعد'),
       'موعد ' || a.appointment_date::text || ' ' || to_char(a.appointment_time,'HH24:MI'),
       a.branch_id, 'new', a.created_at,
       jsonb_build_object('appointment_date', a.appointment_date,
                          'appointment_time', a.appointment_time,
                          'doctor_id', a.doctor_id)
  FROM public.appointments a
 WHERE a.created_at > now() - interval '90 days'
ON CONFLICT (source_table, source_id) DO NOTHING;

INSERT INTO public.inbox_items
  (source_table, source_id, channel, patient_name, patient_phone,
   service_label, subject, branch_id, status, created_at, metadata)
SELECT 'service_inquiries', s.id,
       CASE lower(coalesce(s.source::text,''))
         WHEN 'whatsapp'       THEN 'whatsapp'::public.inbox_channel
         WHEN 'reception'      THEN 'reception'::public.inbox_channel
         WHEN 'phone'          THEN 'phone'::public.inbox_channel
         WHEN 'campaign'       THEN 'campaign'::public.inbox_channel
         WHEN 'contact_form'   THEN 'contact_form'::public.inbox_channel
         WHEN 'patient_portal' THEN 'patient_portal'::public.inbox_channel
         ELSE 'website'::public.inbox_channel
       END,
       s.full_name, s.mobile_e164, s.service_label, s.service_label,
       s.branch_id, 'new', s.created_at,
       jsonb_build_object('request_number', s.request_number)
  FROM public.service_inquiries s
 WHERE s.created_at > now() - interval '90 days'
ON CONFLICT (source_table, source_id) DO NOTHING;

INSERT INTO public.inbox_items
  (source_table, source_id, channel, patient_name, patient_phone,
   service_label, subject, branch_id, status, created_at)
SELECT 'home_care_requests', h.id, 'website', h.patient_name, h.patient_phone,
       coalesce(h.service::text,'رعاية منزلية'),
       'رعاية منزلية' || CASE WHEN h.service IS NULL THEN '' ELSE ' — ' || h.service::text END,
       h.branch_id, 'new', h.created_at
  FROM public.home_care_requests h
 WHERE h.created_at > now() - interval '90 days'
ON CONFLICT (source_table, source_id) DO NOTHING;

INSERT INTO public.inbox_items
  (source_table, source_id, channel, patient_name, patient_phone,
   service_label, subject, status, created_at)
SELECT 'corporate_requests', c.id, 'website',
       c.company_name || ' — ' || c.contact_name, c.phone,
       c.service_type::text, 'طلب شركات — ' || coalesce(c.service_type::text,''),
       'new', c.created_at
  FROM public.corporate_requests c
 WHERE c.created_at > now() - interval '90 days'
ON CONFLICT (source_table, source_id) DO NOTHING;

INSERT INTO public.inbox_items
  (source_table, source_id, channel, patient_name, patient_phone,
   service_label, subject, status, created_at)
SELECT 'second_opinion_requests', so.id, 'website', so.patient_name, so.phone,
       so.specialty::text, 'رأي طبي ثانٍ — ' || coalesce(so.specialty::text,''),
       'new', so.created_at
  FROM public.second_opinion_requests so
 WHERE so.created_at > now() - interval '90 days'
ON CONFLICT (source_table, source_id) DO NOTHING;

INSERT INTO public.inbox_items
  (source_table, source_id, channel, patient_name, patient_phone,
   service_label, subject, status, priority, created_at)
SELECT 'complaints', cp.id, 'support', cp.patient_name, cp.patient_phone,
       coalesce(cp.type::text,'شكوى'), 'شكوى — ' || coalesce(cp.type::text,''),
       'new', 'high', cp.created_at
  FROM public.complaints cp
 WHERE cp.created_at > now() - interval '90 days'
ON CONFLICT (source_table, source_id) DO NOTHING;

INSERT INTO public.inbox_items
  (source_table, source_id, channel, patient_name, patient_phone,
   service_label, subject, status, created_at)
SELECT 'medicine_orders', m.id, 'patient_portal', m.patient_name, m.patient_phone,
       'صيدلية', 'طلب دواء (' || coalesce(m.delivery_type::text,'') || ')', 'new', m.created_at
  FROM public.medicine_orders m
 WHERE m.created_at > now() - interval '90 days'
ON CONFLICT (source_table, source_id) DO NOTHING;

INSERT INTO public.inbox_items
  (source_table, source_id, channel, patient_name, patient_phone,
   service_label, subject, branch_id, status, created_at)
SELECT 'appointment_waitlist', w.id, 'booking', w.patient_name, w.patient_phone,
       'قائمة انتظار', 'قائمة انتظار', w.branch_id, 'new', w.created_at
  FROM public.appointment_waitlist w
 WHERE w.created_at > now() - interval '90 days'
ON CONFLICT (source_table, source_id) DO NOTHING;

INSERT INTO public.inbox_events (item_id, actor_user_id, action, note)
SELECT i.id, NULL, 'created', 'ingested (backfill)'
  FROM public.inbox_items i
 WHERE NOT EXISTS (
   SELECT 1 FROM public.inbox_events e
    WHERE e.item_id = i.id AND e.action = 'created'
 );
