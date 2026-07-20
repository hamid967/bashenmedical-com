
-- 1) Schema extension for offer state
ALTER TABLE public.appointment_waitlist
  ADD COLUMN IF NOT EXISTS offered_date DATE,
  ADD COLUMN IF NOT EXISTS offered_time TIME,
  ADD COLUMN IF NOT EXISTS offered_hold_id UUID,
  ADD COLUMN IF NOT EXISTS offered_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_waitlist_status_doctor
  ON public.appointment_waitlist (doctor_id, status)
  WHERE status = 'waiting';

-- 2) Try to fill a freed slot with the first matching waitlist entry.
CREATE OR REPLACE FUNCTION public.try_fill_waitlist_slot(
  _doctor_id UUID,
  _branch_id UUID,
  _date DATE,
  _time TIME
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wl RECORD;
  v_hold_id UUID;
  v_expires TIMESTAMPTZ := now() + interval '10 minutes';
  v_doctor_name TEXT;
  v_title TEXT;
  v_body TEXT;
BEGIN
  IF _doctor_id IS NULL OR _date IS NULL OR _time IS NULL THEN
    RETURN NULL;
  END IF;

  -- Only fill for future slots
  IF (_date::timestamp + _time) < (now() AT TIME ZONE 'Asia/Riyadh') THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_wl
  FROM public.appointment_waitlist
  WHERE doctor_id = _doctor_id
    AND status = 'waiting'
    AND _date BETWEEN preferred_from AND preferred_to
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Create the 10-minute hold
  INSERT INTO public.slot_holds (
    doctor_id, branch_id, appointment_date, appointment_time,
    session_id, expires_at
  ) VALUES (
    _doctor_id, COALESCE(_branch_id, v_wl.branch_id),
    _date, _time,
    'wl:' || v_wl.id::text,
    v_expires
  )
  RETURNING id INTO v_hold_id;

  UPDATE public.appointment_waitlist
  SET status = 'notified',
      notified_at = now(),
      offered_date = _date,
      offered_time = _time,
      offered_hold_id = v_hold_id,
      offered_expires_at = v_expires,
      updated_at = now()
  WHERE id = v_wl.id;

  SELECT COALESCE(name_ar, name_en) INTO v_doctor_name FROM public.doctors WHERE id = _doctor_id;
  v_title := 'توفّرت فتحة موعد لك';
  v_body := 'تم حجز فتحة مؤقتة لك مع ' || COALESCE(v_doctor_name, 'الطبيب')
    || ' بتاريخ ' || _date::text || ' الساعة ' || to_char(_time, 'HH24:MI')
    || '. الرجاء التأكيد خلال 10 دقائق. المرجع: ' || v_wl.reference;

  -- In-app notification (only visible if waitlist ties to a signed-in user later)
  INSERT INTO public.notifications (
    audience, kind, title, body, metadata, channel, send_status
  ) VALUES (
    'user', 'waitlist_offer', v_title, v_body,
    jsonb_build_object(
      'waitlist_id', v_wl.id,
      'reference', v_wl.reference,
      'doctor_id', _doctor_id,
      'branch_id', COALESCE(_branch_id, v_wl.branch_id),
      'date', _date,
      'time', _time,
      'hold_id', v_hold_id,
      'expires_at', v_expires
    ),
    'in_app', 'sent'
  );

  -- WhatsApp queued row (picked up by the notifications sender)
  INSERT INTO public.notifications (
    audience, kind, title, body, recipient, metadata, channel, send_status
  ) VALUES (
    'patient', 'waitlist_offer', v_title, v_body, v_wl.patient_phone,
    jsonb_build_object(
      'waitlist_id', v_wl.id,
      'reference', v_wl.reference,
      'doctor_name', v_doctor_name,
      'date', _date,
      'time', _time,
      'hold_id', v_hold_id,
      'expires_at', v_expires,
      'confirm_url', 'https://bashenmedical.com/waitlist?ref=' || v_wl.reference
        || '&phone4=' || right(regexp_replace(v_wl.patient_phone, '\D', '', 'g'), 4)
    ),
    'whatsapp', 'pending'
  );

  RETURN v_hold_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.try_fill_waitlist_slot(UUID, UUID, DATE, TIME) TO service_role;

-- 3) Trigger on appointments: fire on transition to cancelled.
CREATE OR REPLACE FUNCTION public.trg_waitlist_on_appt_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND (OLD.status IS DISTINCT FROM 'cancelled')
     AND OLD.status NOT IN ('completed','no_show','cancelled') THEN
    PERFORM public.try_fill_waitlist_slot(
      OLD.doctor_id, OLD.branch_id, OLD.appointment_date, OLD.appointment_time
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_fill_waitlist ON public.appointments;
CREATE TRIGGER appointments_fill_waitlist
  AFTER UPDATE OF status ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_waitlist_on_appt_cancel();

-- 4) Confirm a waitlist offer (public — phone4 is the auth).
CREATE OR REPLACE FUNCTION public.confirm_waitlist_offer(
  _ref TEXT,
  _phone4 TEXT
) RETURNS TABLE(ok BOOLEAN, appointment_id UUID, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wl RECORD;
  v_book JSONB;
  v_appt_id UUID;
BEGIN
  IF _ref IS NULL OR _phone4 IS NULL OR length(_phone4) <> 4 THEN
    RETURN QUERY SELECT false, NULL::uuid, 'بيانات غير مكتملة'; RETURN;
  END IF;

  SELECT * INTO v_wl
  FROM public.appointment_waitlist
  WHERE reference = upper(trim(_ref))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, 'لم يتم العثور على الطلب'; RETURN;
  END IF;

  IF right(regexp_replace(v_wl.patient_phone, '\D', '', 'g'), 4) <> _phone4 THEN
    RETURN QUERY SELECT false, NULL::uuid, 'لم يتم العثور على الطلب'; RETURN;
  END IF;

  IF v_wl.status <> 'notified' OR v_wl.offered_hold_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, 'لا توجد فتحة معروضة حالياً'; RETURN;
  END IF;

  IF v_wl.offered_expires_at IS NULL OR v_wl.offered_expires_at < now() THEN
    -- expire the offer and let the next cancellation flow pick another candidate
    UPDATE public.appointment_waitlist
    SET status = 'waiting',
        offered_hold_id = NULL,
        offered_expires_at = NULL,
        updated_at = now()
    WHERE id = v_wl.id;
    RETURN QUERY SELECT false, NULL::uuid, 'انتهت مدة العرض. سنُعلمك بأقرب فتحة جديدة.'; RETURN;
  END IF;

  -- Reuse the atomic booker (validates the hold + inserts the appointment).
  v_book := public.book_appointment_atomic(
    p_doctor_id       := v_wl.doctor_id,
    p_branch_id       := v_wl.branch_id,
    p_specialty_id    := v_wl.specialty_id,
    p_appointment_date:= v_wl.offered_date,
    p_appointment_time:= v_wl.offered_time,
    p_patient_name    := v_wl.patient_name,
    p_patient_phone   := v_wl.patient_phone,
    p_reason          := 'حجز من قائمة الانتظار',
    p_hold_id         := v_wl.offered_hold_id,
    p_initial_status  := 'pending_verification'::appointment_status
  );

  IF (v_book ->> 'ok')::boolean IS NOT TRUE THEN
    RETURN QUERY SELECT false, NULL::uuid,
      COALESCE(v_book ->> 'message', 'تعذّر إتمام الحجز'); RETURN;
  END IF;

  v_appt_id := (v_book ->> 'appointment_id')::uuid;

  UPDATE public.appointment_waitlist
  SET status = 'fulfilled',
      offered_hold_id = NULL,
      offered_expires_at = NULL,
      updated_at = now()
  WHERE id = v_wl.id;

  RETURN QUERY SELECT true, v_appt_id, 'تم تأكيد الحجز';
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_waitlist_offer(TEXT, TEXT) TO anon, authenticated, service_role;
