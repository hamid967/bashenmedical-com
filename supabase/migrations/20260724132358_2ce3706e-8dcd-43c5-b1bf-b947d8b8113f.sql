
-- Insurance State Machine (Batch A3)
-- 1) Audit table
CREATE TABLE IF NOT EXISTS public.insurance_approval_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID NOT NULL REFERENCES public.insurance_approvals(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_user_id UUID,
  note TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.insurance_approval_events TO authenticated;
GRANT ALL ON public.insurance_approval_events TO service_role;

ALTER TABLE public.insurance_approval_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insurance_events_admin_read"
ON public.insurance_approval_events
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'reception')
  OR public.has_role(auth.uid(), 'branch_manager')
);

CREATE POLICY "insurance_events_service_write"
ON public.insurance_approval_events
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'reception')
  OR public.has_role(auth.uid(), 'branch_manager')
);

CREATE INDEX IF NOT EXISTS idx_insurance_events_approval ON public.insurance_approval_events(approval_id, created_at DESC);

-- 2) State machine RPC
CREATE OR REPLACE FUNCTION public.transition_insurance_approval(
  _approval_id UUID,
  _to_status TEXT,
  _note TEXT DEFAULT NULL,
  _meta JSONB DEFAULT '{}'::jsonb
)
RETURNS public.insurance_approvals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.insurance_approvals;
  _from TEXT;
  _allowed TEXT[];
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;

  IF NOT (
    public.has_role(_uid, 'admin')
    OR public.has_role(_uid, 'super_admin')
    OR public.has_role(_uid, 'reception')
    OR public.has_role(_uid, 'branch_manager')
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row FROM public.insurance_approvals WHERE id = _approval_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: %', _approval_id USING ERRCODE = 'P0002';
  END IF;

  _from := COALESCE(_row.status, 'draft');

  _allowed := CASE _from
    WHEN 'draft'            THEN ARRAY['submitted','cancelled']
    WHEN 'submitted'        THEN ARRAY['under_review','cancelled','needs_more_docs']
    WHEN 'under_review'     THEN ARRAY['approved','partial','rejected','needs_more_docs']
    WHEN 'needs_more_docs'  THEN ARRAY['submitted','cancelled']
    WHEN 'approved'         THEN ARRAY['expired','cancelled']
    WHEN 'partial'          THEN ARRAY['expired','cancelled']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (_to_status = ANY(_allowed)) THEN
    RAISE EXCEPTION 'ILLEGAL_TRANSITION: % -> %', _from, _to_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.insurance_approvals SET
    status       = _to_status,
    submitted_at = CASE WHEN _to_status = 'submitted' AND submitted_at IS NULL THEN now() ELSE submitted_at END,
    reviewed_at  = CASE WHEN _to_status IN ('approved','partial','rejected') THEN now() ELSE reviewed_at END,
    expires_at   = CASE
                     WHEN _to_status IN ('approved','partial') AND expires_at IS NULL
                       THEN now() + interval '30 days'
                     ELSE expires_at
                   END,
    approved_amount = COALESCE((_meta->>'approved_amount')::numeric, approved_amount),
    patient_share   = COALESCE((_meta->>'patient_share')::numeric, patient_share),
    missing_documents = CASE
                          WHEN _meta ? 'missing_documents'
                            THEN ARRAY(SELECT jsonb_array_elements_text(_meta->'missing_documents'))
                          ELSE missing_documents
                        END,
    notes = COALESCE(_note, notes),
    updated_at = now()
  WHERE id = _approval_id
  RETURNING * INTO _row;

  INSERT INTO public.insurance_approval_events(approval_id, from_status, to_status, actor_user_id, note, meta)
  VALUES (_approval_id, _from, _to_status, _uid, _note, COALESCE(_meta,'{}'::jsonb));

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_insurance_approval(UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_insurance_approval(UUID, TEXT, TEXT, JSONB) TO authenticated;
