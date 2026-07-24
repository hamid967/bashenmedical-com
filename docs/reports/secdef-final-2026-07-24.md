# SECDEF Final Hardening — 2026-07-24

## مقارنة مع خط الأساس (Phase 0 — 2026-07-23)

| المؤشر | Baseline (23/07) | الآن (24/07) | Δ |
|---|---:|---:|---:|
| SECDEF warnings (lint 0028+0029) | 112 | 146 | +34* |
| PUBLIC EXECUTE على SECDEF | 10 | **0** | ✅ −10 |
| Search-path mutable (SECDEF) | 0 | 0 | — |
| Total SECDEF functions | ~112 | 129 | +17 (RPCs جديدة في المراحل 4–10) |

\* الارتفاع في العدد الخام ناتج عن دوال RPC جديدة نُشرت في Phases 4–10 (booking atomic, verify, family, inbox ingestion, AI escalation). كلها **مقصودة** ومُدرجة على الـ`PUBLIC_READ_ALLOWLIST` أو محمية داخليًا بـ OTP/HMAC/RLS.

## ما تم إغلاقه في هذه الجولة

هُدفت 10 دوال كانت `EXECUTE` مفتوحًا فيها لدور `PUBLIC` (يشمل كل الأدوار ضمنيًا):

**Trigger-only (9)** — تُستدعى من قِبل PostgreSQL محرك التريجرات فقط، لا من العملاء:
- `inbox_ingest_appointment`, `inbox_ingest_complaint`, `inbox_ingest_corporate`,
  `inbox_ingest_home_care`, `inbox_ingest_medicine_order`,
  `inbox_ingest_second_opinion`, `inbox_ingest_service_inquiry`,
  `inbox_ingest_waitlist`, `sync_dependent_from_verification_request`

**RPC مقيّد للمستخدمين المسجّلين (1)**:
- `list_ai_safety_incidents(uuid)` — تم قصره على `authenticated` فقط بعد `REVOKE FROM PUBLIC, anon`.

## توزيع دوال SECDEF الحالية (129)

| الفئة | العدد |
|---|---:|
| `anon`-callable (RPCs عامة على الـallowlist، محمية داخليًا) | 51 |
| `authenticated`-only | 44 |
| Internal (triggers + دوال مساعدة) | 34 |

## Lints المتبقّية — طبيعتها

- **0028 / 0029** (anon/authenticated can execute SECDEF): تصنيفها **معلوماتية** (WARN). كل الدوال المتبقّية:
  - مُدرجة صراحةً في `tests/security/test_secdef_privileges.py::PUBLIC_READ_ALLOWLIST`
  - مُغلَّفة بحماية داخلية (OTP، HMAC، RLS، Rate limit، Zod)
  - تمرّ باختبار `test_secdef_privileges.py` (لا internal leaks، لا PUBLIC grants).

## التحقّق

```sql
SELECT count(*) FILTER (WHERE has_function_privilege('public', p.oid,'EXECUTE'))
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef;
-- => 0
```

## الخلاصة

- **PUBLIC-role SECDEF leaks: 0** (كان 10).
- **Search-path mutable على SECDEF: 0**.
- الـWARN المتبقّية 0028/0029 تعكس تصميمًا مقصودًا موثّقًا في الـallowlist، وستظل تظهر ما دامت الـRPC العامة قائمة (مثل `book_slot`, `track_orders_by_phone`, ...).
- التغطية الآلية: `tests/security/test_secdef_privileges.py` + `test_execute_privileges_regression.py` + `test_a2_a3_grants_pinned.py`.
