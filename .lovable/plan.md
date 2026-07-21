
# Hamed AI Command Center — خطة التنفيذ

**الإطار التقني:** سنبقى على **TanStack Start** الحالي (بدلاً من Next.js 15 المذكور في المواصفات). السبب: الهجرة إلى Next.js تعني إعادة بناء كل شيء من الصفر (المسارات، Supabase، MCP، RBAC، اختبارات RLS/E2E، Batch A2/A3 hardening). TanStack Start يوفر نفس القدرات (persistent layouts, prefetching, SPA-like transitions, streaming SSR) بدون كسر ما بُني.

## الموجات (Waves)

### Wave 1 — الأساس (هذا التسليم)
**البنية الأساسية للوحة الإدارة الجديدة `/admin/*` v3:**

1. **App Shell جديد `AdminShellV2`:**
   - Sidebar قابل للطي مع حفظ الحالة (localStorage)
   - Mobile drawer (sheet)
   - Sticky top command bar
   - Breadcrumbs تلقائية من route tree
   - Branch/workspace switcher (من `branches` table)
   - Language switcher (AR/EN — يعتمد i18n الحالي)
   - Theme switcher (Light/Dark مع Glassmorphism محدود في dark)
   - User menu مع الأدوار
   - Quick Actions dropdown

2. **Command Palette (`Ctrl+K` / `⌘K`):**
   - بحث عالمي عبر: routes, patients, doctors, appointments
   - fuzzy search محلي + server-side lookup
   - keyboard navigation كامل
   - permission-aware results

3. **AI Assistant Panel (هيكل + محادثة):**
   - لوحة قابلة للفتح/الطي (drawer يمين)
   - streaming responses عبر Lovable AI Gateway (`openai/gpt-5.6-terra`)
   - محادثة داخل الجلسة (localStorage) — بدون تخزين DB في Wave 1
   - Tool activity display (UI جاهز، tools تُضاف في Wave 2)
   - Confirmation dialog قبل أي mutation
   - permission-aware context (يمرر أدوار المستخدم)
   - Sensitive data masking (أرقام جوال، هويات)

4. **Design tokens v3:**
   - Light mode: ocean (navy/teal) — يمتد من `admin.index.tsx` الحالي
   - Dark mode: glass + navy
   - Typography: Sora (headings) + Manrope (body) + Cairo (AR)
   - CSS variables موحّدة `--ac-*`

### Wave 2 — Overview + Analytics + Tables
- KPI cards موسعة (12 مؤشر) مع previous-period comparison
- Analytics module مع Recharts (appointment trends, no-show, revenue, insurance)
- `DataTableV2` reusable مع: sorting, filters, saved views, bulk actions, column visibility, responsive card mode
- استبدال الجداول الحالية في `/admin/inbox`, `/admin/audit-logs`, `/admin/service-inquiries`

### Wave 3 — AI Assistant Tools + MCP
- Typed tool registry (server-side): `search_appointments`, `search_requests`, `summarize_kpi`, `draft_message`, `navigate_to`
- Tool execution مع confirmation و audit logging
- Permission-aware tool filtering (RBAC)
- Prompt-injection protection (system prompt hardening)
- تكامل مع MCP server الحالي (`src/lib/mcp/`)

### Wave 4 — Dashboard Builder + Activity Timeline + File Manager
- Dashboard Builder مع dnd-kit (widgets قابلة للسحب)
- حفظ layouts (personal + role-based) في `user_dashboard_layouts` جدول جديد
- Activity Timeline real-time (Supabase Realtime على `audit_logs`)
- File Manager للتقارير الطبية (private bucket + signed URLs)

### Wave 5 — RBAC UI + Settings + System Health
- محرر أدوار وصلاحيات كامل (بناءً على `user_roles` + `role_permissions` الموجودة)
- Settings hub (branding, booking rules, templates, feature flags)
- System Health page (DB, functions, AI gateway status)

## القيود الفنية
- **لن أنشئ:** Supabase Edge Functions جديدة (نستخدم `createServerFn`)
- **لن أنشئ:** جداول جديدة إلا للـ dashboard layouts في Wave 4
- **سأحافظ على:** كل RLS policies، Batch A2/A3 hardening، اختبارات CI الحالية
- **أدوار الوصول:** `admin`, `super_admin` (والأدوار الفرعية للـ RBAC page في Wave 5)

## Wave 1 — قائمة الملفات

**ملفات جديدة:**
- `src/components/admin/v2/AdminShellV2.tsx` — Shell الرئيسي
- `src/components/admin/v2/AdminSidebar.tsx` — قابل للطي
- `src/components/admin/v2/AdminTopBar.tsx` — command bar
- `src/components/admin/v2/CommandPalette.tsx` — Cmd+K
- `src/components/admin/v2/AIAssistantPanel.tsx` — لوحة AI
- `src/components/admin/v2/BranchSwitcher.tsx`
- `src/components/admin/v2/ThemeSwitcher.tsx` — light/dark فعلي
- `src/components/admin/v2/Breadcrumbs.tsx`
- `src/components/admin/v2/QuickActions.tsx`
- `src/lib/admin/ai-assistant.functions.ts` — server fn للـ AI streaming
- `src/routes/api/admin/ai-chat.ts` — streaming route لـ AI SDK
- `src/styles/admin-v2.css` — design tokens v3

**ملفات مُحدَّثة:**
- `src/routes/_authenticated/admin.tsx` — استخدام `AdminShellV2` بدلاً من `AdminShell`
- `src/styles.css` — استيراد `admin-v2.css`

## Definition of Done (Wave 1)
- [ ] `/admin` يعمل بـ shell جديد كامل بدون كسر أي route فرعي
- [ ] Cmd+K يفتح palette ويبحث في routes + top 20 patients
- [ ] AI panel يرد بـ streaming على أسئلة عامة
- [ ] Theme toggle يعمل ويحفظ التفضيل
- [ ] Mobile drawer يعمل بسلاسة
- [ ] لا كسر في اختبارات E2E الحالية للـ admin
- [ ] RTL/LTR صحيح 100%
- [ ] Accessibility: keyboard nav كامل، focus visible، ARIA labels

## الوقت المتوقع
Wave 1: تسليم واحد كبير الآن. Waves 2-5: كل واحدة تسليم منفصل بعد مراجعتك للسابق.

هل أبدأ بـ Wave 1؟
