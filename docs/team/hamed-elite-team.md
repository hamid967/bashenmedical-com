# فريق حامد | Hamed Elite Digital Team

**آخر تحديث:** 2026-07-21
**الحالة:** Active — إطار قيادة رسمي للمشروع
**المرجع الأعلى:** المهندس حامد — Chief Engineering & Creative Director
**الميزانية التشغيلية:** 500,000 USD / شهر

---

## 1. القيادة التنفيذية (يرفعون مباشرة للمهندس حامد)

| الدور | المسؤولية المختصرة |
|------|--------------------|
| نائب مدير الفريق | تنسيق تشغيلي يومي بين الإدارات |
| مدير البرنامج (PgM) | Roadmap متعدد الفرق، dependencies، تسليم |
| مدير المنتج (Head of Product) | رؤية المنتج، الأولويات، OKRs |
| المدير التقني (CTO) | معمارية، معايير هندسية، اعتماد تقني |
| المدير الإبداعي (CD) | الهوية، اللغة البصرية، جودة التصميم |
| مدير العمليات (COO) | تشغيل، ميزانية، مشتريات، مقاولات |
| مدير الجودة (Head of QA) | معايير الجودة، DoD، اعتماد إصدارات |
| مدير الأمن والخصوصية (CISO) | RLS, PDPL, تشفير, تدقيق, حوادث |
| المستشار الطبي (CMO) | صحة المحتوى الطبي، سلامة المريض، حدود AI |
| مدير المحتوى والتسويق | تحرير، SEO، حملات، هوية صوتية |
| مدير الإنتاج المرئي | تصوير، فيديو، Motion، Sound |

---

## 2. الفرق التنفيذية (14 فريق)

1. **المنتج والتخطيط** — Requirements, Roadmap, Risks, Analytics
2. **UX/UI والتصميم** — Redesign, Booking UX, Portal, Admin, RTL
3. **الهوية والإبداع** — Brand, Icons, Jazan motifs, Assets
4. **البرمجة الأمامية** — React/TS/Tailwind/shadcn, PWA, Perf
5. **Backend وقواعد البيانات** — Supabase, PostgreSQL, APIs, Integrations
6. **الحجز الذكي** — Booking, Family, Waitlist, Check-in, Reception
7. **بوابة المريض** — OTP, Records, Labs, Rx, Billing, Insurance
8. **الإدارة والسوبر أدمن** — Super Admin, Branch, Reception, Doctor, RBAC, Audit
9. **الذكاء الاصطناعي** — Assistant محدود آمن (بدون تشخيص / بدون كشف بيانات)
10. **الأمن والخصوصية** — RLS, Encryption, OTP limits, Rate limits, Pen-test, PDPL
11. **المحتوى** — Medical writing AR/EN, UX writing, SEO, Policies
12. **الإخراج والإنتاج** — Cinematic intro, Videos, Photos, Motion (لا أصوات تلقائية)
13. **الاختبار والجودة** — E2E, Automation, A11y, Perf, Security
14. **DevOps والتشغيل** — CI/CD, Monitoring, Backup, DR, Secrets

---

## 3. هيكل اتخاذ القرار

```text
المهندس حامد (Final Authority)
        ↓
مجلس قيادة فريق حامد (Leadership Council)
        ↓
مديرو الإدارات (11 Directors)
        ↓
قادة الفرق المتخصصة (Team Leads)
        ↓
المصممون · المهندسون · الكتّاب · المختبرون
```

---

## 4. مبادئ ثابتة (Non-Negotiables)

- **الأمن أولًا:** RLS مفعّل على كل جدول عام، أقل صلاحية ممكنة، لا كشف بيانات مرضى.
- **AI محدود:** المساعد لا يشخّص، لا يعرض بيانات مريض، لا يعطي وصفات.
- **الوصول الرقمي:** WCAG AA حد أدنى، دعم RTL/LTR كامل، صفر مخالفات axe للفئات الحرجة.
- **الأداء:** Web Vitals ضمن الأخضر على LCP/CLS/INP.
- **الملكية الفكرية:** لا استخدام شعارات حكومية أو هويات رسمية دون تصريح موثّق.
- **الصوت:** لا تشغيل صوتي تلقائي داخل الموقع.
- **الإصدارات:** تغييرات عالية المخاطر تحتاج موافقة صريحة عبر Change Manifest.

---

## 5. Definition of Done (DoD) موحّد

كل مهمة تسليم يجب أن تحقق:

1. مبنية ضد بيانات فعلية (لا mock في الإنتاج).
2. تعمل AR + EN، Mobile + Tablet + Desktop.
3. تعالج حالات: Loading, Empty, Error, Unauthorized.
4. RLS + Grants + Policies موثّقة إن كانت تلمس DB.
5. اختبار E2E أو Unit مضاف عند الحاجة.
6. مرّت axe بدون مخالفات جديدة على المسارات المتأثرة.
7. مرّت TS strict + ESLint بدون تحذيرات جديدة.
8. تحديث `docs/audit/` أو `.lovable/plan.md` عند التغييرات المعمارية.

---

## 6. RACI مختصر

| القرار | R (منفّذ) | A (معتمِد) | C (مستشار) | I (مُبلَّغ) |
|--------|-----------|-----------|-----------|-----------|
| معمارية جديدة | CTO | حامد | Backend/Frontend Leads | كل الفرق |
| تغيير هوية بصرية | CD | حامد | Product, Content | Marketing |
| تغيير Schema حسّاس | Backend Lead | CTO + CISO | QA | Product |
| نشر Production | DevOps | حامد | QA + Security | كل الفرق |
| محتوى طبي | Medical Writer | CMO | Legal, Content Mgr | Product |
| ميزة AI جديدة | AI Lead | CTO + CMO + CISO | Product | حامد |

---

## 7. حوكمة الميزانية (500K USD/شهر — توزيع استرشادي)

| البند | النسبة |
|------|--------|
| Engineering (Frontend/Backend/DevOps/AI) | 45% |
| Design + Creative + Production | 20% |
| QA + Security + Compliance | 15% |
| Product + Program + Research | 10% |
| Content + Marketing + SEO | 7% |
| Reserve / Contingency | 3% |

التوزيع الفعلي يُعتمد شهريًا من المهندس حامد.

---

## 8. طقوس التشغيل (Cadence)

- **يومي:** Standup لكل فريق (15 دق)
- **أسبوعي:** Leadership Council + Demo مشترك
- **أسبوعي:** SEO + A11y + Security scan (تلقائي عبر CI)
- **شهري:** OKR review + Budget review + Roadmap update
- **ربع سنوي:** Pen-test + DR drill + Retro كبير

---

## 9. مرجع الملفات المرتبطة

- خارطة التغييرات المجمّدة: `docs/audit/change-manifest-v1.md`
- تقرير التدقيق الأولي: `docs/audit/2026-07-day-01_audit-report.md`
- Baselines وصول رقمي: `docs/audit/a11y-baseline-*.md`
- الخطة النشطة: `.lovable/plan.md`

---

_هذا المستند حاكم — أي انحراف عن المبادئ يحتاج قرارًا موثّقًا من المهندس حامد._
