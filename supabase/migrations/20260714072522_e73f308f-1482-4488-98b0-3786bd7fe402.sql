
ALTER TABLE public.service_inquiries
  ADD COLUMN IF NOT EXISTS link_token uuid,
  ADD COLUMN IF NOT EXISTS linked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_service_inquiries_link_token
  ON public.service_inquiries(link_token) WHERE link_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_inquiries_user_id
  ON public.service_inquiries(user_id) WHERE user_id IS NOT NULL;

-- RPC used by patient portal to attach an inquiry to the signed-in user
-- when they present the request_number + one-shot link_token given on
-- creation. SECURITY DEFINER: bypasses RLS so it can find rows whose
-- user_id is still NULL (owner-read policy would hide them).
CREATE OR REPLACE FUNCTION public.claim_service_inquiry(
  _request_number text,
  _link_token uuid
) RETURNS TABLE (id uuid, request_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.service_inquiries%ROWTYPE;
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

  RETURN QUERY SELECT _row.id, _row.request_number;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_service_inquiry(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_service_inquiry(text, uuid) TO authenticated;
