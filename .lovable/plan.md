# ترقية نظام الحجوزات — Reservations Next Gen (خارطة طريق فريق حامد)

خطة من 4 محاور × 4 مراحل. كل مرحلة لها Definition of Done (DoD) واختبارات قبول. المراحل تُنفَّذ بالترتيب؛ كل موافقة منك = ننفّذ مرحلة واحدة ثم نعرض عليك الحصيلة قبل الانتقال.

---

## المحور 1 — تجربة المريض (UX)

### المرحلة 1.1 — Wizard مبسّط + Deep Links ذكية
- تقليص خطوات `/book` من 9 إلى 5 خطوات (specialty → doctor → slot → patient → confirm)
- شريط تقدّم مرئي + إمكانية القفز للخلف بدون فقد البيانات
- Deep link واحد `/book?doctor=X&date=Y` يفتح مباشرة على الخطوة الصحيحة
- حفظ تلقائي في `sessionStorage` كل خطوة (استعادة عند refresh)

**DoD:** الاختبارات الحالية (`book-back-forward-*`, `book-deep-link-params`) تمرّ + اختبار جديد "5 clicks to done".

### المرحلة 1.2 — Mobile-First + PWA offline
- Bottom-sheet لاختيار الوقت على الجوال
- زر "احجز مجدداً" في `/my-orders` (نسخ الحجز السابق بضغطة)
- Service Worker يخزّن قائمة الأطباء والتخصصات للعرض offline
- Add-to-home-screen prompt بعد أول حجز ناجح

**DoD:** Lighthouse Mobile ≥ 90، PWA installable، اختبار offline يعرض آخر بيانات مكتشفة.

### المرحلة 1.3 — Digital Companion (بعد الحجز)
- صفحة `/reservations/:ref` تعرض: OR-code + خريطة الفرع + وقت الوصول المقترح (بناءً على المسافة)
- تذكير قابل للتخصيص (يوم، ساعة، 15 دقيقة قبل)
- زر "أنا في الطريق" + "أنا وصلت" (يفعّل check-in)

**DoD:** E2E: حجز → استلام رابط → check-in → تحديث حالة `patient_check_ins`.

---

## المحور 2 — الذكاء الاصطناعي

### المرحلة 2.1 — مساعد حجز ذكي (Symptom Triage)
- زر "ما التخصص المناسب؟" داخل `/book`
- LLM (google/gemini-3.6-flash) يقرأ الأعراض ويقترح: تخصص + طبيب + مدة موعد
- Streaming response داخل `BaeshenAssistant` مع أزرار "احجز هذا"
- Guard rails: لا تشخيص، إعادة توجيه للطوارئ عند كلمات حرجة (ألم صدر، فقدان وعي...)

**DoD:** 20 حالة اختبار (JSON fixtures) → دقة تصنيف ≥ 85%، zero false-negatives للطوارئ.

### المرحلة 2.2 — Smart Reschedule
- إشعار استباقي عندما يتغيّب طبيب: "متاح موعد أقرب يوم X؟"
- خوارزمية nearest-slot تراعي: تفضيل الفرع، وقت اليوم المعتاد، تاريخ زيارات المريض
- زر "قبول" ينفّذ reschedule ذرّياً (transaction) عبر `book_slot` الحالي

**DoD:** simulation لـ100 حجز → 60%+ يقبلون العرض المقترح تلقائياً.

### المرحلة 2.3 — Waitlist ذكية (Auto-Promote)
- عند إلغاء موعد → LLM يرتّب waitlist حسب: أولوية طبية، مدة الانتظار، مطابقة الطبيب
- Push/WhatsApp للأول في القائمة مع نافذة قبول 15 دقيقة
- Fallback للثاني/الثالث تلقائياً

**DoD:** اختبار concurrency: 50 مستفيد على موعد واحد → واحد فقط يفوز.

---

## المحور 3 — موثوقية وأداء

### المرحلة 3.1 — تقوية Concurrency (Advisory Locks + Idempotency)
- توسيع `_assert_slot_free` ليغطّي: reschedule، waitlist promote، admin manual booking
- Idempotency-Key إلزامي على كل POST بحجز (منع double-submit من الشبكة السيئة)
- جدول `idempotency_keys` (TTL 24h) + retention job

**DoD:** `concurrency_book_slot.py` و `concurrency_direct_insert.py` مع PARALLEL=100 → PASS.

### المرحلة 3.2 — Realtime عالي المستوى
- استبدال polling في dashboards بـ Supabase Realtime broadcast
- Presence channel لكل عيادة (كم مريض في الانتظار الآن)
- عدّاد "أشخاص ينظرون هذا الموعد" على `/book` (شفافية + FOMO خفيف)

**DoD:** RTT < 500ms في 95th percentile، test load 200 concurrent viewers.

### المرحلة 3.3 — Observability كاملة
- Web Vitals per-route (موجود) + Custom booking funnel events
- Dashboard جديد `admin.booking-funnel`: drop-off لكل خطوة، Time-to-book متوسط، معدل الفشل
- Sentry-lite: التقاط أخطاء JS/API في `web_vitals` كسجل موحّد
- تنبيهات Slack/Email عند تجاوز عتبات (error rate > 2%، booking success < 90%)

**DoD:** لوحة جديدة تعمل + 3 تنبيهات مختبرة يدوياً.

---

## المحور 4 — تكاملات خارجية

### المرحلة 4.1 — NPHIES Verify مباشر داخل /book
- عند إدخال هوية المريض → استدعاء NPHIES eligibility (real-time)
- عرض: التغطية، نسبة التحمّل، الحد المتبقّي — قبل تأكيد الحجز
- Fallback عند 5xx: يستمر الحجز مع علامة "قيد التحقّق"
- Cache 24h لكل هوية (تقليل الاستدعاءات)

**DoD:** integration test مع NPHIES sandbox → 3 سيناريوهات (مغطّى/مرفوض/timeout).

### المرحلة 4.2 — Wallet Passes + Calendar Sync
- توليد Apple Wallet `.pkpass` + Google Wallet JWT عند تأكيد الحجز
- زر "أضف للتقويم" → يولّد `.ics` مع تنبيه تلقائي
- OAuth اختياري لـGoogle Calendar → sync ثنائي الاتجاه (تعديل من التقويم = تعديل الحجز)

**DoD:** فتح الـ.pkpass على iOS + `.ics` يعمل على Outlook/Apple Calendar/Gmail.

### المرحلة 4.3 — WhatsApp Business API (تأكيد + إعادة جدولة تفاعلية)
- تأكيد فوري عبر WhatsApp مع Quick Reply buttons: "تأكيد" / "إعادة جدولة" / "إلغاء"
- Webhook `/api/public/webhooks/whatsapp` يستقبل الرد ويطبّقه فوراً
- HMAC signature verification + rate limit

**DoD:** رحلة كاملة: حجز → رسالة → ضغط "إلغاء" → حالة الحجز `cancelled` في < 5 ثوانٍ.

### المرحلة 4.4 — Google/Apple/Meta Analytics (Conversion Tracking)
- GA4 events: `booking_started`, `slot_selected`, `booking_completed` (+ value)
- Meta Pixel + TikTok Pixel اختيارياً
- Consent Mode v2 (يحترم كوكيز الموافقة الموجودة)

**DoD:** أحداث تظهر في GA4 DebugView + لا تسجّل PII.

---

## ترتيب التنفيذ المقترح (11 أسبوع)

```text
أسبوع 1-2  : 3.1 concurrency + 3.3 observability   ← أساس صلب
أسبوع 3-4  : 1.1 wizard + 1.2 mobile PWA           ← أثر مباشر للمستخدم
أسبوع 5-6  : 2.1 symptom AI + 1.3 companion        ← تمييز تنافسي
أسبوع 7-8  : 4.1 NPHIES + 4.2 wallet               ← تكاملات محلية
أسبوع 9    : 3.2 realtime + 2.2 smart reschedule
أسبوع 10   : 4.3 WhatsApp + 2.3 smart waitlist
أسبوع 11   : 4.4 analytics + استقرار + توثيق
```

## Definition of Done للمشروع الكامل
- Booking success rate ≥ 95%
- Average time-to-book ≤ 90s (mobile)
- Zero double-booking incidents في concurrency test بـ200
- NPHIES coverage displayed لـ80% من الحجوزات
- Lighthouse mobile ≥ 90 على `/book`
- كل الاختبارات الموجودة (RLS + E2E + unit) تمرّ

---

**السؤال:** هل نبدأ بالمرحلة **3.1 (concurrency + idempotency)** كأساس، أم تفضّل مرحلة أخرى أولاً؟ اذكر رقم المرحلة (مثلاً "ابدأ 1.1") لأنطلق فوراً.
