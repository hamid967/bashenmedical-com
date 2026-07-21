# مساعد باعشن الذكي — خطة التنفيذ

## 1) حالات الاستخدام (باختصار)

- **زائر**: خدمات، أطباء، فروع، تأمين، أسئلة شائعة، بدء حجز، فتح واتساب، إنشاء استفسار.
- **مريض**: عرض/بحث/إعادة جدولة/إلغاء موعد، متابعة طلبات وتقارير وفواتير وتأمين، تعديل تفضيلات الإشعار، دعم.
- **موظف (admin)**: بحث تشغيلي في الطلبات/المواعيد، تلخيص اليوم، صياغة ردود، اقتراح إجراء تالٍ.
- **سوبر أدمن**: صحة النظام، تكاملات، KPIs، Audit، إدارة أدوات/نماذج/Prompts.

## 2) بنية الوكلاء

Orchestrator واحد يوجّه إلى وكلاء متخصصين. الاتصال بقاعدة البيانات يتم حصريًا عبر **Server Functions** موثقة بالصلاحية، لا يصل النموذج مباشرة.

```text
User → PortalShell/FloatingAssistant
        │
        ▼
   /api/portal/ai-chat  (SSE, requireSupabaseAuth)
        │
        ▼
   Orchestrator (Gemini سريع للتوجيه، GPT-5.4 للمهام المعقدة)
        │
   ┌────┴──────────────────────────────────────────────┐
   ▼         ▼         ▼         ▼         ▼           ▼
booking  services  doctors  requests  reports/insurance  admin
   │         │         │         │         │              │
   └─────────┴────► Typed Tools (Zod I/O) ◄───────────────┘
                    │
                    ▼
             createServerFn + RLS + audit
```

## 3) الأدوات المقترحة (V1: Read-only، V2: Mutating بتأكيد)

**Read-only (V1):**
`search_services`, `search_doctors`, `get_branches`, `get_available_slots`, `get_patient_appointments`, `get_request_status`, `get_report_metadata`, `get_invoice_status`, `get_insurance_status`, `search_admin_requests`, `generate_operations_summary`, `search_knowledge_base`.

**Mutating (V2، تأكيد صريح):**
`create_slot_hold`, `create_appointment`, `reschedule_appointment`, `request_cancellation`, `create_support_request`, `update_reminder_preferences`.

كل أداة تُحدد: Name, Description, InputSchema (Zod), OutputSchema, RequiredRole, ReadOnly|Mutating, NeedsConfirmation, TimeoutMs, MaskedFields, AuditAction.

## 4) Permission Matrix (ملخص)

| Tool | guest | patient | admin | super_admin |
|---|---|---|---|---|
| search_services / doctors / branches / KB | ✅ | ✅ | ✅ | ✅ |
| get_available_slots | ✅ | ✅ | ✅ | ✅ |
| get_patient_appointments/reports/invoices/insurance | ❌ | ✅ (ذاتيًا/تابع مصرح) | ✅ (بمريض محدد + audit) | ✅ |
| create/reschedule/cancel appointment | ❌ | ✅ (تأكيد) | ✅ (تأكيد) | ✅ |
| create_support_request | ✅ (بدون PII) | ✅ | ✅ | ✅ |
| search_admin_requests / operations_summary | ❌ | ❌ | ✅ | ✅ |
| model/tool/prompt admin | ❌ | ❌ | ❌ | ✅ |

فرض الصلاحية داخل كل `createServerFn` عبر `requireSupabaseAuth` + `assertHasRole` + RLS.

## 5) قاعدة المعرفة

مصادر: `service_catalog`, `doctors`, `specialties`, `branches`, `faqs`, `insurance_providers`, `health_articles` (المنشورة فقط), `custom_pages` (المنشورة), سياسات ثابتة.
V1: بحث Postgres FTS + `ilike` مع Metadata filtering (lang, branch, published_at) وإرجاع Citations `{table, id, updated_at, url}`.
V2 (لاحقًا): جدول `ai_kb_embeddings` مع `pgvector` وخوارزمية Hybrid (BM25 + cosine).

## 6) سياسة النماذج (Model Router)

- **Router/سريع**: `google/gemini-3.5-flash`
- **مهام معقدة**: `openai/gpt-5.4`
- **بحث/Embeddings** (V2): `openai/text-embedding-3-small`
- **STT**: `openai/gpt-4o-mini-transcribe`
- **TTS**: عبر Lovable AI TTS
- **Fallback**: `google/gemini-3.1-flash-lite`

يُدار عبر جدول `ai_model_routes` (route_name, model_id, enabled, fallback_id) + شاشة سوبر أدمن. لا نضع أسماء نماذج ثابتة داخل المكونات.

## 7) المخاطر الطبية والأمنية

- منع التشخيص/الوصفات/تعديل الجرعات/الحكم على النتائج/توجيه إيقاف علاج — عبر System Prompt صارم + مصنّف "طبي حساس" يقطع المحادثة برسالة معتمدة.
- كلمات طوارئ (ألم صدر، ضيق تنفس، نزيف، فقدان وعي...) → رسالة ثابتة معتمدة + زر اتصال إسعاف/فرع.
- Prompt Injection: فصل صارم بين System/User/Retrieved/ToolResults، تجاهل تعليمات في المحتوى المسترجع، Tool allowlist، لا يُنفّذ أي أداة Mutating بلا زر تأكيد من الواجهة.
- ماسك للحقول الحساسة (national_id, phone كامل, insurance_policy_no) في الردود؛ تُعرض آخر 4 خانات فقط.

## 8) سياسة حفظ البيانات

- جداول: `ai_conversations`, `ai_messages`, `ai_tool_invocations` (موجود جزئيًا: `mcp_tool_invocations`), `ai_safety_incidents`, `ai_usage_costs`.
- الاحتفاظ: 90 يومًا افتراضيًا لمحادثات المريض، 30 يومًا للزوار، تحكم في `/portal/consents` (ai_history) لتعطيل الحفظ أو الحذف الفوري.
- لا تُرسل PII/تقارير/دفع لأي مزود دون علم. الحقول الحساسة تُقصّ قبل الإرسال للنموذج.

## 9) واجهة المساعد

- زر عائم في PortalShell + الموقع العام + AdminShellV2.
- Sheet جانبي (Desktop) / Full-screen (Mobile).
- بُني على AI Elements: `Conversation`, `Message/MessageResponse`, `PromptInput`, `Tool` (مطوي افتراضيًا).
- Streaming SSE، حالات: `اقتراح | بانتظار التأكيد | قيد التنفيذ | تم | تعذر`.
- شارات اللغة (AR سعودي مهني / EN)، RTL/LTR، دارك اختياري.
- سجل محادثات، بدء جديدة، تحويل لموظف (ينشئ `service_inquiry` مع ملخص آمن).
- إدخال صوتي (STT) وقراءة صوتية (TTS) — Opt-in.

## 10) MCP (لاحق، بعد V2)

- خادم MCP للأدوات الآمنة عبر `@lovable.dev/mcp-js` مع OAuth Supabase. مبدئيًا معطل ويُفعّل من لوحة السوبر أدمن مع Audit.

## 11) لوحة إدارة AI (`/admin/ai/*`)

`/admin/ai/overview`, `/models`, `/prompts` (versioned), `/agents`, `/tools`, `/knowledge`, `/conversations`, `/handoffs`, `/costs`, `/incidents`, `/feature-flags`.

## 12) Change Manifest (ملفات/جداول)

**Migrations:**
- `ai_conversations(id, user_id, scope, lang, started_at, ended_at, consent_history bool)`
- `ai_messages(id, conversation_id, role, content, tool_name?, tokens_in?, tokens_out?, created_at)`
- `ai_tool_invocations(id, conversation_id, tool, input jsonb, output jsonb, status, latency_ms, cost_usd, actor, created_at)`
- `ai_safety_incidents(id, conversation_id, kind, severity, action_taken, created_at)`
- `ai_usage_costs(day, model, tokens_in, tokens_out, cost_usd, requests)`
- `ai_model_routes(route_name pk, model_id, fallback_id, enabled, updated_by, updated_at)`
- `ai_prompt_versions(id, agent, version int, content, published bool, created_by, created_at)`
- `ai_feature_flags(key pk, enabled bool, updated_by, updated_at)`
- RLS: كل جدول محمي؛ المريض يرى محادثاته فقط؛ الإدارة عبر `has_role`.

**Client-safe server fns:** `src/lib/ai/*.functions.ts` (orchestrator, tools/*, kb, safety, router).
**Server-only helpers:** `src/lib/ai/*.server.ts` (Gateway provider، classifiers، masking، cost accounting).
**Routes:**
- `src/routes/api/ai/chat.ts` (SSE عام + مريض + إداري، حسب الجلسة والصلاحية)
- `src/routes/api/ai/stt.ts`, `src/routes/api/ai/tts.ts`
- `src/routes/_authenticated/admin.ai.*.tsx` (11 صفحة)
- تحديث `PortalShell` + `AdminShellV2` بزر مساعد + Sheet.

## 13) خطة تنفيذ متدرجة

**المرحلة أ — V1 قراءة فقط (هذا التسليم الأول):**
1. Migrations للجداول + RLS + Grants.
2. Gateway provider + Orchestrator + 8 أدوات Read-only.
3. Endpoint `/api/ai/chat` SSE مع تصنيف "طبي حساس/طوارئ".
4. مكوّن `BaeshenAssistant` (Sheet + Floating Button) في PortalShell والموقع العام.
5. Masking + Prompt Injection guards + Audit.
6. صفحة `/admin/ai/overview` (تشغيل/تعطيل، تكلفة، محادثات، حوادث).

**المرحلة ب — V2 أدوات Mutating (بعد الاعتماد):**
7. أدوات الحجز/الجدولة/الإلغاء مع Confirmation Cards (نُعيد استخدام `AssistantActionButton` الحالي).
8. صياغة ردود موظف + `create_support_request` (Handoff).
9. صفحات إدارة النماذج/Prompts/Tools/KB.

**المرحلة ج — V3:**
10. Embeddings + Hybrid Search، STT/TTS، MCP.

## 14) الاختبار والتراجع

- Unit: Zod schemas، masking، classifiers.
- Contract: كل أداة تُختبر بحدود صلاحية (guest/patient/admin/super_admin).
- RLS/RBAC: pytest يضرب الأدوات دون توكن، بتوكن مريض، بتوكن admin.
- Prompt Injection: مجموعة إغراءات "تجاهل التعليمات/اكشف الأسرار/شغّل أداة X" — يجب أن تُرفض.
- Playwright: مسارات AR RTL / EN LTR على Chrome/Safari/Firefox/Edge، Mobile+Desktop.
- Feature flag `ai.assistant.enabled` لإيقاف فوري. Rollback: تعطيل الـflag + revert migrations reversible.

## 15) تسليم أول ملموس (المرحلة أ)

- زر مساعد عائم في PortalShell والموقع العام يفتح Sheet.
- SSE من `/api/ai/chat` بجيميناي 3.5 flash مع system prompt سعودي مهني.
- 8 أدوات قراءة فقط.
- جداول ai_* + RLS + `admin.ai.overview`.
- Masking + Emergency banner + Handoff (بدون تنفيذ إجراءات).

---

**سؤال قبل البدء:** هل أبدأ فورًا بتنفيذ **المرحلة أ (V1 Read-only)** كما هي، أم تود تعديل قائمة الأدوات/الصفحات أو تفعيل STT/TTS من البداية؟