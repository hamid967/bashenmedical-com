
-- Refunds: allow patients to request refunds on their own payments and view them
-- Also sync payment/invoice status when a refund is processed

-- 1) Patient SELECT own refunds
CREATE POLICY "patient read own refunds"
ON public.refunds
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.payments pay
    JOIN public.invoices inv ON inv.id = pay.invoice_id
    JOIN public.patients pt ON pt.id = inv.patient_id
    WHERE pay.id = refunds.payment_id
      AND pt.profile_id = auth.uid()
  )
);

-- 2) Patient INSERT refund request (must be pending, requested_by = self, not mock)
CREATE POLICY "patient request own refund"
ON public.refunds
FOR INSERT
WITH CHECK (
  status = 'pending'
  AND requested_by = auth.uid()
  AND approved_by IS NULL
  AND is_mock = false
  AND EXISTS (
    SELECT 1 FROM public.payments pay
    JOIN public.invoices inv ON inv.id = pay.invoice_id
    JOIN public.patients pt ON pt.id = inv.patient_id
    WHERE pay.id = refunds.payment_id
      AND pt.profile_id = auth.uid()
  )
);

-- 3) Patient UPDATE own pending refund to cancel it (status -> canceled)
CREATE POLICY "patient cancel own pending refund"
ON public.refunds
FOR UPDATE
USING (
  status = 'pending'
  AND requested_by = auth.uid()
)
WITH CHECK (
  status IN ('pending', 'canceled')
  AND requested_by = auth.uid()
);

-- 4) Trigger: sync payment + invoice status on refund state transitions
CREATE OR REPLACE FUNCTION public.sync_on_refund_processed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id UUID;
  v_payment_amount NUMERIC;
BEGIN
  IF NEW.status = 'processed' AND (OLD.status IS DISTINCT FROM 'processed') THEN
    SELECT invoice_id, amount INTO v_invoice_id, v_payment_amount
    FROM public.payments WHERE id = NEW.payment_id;

    -- Mark payment as refunded (full) or partially_refunded
    IF NEW.amount >= v_payment_amount THEN
      UPDATE public.payments SET status = 'refunded', updated_at = now()
      WHERE id = NEW.payment_id;
    ELSE
      UPDATE public.payments SET status = 'partially_refunded', updated_at = now()
      WHERE id = NEW.payment_id;
    END IF;

    -- Recompute invoice status based on remaining successful payments vs total
    UPDATE public.invoices inv
    SET status = CASE
          WHEN COALESCE(paid_sum.total, 0) <= 0 THEN 'refunded'
          WHEN COALESCE(paid_sum.total, 0) + 0.01 >= inv.total THEN 'paid'
          ELSE 'partially_paid'
        END,
        paid_at = CASE
          WHEN COALESCE(paid_sum.total, 0) + 0.01 >= inv.total THEN inv.paid_at
          ELSE NULL
        END,
        updated_at = now()
    FROM (
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM public.payments
      WHERE invoice_id = v_invoice_id
        AND status IN ('succeeded','completed','paid')
    ) AS paid_sum
    WHERE inv.id = v_invoice_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_on_refund_processed ON public.refunds;
CREATE TRIGGER trg_sync_on_refund_processed
AFTER UPDATE ON public.refunds
FOR EACH ROW
EXECUTE FUNCTION public.sync_on_refund_processed();

-- 5) Ensure grants (idempotent) for authenticated role on refunds
GRANT SELECT, INSERT, UPDATE ON public.refunds TO authenticated;
