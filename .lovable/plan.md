## SECURITY DEFINER Audit — الدفعة الثانية

### الهدف
تقليل صلاحيات `EXECUTE` على الدوال `SECURITY DEFINER` المتبقية (حوالي 146 تحذير 0028/0029) مع توثيق كل خطوة، بدون كسر أي مسار عام موثّق في `PUBLIC_READ_ALLOWLIST`.

### الخطوات

1. **جرد شامل قبل التنفيذ**
   - استعلام `pg_proc` لكل دوال `prosecdef = true` في `public` مع أعمدة: `anon_exec`, `authenticated_exec`, `public_exec`, بادئة `_`، وجود على الـallowlist.
   - حفظ الناتج في `docs/reports/secdef-inventory-2026-07-29.md` كخط أساس.

2. **تصنيف الدوال إلى ثلاث فئات**
   - **A. Trigger-only / Internal helpers** — لا تُستدعى من العميل: `REVOKE EXECUTE FROM anon, authenticated, PUBLIC` والإبقاء على `service_role` فقط.
   - **B. Authenticated-only RPCs** (لوحات إدارية، admin/doctor/staff): `REVOKE FROM anon, PUBLIC` والإبقاء على `authenticated` (مع حماية داخلية `has_role`).
   - **C. Public/Guest RPCs** على الـallowlist (`book_slot`, `track_orders_by_phone`, …): إبقاء `anon` صراحةً، مع `REVOKE FROM PUBLIC` للتأكد أن لا leakage غير مقصود.

3. **Migration واحدة قابلة للمراجعة**
   - ملف SQL منفصل يحتوي فقط `REVOKE`/`GRANT` بدون تعديل جسم أي دالة.
   - كل مجموعة معلّقة بسطر يشرح فئتها ومبرّرها.
   - لا مساس بالدوال المُعالجة في الدفعة الأولى (`refresh_bi_daily_kpis`, `admin_list_data_contracts`, …).

4. **التحقق بعد التنفيذ**
   - إعادة تشغيل `supabase--linter` ومقارنة عدد تحذيرات 0028/0029.
   - تشغيل `tests/security/test_secdef_privileges.py` و`test_execute_privileges_regression.py` و`test_a2_a3_grants_pinned.py` — لا بد أن تمر كلها.
   - تشغيل `tests/rls/doctor-workflow.rls.test.ts` و`patient-workflow.rls.test.ts` كتحقّق دخاني على أهم مسارات RLS التي تعتمد على دوال SECDEF.

5. **التوثيق**
   - `docs/reports/secdef-batch2-2026-07-29.md`: جدول قبل/بعد لكل دالة (الدور، EXECUTE قبل، EXECUTE بعد، المبرّر، حماية داخلية موجودة).
   - تحديث `docs/security/public_read_allowlist.md` إذا تغيّر أي إدخال.
   - تحديث `tests/security/test_secdef_privileges.py::PUBLIC_READ_ALLOWLIST` إن اقتضى الأمر.

### مخرجات نهائية
- Migration واحدة تحتوي `REVOKE`/`GRANT` مصنّفة.
- تقريران في `docs/reports/`: الجرد + قبل/بعد.
- تحذيرات 0028/0029 تقترب من الصفر باستثناء ما هو في الـallowlist رسميًا.
- كل الاختبارات الأمنية وRLS خضراء.

### خارج النطاق
- لا تعديل على أجسام الدوال (search_path/security invoker) — يبقى للدفعة الثالثة إن لزم.
- NPHIES والدفع مؤجّلان.
- refactor `any` → typed خارج نطاق هذه الدفعة.
