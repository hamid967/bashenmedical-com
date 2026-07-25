# نظام الحجز العام (`/book`)

واجهة حجز مواعيد عامة للمرضى مع دفاعات RLS وتحقق من جانب العميل، بالإضافة إلى نقطة نهاية API عامة (`/api/public/book`) تُعالج الإدراجات بشكل آمن وتُعيد أخطاء عربية ثابتة فقط.

## الوثائق

- [استيراد `friendlyInsertError` داخل مسارات insert](docs/book-friendly-insert-error.md) — الطريقة الصحيحة الوحيدة لاستيراد `friendlyInsertError` / `FRIENDLY_INSERT_MESSAGES` وما يُفشل قواعد `lint:inserts` على `book` و `pharmacy`.

## التشغيل السريع

المتطلبات: [Bun](https://bun.sh) ≥ 1.1، Node ≥ 20، Git.

```bash
# 1) استنساخ المستودع
git clone https://github.com/hamid967/happy-hugger-fluff-e1a5b380.git
cd happy-hugger-fluff-e1a5b380

# 2) تثبيت التبعيات
bun install

# 3) نسخ متغيرات البيئة (ثم عدّلها حسب مشروعك)
cp .env.example .env.local

# 4) تشغيل خادم التطوير على http://localhost:8080
bun run dev
```

أوامر مفيدة أخرى:

```bash
bun run build        # بناء إنتاجي
bun run typecheck    # فحص أنواع TypeScript
bun run format:check # Prettier
bun run check:rls    # اختبارات RLS الكاملة (تحتاج أسرار Supabase)
```

## المزامنة مع GitHub واستراتيجية الفروع

المشروع مربوط بمستودع **[`hamid967/happy-hugger-fluff-e1a5b380`](https://github.com/hamid967/happy-hugger-fluff-e1a5b380)** عبر تكامل Lovable ↔ GitHub الثنائي الاتجاه:

- أي تعديل تجريه في Lovable يُدفع تلقائيًا كـ commit إلى المستودع.
- أي `push` تدفعه إلى الفرع المتصل يُزامَن فورًا داخل Lovable.

### الفروع

| الفرع       | الغرض                                                                  |
| ----------- | ---------------------------------------------------------------------- |
| `main`      | الفرع الافتراضي — يعكس الحالة الحيّة في Lovable ويُنشر إلى الإنتاج.    |
| `feature/*` | فروع للميزات الجديدة أو الإصلاحات — تُفتح عبر Pull Request إلى `main`. |
| `fix/*`     | فروع لإصلاحات عاجلة — نفس تدفّق الـ PR.                                |

### تدفّق العمل المُوصى به

1. أنشئ فرعًا محليًا من آخر `main`:
   ```bash
   git checkout main && git pull
   git checkout -b feature/short-description
   ```
2. طبّق التعديلات وشغّل الفحوصات محليًا:
   ```bash
   bun run typecheck && bun run format:check && bun run check:rls
   ```
3. ادفع الفرع وافتح Pull Request إلى `main`:
   ```bash
   git push -u origin feature/short-description
   ```
4. بعد نجاح CI ومراجعة الـ PR، ادمج إلى `main`. Lovable يلتقط الدمج تلقائيًا.

### تبديل الفرع النشط في Lovable

المزامنة الافتراضية على `main`. لتبديل الفرع المتصل من داخل Lovable:

1. فعّل **GitHub Branch Switching** من **Account Settings → Labs**.
2. اضغط **+** أسفل يسار الدردشة → **GitHub** → اختر الفرع المطلوب.

### إعادة الربط أو تغيير المستودع

من داخل Lovable: **+** أسفل يسار الدردشة → **GitHub** → **Disconnect** ثم **Connect project** واختر المستودع الجديد. يُدفع كامل المشروع تلقائيًا بعد الربط.

## الفحوصات

```bash
bun run format:check          # prettier
bun run lint:inserts          # حماية friendlyInsertError على book + pharmacy
bun run lint:book             # نطاق ضيّق (book فقط) — للـ pre-commit
bun run typecheck
bash tests/lint/book-docs-examples.sh   # أمثلة docs لا تزال متزامنة مع القواعد
bun tests/unit/book-docs-keys.test.ts   # كل مفتاح مذكور في docs موجود ومربوط
bash tests/lint/book-guardrails.sh      # fixture يتحقق من فعّالية القواعد
```

اختبارات RLS (تتطلّب Supabase حي):

```bash
SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
  bun tests/rls/pharmacy-friendly-errors.test.ts
```

## تشغيل مجموعة الاختبارات الكاملة محليًا

لتشغيل كل ما يُنفّذه CI قبل الـ push، نفّذ الأوامر التالية بالترتيب. بعضها يحتاج إلى الأسرار الثلاثة المذكورة أعلاه.

### 1. فحوصات الشكل والكود

```bash
bun run format:check
bun run lint:inserts
bun run typecheck
```

### 2. فحوصات الوثائق والأمثلة

```bash
bash tests/lint/book-docs-examples.sh
bun tests/unit/book-docs-keys.test.ts
bash tests/lint/book-guardrails.sh
```

### 3. الاختبارات الوحدوية (unit tests)

```bash
set -e
for f in tests/unit/*.test.ts; do
  echo "── $f ──"
  bun "$f"
done
```

### 4. اختبارات RLS (تتطلّب Supabase حيًا)

**أولاً: تأكّد من الأسرار**

```bash
set -a; source .env.local; set +a
```

(أو اكتبها يدويًا: `export SUPABASE_URL=...` و `SUPABASE_PUBLISHABLE_KEY=...` و `SUPABASE_SERVICE_ROLE_KEY=...`)

**ثانيًا: شغّل مجموعة RLS كاملة**

```bash
set -e
for f in tests/rls/*.test.ts; do
  echo "── $f ──"
  bun "$f"
done
```

أو استخدم السكربت الجاهز:

```bash
bun run check:rls
```

### 5. أمر واحد للمجموعة الكاملة (بعد ضبط الأسرار)

```bash
set -e
bun run format:check
bun run lint:inserts
bun run typecheck
bash tests/lint/book-docs-examples.sh
bun tests/unit/book-docs-keys.test.ts
bash tests/lint/book-guardrails.sh
for f in tests/unit/*.test.ts; do
  echo "── $f ──"
  bun "$f"
done
for f in tests/rls/*.test.ts; do
  echo "── $f ──"
  bun "$f"
done
```

> **ملاحظة:** قسم `lint-and-typecheck` في CI يشغّل أيضًا `bun run lint:book` عند الحاجة، لكن `lint:inserts` أشمل (book + pharmacy).

## إعداد أسرار Supabase لاختبارات RLS

تتطلّب اختبارات RLS مشروع Supabase حقيقيًا. يجب توفّر الأسرار التالية بأسمائها المحدّدة في GitHub Actions (Repository secrets) أو في بيئة التشغيل المحلّية:

| المتغير                     | الغرض                      | مطلوب على `main` | التوقّعات والتحقق                                                                                       |
| --------------------------- | -------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`              | عنوان مشروع Supabase       | نعم              | يبدأ بـ `https://` وينتهي بـ `.supabase.co`. يُقرأ من `secrets.SUPABASE_URL` ويُتحقق من أنه ليس فارغًا. |
| `SUPABASE_PUBLISHABLE_KEY`  | مفتاح العميل (anon/public) | نعم              | يُستخدم لمحاكاة المستخدمين المجهولين/المسجّلين. يُقرأ من `secrets.SUPABASE_PUBLISHABLE_KEY`.            |
| `SUPABASE_SERVICE_ROLE_KEY` | مفتاح الخدمة               | **نعم**          | يُستخدم لتهيئة البيانات وتنظيفها بعد الاختبارات. يُقرأ من `secrets.SUPABASE_SERVICE_ROLE_KEY`.          |

### التحقق المبكّر قبل `checkout` و `install`

كلتا وظيفتَي CI (`rls-tests-main` و `rls-tests-pr`) تتضمّن خطوة `verify_secrets` تُنفّذ **قبل** `actions/checkout` وقبل `bun install`. تُحقّق الخطوة من أن الأسرار الثلاثة غير فارغة عبر bash:

```bash
set -e
missing=()
[ -z "$SUPABASE_URL" ] && missing+=("SUPABASE_URL")
[ -z "$SUPABASE_PUBLISHABLE_KEY" ] && missing+=("SUPABASE_PUBLISHABLE_KEY")
[ -z "$SUPABASE_SERVICE_ROLE_KEY" ] && missing+=("SUPABASE_SERVICE_ROLE_KEY")
```

إذا كانت القائمة `missing` غير فارغة، يُكتب ملخّص في `GITHUB_STEP_SUMMARY` ويُعرض `::error::` أو `::warning::` في السجلّ. لا يتم إجراء `checkout` أو تثبيت التبعيات في حال غياب الأسرار؛ والغرض هو الفشل/التخطّي السريع دون إهدار وقت التثبيت.

### إضافة الأسرار في GitHub

1. افتح المستودع على GitHub.
2. اذهب إلى **Settings → Secrets and variables → Actions → New repository secret**.
3. أضِف كل سرٍّ من الأسرار الثلاثة أعلاه باسمه بالضبط كما في الجدول.

> **تنبيه:** `SUPABASE_SERVICE_ROLE_KEY` غير متاح على Lovable Cloud. إذا كنت تستخدم Lovable Cloud، أنشئ مشروع Supabase منفصلًا خاصًا بالاختبارات لاستخراج مفتاح الخدمة منه.

### سلوك CI في GitHub Actions

تستخدم الـ CI وظيفتين منفصلتين لاختبارات RLS، وكلتاهما تبدأ بفحص مبكّر للأسرار **قبل** `checkout` و `install` لتجنّب العمل المهدور:

| الوظيفة          | الفرع/الحدث                            | السلوك عند غياب الأسرار           |
| ---------------- | -------------------------------------- | --------------------------------- |
| `rls-tests-main` | `push` إلى `main` فقط                  | فشل فوري (`exit 1`)               |
| `rls-tests-pr`   | PRs من نفس المستودع فقط (لا الـ forks) | تخطٍّ آمن (`skip`) لا يفشل الـ PR |

الوظيفتان تتحققان من وجود الأسرار التالية قبل تشغيل أي خطوة أخرى:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

#### على فرع `main` (`rls-tests-main`)

إذا كان أي سرٍ من الأسرار الثلاثة مفقودًا:

- تُطبع رسالة `::error::` في سجلّ الوظيفة.
- يُكتب ملخّص في `GITHUB_STEP_SUMMARY` بالعنوان:

  ```
  ## ❌ RLS tests failed on main — missing Supabase secrets
  ```

- يتضمّن الملخّص:
  - أن الفحص يجري مبكرًا قبل checkout/install.
  - قائمة بالأسرار الناقصة (مثل `SUPABASE_SERVICE_ROLE_KEY`).
  - رابط مباشر إلى إعدادات أسرار المستودع.
  - ملاحظة أن `SUPABASE_SERVICE_ROLE_KEY` غير متاح على Lovable Cloud.
- تفشل الوظيفة فورًا برمز `1` وتظهر العلامة الحمراء في CI.

إذا كانت جميع الأسرار موجودة، تكتب الوظيفة:

```
✅ All Supabase secrets present — proceeding with checkout, install, and full RLS suite.
```

ثم تُكمل checkout، تثبيت التبعيات، وتشغيل كامل اختبارات `tests/rls/*.test.ts` بصورة صارمة.

#### على طلبات السحب (`rls-tests-pr`)

إذا كانت الأسرار غير مضبوطة:

- تُطبع رسالة `::warning::` في سجلّ الوظيفة.
- يُكتب ملخّص في `GITHUB_STEP_SUMMARY` بالعنوان:

  ```
  ## ⚠️ RLS tests skipped on PR — missing Supabase secrets
  ```

- يتضمّن الملخّص:
  - أن الفحص يجري مبكرًا قبل checkout/install لتخطٍ سريع.
  - قائمة بالأسرار الناقصة.
  - توضيح أن PRs تستطيع التخطّي بينما `main` صارم.
  - رابط إعدادات أسرار المستودع.
  - ملاحظة أن `SUPABASE_SERVICE_ROLE_KEY` غير متاح على Lovable Cloud.
- لا تفشل الوظيفة، ويتم تخطّي خطوات checkout، install، والاختبارات.

### أمثلة لمحتوى `GITHUB_STEP_SUMMARY`

#### مثال على `main` عند غياب `SUPABASE_SERVICE_ROLE_KEY` و `SUPABASE_PUBLISHABLE_KEY`

```markdown
## ❌ RLS tests failed on main — missing Supabase secrets

This early check runs **before** checkout/install to fail fast on `main`.

The following secrets are **required** but missing:

- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Add them here: [Repository secrets](https://github.com/owner/repo/settings/secrets/actions)

Note: `SUPABASE_SERVICE_ROLE_KEY` is not available on Lovable Cloud. For full RLS tests you need a separate Supabase project.
```

يعرض سجلّ الوظيفة أيضًا:

```
::error::RLS tests failed on main — missing secrets: SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY. See job summary for details.
```

#### مثال على PR عند غياب كل الأسرار

```markdown
## ⚠️ RLS tests skipped on PR — missing Supabase secrets

This early check runs **before** checkout/install so we skip fast on PRs without wasted work.

The following secrets are missing:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

PR runs are allowed to skip; `main` is strict.

Add them here: [Repository secrets](https://github.com/owner/repo/settings/secrets/actions)

Note: `SUPABASE_SERVICE_ROLE_KEY` is not available on Lovable Cloud. For full tests you need a separate Supabase project; otherwise this job will keep skipping safely on PRs.
```

يعرض سجلّ الوظيفة أيضًا:

```
::warning::RLS tests skipped on PR — missing secrets: SUPABASE_URL SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY. See job summary.
```

> **ملاحظة:** PRs القادمة من `forks` تُستثنى من هذه الوظيفة لأن GitHub لا يكشف أسرار المستودع الأصلي للـ forks.

## اختبار الأسرار و RLS محليًا قبل تشغيل CI

تجنّب انتظار CI لمعرفة ما إذا كانت الأسرار أو اختبارات RLS تعمل؛ شغّل الاختبارات محليًا أولًا. اتّبع الخطوات التالية بالترتيب.

### 1. تحقّق من الأسرار

نفّذ هذا الأمر لرؤية الأسماء فقط (القيم تبقى مخفيّة):

```bash
env | grep -E '^(SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY|SUPABASE_SERVICE_ROLE_KEY)='
```

إذا لم يُطبع شيء، الأسرار غير مضبوطة. نفّذ هذا التحقق المفصّل:

```bash
bash -c '
  missing=()
  [ -z "$SUPABASE_URL" ]              && missing+=("SUPABASE_URL")
  [ -z "$SUPABASE_PUBLISHABLE_KEY" ]  && missing+=("SUPABASE_PUBLISHABLE_KEY")
  [ -z "$SUPABASE_SERVICE_ROLE_KEY" ] && missing+=("SUPABASE_SERVICE_ROLE_KEY")
  if [ ${#missing[@]} -gt 0 ]; then
    echo "❌ Missing: ${missing[*]}"
    exit 1
  fi
  echo "✅ All Supabase secrets are set"
'
```

### 2. اضبط الأسرار في الجلسة (أو في `.env.local`)

**الخيار أ — يدويًا في الجلسة:**

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

**الخيار ب — ملف `.env.local` (لا ترفعه إلى Git):**

نسّخ الملف المُجهّز `.env.example`:

```bash
cp .env.example .env.local
```

ثم عدّل `.env.local` وضع القيم الحقيقية:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

ثم حمّله قبل كل تشغيل:

```bash
set -a; source .env.local; set +a
```

### 3. شغّل اختبار RLS واحدًا

```bash
bun tests/rls/appointments.rls.test.ts
```

استبدل `appointments.rls.test.ts` بأي ملف آخر تحت `tests/rls/`. أمثلة:

```bash
bun tests/rls/book-api-friendly-errors.test.ts
bun tests/rls/pharmacy-friendly-errors.test.ts
bun tests/rls/appt-reason-too-long.test.ts
```

> **ملاحظة:** إذا لم تستخدم `export` أو `.env.local`، اكتب الأسرار قبل كل أمر:
>
> ```bash
> SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
>   bun tests/rls/appointments.rls.test.ts
> ```

### 4. شغّل مجموعة RLS كاملة كما يفعل CI

```bash
set -e
for f in tests/rls/*.test.ts; do
  echo "── $f ──"
  bun "$f"
done
```

أو استخدم السكربت الجاهز:

```bash
bun run check:rls
```

### 5. تحقّق من النتيجة

- إذا ظهر `✅ جميع اختبارات RLS نجحت`، يمكنك المتابعة.
- إذا ظهر `❌ Missing: ...`، أعد الخطوة 2.
- إذا ظهرت أخطاء في الاختبارات، راجع `tests/rls/` ثم حلّ المشكلة قبل الـ push.

### 6. أمثلة على أخطاء محليّة شائعة

| الخطأ المحلي                         | السبب                                             | الحل                                                         |
| ------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------ |
| `Missing: SUPABASE_SERVICE_ROLE_KEY` | لم يُضبط السرّ في البيئة                          | صدّر الأسرار أو حمّل `.env.local`.                           |
| `fetch failed` / `401 Unauthorized`  | `SUPABASE_URL` أو مفتاح خاطئ                      | تأكّد من تطابق المفاتيح مع المشروع.                          |
| `permission denied for table`        | `SUPABASE_SERVICE_ROLE_KEY` غير صحيح أو RLS مفقود | تأكّد من المفتاح، ومن أن الجداول تملك GRANTs و RLS policies. |
| فشل فقط في بعض ملفّات الـ RLS        | تغييرات في السكيما لم تُنفّذ                      | شغّل آخر migration على قاعدة البيانات المحليّة/الحية.        |

### 7. استخدم سكربت `check:rls` كحاجز قبل الـ push

المشروع يتضمّن سكربتًا (`scripts/pre-push-rls-checks.sh`) يُنفّذ نفس فحوصات CI محليًا قبل أي `push`. يتحقّق من الأسرار ثم يشغّل كل ملفّات `tests/rls/*.test.ts`.

تشغيله يدويًا:

```bash
bun run check:rls
```

أو مع تحميل أسرار من `.env.local`:

```bash
set -a; source .env.local; set +a
bun run check:rls
```

> **تنبيه:** إذا كانت الأسرار غير مضبوطة، سيفشل السكربت فورًا ويمنع تشغيل الاختبارات — تمامًا كما تفعل وظيفة `rls-tests-main` على `main`.

#### تفعيله كـ `pre-push` hook (اختياري)

إذا كنت تستخدم `husky` (مفعّل تلقائيًا عبر `bun run prepare`)، فالسكربت مفعّل كـ `pre-push` hook بالفعل ويمنع أي `push` يكسر اختبارات RLS أو يفتقر إلى الأسرار. لتشغيله يدويًا أو تجاوزه:

```bash
# تفعيل الـ hooks (مرة واحدة بعد الاستنساخ)
bun run prepare

# تجاوز الـ pre-push في دفعة واحدة (مثال: push عاجل)
git push --no-verify
```

## استكشاف أخطاء CI المتعلقة بالأسرار

| العَرَض                                                                              | السبب المحتمل                                                  | الحل                                                                                                                                                                 |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `## ❌ RLS tests failed on main — missing Supabase secrets` في `GITHUB_STEP_SUMMARY` | واحد أو أكثر من أسرار Supabase غير مضبوط في Repository secrets | أضِف الأسرار الناقصة في **Settings → Secrets and variables → Actions** بأسمائها بالضبط: `SUPABASE_URL`، `SUPABASE_PUBLISHABLE_KEY`، `SUPABASE_SERVICE_ROLE_KEY`.     |
| `## ⚠️ RLS tests skipped on PR — missing Supabase secrets`                           | نفس الأسباب السابقة لكن على PR                                 | اختياري على PR؛ إذا أردت تشغيل الاختبارات على PR أضِف الأسرار. إذا كنت تستخدم Lovable Cloud، فالتخطّي المتكرّر متوقّع.                                               |
| لا يظهر وظيفة `rls-tests-pr` في CI لـ PR                                             | الـ PR قادم من `fork`                                          | الوظيفة تُستثني الـ forks لأن GitHub لا يكشف أسرار المستودع الأصلي للـ forks. ادمج الفرع في المستودع الأصلي أولًا.                                                   |
| الاختبارات تفشل بعد الفحص المبكّر مع خطأ `401 Unauthorized` أو `403 Forbidden`       | مفتاح خاطئ أو عنوان مشروع غير صحيح                             | تأكّد من أن `SUPABASE_URL` يبدأ بـ `https://` وينتهي بـ `.supabase.co`، وأن المفتاح المستخدَم يتطابق مع المشروع (لا تخلط بين مفتاحي `PUBLISHABLE` و `SERVICE_ROLE`). |
| لا أستطيع الحصول على `SUPABASE_SERVICE_ROLE_KEY`                                     | Lovable Cloud لا يوفّر مفتاح الخدمة                            | أنشئ مشروع Supabase منفصلًا خاصًا بالاختبارات واستخدم `SUPABASE_SERVICE_ROLE_KEY` الخاص به.                                                                          |
| تكرار رسالة التخطّي على كل PR                                                        | الأسرار مضبوطة لكن الوظيفة ما زالت تتخطّى                      | تأكّد أن الأسرار مضبوطة في **Repository secrets** (وليس Environment secrets فقط)، وأن أسماؤها متطابقة تمامًا (حسّاسة لحالة الأحرف).                                  |

### قائمة مرجعية سريعة

1. افتح المستودع على GitHub.
2. اذهب إلى **Settings → Secrets and variables → Actions**.
3. تحقّق من وجود الأسرار الثلاثة بالأسماء التالية:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. إذا كانت ناقصة، أضِفها بقيمها الصحيحة.
5. أعد تشغيل الوظيفة (re-run) في GitHub Actions.

## تشغيل الاختبارات في Docker أو Devcontainer (نفس بيئة CI)

CI يستخدم `oven-sh/setup-bun@v2` بإصدار `latest` على Linux. لإعادة إنتاج نفس البيئة محليًا اختَر أحد المسارين التاليين.

### الطريقة الأسرع: سكربت CLI موحّد

`scripts/run-tests.sh` يكتشف تلقائيًا أفضل طريقة (داخل حاوية بالفعل → `bun` مباشرة، وإلا `docker compose`، ثم `docker`، ثم `bun` محلي).

```bash
bun run test:all                       # الاكتشاف التلقائي
bun run test:all -- --explain          # عرض تفسير اختيار الطريقة فقط
bun run test:all -- --explain-json      # نفس التفسير كـ JSON (للاستهلاك الآلي / CI)
bun run test:all -- --method=compose   # فرض docker compose
bun run test:all -- --method=docker    # فرض docker مباشر
bun run test:all -- --method=bun       # bun محلي فقط
bun run test:all -- --no-rls           # تخطّي اختبارات RLS
bun run test:all -- -- bun test tests/rls/appointments.rls.test.ts  # أمر مخصّص
bun run test:all -- --watch                          # وضع المراقبة (يعيد التشغيل عند التغيير)
bun run test:all -- --watch --method=compose         # مراقبة + إعادة تشغيل داخل Docker Compose
bun run test:all -- --watch --no-rls --watch-path=src  # مراقبة مجلد إضافي مع تخطّي RLS
```

**وضع `--watch`:** يشغّل جولة أولى ثم يعيد التنفيذ عند أي تغيير في `src/`, `tests/`, `scripts/`, `package.json`, `Dockerfile.test`, `docker-compose.test.yml` (أضِف مجلدات بـ `--watch-path=<path>`). يختار المراقب المتاح تلقائيًا بالترتيب: `entr` → `inotifywait` (Linux) → `fswatch` (macOS) → استعلام دوري كل ثانيتين (fallback). يعمل مع كل طرق التنفيذ (`bun`/`compose`/`docker`) — في وضع `docker` تُعاد الحاوية بالكامل عند كل تغيير. أوقفه بـ `Ctrl+C`.

يتحقّق السكربت من وجود `.env.local` عند الحاجة، ويحمّله تلقائيًا في وضع `bun`، ويبني الصورة قبل التشغيل في وضع `compose`/`docker`.

### مطابقة CI ↔ الحاوية المحلية

الأوامر التي ينفّذها `scripts/run-tests.sh` و`Dockerfile.test` مأخوذة حرفيًا من `.github/workflows/ci.yml` بنفس الترتيب. الجدول أدناه هو مصدر الحقيقة لهذه المطابقة — إذا تغيّر أحد الطرفين وجب تحديث الآخر.

| #   | خطوة CI (workflow / step)            | الأمر في CI                                                                      | الأمر داخل `Dockerfile.test` / `run-tests.sh`                                     |
| --- | ------------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | `lint-and-typecheck` → Install       | `bun install --frozen-lockfile`                                                  | `bun install --frozen-lockfile`                                                   |
| 2   | `lint-and-typecheck` → Prettier      | `bun run format:check`                                                           | `bun run format:check`                                                            |
| 3   | `lint-and-typecheck` → Lint inserts  | `bun run lint:inserts`                                                           | `bun run lint:inserts`                                                            |
| 4   | `lint-and-typecheck` → Docs examples | `bash tests/lint/book-docs-examples.sh`                                          | `bash tests/lint/book-docs-examples.sh`                                           |
| 5   | `lint-and-typecheck` → Docs keys     | `bun tests/unit/book-docs-keys.test.ts`                                          | `bun tests/unit/book-docs-keys.test.ts`                                           |
| 6   | `lint-and-typecheck` → Unit tests    | `for f in tests/unit/*.test.ts; do bun "$f"; done`                               | نفس الحلقة حرفيًا                                                                 |
| 7   | `lint-and-typecheck` → TypeScript    | `bun run typecheck`                                                              | `bun run typecheck`                                                               |
| 8   | `rls-tests-*` → Verify secrets       | فحص وجود `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | نفس الفحص داخل `scripts/pre-push-rls-checks.sh` (يُستدعى عبر `bun run check:rls`) |
| 9   | `rls-tests-*` → RLS suite            | `for f in tests/rls/*.test.ts; do bun "$f"; done`                                | نفس الحلقة داخل `check:rls`                                                       |

**تكافؤ البيئة:**

| المكوّن      | CI (`ubuntu-latest`)                       | الحاوية المحلية                                                                  |
| ------------ | ------------------------------------------ | -------------------------------------------------------------------------------- |
| نظام التشغيل | Ubuntu (Linux x64/arm64)                   | Debian slim (`oven/bun:1-debian`)                                                |
| Bun          | `oven-sh/setup-bun@v2` بإصدار `latest`     | `oven/bun:1-debian` (نفس القناة)                                                 |
| متغيّر `CI`  | `true`                                     | `true` (مضبوط في `Dockerfile.test` و `docker-compose.test.yml`)                  |
| الأسرار      | `secrets.SUPABASE_*` من Repository secrets | `.env.local` عبر `--env-file` / `env_file`                                       |
| التبعيات     | `bun install --frozen-lockfile`            | `bun install --frozen-lockfile` (fallback إلى `bun install` عند اختلاف lockfile) |

**فروق مقصودة:**

- CI يفصل بين وظيفة `lint-and-typecheck` (تعمل دائمًا) و `rls-tests-*` (تعمل فقط عند وجود الأسرار). محليًا كلاهما يعمل بالتسلسل في تنفيذ واحد، ويمكن تخطّي RLS عبر `bun run test:all -- --no-rls` لمحاكاة الحالة بدون أسرار.
- `rls-tests-pr` يتخطّى صامتًا على PRs بدون أسرار؛ محليًا `check:rls` يفشل صراحةً — لأن الغرض محلي هو منع الـ push، لا الاختيار.
- `rls-tests-main` يواصل تشغيل بقيّة الملفات عند فشل ملف ويعدّ الفاشلة؛ `check:rls` يفعل نفس الشيء (`failed=$((failed + 1))`).

**كيف تتحقّق يدويًا من التطابق:**

```bash
# 1. الأوامر داخل الحاوية:
docker compose -f docker-compose.test.yml run --rm tests bash -lc 'echo "$0"; declare -f'

# 2. قارن بأوامر CI:
grep -E "^\s+run:|bun |bash tests/" .github/workflows/ci.yml
```

### محاكاة GitHub Actions محليًا عبر `act`

للحصول على مقارنة **أدقّ** بين المحلي و CI، شغّل نفس ملف الـ workflow (`.github/workflows/ci.yml`) داخل حاوية Docker مطابقة لـ `ubuntu-latest` باستخدام [`act`](https://nektosact.com). هذا يضمن نفس الأوامر، الترتيب، ومتغيّرات البيئة التي يستخدمها GitHub.

**المتطلبات:**

- Docker يعمل في الخلفية.
- `act`: `brew install act` (macOS) أو `curl -s https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash`.
- ملف `.env.local` بالأسرار الثلاثة (يُستخدَم تلقائيًا كملف أسرار لـ `act`).

**ملف `.actrc` المُرفَق** يضبط صورة `catthehacker/ubuntu:act-latest` (الأقرب لبيئة GitHub Actions) ومجلّد المصنوعات في `/tmp/act-artifacts`.

**الاستخدام:**

```bash
bun run test:act                                  # كل الوظائف على حدث push
bun run test:act -- --list                        # اعرض الوظائف المتاحة
bun run test:act -- --job lint-and-typecheck     # وظيفة واحدة
bun run test:act -- --job rls-tests-main          # RLS الصارمة (تحتاج .env.local)
bun run test:act -- --event pull_request          # محاكاة حدث PR
bun run test:act -- --dry-run                     # طباعة الخطوات دون تنفيذ
```

**تكامل مع تقرير المقارنة:**

`compare-ci.sh` يدعم الآن `--act` / `--act-job` لتوليد سجل CI محليًا عبر `act` بدل الاعتماد على سجل بعيد:

```bash
# مقارنة أدقّ: كلا الطرفين يعملان محليًا بنفس الأوامر
bun run test:compare-ci -- --act-job lint-and-typecheck --method=compose

# افتراضيًا يستخدم وظيفة lint-and-typecheck
bun run test:compare-ci -- --act
```

الفرق عن `--gh-run` / `--ci-log`: تشغيل `act` يعطي مخرجات مكافئة تمامًا لأوامر CI بدون الحاجة لسجل بعيد أو دفع commit، فيقلّل الاختلافات "الشكلية" (طوابع، معرّفات run) إلى الحد الأدنى.

### تقرير HTML مرئي للمقارنة

بعد توليد `ci-compare.json`، حوّله إلى صفحة HTML مستقلّة سهلة القراءة (RTL، وضع داكن تلقائي، تلوين الفروق أخضر/أحمر، بطاقات إحصائيات، جدول أخطاء قابل للترتيب):

```bash
bun run test:compare-ci -- --act --out ci-compare.json
bun run test:compare-ci:html                              # يقرأ ci-compare.json → ci-compare.html
bun run test:compare-ci:html -- --in report.json --out report.html
open ci-compare.html                                       # macOS (أو xdg-open على Linux)
```

يعرض التقرير:

- **شارة حالة** خضراء (مطابق) أو حمراء (اختلافات).
- **بطاقات** لأسطر المخرجات، رمز الخروج، وعدد الأخطاء ومقاطع الفروق.
- **جدول الأخطاء** مع مصدرها (CI/محلي) ورقم السطر.
- **مقاطع الفروق** كـ `<details>` قابلة للطيّ (أول ٣ مفتوحة تلقائيًا)، مع تلوين `-` أحمر و `+` أخضر.

### إخراج تقرير مقارنة JSON (محلي ↔ CI)

`scripts/compare-ci.sh` يشغّل الاختبارات محليًا، يقارن مخرجاتها بسجل CI بعد التطبيع (إزالة ANSI، طوابع GitHub Actions، بادئات job/step، `::group::`)، ويُخرج تقريرًا `ci-compare.json` بالبنية التالية:

```json
{
  "meta": {
    "generated_at": "...",
    "method": "compose",
    "ci_source": "gh:12345",
    "normalization": "..."
  },
  "local_run": { "exit_code": 0, "line_count": 342, "normalized_log": "/tmp/.../local.norm" },
  "ci_run": { "line_count": 340, "source": "gh:12345", "normalized_log": "/tmp/.../ci.norm" },
  "summary": { "local_error_count": 0, "ci_error_count": 0, "diff_hunks": 0, "match": true },
  "errors": { "local": [{ "line": 87, "text": "..." }], "ci": [] },
  "differences": [
    { "hunk": "@@ -120,3 +120,4 @@", "ci_only": ["..."], "local_only": ["...", "..."] }
  ]
}
```

الاستخدام:

```bash
# مع ملف سجل CI محفوظ محليًا
bun run test:compare-ci -- --ci-log ci.log

# سحب سجل CI مباشرة عبر gh CLI (يتطلّب مصادقة)
bun run test:compare-ci -- --gh-run 12345678 --method=compose

# بدون تشغيل محلي جديد (مقارنة سجلّين محفوظين)
bun run test:compare-ci -- --no-run --local-log prev-local.log --ci-log ci.log --out diff.json
```

خيارات: `--ci-log <path>` أو `--gh-run <id>`، `--method=auto|bun|compose|docker`، `--out <file>` (افتراضي `ci-compare.json`)، `--no-run --local-log <path>`. المتطلبات: `jq` (و`gh` عند استخدام `--gh-run`).

للتحقق السريع من التطابق:

```bash
jq '.summary.match' ci-compare.json          # true = مطابق
jq '.differences | length' ci-compare.json   # عدد الاختلافات
jq '.errors.local' ci-compare.json           # أخطاء محلية فقط
```

### الخيار 1: Docker Compose (موصى به)

المتطلبات: Docker Desktop أو Docker Engine + plugin `compose`.

1. جهّز الأسرار في `.env.local` (انظر قسم `.env.example` أعلاه):
   ```bash
   cp .env.example .env.local
   # عدِّل .env.local وضَع القيم الحقيقية
   ```
2. ابنِ الصورة (مرة واحدة أو بعد تغيير `package.json`):
   ```bash
   docker compose -f docker-compose.test.yml build
   ```
3. شغّل مجموعة الاختبارات الكاملة كما في CI:
   ```bash
   docker compose -f docker-compose.test.yml run --rm tests
   ```
4. لتشغيل أمر واحد فقط داخل الحاوية (مثلاً اختبارات RLS):
   ```bash
   docker compose -f docker-compose.test.yml run --rm tests bash -lc "bun run check:rls"
   ```
5. للدخول تفاعليًا للتصحيح:
   ```bash
   docker compose -f docker-compose.test.yml run --rm tests bash
   ```

### الخيار 2: Dockerfile مباشرة (بدون Compose)

```bash
docker build -f Dockerfile.test -t app-tests .
docker run --rm --env-file .env.local -v "$PWD":/app -w /app app-tests
```

### الخيار 3: Devcontainer (VS Code / Cursor / GitHub Codespaces)

المتطلبات: إضافة **Dev Containers** في VS Code، أو فتح المستودع في Codespaces.

1. جهّز `.env.local` كما في الخيار 1 (Devcontainer يقرأه عبر `runArgs`).
2. افتح المشروع في VS Code ثم نفّذ من لوحة الأوامر:
   `Dev Containers: Reopen in Container`.
3. انتظر انتهاء `postCreateCommand` (يشغّل `bun install` تلقائيًا).
4. من طرفية الحاوية شغّل نفس أوامر CI:
   ```bash
   bun run format:check
   bun run lint
   bun run typecheck
   bun test
   bun run check:rls
   ```

### ملاحظات

- ملف `.env.local` مُستثنى من Git عبر `.gitignore` (`*.local`) ولن يُنسَخ إلى الصورة في `docker build`؛ يُمرَّر وقت التشغيل عبر `--env-file` أو `env_file` في Compose.
- إذا فشل `bun install --frozen-lockfile` لأن lockfile قديم، Dockerfile يقع تلقائيًا على `bun install`.
- على Apple Silicon: الصورة `oven/bun:1-debian` متعددة المعمارية ولا تحتاج `--platform`.

## تشخيص فشل اختبارات RLS محليًا خطوة بخطوة

هذا القسم يجمع أكثر أسباب فشل `bun run check:rls` (أو أي ملف تحت `tests/rls/`) شيوعًا محليًا، مع طريقة تشخيص كل حالة وحلّها.

### مخطّط تشخيصي سريع

قبل الغوص في التفاصيل، اتبع هذا الترتيب — أول خطوة تعطي إشارة توقف عند المشكلة:

1. **هل الأسرار الثلاثة موجودة؟** → `env | grep -E '^(SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY|SUPABASE_SERVICE_ROLE_KEY)='` — يجب أن يظهر ٣ أسطر.
2. **هل الاتصال بالمشروع الصحيح؟** → `echo "$SUPABASE_URL"` يجب أن يطابق مشروع Supabase المستخدم في الاختبار.
3. **هل السكيما محدَّثة؟** → آخر migration مطبَّق على نفس المشروع الذي تشير إليه `SUPABASE_URL`.
4. **هل الفشل في ملف واحد أم كل الملفات؟** → واحد فقط ⇒ مشكلة اختبار/سكيما محدّدة؛ كل الملفات ⇒ مشكلة بيئة/شبكة/أسرار.
5. **شغّل ملفًا واحدًا بمخرجات مفصّلة**: `bun tests/rls/<الملف>.test.ts` واقرأ أول سطر خطأ (وليس آخر سطر).

### 1. أسرار غير مضبوطة أو غير محمّلة

**العَرَض:**

```
❌ Missing: SUPABASE_URL SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY
```

أو `TypeError: Cannot read properties of undefined` عند إنشاء عميل Supabase.

**التشخيص:**

```bash
bash -c 'for k in SUPABASE_URL SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY; do
  [ -z "${!k}" ] && echo "❌ $k فارغ" || echo "✅ $k مضبوط (${#!k} حرفًا)"
done'
```

**الحل:**

```bash
set -a; source .env.local; set +a
bun run check:rls
```

إذا كنت في shell جديد، الأسرار المُصدَّرة سابقًا لا تنتقل — أعد التحميل.

### 2. مفاتيح خاطئة أو من مشروع مختلف (`401` / `Invalid API key`)

**العَرَض:** `401 Unauthorized`, `Invalid API key`, أو `JWT malformed`.

**التشخيص:**

```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  "$SUPABASE_URL/rest/v1/"
```

- `200` ⇒ المفتاح والعنوان صحيحان.
- `401` ⇒ المفتاح لا يطابق `SUPABASE_URL`.
- `000` أو timeout ⇒ عنوان خاطئ أو مشكلة شبكة.

**سبب شائع:** خلط مفتاح `PUBLISHABLE` مع `SERVICE_ROLE`، أو نسخ مفتاح من مشروع Supabase آخر.

**الحل:** انسخ المفاتيح من نفس المشروع الذي يشير إليه `SUPABASE_URL` وأعد الخطوة 1.

### 3. `Expected 3 parts in JWT; got 1`

**السبب:** استخدام مفتاح بصيغة `sb_secret_*` أو `sb_publishable_*` (الصيغة الجديدة) مع قارئ يتوقّع JWT قديم.

**الحل:** استخدم مفتاح `service_role` أو `anon` بصيغة JWT الكلاسيكية (`eyJ...` ثلاثة أجزاء مفصولة بنقاط). على Lovable Cloud، لا يتوفّر `service_role` — استخدم مشروع Supabase منفصل للاختبارات.

### 4. `permission denied for table` أو `relation ... does not exist`

**العَرَض:** الاختبار يفشل حتى مع `SUPABASE_SERVICE_ROLE_KEY` صحيح.

**التشخيص:**

```bash
# تحقّق من وجود الجدول والسياسات
curl -sS \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/appointments?select=id&limit=1"
```

- `permission denied` ⇒ ينقص `GRANT` على الجدول.
- `relation ... does not exist` ⇒ ينقص migration لم يُطبَّق.
- `[]` ⇒ الجدول موجود وسليم؛ الفشل في منطق الاختبار نفسه.

**الحل:**

- تأكّد أن آخر migration مطبَّق على نفس المشروع.
- تأكّد من وجود `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;` و `GRANT ALL ... TO service_role;` في migration الجدول.

### 5. `new row violates row-level security policy`

**السبب:** الاختبار يُدرج صفًا كمستخدم عادي (عبر `PUBLISHABLE_KEY`) بينما السياسة تتطلّب `auth.uid() = user_id` والصف يفتقر إلى `user_id` صحيح.

**التشخيص:** ابحث في ملف الاختبار عن استدعاء `insert(...)` وتأكّد أن `user_id` (أو الحقل المكافئ) يُضبط على `auth.uid()` لجلسة الاختبار.

**الحل:** مرّر `user_id` صراحة في payload الاختبار، أو تحقّق أن جلسة الاختبار مُسجَّلة الدخول قبل الإدراج.

### 6. `infinite recursion detected in policy`

**السبب:** سياسة RLS تستعلم من نفس الجدول المطبَّقة عليه (كلاسيكية عندما `profiles.role = 'admin'` تُفحَص داخل سياسة على `profiles`).

**الحل:** انقل الفحص إلى دالة `SECURITY DEFINER` مثل `public.has_role(auth.uid(), 'admin')` — راجع `has_role` الموجودة في المشروع.

### 7. ملف واحد فقط يفشل بعد تحديث السكيما

**السبب:** الاختبار مبني على شكل جدول أو enum قديم لم يواكب آخر migration.

**التشخيص:**

```bash
# قارن الأعمدة الفعلية بما يتوقّعه الاختبار
grep -nE "\.select\(|\.insert\(|\.update\(" tests/rls/<الملف>.test.ts
```

ثم تحقّق من الأعمدة الفعلية عبر Supabase (Table Editor أو `information_schema`).

**الحل:** حدّث الاختبار ليطابق السكيما، أو أعِد تطبيق آخر migration إن كان مفقودًا.

### 8. `fetch failed` / timeout

**العَرَض:** `TypeError: fetch failed`, `ECONNREFUSED`, `ETIMEDOUT`.

**التشخيص:**

```bash
curl -sSI "$SUPABASE_URL/rest/v1/" | head -1
```

- سطر `HTTP/2 200` ⇒ الشبكة سليمة؛ راجع الأسباب الأخرى.
- لا مخرجات ⇒ مشكلة شبكة/جدار حماية/VPN أو `SUPABASE_URL` مكتوب خطأ (مثلاً بدون `https://`).

**الحل:** تحقّق من `SUPABASE_URL` (يجب أن يبدأ بـ `https://` وينتهي بـ `.supabase.co` بلا شرطة مائلة في النهاية).

### 9. اختبار ينجح مرة ويفشل أخرى (flaky)

**الأسباب الشائعة:**

- بيانات متبقّية من تشغيل سابق (اختبار لا يُنظّف).
- تشغيل موازٍ لاختبارات تتشارك نفس السجلات.

**الحل:**

- شغّل الملفات بالتسلسل (`for f in tests/rls/*.test.ts; do bun "$f"; done`) بدل أي أداة موازية.
- تحقّق أن كل اختبار يُنشئ ثم يحذف بياناته (transaction/`afterAll`).

### 10. اختلاف السلوك بين محلي و Docker/CI

إذا نجح الاختبار في shell محلي وفشل داخل `docker compose run --rm tests`:

- تأكّد أن `.env.local` يحتوي القيم الصحيحة (Compose يقرأه عبر `env_file`).
- تحقّق من إصدار Bun داخل الحاوية: `docker compose -f docker-compose.test.yml run --rm tests bun --version` — يجب أن يطابق إصدار CI.
- امسح الطبقات القديمة: `docker compose -f docker-compose.test.yml build --no-cache`.

### قائمة تحقّق نهائية قبل فتح PR

- [ ] `env | grep SUPABASE_` يُظهر الأسرار الثلاثة.
- [ ] `curl -H "apikey: $SUPABASE_PUBLISHABLE_KEY" $SUPABASE_URL/rest/v1/` يُعيد `200`.
- [ ] `bun run check:rls` ينجح محليًا.
- [ ] آخر migration مطبَّق على المشروع الذي تشير إليه `SUPABASE_URL`.
- [ ] لا رسائل `RLS policy` أو `permission denied` في المخرجات.

## حمايات مهمة

- لا يُعرض للمستخدم أي نص خطأ إنجليزي قادم من PostgREST/PL/pgSQL — الرسائل العربية الثابتة فقط.
- `friendlyInsertError` و `FRIENDLY_INSERT_MESSAGES` يُستورَدان من `@/lib/insert-errors` فقط داخل كل مسارات insert (`book.tsx` و `pharmacy.tsx` و API الحجز).
- Pre-commit hook، CI workflow، واختبارات fixture/unit/rls يحرسون هذه القاعدة.
