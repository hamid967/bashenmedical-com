-- Add decision reason + processed_at for richer refund timeline
ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS decision_reason text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

-- Backfill processed_at from updated_at for already-processed rows
UPDATE public.refunds
SET processed_at = updated_at
WHERE status IN ('processed','rejected','canceled') AND processed_at IS NULL;

-- Trigger: stamp processed_at when status transitions to a terminal state
CREATE OR REPLACE FUNCTION public.stamp_refund_processed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('processed','rejected','canceled')
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.processed_at IS NULL THEN
    NEW.processed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_refund_processed_at ON public.refunds;
CREATE TRIGGER trg_stamp_refund_processed_at
BEFORE UPDATE ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.stamp_refund_processed_at();