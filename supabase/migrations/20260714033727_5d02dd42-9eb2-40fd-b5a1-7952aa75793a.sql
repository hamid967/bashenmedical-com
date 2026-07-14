CREATE OR REPLACE FUNCTION public.notify_refund_status_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_body text;
  v_kind text;
  v_amount numeric;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('processed','rejected','canceled') THEN RETURN NEW; END IF;
  IF NEW.requested_by IS NULL THEN RETURN NEW; END IF;

  v_amount := COALESCE(NEW.amount, 0);

  IF NEW.status = 'processed' THEN
    v_kind := 'refund_processed';
    v_title := 'تمت معالجة طلب الاسترداد';
    v_body := 'تم صرف مبلغ ' || v_amount::text || ' لطلب الاسترداد الخاص بك.';
  ELSIF NEW.status = 'rejected' THEN
    v_kind := 'refund_rejected';
    v_title := 'تم رفض طلب الاسترداد';
    v_body := COALESCE(NEW.decision_reason, 'يرجى التواصل مع قسم المحاسبة لمزيد من التفاصيل.');
  ELSE -- canceled
    v_kind := 'refund_canceled';
    v_title := 'تم إلغاء طلب الاسترداد';
    v_body := COALESCE(NEW.decision_reason, 'تم إلغاء الطلب.');
  END IF;

  INSERT INTO public.notifications (
    audience, user_id, kind, title, body, metadata, channel, send_status
  ) VALUES (
    'patient',
    NEW.requested_by,
    v_kind,
    v_title,
    v_body,
    jsonb_build_object(
      'refund_id', NEW.id,
      'payment_id', NEW.payment_id,
      'status', NEW.status,
      'amount', v_amount
    ),
    'in_app',
    'sent'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_refund_status_change ON public.refunds;
CREATE TRIGGER trg_notify_refund_status_change
AFTER UPDATE OF status ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.notify_refund_status_change();