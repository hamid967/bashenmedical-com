
ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS receipt_reference text;

CREATE OR REPLACE FUNCTION public.generate_refund_receipt_reference()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  candidate text;
  attempts int := 0;
BEGIN
  LOOP
    -- RF-<year>-<6 base36 chars> — short, human readable, uppercase
    candidate := 'RF-' || to_char(now(), 'YYYY') || '-' ||
                 upper(substr(replace(encode(gen_random_bytes(6), 'base64'), '/', ''), 1, 6));
    -- Clean any padding/plus chars that might appear
    candidate := regexp_replace(candidate, '[^A-Z0-9\-]', 'X', 'g');

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.refunds WHERE receipt_reference = candidate
    );

    attempts := attempts + 1;
    IF attempts > 10 THEN
      RAISE EXCEPTION 'Could not generate a unique refund receipt reference after % attempts', attempts;
    END IF;
  END LOOP;
  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_refund_receipt_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.receipt_reference IS NULL OR NEW.receipt_reference = '' THEN
    NEW.receipt_reference := public.generate_refund_receipt_reference();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refunds_set_receipt_reference ON public.refunds;
CREATE TRIGGER trg_refunds_set_receipt_reference
BEFORE INSERT ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.set_refund_receipt_reference();

-- Backfill existing rows without a reference
UPDATE public.refunds
SET receipt_reference = public.generate_refund_receipt_reference()
WHERE receipt_reference IS NULL OR receipt_reference = '';

ALTER TABLE public.refunds
  ALTER COLUMN receipt_reference SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS refunds_receipt_reference_key
  ON public.refunds (receipt_reference);
