INSERT INTO public.permissions (key, category, description_ar, description_en)
VALUES
  ('system.monitor', 'system', 'عرض صحة النظام والتكاملات والمهام الخلفية', 'View system health, integrations & background jobs'),
  ('system.flags.manage', 'system', 'إدارة feature flags', 'Manage feature flags')
ON CONFLICT (key) DO UPDATE
  SET category = EXCLUDED.category,
      description_ar = EXCLUDED.description_ar,
      description_en = EXCLUDED.description_en;

INSERT INTO public.role_permissions (role, permission_key)
VALUES
  ('super_admin', 'system.monitor'),
  ('super_admin', 'system.flags.manage')
ON CONFLICT DO NOTHING;