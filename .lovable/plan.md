# خطة ترقية النظام الشاملة

نطاق واسع، أقترح تنفيذها على 4 موجات متتالية حتى نتمكن من التحقق بعد كل موجة قبل الانتقال للتالية.

---

## Wave 1 — الأمان والصلاحيات (Batch A4)

- تصفية بقية تحذيرات `SECURITY DEFINER` (108 تحذير) عبر:
  - سحب `EXECUTE` من `PUBLIC/anon` للدوال غير المخصصة للعموم
  - تحويل الدوال المؤهلة إلى `SECURITY INVOKER`
  - تحديث `docs/security/public_read_allowlist.md`
- تفعيل `Leaked Password Protection (HIBP)` عبر `configure_auth`
- إضافة اختبارات في `tests/security/test_secdef_privileges.py` لتغطية الدوال الجديدة
- إعادة تشغيل `supabase--linter` والهدف: خفض التحذيرات إلى أقل من 20

## Wave 2 — الأداء والبنية التحتية

بناءً على `slow_queries`:
- **web_vitals inserts** (2029 استدعاء، 4.5 ثانية إجمالي): إضافة batching عميل + فهرس على `(created_at, metric)`
- **clinic_settings** (8974 استدعاء): إضافة in-memory cache عبر React Query مع `staleTime: 5min` بدل الاستعلام في كل صفحة
- **notifications unread**: فهرس مركب على `(user_id, audience, channel, read_at) WHERE read_at IS NULL`
- **list_public_branches / specialties**: تفعيل PostgREST cache headers + فهرس على `is_active`
- تفعيل preload للـ LCP على `/` و `/book` عبر `head().links`
- تفعيل `vite-imagetools` لتحويل الصور تلقائيًا إلى AVIF/WebP

## Wave 3 — التبعيات (Dependencies)

- `bun outdated` لعرض الحزم القديمة
- تحديث الحزم الآمنة (minor/patch) دفعة واحدة
- تحديث major محدد: React Query, TanStack Router, Vite (بعد فحص breaking changes)
- إعادة توليد `bun.lock` وتشغيل اختبارات E2E الكاملة للتأكد من عدم الكسر
- ملاحظة: `code--dependency_scan` أفاد بعدم وجود ثغرات حالياً

## Wave 4 — الميزات والوظائف

- **AI Assistant Phase C**: streaming responses + memory persistence عبر جلسات
- **Reservations 2030 - NPHIES**: ربط طلبات التأمين بـ `insurance_verifications` + retry queue
- **Cost Transparency**: عرض تقديري للتكلفة قبل الحجز في `/book` بناءً على `service_catalog` + `insurance_approvals`
- **Real-time slots**: subscription على `availability_slots` عبر Supabase Realtime لتحديث المواعيد لحظياً في `SlotPicker`

---

## تفاصيل تقنية

| الموجة | ملفات رئيسية | زمن متوقع |
|--------|--------------|-----------|
| W1 Security | `supabase migration` + `docs/security/*` + `tests/security/*` | 1-2 خطوة |
| W2 Perf | `src/lib/queries/*`, `vite.config.ts`, `src/routes/index.tsx`, migration للفهارس | 2-3 خطوات |
| W3 Deps | `package.json`, `bun.lock` + CI verification | 1-2 خطوة |
| W4 Features | `src/lib/ai/*`, `src/lib/nphies/*`, `src/routes/book.tsx` | 3-5 خطوات |

---

## ترتيب التنفيذ

سأبدأ بـ **Wave 1** فور موافقتك، ثم أعود للتحقق قبل الانتقال إلى Wave 2. هذا يضمن أن الأمان جاهز قبل إضافة أي ميزات جديدة.

هل توافق على البدء بهذا الترتيب، أم تفضل ترتيباً مختلفاً (مثلاً البدء بالميزات أولاً)؟
