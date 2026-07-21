# الدفعة 5 — بيانات حجز حقيقية على CI (Zero-Flake)

**الهدف:** كل اختبار E2E للحجز يشتغل على fixtures ثابتة معروفة الخصائص، مع seed قبل الاختبارات وcleanup بعدها، بدون أي أثر جانبي على البيانات الإنتاجية.

## 1. Fixtures ثابتة معروفة الـ slugs

جميع الصفوف مُميّزة بـ `slug` يبدأ بـ `e2e-` لضمان تنظيف آمن ومحدود.

| الجدول | البيانات |
|---|---|
| `branches` | `slug='e2e-branch'`, `name_ar='فرع اختبار E2E'`, `name_en='E2E Test Branch'`, `is_active=true`, `city_ar='الرياض'` |
| `specialties` | `slug='e2e-specialty'`, `name_ar='تخصص اختبار'`, `name_en='E2E Specialty'`, `is_active=true` |
| `doctors` | `slug='e2e-doctor'`, `name_ar='د. اختبار E2E'`, `name_en='Dr. E2E Test'`, `specialty_id=<↑>`, `branch_id=<↑>`, `gender='male'`, `is_active=true` |
| `doctor_branches` | ربط `(doctor, branch, is_primary=true)` |
| `availability_slots` | 14 يوم قادمة × 6 سلوتس/يوم (09:00–12:00 كل 30د) بحالة `available` |

كل الـ INSERTs تستخدم `ON CONFLICT (slug) DO UPDATE`/`DO NOTHING` → **idempotent**.

## 2. سكربتات

- `scripts/ci/ensure-e2e-booking-fixtures.py` — يزرع الـ fixtures عبر REST + service_role (مطابقة لنمط `ensure-e2e-admin.py`). يعيد `E2E_BRANCH_SLUG` و`E2E_DOCTOR_SLUG` لـ stdout كـ GitHub outputs.
- `scripts/ci/cleanup-e2e-booking-fixtures.py` — يحذف بدقة:
  1. `appointments` حيث `doctor_id = E2E_DOCTOR_ID`
  2. `slot_holds` لنفس الـ doctor
  3. `availability_slots` (تنحذف تلقائيًا مع الطبيب لكن نصرّح للسرعة)
  4. `doctor_branches` → `doctors` → `specialties` → `branches` بترتيب الاعتماد
  يعمل دائمًا حتى لو فشل الـ E2E (`if: always()`).

## 3. تعديل الاختبارات لاستهداف الـ fixtures

بدل `.first` عشوائي على كل خطوة، الاختبارات ستقرأ من env vars:
- `E2E_BRANCH_NAME` (default `فرع اختبار E2E`) — يُستخدم في selector Step 2
- `E2E_SPECIALTY_NAME` (default `تخصص اختبار`) — Step 3
- `E2E_DOCTOR_NAME` (default `د. اختبار E2E`) — Step 4

هذا يضمن أن الاختبار لا يتأثر بترتيب البيانات الحقيقية ولا يحجز طبيبًا حقيقيًا بالخطأ.

تحديث:
- `book_full_journey_en.py`
- `book_hold_banner_ar.py`
- `book_conflict_returns_to_step6.py`
- `tests/e2e/_helpers.py` (يضيف `pick_by_text(locator, text)` مساعِد)

الاختبارات `book_branch_form_render.py` و`book_center_form_render.py` تعتمد على `/branches/{slug}` و`/excellence/{slug}` لبيانات حقيقية → تبقى كما هي (تُختبر عرض form فقط، لا حجز).

## 4. CI wiring

في job `e2e-booking` بـ `.github/workflows/ci.yml`:

```text
1. Verify secrets                     (existing)
2. Setup Node/Python/Playwright       (existing)
3. Build app                          (existing)
4. ensure-e2e-admin.py                (existing)
5. + ensure-e2e-booking-fixtures.py   ← NEW  (pre-tests)
6. Start preview server               (existing)
7. Run 6 booking E2E scripts          (existing, mildly updated)
8. Upload artifacts (if failure)      (existing)
9. + cleanup-e2e-booking-fixtures.py  ← NEW  (if: always())
```

env المُصدَّرة للاختبارات: `E2E_BRANCH_NAME`, `E2E_SPECIALTY_NAME`, `E2E_DOCTOR_NAME`.

## 5. تفاصيل تقنية

- **الأمان:** الـ slug prefix `e2e-` يمنع cleanup من لمس بيانات حقيقية. الفحص الأول في cleanup: `SELECT id FROM doctors WHERE slug LIKE 'e2e-%'` ثم يعمل على الـ IDs فقط.
- **الـ RLS:** service_role يتخطى RLS، لذلك السكربتات تكتب مباشرة عبر PostgREST/REST مع `apikey + Bearer` كما في `ensure-e2e-admin.py`.
- **التصادم مع الحجز الحقيقي:** الاختبار الوحيد الذي يُنشئ `appointment` هو `book_full_journey_en.py`. الـ cleanup يحذف كل `appointments` للطبيب E2E → لا تراكم.
- **التوقيت:** slots تُحسب من `today()` بتوقيت الرياض إلى `today() + 14 days`، ما يضمن دائمًا وجود يوم متاح بغضّ النظر عن يوم التشغيل.
- **الاختبار المحلي:** السكربتات تعمل محليًا بنفس env vars؛ يمكن للمطور تشغيل `python scripts/ci/ensure-e2e-booking-fixtures.py` ثم `E2E_BRANCH_NAME=... python tests/e2e/book_full_journey_en.py`.

## معايير القبول (DoD)

- [ ] `ensure-e2e-booking-fixtures.py` idempotent (تشغيلين متتاليين → نفس النتيجة، لا صفوف مكرّرة)
- [ ] `cleanup-e2e-booking-fixtures.py` لا يمس أي صف لا يبدأ slug بـ `e2e-`
- [ ] الـ 3 اختبارات المُعدّلة تختار الـ fixture بالاسم لا بـ `.first` عشوائي
- [ ] Cleanup يعمل حتى لو فشلت الاختبارات (`if: always()`)
- [ ] Job الـ E2E يخضر بشكل ثابت 3 مرات متتالية على PR
