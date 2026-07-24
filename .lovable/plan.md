
# Phase 9 — Full Website CMS

نظام إدارة محتوى موحّد داخل `/admin` يتحكم في كل أسطح الموقع العامة، بدلًا من جداول متفرقة لكل قسم. الأقسام الحالية (`doctors`, `branches`, `specialties`, `health_articles`, `faqs`, `custom_pages`, `insurance_providers`, `content_items`, `about_sections`, `intro_settings`…) تبقى مصدر البيانات؛ CMS يضيف **طبقة إصدار وسير عمل** فوقها.

## 1) نموذج البيانات (طبقة CMS)

جدول موحّد للنسخ + الحالة لكل نوع محتوى:

```text
cms_entries        (id, kind, entity_id, slug, locale_completeness jsonb, current_version_id, status, scheduled_at, published_at, archived_at, created_by, updated_at)
cms_versions       (id, entry_id, version_no, payload_ar jsonb, payload_en jsonb, media_ids uuid[], seo jsonb, og_image_id, author_id, note, created_at)
cms_reviews        (id, version_id, reviewer_id, decision, comment, created_at)   -- approve/reject
cms_schedule       (id, version_id, publish_at, unpublish_at, job_state)
cms_audit          (id, entry_id, version_id, actor_id, action, before jsonb, after jsonb, created_at)  -- immutable, DELETE denied
```

`kind` enum يغطي كل الأسطح المطلوبة:
`home, nav, footer, hero, service, specialty, doctor, branch, offer, announcement, article, faq, insurance, contact, hours, banner, intro, whatsapp, policy, page, seo_defaults`.

`status` enum: `draft, in_review, approved, scheduled, published, archived`.

RLS: كتابة عبر `has_role('editor'|'admin'|'super_admin')`؛ نشر عبر `has_role('admin'|'super_admin')` فقط. `cms_audit` تمنع UPDATE/DELETE.

## 2) سير العمل

```text
draft ──submit──▶ in_review ──approve──▶ approved ──schedule──▶ scheduled ──cron──▶ published
   ▲                 │reject                   │publish-now         │                  │
   └─────────────────┘                         └───────────────────▶┘                  └──archive──▶ archived
```

- `submit`, `approve`, `reject`, `publish`, `schedule`, `unschedule`, `archive`, `restore`, `rollback` كلها server functions محمية بأدوار.
- النشر يحدّث `entity` الفعلي (doctor/branch/article…) من `payload_ar/payload_en` داخل transaction، ويسجّل `cms_audit`.
- الجدولة عبر `pg_cron` كل دقيقة تنادي `/api/public/cron/cms-publish` (apikey header) الذي ينفّذ كل النسخ `scheduled_at <= now()`.

## 3) واجهات لوحة الإدارة `/admin/cms`

- `/admin/cms` — لوحة رئيسية: KPIs (مسودات، بانتظار المراجعة، مجدولة، مؤرشفة)، طابور المراجعة، آخر نشرات.
- `/admin/cms/$kind` — قائمة بكل النوع مع فلاتر (حالة/فرع/لغة/كامل الترجمة) + عمود مؤشر اكتمال AR/EN.
- `/admin/cms/$kind/$id` — محرر ثنائي اللغة، تبويبات: **AR | EN | Media | SEO/OG | Schedule | History**.
  - AR/EN: نموذج مبني من مخطط لكل `kind` (schema-driven form).
  - Media: MediaPicker موجود.
  - SEO/OG: title, description, canonical, og:title, og:description, og:image (من MediaPicker).
  - Schedule: `publish_at`, `unpublish_at`.
  - History: قائمة نسخ + Diff + زر Rollback.
- `/admin/cms/$kind/$id/preview` — Preview عبر توكن قصير الأمد يعيد render صفحة السطح العام بحمولة النسخة (بدون نشر).
- `/admin/cms/review` — طابور المراجعين مع Approve/Reject.
- `/admin/cms/audit` — سجل تدقيق كامل قابل للفلترة.

مؤشر اكتمال الترجمة: نسبة الحقول المُعبَّأة لكل لغة تظهر شارة (100% أخضر، <100% كهرماني، فارغ أحمر)؛ لا يمكن `approve` إذا AR غير مكتمل.

## 4) المعاينة قبل النشر

- زر "Preview" يُنشئ توكن (`cms_preview_tokens` عمر 15 دقيقة) ويفتح المسار العام بـ `?preview=<token>`.
- المسار العام (loader) يرصد `preview` token، يستدعي `getCmsVersionForPreview` (يتحقق من الدور + التوكن)، ويستبدل بيانات المصدر بحمولة النسخة أثناء الـ render فقط. لا يُخزَّن ولا يظهر لغير الأدمن.

## 5) النسخ، الاسترجاع، والتدقيق

- كل حفظ ينشئ صفًا جديدًا في `cms_versions` مع `version_no` تصاعدي.
- Rollback = نسخ الحمولة إلى نسخة جديدة برقم جديد ثم Publish (لا يحذف السجل التاريخي).
- `cms_audit` يسجّل: create/update/submit/approve/reject/publish/schedule/unschedule/archive/rollback مع `before/after` diff. RLS يمنع الحذف والتحديث.

## 6) الصلاحيات

يُضاف دور `editor` لجدول `user_roles` (يوجد بالفعل). المصفوفة:

| Action | editor | admin | super_admin |
|---|---|---|---|
| create/edit draft | ✅ | ✅ | ✅ |
| submit for review | ✅ | ✅ | ✅ |
| approve/reject | ❌ | ✅ | ✅ |
| publish now | ❌ | ✅ | ✅ |
| schedule | ❌ | ✅ | ✅ |
| rollback | ❌ | ✅ | ✅ |
| archive | ❌ | ✅ | ✅ |
| SEO defaults / nav / footer / policies | ❌ | ❌ | ✅ |

## 7) تكامل الأسطح العامة

- `home, nav, footer, hero, contact, hours, whatsapp, intro, seo_defaults` تُخزَّن كـ singletons داخل `cms_entries` (kind + entity_id NULL) وتُقرأ في loaders الصفحات العامة عبر server-fn `getPublishedSurface(kind)` مع `TO anon` policy على `cms_entries` لصفوف `status='published'` فقط.
- الأنواع المرتبطة بجداول قائمة (doctors/branches/articles…) — النشر يكتب في الجدول الأصلي؛ الصفحات العامة تبقى كما هي.

## 8) الاختبارات

- Unit: انتقالات الحالة، فحص الدور لكل action، تدقيق مناعي، اكتمال الترجمة.
- E2E: draft→submit→approve→schedule→cron publish→rollback؛ preview token؛ non-editor rejected.

## 9) خطوات التنفيذ (بالترتيب)

1. Migration واحدة: enums، الجداول الخمسة، RLS/GRANT، فهارس، trigger منع UPDATE/DELETE على `cms_audit`.
2. `src/lib/admin/cms/schemas.ts` — مخطط الحقول لكل `kind` (AR/EN).
3. `src/lib/admin/cms/*.functions.ts` — server fns (list/get/save/submit/approve/reject/publish/schedule/rollback/archive/preview-token).
4. `src/routes/api/public/cron/cms-publish.ts` + جدولة `pg_cron` كل دقيقة.
5. صفحات `/admin/cms/*` + رابط "CMS" في `AdminShellV2`.
6. تعديل loaders الأسطح المفردة (home/nav/footer/…) لتقرأ من `getPublishedSurface`.
7. اختبارات unit + E2E.

## Deliverable المرحلة الأولى (هذا الطلب)

سأنفّذها في هذا الترتيب:
1. الهجرة (سترسل لاعتمادك أولًا).
2. server fns + مخططات + راوتات الأدمن + كرون + تكامل الأسطح المفردة + اختبارات.

هل أبدأ بإرسال ملف الهجرة (الخطوة 1) الآن؟
