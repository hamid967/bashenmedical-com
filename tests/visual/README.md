# Visual Regression — Portal (Design Tokens v2)

اختبارات لقطات بصرية للتحقق من عدم انحراف مظهر صفحات `portal/*` بعد ترحيل
Design Tokens v2 أو أي تعديل UI لاحق.

## التشغيل السريع

```bash
# 1) سجّل baselines (مرة واحدة من فرع أخضر — أو بعد قبول تغيير مقصود)
UPDATE_BASELINES=1 python3 tests/visual/portal_visual_regression.py

# 2) شغّل المقارنة (تفشل عند أي انحراف > 0.5%)
python3 tests/visual/portal_visual_regression.py
```

## توفير جلسة مريض تلقائياً (بدون جلسة حقيقية)

بدل انتظار مريض حقيقي، يوجد سكربت CI يُجهّز مستخدم اختبار ثابت:

```bash
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
E2E_PATIENT_EMAIL=visual-patient@bashenmedical.com \
E2E_PATIENT_PASSWORD='<random-strong>' \
python3 scripts/ci/ensure-e2e-patient.py
```

السكربت (idempotent) يقوم بـ:
1. إنشاء/تحديث المستخدم في Supabase Auth مع `email_confirm=true`.
2. مزامنة كلمة السر مع `E2E_PATIENT_PASSWORD` (ضدّ التدوير).
3. `upsert` صف في `public.profiles` بالاسم/الجوال ليكون المحتوى ثابتاً.
4. حذف أي دور مسرَّب في `public.user_roles` (نبقيه مريضاً عادياً).

بعدها، اختبار الـVisual Regression يُسجّل الدخول برمجياً عبر
`E2E_PATIENT_EMAIL` + `E2E_PATIENT_PASSWORD` (طريق `password_sign_in`
داخل `portal_visual_regression.py`) — لا حاجة لجلسة `LOVABLE_BROWSER_*`
حقيقية في CI.

في `.github/workflows/ci.yml` توجد خطوتان مُفعّلتان تلقائياً عندما تتوفر
أسرار `E2E_PATIENT_EMAIL` و`E2E_PATIENT_PASSWORD`:
- **Ensure E2E patient user exists** — تنفّذ السكربت أعلاه.
- **Run portal Visual Regression** — تشغّل الاختبار وترفع `tests/visual/diffs/**` كـartifact عند الفشل.


## متغيرات البيئة

| Var | افتراضي | الغرض |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:8080` | عنوان تطبيق الاختبار |
| `E2E_PATIENT_EMAIL` / `E2E_PATIENT_PASSWORD` | — | تسجيل دخول مريض ثابت في CI |
| `LOVABLE_BROWSER_SUPABASE_*` | — | جلسة مُحقنة داخل السَّندبوكس |
| `UPDATE_BASELINES` | `0` | `1` = اكتب baselines بدل المقارنة |
| `VISUAL_PIXEL_TOLERANCE` | `0.005` (0.5%) | نسبة البكسلات المختلفة المسموحة |
| `VISUAL_CHANNEL_TOLERANCE` | `8` | الفرق اللوني لكل قناة (0–255) |

## آلية عمل الاستقرار

1. `viewport` ثابت 1280×1800 و `device_scale_factor=1` و `reduced_motion=reduce`.
2. `Date.now` و `Math.random` مُجمَّدان قبل تحميل أي سكربت (`addInitScript`).
3. CSS يُحقن قبل اللقطة يوقف الحركات ويخفي أي عنصر يحمل `[data-visual-mask]`
   أو `[data-portal-timestamp]`.
4. الانتظار: `wait_for_selector('main')` ثم `networkidle` قصير.

## قناع المحتوى الديناميكي

لمنع أي عنصر يتغير بين التشغيلات (رقم عشوائي، عدّاد ثواني…) من إفشال
الاختبار، أضف `data-visual-mask` عليه في المصدر:

```tsx
<span data-visual-mask>{liveCounter}</span>
```

## عند فشل الاختبار

المخرجات:
- `tests/visual/diffs/<slug>.actual.png` — اللقطة الفعلية.
- `tests/visual/diffs/<slug>.diff.png` — خريطة الفروق (مضخّمة 8×).
- المرجع تحت `tests/visual/baselines/<slug>.png`.

قرّر:
- إن كان التغيير **مقصوداً**: راجع الـdiff بصرياً ثم شغّل الأمر مع
  `UPDATE_BASELINES=1` لتحديث المرجع، وارفعه ضمن نفس الـPR.
- إن كان **غير مقصود**: خفّض الحدّ الأدنى للتغيير أو أصلح المكوّن.
