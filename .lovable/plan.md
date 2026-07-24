# ترقية منصة باعشن — حسب ملف "فريق حامد" (1129 سطرًا)

الملف نفسه يُلزم بالبدء بـ **Phase 0 (الفحص الشامل)** قبل أي تعديل مرتفع الخطورة، مع تقديم Change Manifest واعتماد قبل كل تغيير حساس (RLS، مصادقة، دفع، تأمين). لذا الخطة تلتزم بذلك بدل تنفيذ 8 مراحل دفعة واحدة.

## الوضع الحالي (مؤكد من الشيفرة)
- Phase 0/1/2 من الخارطة السابقة مكتملة (Design System v2/v3، Auth مع OTP وWhatsApp، RBAC/RLS، Booking SPA، Front Desk أولي، Admin Shell V2، Patient Portal v2، AI Assistant، NPHIES adapter، Web Vitals، Release Gate).
- Batch 3.1 (Front Desk Polish) هو التالي المعتمد سابقًا لكنه غير منفذ.
- توثيق Phase 0 السابق موجود في `docs/audit/phase0-audit-2026-07-23.md` وسيُحدَّث بدل إعادة الفحص من الصفر.

## المخرجات (Deliverable لهذه الجولة)
1. **Phase 0 Refresh Report** — `docs/audit/phase0-refresh-2026-07-24.md`:
   - جرد Routes/Server Fns/Tables المستجدة منذ آخر تقرير.
   - Broken links + CTAs معطلة أو مخفية.
   - Permission Matrix فعلي مقابل ما يطلبه القسم §11.
   - فجوات ضد كل قسم من §6 إلى §28 مع تصنيف Critical/High/Medium/Low.
   - Prioritized Backlog مرقّم يربط كل فجوة ببـ Batch.
2. **Roadmap V3** في `.lovable/plan.md` — يحل محل V2 ويقسم البقية إلى Batches صغيرة قابلة للاعتماد.
3. **Change Manifest Template** — `docs/audit/change-manifest-template.md` مطبّق كما يفرض §4.

## Roadmap V3 المقترحة (بعد الاعتماد، Batch واحد لكل جولة)

**المسار A — إغلاق العمليات (Front Desk + Doctor + Requests)**
- A1: Batch 3.1 Front Desk Polish — MRN search, Patient Snapshot, reschedule/no-show workflows.
- A2: Batch 3.2 Doctor Console `/doctor` — today schedule, visit close, follow-up hold.
- A3: Requests Hub §17 — unified queue من الموقع/واتساب/الحجز/الاستقبال مع Audit.

**المسار B — دورة المريض المالية والطبية**
- B1: Reports & Prescriptions §18 — Private Storage + Signed URLs + Version History.
- B2: Insurance State Machine §19 — 11 حالة، فصل Mock/Prod، Retry للأخطاء التقنية فقط.
- B3: Billing & Payments §20 — Estimate/Invoice/Refund مع Webhook موقّع + Idempotency.

**المسار C — المحتوى والاتصال**
- C1: Content Engine §21 — Offers/Announcements مع Audience+Impressions+Clicks.
- C2: CMS Cycle §22 — Draft→Review→Approved→Scheduled→Published→Archived مع Preview & Rollback.
- C3: Notifications §23 — توحيد الحالات queued/sent/delivered/failed مع Provider callback فقط.

**المسار D — الجاهزية للإنتاج**
- D1: SEO §27 — Doctor/Medical Org/Breadcrumb/Article schemas + 404 map.
- D2: A11y §26 — WCAG 2.2 AA sweep + Reduced Motion + 200% Zoom.
- D3: System Health §28 لوحة داخلية + Backup/DR verification.
- D4: AI Safety §24 — Prompt Injection tests, PII masking, Mutations خلف بوابة صريحة.

## قواعد الالتزام (من الملف)
- لا جداول موازية، لا بيانات ثابتة، لا CTAs وهمية، لا نجاح مزيف.
- كل Batch يحتاج: مالك، ملفات متأثرة، اختبارات، خطة تراجع، معيار قبول، Change Manifest.
- الحساسات (RLS/Auth/Payments/NPHIES) تُوقف انتظارًا لاعتماد المهندس حامد قبل التنفيذ.
- Playwright/Unit/RLS tests + tsgo + build يجب أن تخضر قبل كل تسليم.

## الجولة التالية بعد الاعتماد
أبدأ فورًا بـ:
1. توليد `phase0-refresh-2026-07-24.md` (قراءة الشيفرة، جرد فعلي، لا تخمين).
2. كتابة `Roadmap V3` في `.lovable/plan.md`.
3. اقتراح أول Batch للتنفيذ (المرشح: **A1 — Front Desk Polish** لأنه أقل خطرًا ويكمل عمل معتمد سابقًا).

## طلب الاعتماد
هل أعتمد:
- (أ) تنفيذ Phase 0 Refresh + Roadmap V3 الآن، ثم أنتظر اعتمادك لاختيار الـ Batch الأول؟
- (ب) أم تريد تعديل ترتيب المسارات A/B/C/D قبل التوثيق؟
