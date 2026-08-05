-- Owner Site Builder: portal services columns + RLS for specialties/excellence editors

-- ============ EXTEND service_catalog for public /services portal ============
ALTER TABLE public.service_catalog
  ADD COLUMN IF NOT EXISTS href text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS requires_auth boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_in_portal boolean NOT NULL DEFAULT false;

ALTER TABLE public.service_catalog
  DROP CONSTRAINT IF EXISTS service_catalog_category_check;

ALTER TABLE public.service_catalog
  ADD CONSTRAINT service_catalog_category_check
  CHECK (
    category IS NULL OR category IN (
      'appointments', 'records', 'pharmacy', 'care', 'billing', 'support'
    )
  );

CREATE INDEX IF NOT EXISTS service_catalog_portal_idx
  ON public.service_catalog (show_in_portal, display_order)
  WHERE show_in_portal = true AND is_active = true;

-- Seed e-services for the public portal (do not collide with inquiry catalog slugs)
INSERT INTO public.service_catalog (
  slug, name_ar, name_en, description_ar, description_en,
  icon, href, category, requires_auth, show_in_portal, display_order, is_active
) VALUES
  ('esvc-book', 'احجز موعدك', 'Book Appointment', 'احجز مع استشاري في 12 تخصصًا.', 'Book with a consultant in 12 specialties.', 'CalendarCheck', '/book', 'appointments', false, true, 10, true),
  ('esvc-lookup', 'تعديل / إلغاء موعد', 'Manage Appointment', 'ابحث عن حجزك برقم الجوال.', 'Look up your booking by phone.', 'Search', '/lookup', 'appointments', false, true, 20, true),
  ('esvc-telemed', 'الاستشارة عن بُعد', 'Telemedicine', 'استشارة فيديو مع الطبيب.', 'Video consultation with doctor.', 'Video', '/telemedicine', 'appointments', false, true, 30, true),
  ('esvc-second', 'رأي طبي ثانٍ', 'Second Opinion', 'مراجعة استشاري مختص لحالتك.', 'Specialist review of your case.', 'Stethoscope', '/second-opinion', 'appointments', false, true, 40, true),
  ('esvc-lab-reports', 'التقارير المخبرية', 'Lab Reports', 'تحميل نتائج التحاليل.', 'Download lab results.', 'FlaskConical', '/my', 'records', true, true, 50, true),
  ('esvc-rad-reports', 'تقارير الأشعة', 'Radiology Reports', 'صور وتقارير الأشعة.', 'Images and reports.', 'Scan', '/my', 'records', true, true, 60, true),
  ('esvc-pharmacy', 'الصيدلية', 'Pharmacy', 'اطلب أدويتك أونلاين.', 'Order medicines online.', 'Pill', '/pharmacy', 'pharmacy', false, true, 70, true),
  ('esvc-delivery', 'توصيل الأدوية', 'Medicine Delivery', 'توصيل إلى باب المنزل.', 'Home delivery.', 'Truck', '/pharmacy', 'pharmacy', false, true, 80, true),
  ('esvc-track', 'تتبع الطلب', 'Track Order', 'حالة طلب الصيدلية.', 'Pharmacy order status.', 'MapPin', '/track', 'pharmacy', false, true, 90, true),
  ('esvc-home-care', 'الرعاية المنزلية', 'Home Care', 'زيارات طبية للمنزل.', 'In-home medical visits.', 'Home', '/home-care', 'care', false, true, 100, true),
  ('esvc-emergency', 'الطوارئ', 'Emergency', 'خدمات الطوارئ على مدار الساعة.', '24/7 emergency services.', 'HeartPulse', '/emergency', 'care', false, true, 110, true),
  ('esvc-intl', 'المرضى الدوليون', 'International Patients', 'خدمات المرضى من خارج المملكة.', 'Services for international patients.', 'Plane', '/international-patients', 'care', false, true, 120, true),
  ('esvc-corp', 'خدمات الشركات', 'Corporate', 'عقود واتفاقيات الشركات.', 'Corporate contracts.', 'Building2', '/corporate', 'care', false, true, 130, true),
  ('esvc-insurance-info', 'التأمين الطبي', 'Insurance', 'شركات التأمين المعتمدة.', 'Approved insurance providers.', 'ShieldCheck', '/insurance', 'billing', false, true, 140, true),
  ('esvc-packages', 'الباقات الطبية', 'Medical Packages', 'فحوصات وباقات بأسعار مميزة.', 'Screening packages.', 'CreditCard', '/packages', 'billing', false, true, 150, true),
  ('esvc-invoices', 'الفواتير', 'Invoices', 'استعراض فواتيرك.', 'View your invoices.', 'FileText', '/my', 'billing', true, true, 160, true),
  ('esvc-rate', 'قيّم تجربتك', 'Rate Us', 'شاركنا رأيك في الخدمة.', 'Share your experience.', 'Star', '/rate', 'support', false, true, 170, true),
  ('esvc-complaints', 'الشكاوى والاقتراحات', 'Feedback', 'صوتك يهمّنا.', 'Your voice matters.', 'MessageSquareWarning', '/complaints', 'support', false, true, 180, true),
  ('esvc-contact', 'تواصل معنا', 'Contact', 'أرقام وقنوات التواصل.', 'Phones & channels.', 'Phone', '/contact', 'support', false, true, 190, true),
  ('esvc-doctors', 'دليل الأطباء', 'Doctor Directory', 'تصفح الأطباء بالتخصص.', 'Browse doctors by specialty.', 'Users', '/doctors', 'support', false, true, 200, true)
ON CONFLICT (slug) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  name_en = EXCLUDED.name_en,
  description_ar = EXCLUDED.description_ar,
  description_en = EXCLUDED.description_en,
  icon = EXCLUDED.icon,
  href = EXCLUDED.href,
  category = EXCLUDED.category,
  requires_auth = EXCLUDED.requires_auth,
  show_in_portal = EXCLUDED.show_in_portal,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- ============ specialties: allow super_admin + content_manager ============
DROP POLICY IF EXISTS "admins manage specialties" ON public.specialties;
CREATE POLICY "admins manage specialties" ON public.specialties
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "editors read specialties" ON public.specialties;
CREATE POLICY "editors read specialties" ON public.specialties
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'content_manager'));

DROP POLICY IF EXISTS "editors insert specialties" ON public.specialties;
CREATE POLICY "editors insert specialties" ON public.specialties
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'content_manager'));

DROP POLICY IF EXISTS "editors update specialties" ON public.specialties;
CREATE POLICY "editors update specialties" ON public.specialties
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'content_manager'))
  WITH CHECK (public.has_role(auth.uid(), 'content_manager'));

DROP POLICY IF EXISTS "read active specialties" ON public.specialties;
CREATE POLICY "read active specialties" ON public.specialties
  FOR SELECT TO anon, authenticated
  USING (
    is_active = true
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'content_manager')
  );

-- ============ excellence_centers: content_manager write (no delete) ============
DROP POLICY IF EXISTS "editors read excellence" ON public.excellence_centers;
CREATE POLICY "editors read excellence" ON public.excellence_centers
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'content_manager'));

DROP POLICY IF EXISTS "editors insert excellence" ON public.excellence_centers;
CREATE POLICY "editors insert excellence" ON public.excellence_centers
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'content_manager'));

DROP POLICY IF EXISTS "editors update excellence" ON public.excellence_centers;
CREATE POLICY "editors update excellence" ON public.excellence_centers
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'content_manager'))
  WITH CHECK (public.has_role(auth.uid(), 'content_manager'));
