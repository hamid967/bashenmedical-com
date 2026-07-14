
ALTER TABLE public.service_inquiry_attachments
  ADD COLUMN IF NOT EXISTS scan_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS scan_result jsonb,
  ADD COLUMN IF NOT EXISTS scan_completed_at timestamptz;

ALTER TABLE public.service_inquiry_attachments
  DROP CONSTRAINT IF EXISTS service_inquiry_attachments_scan_status_check;

ALTER TABLE public.service_inquiry_attachments
  ADD CONSTRAINT service_inquiry_attachments_scan_status_check
  CHECK (scan_status IN ('pending','scanning','clean','infected','error'));

CREATE INDEX IF NOT EXISTS idx_inquiry_attachments_scan_status
  ON public.service_inquiry_attachments(scan_status);
