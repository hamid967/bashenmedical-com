
# المرحلة الأولى — تقرير الفحص الشامل (Read-only Audit)

مقدَّم للمهندس حامد — لا تعديلات نُفِّذت بعد. ينتظر اعتمادكم قبل الانتقال للمرحلة الثالثة.

## 1. حجم المشروع (Snapshot)

| البند | العدد |
|---|---|
| ملفات المسارات (routes) | 177 |
| مسارات عامة (public) | 52 |
| مسارات محمية (`_authenticated/*`) | 97 |
| مسارات API عامة (`/api/public/*`) | 22 |
| Server functions (`*.functions.ts`) | 80 |
| Server-only helpers (`*.server.ts`) | 8 |
| جداول Supabase | 92 (169 هجرة تراكمية) |

## 2. نتائج الفحوصات الآلية

### 2.1 TypeScript (blocker وحيد)
- `src/routes/waitlist.tsx:149` — `<Link to="/track">` ينقصه `search` مطلوب من الـtype-safe router. **P0 صغير، إصلاح سطر واحد.**

### 2.2 Lint / Portal Tokens
- Design Tokens v2 baseline صحيح (501 مخالفة تاريخية مسموحة، صفر جديد).

### 2.3 SSR / Console
- تحذير متكرر `disableCsrfMiddlewareWarning` (تلوث سجلات) + `renderToReadableStream aborted` أثناء التنقل السريع — غير قاتل لكن يجب إسكاته أو معالجته.

### 2.4 Supabase Linter — 111 تنبيه
تصنيف تقريبي:
- **WARN — Public EXECUTE على SECURITY DEFINER**: ~90 دالة يمكن استدعاؤها من `anon`. أعلى أولوية أمنية.
- **WARN — Extension in `public`** ×1.
- **WARN — Function search_path mutable** (بقايا) — منخفض.
- **INFO — RLS Enabled / policies exist** (تأكيدات لا تتطلب فعلاً).

### 2.5 لا يوجد
- `src/pages/`، ولا `react-router-dom`، ولا `_authenticated/index.tsx` (لا صراع على `/`).

## 3. جرد لوحة الإدارة الحالية (97 مسار)

هناك **تشتت واضح**: نفس المفهوم موزّع على عدة صفحات دون واجهة موحدة.

### 3.1 مسارات إدارة تعمل جزئيًا ومكرَّرة (يجب دمجها)
- `admin.tsx` + `admin.index.tsx` + `admin.classic.tsx` + `admin.lazy.tsx` → 4 نقاط دخول لنفس اللوحة.
- `dashboard.tsx` + `command-center.tsx` + `admin.index.tsx` → 3 لوحات مؤشرات متوازية.
- `orders-unified.tsx` موجود لكن `admin.service-inquiries.tsx` و `complaints-admin.tsx` و `second-opinion-admin.tsx` و `corporate-admin.tsx` منفصلة → لا "صندوق طلبات موحّد" حقيقي.
- `patients-management.tsx` + `patients.index.tsx` + `patients-analytics.tsx` — 3 مسارات للمرضى.
- `admin.no-show-*` ×3 + `admin.reservations-usage` + `admin.web-vitals` + `admin.visual-analytics` — تحليلات مبعثرة.

### 3.2 مسارات إدارة موجودة لكن ليست في القائمة الجانبية الرئيسية
`inventory-management`, `pharmacy-management`, `hr-management`, `nurses`, `qr-cards`, `ratings`, `intro-settings`, `messaging-settings`, `message-templates`, `notifications-queue`, `audit-log`, `rbac`, `mcp-status`, `transition-alerts` — يصعب اكتشافها.

### 3.3 لوحة Owner
`owner.*` (10 مسارات) منفصلة تمامًا عن `admin.*` — نموذجان للتنقل يخلقان ارتباكًا.

## 4. صندوق الطلبات — الوضع الحالي

مصادر الطلبات الواردة موجودة كجداول لكنها **غير مجمّعة في inbox واحد**:

| المصدر | الجدول | الواجهة الإدارية | مربوط بلوحة موحّدة؟ |
|---|---|---|---|
| نموذج الحجز | `appointments` | `appointments-queue`, `calendar` | لا |
| استفسارات الخدمات | `service_inquiries` | `admin.service-inquiries` | لا |
| واتساب/تواصل | `service_inquiries` (source=whatsapp) | مختلط | جزئي |
| الشكاوى | `complaints` | `complaints-admin` | لا |
| رأي ثانٍ | `second_opinion_requests` | `second-opinion-admin` | لا |
| الشركات | `corporate_requests` | `corporate-admin` | لا |
| الرعاية المنزلية | `home_care_requests` | — | **غير موجود** |
| قصص المرضى | `patient_stories` | `patient-stories-admin` | لا |
| قائمة الانتظار | `appointment_waitlist` | مضمّن في calendar | جزئي |

→ **`orders-unified.tsx` موجود لكنه لا يستهلك جميع المصادر أعلاه.**

## 5. المشكلات المصنّفة حسب الخطورة

### P0 (قاتل / أمني)
1. Public EXECUTE على ~90 دالة SECURITY DEFINER — يفتح سطح هجوم واسع.
2. TS error في `waitlist.tsx` — يكسر build صارم.
3. `home_care_requests` بلا واجهة إدارية → طلبات المرضى تضيع.

### P1 (تشتّت وظيفي)
4. تعدد صفحات admin/dashboard/command-center بدون واجهة موحّدة.
5. لا "Unified Inbox" حقيقي — الطلبات موزّعة على 6+ صفحات.
6. `owner.*` منفصلة عن `admin.*` بلا Sidebar موحّد.
7. لا "Assignment / Ownership" (تعيين موظف) على `service_inquiries` / `complaints` / `second_opinion` بشكل موحّد.
8. لا "حالة موحّدة" (جديد/مراجعة/تم التواصل/بانتظار/مكتمل) عبر أنواع الطلبات.

### P2 (نظافة)
9. تحذيرات `disableCsrfMiddlewareWarning` تُلوّث السجلات.
10. `admin.lazy.tsx` و `admin.classic.tsx` تبدو تجارب قديمة.
11. `Extension in public` warning من Supabase.

### P3 (تحسينات مستقبلية)
12. مسارات إدارة ليست في القائمة الجانبية (اكتشاف صعب).
13. لا اختصارات لوحة مفاتيح ولا Command-K بحث شامل.

## 6. Change Manifest — للمراحل التالية

المراحل مقسومة إلى دفعات آمنة قابلة للتراجع. **لن أنفّذ أي دفعة قبل اعتمادكم صراحةً**.

### Batch A — إصلاحات P0 (منخفضة الخطورة، سريعة)
| # | التغيير | ملفات | خطر | تراجع |
|---|---|---|---|---|
| A1 | إصلاح TS في `waitlist.tsx` (إضافة `search={{}}`) | 1 ملف | لا | git |
| A2 | Migration: `REVOKE EXECUTE ... FROM anon, public` على الدوال الداخلية (~90 دالة) مع الحفاظ على `GRANT EXECUTE ... TO authenticated` حيث تُستخدم فعلاً من المتصفح | migration واحدة | **متوسط** — قد تكسر مسارات تستدعي RPC مباشرة من العميل | migration reversal + اختبار مسارات المتصفح المتأثرة قبل الدمج |
| A3 | إنشاء واجهة إدارية لـ `home_care_requests` (قراءة + حالة + ملاحظات) | 1 route جديد + queries | منخفض | حذف الملف |

**اعتماد مطلوب على A2** لأنه أمني/متوسط الخطر — أحتاج قائمة الدوال الـ~90 وتصويت "احتفظ/ألغِ" على كل مجموعة قبل الدفع.

### Batch B — توحيد صندوق الطلبات (P1 محوري)
| # | التغيير | ملفات | خطر |
|---|---|---|---|
| B1 | View SQL موحّد `admin_unified_inbox` يجمع الجداول السبعة أعلاه بأعمدة موحّدة (ref, type, patient_name, phone, service, source, branch, created_at, priority, status, assignee, last_update) | migration + RLS | متوسط |
| B2 | صفحة `admin.inbox.tsx` جديدة تستهلك الـview مع فلاتر (النوع، الحالة، المصدر، الفرع، المسؤول) + إجراءات جماعية آمنة | 1 route + مكوّنات | منخفض |
| B3 | تطبيع الحالات: إضافة enum موحّد `request_status` + عمود `assignee_id` + جدول `request_events` (audit) — تطبيق على الجداول السبعة عبر triggers لا تكسر البيانات القائمة | migration | **عالٍ — يحتاج اعتماد صريح** |
| B4 | ربط الإجراءات (تعيين، تحديث حالة، ملاحظة، ردّ للمريض، إنشاء موعد، دمج مكرر، أرشفة) بـserver functions محمية بـRBAC | ~8 server fns جديدة | متوسط |

### Batch C — توحيد التنقل والصفحات الفائضة
| # | التغيير | خطر |
|---|---|---|
| C1 | Sidebar موحّد يجمع Admin + Owner تحت `_authenticated/console/*` مع أدوار (super_admin / branch_manager / reception / doctor / content_manager) | متوسط — يمس التنقل |
| C2 | إزالة `admin.lazy.tsx`, `admin.classic.tsx` بعد التأكد من عدم وجود روابط داخلية/خارجية | منخفض بعد grep شامل |
| C3 | دمج `dashboard` + `command-center` + `admin.index` في `console/overview` | متوسط |
| C4 | نقل التحليلات إلى `console/analytics/*` (web-vitals, no-show, reservations-usage, visual) | منخفض |

### Batch D — إدارة الحجز الموحّدة
| # | التغيير | خطر |
|---|---|---|
| D1 | صفحة `console/calendar` تعرض تقويم يومي/أسبوعي/شهري + فلاتر طبيب/فرع/تخصص + drag-to-reschedule محمي بـserver fn | متوسط |
| D2 | منع التعارض على مستوى DB (unique partial index على doctor_id+start_at حيث status NOT IN cancelled) | متوسط |
| D3 | تكامل مع قائمة الانتظار وإجازات الأطباء والحضور/No-show كتبويبات في نفس الصفحة | منخفض |

### Batch E — RBAC وتدقيق
| # | التغيير | خطر |
|---|---|---|
| E1 | استكمال الأدوار (11 دور) مع صلاحيات تفصيلية عبر `role_permissions` + `user_resource_permissions` القائمين | متوسط |
| E2 | Audit log غير قابل للتعديل (append-only + RLS ينع UPDATE/DELETE للجميع عدا service_role) لكل عمل إداري حساس | متوسط |
| E3 | Rate limiting server-side على كل الـmutations الإدارية عبر `src/lib/rate-limit.server.ts` القائم | منخفض |

### Batch F — نظافة وتلميع (P2/P3)
- إسكات CSRF warning عبر خيار موثّق أو تفعيل الحماية.
- Command-K بحث شامل + اختصارات.
- توحيد حالات التحميل/الفراغ/الفشل بمكوّنات portal الحالية.
- Playwright E2E لكل دور × كل تدفق أساسي.

## 7. الاعتمادات المطلوبة الآن من المهندس حامد

قبل التنفيذ أحتاج قرارًا واضحًا على:

1. **Batch A2** — الموافقة على مراجعة قائمة الدوال قبل REVOKE (سأُنتج القائمة الكاملة عند الاعتماد).
2. **Batch B3** — الموافقة على تطبيع الحالات (تغيير schema يمس 7 جداول).
3. **Batch C1** — الموافقة على دمج Admin + Owner تحت `_authenticated/console/*` (يغيّر روابط داخلية).
4. **ترتيب الأولوية**: هل نبدأ بـ A → B → C → D → E → F، أم تعديل الترتيب؟
5. **نطاق الحذف**: الموافقة على حذف `admin.lazy.tsx` و`admin.classic.tsx` بعد التحقق.

## 8. ما لن أفعله دون اعتماد صريح
- أي migration يمس RLS/policies/GRANTs.
- أي حذف ملف.
- أي دمج routes يغيّر URLs قائمة.
- أي تغيير على `owner.*` أو `admin.*` structure.

## 9. الخطوة التالية المقترحة
بمجرد اعتمادكم، أبدأ بـ **Batch A** كاملة (A1+A2+A3) في تسليم واحد، ثم أعرض تقرير التحقق قبل الانتقال لـ Batch B.
