# خطة تنفيذ اختبارات E2E حرجة بعد تغيير A2

الهدف: التحقق من أن REVOKE على G2/G3/G4 لم يكسر أي مسار حرج للمستخدم النهائي أو الطاقم الطبي، وتقرير النتائج تلقائيًا بعد الدمج.

## النطاق (Scope)

| المسار | نوع الاختبار | لماذا حرج بعد A2 |
|---|---|---|
| `/doctors` + `/doctors/$slug` | Public read | يعتمد على `has_role` وسياسات RLS للكتالوج |
| `/book` (رحلة كاملة) | Guest flow | يستدعي `_assert_slot_free`, `try_fill_waitlist_slot`, `slot_holds` |
| `/reservations/manage` (OTP) | Guest auth | يستخدم `_appointment_belongs_to_me` |
| `/portal/appointments` + `/portal/records` | Authenticated user | يعتمد على `requireSupabaseAuth` + قراءات RLS |
| `/admin/inbox` + `/admin/audit-logs` + `/admin/role-permissions-matrix` | Staff | يستدعي 21 دالة G3 |
| `/api/public/book/hold` + `/api/public/inquiries/create` | Rate-limited APIs | تأكد أن REVOKE لم يمنع الاستدعاء المشروع |

## بنية الاختبارات

```text
tests/e2e/critical-post-a2/
  __init__.py
  _shared.py                       # helpers: login, artifacts, retries
  test_public_doctors.py           # /doctors listing + detail + i18n
  test_booking_guest_flow.py       # slot pick → hold → OTP → confirm
  test_reservation_manage_otp.py   # find → OTP → cancel/reschedule + undo
  test_portal_authenticated.py     # login as patient → appointments + records
  test_admin_console_staff.py      # login as admin → inbox + audit + matrix
  test_public_apis_rate_limit.py   # POST /api/public/* happy + 429
```

## المهام التنفيذية

1. **إعداد بيانات ثابتة**
   - تشغيل `scripts/ci/ensure-e2e-admin.py` (موجود) لمستخدم admin.
   - تشغيل `scripts/ci/ensure-e2e-patient.py` (موجود) لمستخدم مريض.
   - إضافة `scripts/ci/ensure-e2e-doctor-slot.py` جديد: يضمن وجود طبيب واحد + branch + slot متاح في نافذة `now + 24h..48h` لتفادي هشاشة التوقيت.

2. **الملفات الجديدة** (تحت `tests/e2e/critical-post-a2/`) — تعتمد على `_helpers.py` القائم (`retry_async`, artifact capture).

3. **CI job جديد** `.github/workflows/ci.yml`:
   - Job اسمه `e2e-critical-post-a2` يعمل بعد `build` و`migrations`.
   - يشغّل السكربتات الثلاثة أولاً، ثم `pytest tests/e2e/critical-post-a2/ -n 2 --maxfail=3`.
   - يرفع `screenshots/` + `traces/` كـ artifact عند الفشل.
   - ينشر تعليقًا لاصقًا (sticky) على PR يلخّص النتائج (Pass/Fail لكل ملف + رابط الـ artifact).

4. **معايير القبول (DoD)**
   - كل مسار حرج يمرّ في AR وEN.
   - لا استعلام يعود بـ `permission denied for function ...` (rg على logs).
   - زمن الإجابة لكل خطوة < 3s p95.
   - عند الفشل: HAR + screenshot + trace متاحة خلال دقيقتين من انتهاء الـ job.

## تقرير النتائج بعد الدمج

- بعد أول merge لهذه الخطة، ينشر CI تعليقًا على PR وملخصًا في `admin.visual-analytics` (قسم جديد "Post-A2 E2E status").
- تقرير Markdown مختصر يُلحق تلقائياً في `.workspace/reports/post-a2-e2e-<date>.md` يحتوي:
  - Pass/Fail لكل من المسارات الستة.
  - أي دالة G2/G3/G4 ظهرت في logs الفشل (candidates للـ rollback الجزئي).
  - توصية: **Keep hardened** أو **Rollback via prepared migration**.

## تفاصيل تقنية

- استخدام `retry_async(attempts=3, backoff=[0.5,1,2])` على كل خطوة شبكة.
- تسجيل الدخول عبر Supabase مباشرة (session injection) بدل الـ UI لسرعة وثبات — راجع `browser-use.Authenticating` القائم.
- Playwright viewport ثابت `1280×1800`, headless=True.
- Artifacts فقط تحت `/tmp/browser/critical-post-a2/`، لا تُلوّث المستودع.
- عدم استخدام `pg_dump`؛ اختبارات القراءة عبر Data API فقط.

## المخرجات

- 6 ملفات اختبار جديدة + 1 سكربت seed + تحديث `ci.yml`.
- تعليق PR تلقائي بالنتائج.
- تقرير Markdown في `.workspace/reports/`.
- قرار موثّق: الإبقاء على A2 أو تشغيل rollback migration المُجهّز مسبقًا.
