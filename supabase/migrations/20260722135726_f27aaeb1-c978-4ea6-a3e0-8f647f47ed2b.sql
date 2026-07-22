-- Null out any stale branch_id values that don't reference an existing branch
UPDATE public.service_inquiries si
SET branch_id = NULL
WHERE branch_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.id = si.branch_id);

-- Add the foreign key so PostgREST can embed branches:branch_id(...)
ALTER TABLE public.service_inquiries
  ADD CONSTRAINT service_inquiries_branch_id_fkey
  FOREIGN KEY (branch_id)
  REFERENCES public.branches(id)
  ON DELETE SET NULL;

-- Index the FK column to keep lookups fast
CREATE INDEX IF NOT EXISTS service_inquiries_branch_id_idx
  ON public.service_inquiries(branch_id);