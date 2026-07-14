DROP FUNCTION IF EXISTS public.track_orders_by_phone(text);

CREATE OR REPLACE FUNCTION public.service_inquiry_updates_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'service_inquiry_updates rows are immutable';
END;
$function$;