DROP POLICY IF EXISTS "ai_stream_events insert anon" ON public.ai_stream_events;

CREATE POLICY "ai_stream_events insert anon"
  ON public.ai_stream_events
  FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);

CREATE POLICY "ai_stream_events insert authenticated"
  ON public.ai_stream_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());