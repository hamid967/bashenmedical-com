
-- notifications: covering indexes for the "unread by channel" query pattern
CREATE INDEX IF NOT EXISTS idx_notifications_user_channel_unread
  ON public.notifications (user_id, channel)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_audience_channel_unread
  ON public.notifications (audience, channel)
  WHERE read_at IS NULL;

-- specialties: sorted public list
CREATE INDEX IF NOT EXISTS idx_specialties_active_sort
  ON public.specialties (is_active, sort_order)
  WHERE is_active = true;

-- web_vitals: dashboard time+metric filters
CREATE INDEX IF NOT EXISTS idx_web_vitals_created_metric
  ON public.web_vitals (created_at DESC, metric);
