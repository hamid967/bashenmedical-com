
CREATE OR REPLACE FUNCTION public.claim_service_inquiry(_request_number text, _link_token uuid)
 RETURNS TABLE(id uuid, request_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.service_inquiries%ROWTYPE;
  _email text;
  _phone text;
  _title text;
  _body text;
  _meta jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.service_inquiries
     SET user_id = _uid,
         linked_at = now(),
         link_token = NULL
   WHERE request_number = _request_number
     AND link_token = _link_token
     AND user_id IS NULL
   RETURNING * INTO _row;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.service_inquiry_updates (inquiry_id, update_type, internal_note, metadata, created_by)
  VALUES (_row.id, 'note', 'Claimed by patient via portal',
          jsonb_build_object('event','claim'), _uid);

  -- إشعار المريض بربط الاستفسار واكتمال التحقق
  SELECT email, phone INTO _email, _phone
    FROM public.profiles WHERE id = _uid;

  _title := 'تم ربط استفسارك بحسابك';
  _body  := 'تم التحقق من رقم الطلب ' || _row.request_number
            || ' وربطه بحسابك بنجاح. يمكنك متابعة الحالة من صفحة "استفساراتي".';
  _meta  := jsonb_build_object(
             'event', 'inquiry_linked',
             'inquiry_id', _row.id,
             'request_number', _row.request_number,
             'service_label', _row.service_label,
             'branch_id', _row.branch_id
           );

  -- إشعار داخل التطبيق (مُعتبر مُرسلاً فوراً)
  INSERT INTO public.notifications
    (audience, user_id, kind, title, body, metadata, channel, send_status, sent_at, recipient)
  VALUES
    ('user', _uid, 'inquiry_linked', _title, _body, _meta, 'in_app', 'sent', now(), NULL);

  -- إشعار بريد إلكتروني (قيد الإرسال) إن توفّر البريد
  IF _email IS NOT NULL AND length(trim(_email)) > 0 THEN
    INSERT INTO public.notifications
      (audience, user_id, kind, title, body, metadata, channel, send_status, recipient)
    VALUES
      ('user', _uid, 'inquiry_linked', _title, _body, _meta, 'email', 'queued', _email);
  END IF;

  -- رسالة نصية (قيد الإرسال) إن توفّر الجوال
  IF _phone IS NOT NULL AND length(trim(_phone)) > 0 THEN
    INSERT INTO public.notifications
      (audience, user_id, kind, title, body, metadata, channel, send_status, recipient)
    VALUES
      ('user', _uid, 'inquiry_linked', _title, _body, _meta, 'sms', 'queued', _phone);
  END IF;

  RETURN QUERY SELECT _row.id, _row.request_number;
END;
$function$;
