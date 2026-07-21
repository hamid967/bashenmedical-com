# Permission-Error Watchdog + Auto-Rollback

منظومة رصد تكشف طفرات أخطاء 401/403 على `/api/*` واستدعاءات RPC خلال 24 ساعة من كل migration جديد، وتُصدر توصية Rollback آلية.

## المكوّنات

| المكوّن | الوصف |
|---|---|
| `public.deployment_markers` | سجل كل migration مُدمج + خط الأساس (أخطاء/ساعة خلال 7 أيام سابقة). |
| `public.api_permission_errors` | append-only، احتفاظ 14 يوم، يستقبل من الفرونت عبر `record_permission_error`. |
| `public.rollback_recommendations` | يخزّن توصيات watchdog مع النسبة والمسارات الأعلى. |
| `record_permission_error` (RPC) | يستدعى تلقائياً من الفرونت لكل استجابة 401/403. |
| `evaluate_permission_error_spike` (RPC) | ينفّذه watchdog كل 15 دقيقة، يقارن بالـbaseline. |
| `POST /api/public/hooks/record-deployment` | يستدعيه CI بعد كل دمج migration لتسجيل نقطة انطلاق. |
| `POST /api/public/hooks/permission-watchdog` | يستدعيه pg_cron كل 15 دقيقة. |
| `src/lib/telemetry/permission-errors.ts` | wrapper على `window.fetch` + `reportRpcPermissionError` للـcatch. |

## العتبات

- `warn`: النسبة ≥ **3×** الـbaseline ومعدّل الرصد ≥ 5/ساعة.
- `rollback`: النسبة ≥ **6×** الـbaseline ومعدّل الرصد ≥ 5/ساعة.

تُعدَّل بارامترات `evaluate_permission_error_spike(_warn_ratio, _rollback_ratio, _min_observed_per_hour)` عند الحاجة.

## التثبيت (خطوات لمرة واحدة)

### 1) Front-end bootstrap
في `src/start.tsx` (client entry) أضِف:
```ts
import { installPermissionErrorReporter } from "@/lib/telemetry/permission-errors";
installPermissionErrorReporter();
```

### 2) جدولة pg_cron (كل 15 دقيقة)
شغّل عبر أداة الإدراج (SQL) — **ليس migration** لأنه يحتوي مفاتيح المشروع:
```sql
select cron.schedule(
  'permission-watchdog-15m',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://project--550c7bc5-80b4-4118-853f-28cc7bd42f26.lovable.app/api/public/hooks/permission-watchdog',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_jCNv8mbgtiQaIWkms_cHiA_9WUH_qEG"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- تنظيف يومي لسجل 14 يوم
select cron.schedule(
  'purge-permission-errors',
  '0 3 * * *',
  $$ select public._purge_old_permission_errors(); $$
);
```

### 3) خطوة CI بعد الدمج
تُضاف تلقائياً في `.github/workflows/ci.yml` (job `record-deployment-marker`).
تُشغَّل فقط على `push` إلى `main` عند تعديل `supabase/migrations/*`.

### 4) تنبيه Slack (اختياري)
أضف secret اسمه `SLACK_ALERT_WEBHOOK` قيمته Incoming Webhook من قناتك.
بدونه، التوصيات تُخزَّن في `rollback_recommendations` فقط.

## الـRollback الآلي — القاعدة

**لا نطبّق Rollback على DB تلقائياً** لأنه غير آمن. عند `severity='rollback'`:
1. تُنشأ توصية في `rollback_recommendations` (لوحة `/admin`).
2. يُرسل تنبيه Slack عاجل.
3. الخطوة اليدوية:
   - راجع `top_routes` وحدّد الـmigration المسبِّب من `migration_ref`.
   - نفّذ migration معاكس (نمط `docs/security/public_read_allowlist.md` قسم "الإزالة").
   - حدّث `rollback_recommendations.status = 'rolled_back'`.

## استعراض الحالة

```sql
-- آخر migration ومعدل الأخطاء الحالي
select * from public.evaluate_permission_error_spike();

-- التوصيات المفتوحة
select triggered_at, severity, ratio, observed_per_hour, top_routes
from public.rollback_recommendations
where status = 'open' order by triggered_at desc;

-- أعلى المسارات خطأً في آخر ساعة
select route, count(*) from public.api_permission_errors
where occurred_at > now() - interval '1 hour'
group by route order by 2 desc limit 10;
```
