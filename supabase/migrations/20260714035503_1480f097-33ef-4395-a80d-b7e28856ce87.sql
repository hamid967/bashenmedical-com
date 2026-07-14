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
  v_has_receipt boolean := false;
  v_metadata jsonb;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('processed','rejected','canceled') THEN RETURN NEW; END IF;
  IF NEW.requested_by IS NULL THEN RETURN NEW; END IF;

  v_amount := COALESCE(NEW.amount, 0);

  IF NEW.status = 'processed' THEN
    v_kind := 'refund_processed';
    v_title := 'تمت معالجة طلب الاسترداد';
    v_body := 'تم صرف مبلغ ' || v_amount::text || '. إيصال الاسترداد (PDF) متاح للتنزيل من هذا الإشعار.';
    v_has_receipt := true;
  ELSIF NEW.status = 'rejected' THEN
    v_kind := 'refund_rejected';
    v_title := 'تم رفض طلب الاسترداد';
    v_body := COALESCE(NEW.decision_reason, 'يرجى التواصل مع قسم المحاسبة لمزيد من التفاصيل.');
  ELSE
    v_kind := 'refund_canceled';
    v_title := 'تم إلغاء طلب الاسترداد';
    v_body := COALESCE(NEW.decision_reason, 'تم إلغاء الطلب.') || ' — إيصال الإلغاء (PDF) متاح للتنزيل من هذا الإشعار.';
    v_has_receipt := true;
  END IF;

  v_metadata := jsonb_build_object(
    'refund_id', NEW.id,
    'payment_id', NEW.payment_id,
    'status', NEW.status,
    'amount', v_amount,
    'receipt_reference', NEW.receipt_reference,
    'has_receipt', v_has_receipt,
    'receipt_url', CASE WHEN v_has_receipt
      THEN '/portal/refunds?receipt=' || NEW.id::text
      ELSE NULL END
  );

  INSERT INTO public.notifications (
    audience, user_id, kind, title, body, metadata, channel, send_status
  ) VALUES (
    'patient',
    NEW.requested_by,
    v_kind,
    v_title,
    v_body,
    v_metadata,
    'in_app',
    'sent'
  );

  RETURN NEW;
END;
$$;