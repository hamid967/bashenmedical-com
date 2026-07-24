# خطة "منظومة باعشن HIS" — Roadmap V2 (Batch-by-Batch)

المرجع الأصلي: `Baeshen_Medinous_Style_Booking_System_Lovable.md` + خطة فريق حامد العالمية (رفع 2026-07-24).
المسار: تسليم على شكل Batches صغيرة، كل Batch يمر ببوابة اعتماد م. حامد قبل التالي.

## الحالة الحالية

- ✅ Phase 1 (Audit + Manifest) — منجز.
- ✅ Phase 2 (Patient Master, Schedule Engine, Atomic Booking RPC, BMC-APT reference) — منجز.
- ✅ Phase 3 Backend (queue_entries + triggers + RLS + E2E) — منجز.
- ✅ Phase 3 UI Initial (`/admin/front-desk` — تبويب حجوزات اليوم + الطابور، Realtime) — منجز.
- ⏳ Phase 3 Polish, Phase 4, 5, 6 — النطاق أدناه.

---

## Batch 3.1 — Front Desk Polish (Phase 3 Close-out)

**الهدف**: إغلاق الفجوات التشغيلية في `/admin/front-desk` قبل الانتقال للتأمين.

- بحث مريض سريع (بالاسم/الجوال/MRN) + Patient Snapshot Card (آخر زيارة، تأمين نشط، تنبيهات).
- Actions من صف الحجز: Check-in، إعادة جدولة (Hold-New-then-Release-Old)، إلغاء بسبب، No-show بفترة سماح.
- فلاتر شريطية: طبيب/عيادة/حالة/مصدر/تأمين، حفظ آخر فلتر لكل مستخدم.
- Print/Export قائمة اليوم (PDF بسيط).
- Empty/Error/Loading states موحدة عبر `FeatureErrorBoundary` + skeleton.

**DoD**: Playwright يمر لسيناريو Check-in→In-service→Completed + إعادة الجدولة مع تحرير Slot القديم.

## Batch 3.2 — Doctor Console (`/admin/doctor-today`)

- جدول اليوم للطبيب المسجل دخوله فقط.
- المنتظرون (queue_entries حالة waiting/called) — استدعاء التالي / تخطي.
- إنهاء الزيارة → مزامنة `appointments.status = completed` + `queue_entries.completed_at`.
- طلب متابعة (يفتح slot hold للطبيب نفسه، بدون EMR).

## Batch 4.1 — Insurance State Machine

- Enum `insurance_state` بـ11 حالة (draft, submitted, pending, approved, partial, denied, expired…) على `insurance_verifications` + `insurance_approvals`.
- transitions RPC + audit history.
- UI في `/admin/insurance` + شارة داخل صف الحجز.

## Batch 4.2 — NPHIES Adapter Mock/Prod Flag

- ai_feature_flags: `nphies.mode` = `mock` | `sandbox` | `prod`.
- Request-ID logging على `nphies_requests` بدون PII (masking helper).
- UI Super Admin لعرض السجل + إعادة المحاولة.

## Batch 4.3 — Estimates + Invoices + Refunds

- ربط `estimate_appointment_cost` RPC القائم بواجهة داخل `/book` (تقدير قبل التأكيد) و`/admin/front-desk` (تعديل التأمين → إعادة الحساب).
- Invoice lifecycle: draft → issued → paid/partial → refunded.
- Refunds: قيد refunds table مع state machine (requested/approved/executed/rejected).
- Webhook signature + idempotency على أي Payment provider (لا تأكيد قبل webhook موثّق).

## Batch 5.1 — Patient Portal: Reports & Prescriptions

- `/patient/reports` — عرض `medical_reports` + `lab_reports` + `radiology_reports` للمريض + تابعيه المعتمدين فقط.
- `/patient/prescriptions` — قائمة الوصفات + طلب صرف من صيدلية المجمع (يربط `medicine_orders`).
- تنزيل PDF عبر server function مع signed URL قصير الأجل.

## Batch 5.2 — Patient Portal: Billing & Insurance

- `/patient/billing` — الفواتير + المدفوعات + استرداد.
- `/patient/insurance` — بطاقات التأمين + طلبات الموافقة.
- استخدام نفس State Machine Batch 4.1.

## Batch 6.1 — Unified Notifications

- جدول `notification_channels_status` (queued/sent/delivered/failed/unknown) موحد عبر SMS/WhatsApp/Email/Push/In-app.
- Dispatcher server-fn واحد + retry policy + dead-letter.
- UI `/admin/notifications-log` مع فلترة حسب القناة/الحالة/المستلم.

## Batch 6.2 — WhatsApp Templates + Inbound

- تسجيل قوالب واتساب المعتمدة في `message_templates` (موجود) + validator.
- Inbound webhook إلى `/api/public/webhooks/whatsapp` مع signature verification.
- ربط الرد بمحادثة inbox_items القائمة.

## Batch 6.3 — AI Assistant Depth

- ربط المساعد بـ`getMyPatientContext` server-fn (مواعيد قادمة، وصفات نشطة، فواتير مستحقة) بعد فحص RBAC صارم.
- Streaming موجود؛ الإضافة: Tool-calling للحجز/إعادة الجدولة عبر HMAC-signed intents (تأكيد إنساني قبل التنفيذ).
- تسجيل كل استدعاء أداة على `ai_tool_invocations` + rate-limit.

---

## Demo/Production Data Separation (يبقى كما هو)

- عمود `is_demo boolean not null default false` في كل جدول جديد يحتمل بيانات تجريبية.
- RLS تُخفي `is_demo=true` عن مسارات المرضى.
- Feature flag `bookings.show_demo` + toggle في Super Admin.

## Definition of Done لكل Batch

- Migrations reversible + Rollback موثّق.
- Unit + Integration + Playwright خضراء (على الأقل سيناريو واحد للـBatch).
- ESLint + tsc + build نظيفة.
- Security scan بدون findings حرجة جديدة.
- RLS cross-tenant test عند إضافة جدول/عمود حساس.
- لا أزرار وهمية / لا نجاح مزيف.

## القرار المطلوب

اعتماد ترتيب Batches أعلاه (3.1 → 6.3). عند التأكيد أبدأ Batch 3.1 مباشرة وأوقف عند بوابته قبل 3.2.
