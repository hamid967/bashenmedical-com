# لوحة Super Admin الموحّدة

## الهدف
واجهة واحدة (`/owner`) تحت صلاحية `super_admin` تجمع إدارة **الصفحات + الخدمات + الوسائط + الحسابات + الأدوار + الإعدادات + الطلبات**، بدل تشتّتها بين `/owner` و`/admin`.

## الوضع الحالي
- `/owner` (Site Builder): يوجد بالفعل — صفحات، خدمات، وسائط، قوائم.
- `/admin/*`: 40+ صفحة (مواعيد، طلبات، مرضى، رسائل، RBAC…).
- **ناقص**: قسم "إدارة الحسابات" و"سِجل النشاط" و"إعدادات الموقع العامة" داخل واجهة المالك.

## الجديد المُضاف (المرحلة 1 — الحسابات والإعدادات)

### 1) إدارة الحسابات — `/owner/accounts`
- جدول لكل مستخدمي `auth.users` + `profiles` + `user_roles`.
- بحث بالبريد/الاسم/الجوال، فلترة حسب الدور، ترقيم صفحات.
- إجراءات (super_admin فقط):
  - تعيين/إزالة دور (`admin`, `reception`, `content_manager`, `super_admin`).
  - إعادة تعيين كلمة المرور (Auth Admin API).
  - إرسال رابط سحري.
  - تعطيل/تفعيل الحساب (`banned_until`).
  - حذف الحساب (تأكيد مزدوج).
- كل إجراء يُسجَّل في `security_audit_log`.

### 2) سِجل النشاط الموحّد — `/owner/audit`
- عرض دمج من `security_audit_log` + `appointment_audit` + `reservation_manage_events`.
- فلاتر: تاريخ، نوع الحدث، المستخدم، شدة.
- تصدير CSV.

### 3) الإعدادات العامة — `/owner/settings`
- تحرير `clinic_settings` + `system_settings` + `intro_settings` من مكان واحد:
  - اسم المجمع، شعار، ألوان أساسية، ساعات العمل، أرقام التواصل.
  - تفعيل/إيقاف الأقسام العامة (المدونة، القصص، الشكاوى…).
  - إعدادات OG/SEO الافتراضية.

### 4) روابط ذكية للأقسام الموجودة
تحديث القائمة الجانبية في `owner.tsx` لتشمل مجموعات:
- **المحتوى**: صفحات · خدمات · وسائط · قوائم · محتوى (موجود).
- **العمليات**: طلبات الخدمات · مواعيد · شكاوى · طلبات الشركات.
- **التقارير**: تحليلات مرئية · Web Vitals · No-Show · استخدام الحجوزات.
- **الإدارة**: **الحسابات (جديد)** · الأدوار (RBAC) · **سجل النشاط (جديد)** · **الإعدادات (جديد)**.

## القيود الأمنية
- كل الصفحات الجديدة تحت `_authenticated/owner/*` مع `beforeLoad` يتحقق من `super_admin` عبر `has_role` RPC.
- الحسابات + الحذف + تغيير الأدوار = **super_admin حصراً** (لا يُعرض للـ `content_manager`).
- إجراءات Auth Admin تعمل عبر `createServerFn` + `requireSupabaseAuth` + فحص الدور + `supabaseAdmin` داخل `.handler()`.
- Rate limit على إجراءات كتابة الحسابات (5/دقيقة/مستخدم).

## التفاصيل التقنية
- ملفات جديدة:
  - `src/lib/owner/accounts.functions.ts` — list/setRole/removeRole/resetPassword/disable/delete
  - `src/lib/owner/audit.functions.ts` — قراءة موحّدة
  - `src/lib/owner/settings.functions.ts` — قراءة/تحديث
  - `src/routes/_authenticated/owner.accounts.tsx`
  - `src/routes/_authenticated/owner.audit.tsx`
  - `src/routes/_authenticated/owner.settings.tsx`
- تعديل: `src/routes/_authenticated/owner.tsx` (قائمة موسّعة بمجموعات).
- اختبارات E2E:
  - `tests/e2e/owner_accounts_role_toggle.py` — تعيين/إزالة دور.
  - `tests/e2e/owner_accounts_forbidden_for_content_manager.py` — منع الوصول.

## خارج النطاق (مراحل لاحقة)
- تحرير سياسات RLS من الواجهة.
- تحرير أعمدة الجداول (Table editor).
- تعدد المستأجرين (Multi-tenant).

## معايير الإنجاز (DoD)
- `super_admin` يستطيع من `/owner` وحدها: إضافة صفحة، تعطيل حساب، ترقية مستخدم إلى `admin`، تعديل الإعدادات العامة، ورؤية سجل من فعل ماذا ومتى.
- محاولة وصول `content_manager` إلى `/owner/accounts` → إعادة توجيه.
- كل إجراء حسّاس يظهر في `/owner/audit`.

هل أبدأ التنفيذ؟
