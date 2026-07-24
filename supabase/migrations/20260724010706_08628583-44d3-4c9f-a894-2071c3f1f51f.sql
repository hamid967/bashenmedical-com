
CREATE OR REPLACE FUNCTION public.auto_transition_content_items()
RETURNS TABLE(published_count integer, archived_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_published integer := 0;
  v_archived integer := 0;
BEGIN
  WITH promoted AS (
    UPDATE public.content_items ci
    SET status = 'published'::content_item_status,
        updated_at = now()
    WHERE ci.status = ANY (ARRAY['draft','review','approved','scheduled']::content_item_status[])
      AND ci.starts_at IS NOT NULL
      AND ci.starts_at <= now()
      AND (ci.ends_at IS NULL OR ci.ends_at > now())
      AND ci.disabled_at IS NULL
    RETURNING ci.id, to_jsonb(ci.*) AS snap
  ), ins_pub AS (
    INSERT INTO public.content_item_versions(item_id, changed_by, snapshot, reason)
    SELECT id, NULL, snap, 'auto:published' FROM promoted
    RETURNING 1
  )
  SELECT count(*)::int INTO v_published FROM ins_pub;

  WITH ended AS (
    UPDATE public.content_items ci
    SET status = 'archived'::content_item_status,
        updated_at = now()
    WHERE ci.status <> 'archived'::content_item_status
      AND ci.ends_at IS NOT NULL
      AND ci.ends_at <= now()
    RETURNING ci.id, to_jsonb(ci.*) AS snap
  ), ins_arch AS (
    INSERT INTO public.content_item_versions(item_id, changed_by, snapshot, reason)
    SELECT id, NULL, snap, 'auto:archived' FROM ended
    RETURNING 1
  )
  SELECT count(*)::int INTO v_archived FROM ins_arch;

  RETURN QUERY SELECT v_published, v_archived;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_transition_content_items() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_transition_content_items() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_transition_content_items() TO service_role;
