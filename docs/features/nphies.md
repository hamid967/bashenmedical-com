# NPHIES — التحقق من أهلية التأمين

ميزة مستقلة تعمل كطبقة موحّدة للتحقق من الأهلية وتقدير التكلفة.

## المكوّنات

| المستوى | الملف | الدور |
|---|---|---|
| UI مخصّص | `src/routes/insurance.verify.tsx` (`/insurance/verify`) | صفحة عامة قائمة بذاتها للمرضى للتحقق قبل الحجز. |
| UI مدمج | `src/components/booking/InsuranceSection.tsx` | نفس التدفق داخل معالج `/book`. |
| API عام | `src/routes/api/public/insurance/verify.ts` (`POST /api/public/insurance/verify`) | تحقق مدخل Zod + استدعاء المحوّل + تنسيق الرد. |
| المحوّل | `src/lib/nphies/adapter.server.ts` | `checkEligibility()` + سائقو `mock`/`sandbox`/`live` + سجل تدقيق. |
| السجل | جدول `public.nphies_requests` | كل استدعاء يُسجّل (Latency + status + raw). |
| لوحة الأدمن | `src/routes/_authenticated/admin.nphies-logs.tsx` | عرض السجلات وتحليل الأداء. |

## تدفق البيانات

```text
UI (insurance.verify.tsx | InsuranceSection.tsx)
  │  { doctor_id, provider_id, policy_number?, member_id?, patient_national_id? }
  ▼
POST /api/public/insurance/verify   (Zod validation)
  ▼
checkEligibility(input)             (src/lib/nphies/adapter.server.ts)
  ├── driver = mock  → RPC estimate_appointment_cost
  ├── driver = sandbox → (مطابق للـ mock مؤقتًا — hook للـ FHIR sandbox)
  └── driver = live  → NPHIES HTTP (FHIR CoverageEligibilityRequest)
  ▼
INSERT nphies_requests (best-effort audit)
  ▼
Response: { ok, eligible, reason, coverage_percent, consultation_fee,
            covered_amount, patient_share, source }
```

## اختيار السائق

يُقرَّر عبر `NPHIES_MODE` (server env):
- `mock` (افتراضي) — تقدير داخلي عبر RPC.
- `sandbox` — مطابق للـ mock حاليًا؛ محجوز لاختبارات NPHIES الرسمية.
- `live` — يتطلب `NPHIES_BASE_URL` و `NPHIES_CLIENT_ID` و `NPHIES_CLIENT_SECRET`.

عقد الاستجابة **ثابت** بين الأوضاع الثلاثة، فأي ترقية للسائق لا تكسر الواجهات.

## عقد الطلب

```json
POST /api/public/insurance/verify
{
  "doctor_id": "uuid",
  "provider_id": "uuid",
  "policy_number": "POL-1234" ,          // اختياري
  "member_id": "MEM-5678",               // اختياري
  "patient_national_id": "1XXXXXXXXX"    // اختياري
}
```

## عقد الاستجابة

```json
{
  "ok": true,
  "eligible": true,
  "reason": "ok",
  "message": "التأمين مؤهل...",
  "coverage_percent": 80,
  "consultation_fee": 300,
  "covered_amount": 240,
  "patient_share": 60,
  "source": "mock"
}
```

## الخصوصية

- الصفحة العامة لا تحفظ أي PHI من جانب المتصفح.
- سجل `nphies_requests` يخزن حقول معرّفة فقط (سياسة/عضوية/هوية اختيارية) — RLS يقيّد القراءة على `admin`/`super_admin`.
- Rate limiting مطبّق على مسارات `/api/public/*` الحرجة (انظر `src/lib/rate-limit.server.ts`).
