
CREATE TABLE public.reconciliation_adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  linked_nphies_request_id UUID NULL REFERENCES public.nphies_requests(id) ON DELETE SET NULL,
  unlink_nphies BOOLEAN NOT NULL DEFAULT false,
  override_expected_share NUMERIC(12,2) NULL,
  override_invoice_status TEXT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  reason TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ NULL,
  revoked_by UUID NULL REFERENCES auth.users(id),
  revoke_reason TEXT NULL,
  CONSTRAINT reason_not_blank CHECK (length(btrim(reason)) >= 3)
);

CREATE INDEX idx_recon_adj_invoice_active
  ON public.reconciliation_adjustments (invoice_id)
  WHERE revoked_at IS NULL;
CREATE INDEX idx_recon_adj_created_at
  ON public.reconciliation_adjustments (created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.reconciliation_adjustments TO authenticated;
GRANT ALL ON public.reconciliation_adjustments TO service_role;

ALTER TABLE public.reconciliation_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read reconciliation adjustments"
  ON public.reconciliation_adjustments
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Admins create reconciliation adjustments"
  ON public.reconciliation_adjustments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
    )
  );

-- Only the revoke fields are mutable; core columns stay immutable via trigger.
CREATE POLICY "Admins revoke reconciliation adjustments"
  ON public.reconciliation_adjustments
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE OR REPLACE FUNCTION public.recon_adj_prevent_core_edits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
     OR NEW.linked_nphies_request_id IS DISTINCT FROM OLD.linked_nphies_request_id
     OR NEW.unlink_nphies IS DISTINCT FROM OLD.unlink_nphies
     OR NEW.override_expected_share IS DISTINCT FROM OLD.override_expected_share
     OR NEW.override_invoice_status IS DISTINCT FROM OLD.override_invoice_status
     OR NEW.resolved IS DISTINCT FROM OLD.resolved
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only revoke fields (revoked_at, revoked_by, revoke_reason) may be modified on reconciliation_adjustments';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recon_adj_prevent_core_edits
  BEFORE UPDATE ON public.reconciliation_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.recon_adj_prevent_core_edits();
