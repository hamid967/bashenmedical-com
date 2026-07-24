# فريق حامد — تطوير منظومة الحجوزات والعيادات الخارجية

> وثيقة تنفيذ جاهزة للرفع إلى Lovable  
> المشروع: مجمع باعشن الطبي  
> مدير الفريق: المهندس حامد

## الهدف

طوّر نظام الحجوزات الحالي في مشروع مجمع باعشن الطبي إلى منظومة متكاملة لإدارة التسجيل والمواعيد والعيادات الخارجية، مستوحاة وظيفيًا من مستوى أنظمة HIS العالمية مثل Medinous.

لا تنسخ واجهة Medinous أو علامتها أو محتواها أو كودها. ابنِ منتجًا أصليًا بهوية مجمع باعشن.

## قاعدة التنفيذ

- افحص أولًا نظام الحجز الحالي والجداول والمكونات.
- حافظ على Slot Hold وIdempotency وNPHIES وReal-time Monitoring الموجودة وطوّرها.
- حافظ على البنية التقنية الحالية.
- لا تنشئ نظام حجز موازيًا.
- لا تكرر الجداول أو الخدمات.
- استخدم Migrations قابلة للتراجع.
- اعرض Change Manifest قبل التغييرات عالية الخطورة.
- افصل تمامًا بين بيانات Demo وProduction.

---

## 1. وحدات المنظومة

طوّر:

1. تسجيل المرضى.
2. الرقم الطبي الموحد MRN.
3. البحث عن المريض ومنع التكرار.
4. حجز المواعيد.
5. جداول الأطباء.
6. إدارة العيادات والفروع.
7. إدارة الفترات الزمنية.
8. قائمة الانتظار.
9. تسجيل الوصول.
10. طابور العيادة.
11. العيادات الخارجية.
12. إحالات المتابعة.
13. التأمين والتحقق.
14. الفواتير والتحصيل.
15. الإشعارات.
16. بوابة المريض.
17. لوحة الاستقبال.
18. لوحة الطبيب.
19. لوحة مدير الفرع.
20. لوحة السوبر أدمن.
21. التحليلات التشغيلية.
22. Audit Logs.
23. إدارة التكاملات.
24. المساعد الذكي.

---

## 2. أنواع الحجوزات

دعم:

- حجز جديد.
- زيارة متابعة.
- حجز لفرد عائلة.
- أقرب طبيب متاح.
- طبيب محدد.
- حجز خدمة أو فحص أو باقة.
- حجز من الاستقبال أو الهاتف.
- حجز من واتساب.
- حجز من لوحة المريض.
- حجز طارئ إداري.
- استشارة حضورية.
- استشارة عن بُعد عند تفعيلها.
- موعد يحتاج موافقة تأمين.
- موعد يحتاج دفعة مقدمة.

سجّل `booking_source` لكل حجز.

---

## 3. رحلة الحجز للمريض

طوّر المسار `/book` كتطبيق داخل صفحة واحدة دون Full Page Reload:

```text
المستفيد
→ الفرع
→ التخصص/الخدمة
→ الطبيب
→ التاريخ والوقت
→ بيانات المريض
→ OTP
→ التأمين أو الدفع الذاتي
→ المراجعة
→ التأكيد
```

### واجهة الحجز

- Stepper واضح.
- Sticky Summary على الكمبيوتر.
- Bottom Sheet على الجوال.
- السابق والمتابعة.
- حفظ تلقائي.
- Browser Back/Forward.
- RTL عربي وLTR إنجليزي.
- Loading وSkeleton وEmpty وError.
- دعم الجوال وSafe Areas.
- أزرار لا تقل عن 44×44px.
- عدم فقد البيانات عند العودة.
- تعديل أي مرحلة من شاشة المراجعة.

---

## 4. البحث الذكي عن الموعد

اسمح بالبحث حسب:

- الفرع.
- التخصص.
- الخدمة.
- الطبيب.
- الجنس.
- اللغة.
- نوع الاستشارة.
- شركة التأمين.
- التاريخ.
- الفترة الصباحية أو المسائية.
- أقرب موعد متاح.

اعرض:

- أقرب ثلاثة مواعيد.
- طبيبًا بديلًا.
- فرعًا بديلًا.
- يومًا بديلًا.
- قائمة الانتظار.

لا تستخدم بحث الأعراض للتشخيص. يمكن استخدامه فقط للتوجيه إلى تخصص عام مع تنبيه واضح.

---

## 5. تسجيل المريض والرقم الطبي

أنشئ أو طوّر Patient Master Index.

لكل مريض:

- Patient ID داخلي.
- MRN عام.
- الاسم العربي والإنجليزي.
- الهوية أو الإقامة عند الحاجة.
- تاريخ الميلاد والجنس.
- الجوال والبريد.
- اللغة.
- الفرع الأساسي.
- جهة اتصال الطوارئ.
- التأمين.
- الموافقات.
- أفراد العائلة.
- حالة الحساب.

أنشئ MRN على الخادم:

```text
BMC-MRN-000001
```

### منع التكرار

ابحث بأمان حسب الهوية أو الإقامة والجوال وتاريخ الميلاد وMRN.

عند الاشتباه:

- لا تدمج تلقائيًا.
- أنشئ Duplicate Review Case.
- اعرض مقارنة لموظف مخول.
- اطلب اعتمادًا.
- احتفظ بسجل الدمج.
- وفّر خطة تراجع.

---

## 6. جداول الأطباء والعيادات

أنشئ Schedule Engine يدعم:

- الجدول الأسبوعي.
- الفرع والعيادة والطبيب والخدمة.
- مدة الموعد.
- وقت التحضير والتنظيف.
- الاستراحات والإجازات والطوارئ.
- الاستثناءات والحد اليومي والسعة.
- الحجز الإضافي المصرح.
- الحضور وعن بُعد.
- قواعد التأمين.
- أيام العمل.
- مواسم رمضان والإجازات.

امنع تداخل الطبيب أو العيادة، والحجز خارج الدوام أو أثناء الإجازة، والحجز المزدوج وتجاوز السعة دون صلاحية.

---

## 7. Slot Inventory وSlot Hold

حالات Slot:

```text
available
held
booked
blocked
completed
cancelled
expired
```

عند اختيار الموعد:

1. تحقق من التوفر على الخادم.
2. أنشئ Slot Hold لمدة خمس دقائق.
3. أرجع `hold_id` و`expires_at`.
4. اعرض مؤقتًا.
5. حرر Hold عند التغيير أو الانتهاء.
6. أعد جلب المواعيد.
7. اقترح البدائل.

وقت الخادم وقاعدة البيانات هما مصدر الحقيقة.

---

## 8. التأكيد الذري

نفّذ التأكيد داخل Transaction واحدة:

1. اقفل Slot.
2. تحقق من Hold وعدم انتهائه.
3. تحقق من السعة.
4. تحقق من عدم وجود موعد متداخل للمريض.
5. تحقق من الطبيب والفرع والخدمة.
6. تحقق من الدفع أو التأمين المطلوب.
7. أنشئ Appointment.
8. حدّث Slot.
9. أغلق Hold.
10. أنشئ Status History.
11. أنشئ Audit Log.
12. أرجع رقم الحجز.

نفّذ Rollback كاملًا عند الفشل.

استخدم Idempotency Key لمنع الحجز المكرر.

---

## 9. رقم الحجز

أنشئ الرقم على الخادم:

```text
BMC-APT-YYYYMMDD-XXXX
```

مثال:

```text
BMC-APT-20260724-0042
```

يجب أن يكون فريدًا، وألا يكشف UUID أو Database ID.

---

## 10. حالات الموعد

```text
draft
slot_held
pending_verification
pending_insurance
pending_payment
pending_confirmation
confirmed
arrived
checked_in
waiting
called
in_consultation
completed
rescheduled
cancelled
no_show
```

استخدم State Machine بانتقالات مسموحة. كل تغيير يسجّل الحالة السابقة والجديدة والمستخدم والوقت والسبب والقناة وCorrelation ID.

---

## 11. لوحة الاستقبال

أنشئ `/admin/front-desk` ويحتوي:

- بحث المريض.
- تسجيل مريض.
- Patient Snapshot.
- إنشاء حجز.
- حجوزات اليوم.
- المرضى الواصلون.
- قائمة الانتظار.
- Check-in.
- إعادة الجدولة والإلغاء.
- No-show.
- الفواتير والتأمين.
- المستندات المطلوبة.
- التواصل.
- طباعة تأكيد الموعد.

اعرض الوقت والمريض وMRN والطبيب والعيادة والخدمة والحالة والتأمين والدفع ووقت الوصول والانتظار والإجراء التالي.

أضف البحث والفلاتر والترتيب وPagination وSaved Views وReal-time Updates وMobile Card View.

---

## 12. Check-in والطابور

دعم Check-in بواسطة الموظف أو حساب المريض أو QR، مع جاهزية Kiosk مستقبلية.

عند الوصول:

1. تحقق من الموعد والوقت.
2. تحقق من بيانات المريض.
3. تحقق من التأمين أو الدفع.
4. أنشئ Queue Entry.
5. أعط رقم انتظار.
6. حدد العيادة.
7. أرسل إشعارًا.

حالات الطابور:

```text
waiting
called
skipped
in_service
completed
cancelled
```

لا تعرض وقتًا دقيقًا دون بيانات مباشرة.

---

## 13. قائمة الانتظار

اجمع الطبيب والتخصص والفرع ونطاق التاريخ والفترة وقناة التواصل.

عند توفر موعد:

1. أنشئ Opportunity.
2. أرسل إشعارًا.
3. احجز Slot مؤقتًا.
4. اسمح بالتأكيد بنقرة واحدة.
5. حرر Slot عند انتهاء المهلة.

---

## 14. إعادة الجدولة

1. تحقق من السياسة.
2. اعرض البدائل.
3. أنشئ Hold للموعد الجديد.
4. اعرض القديم والجديد.
5. اطلب التأكيد.
6. أكد الجديد ذريًا.
7. حرر القديم بعد نجاح الجديد فقط.
8. سجّل التاريخ.
9. أرسل إشعارًا.

---

## 15. الإلغاء وNo-show

اعرض سياسة الإلغاء وأثر الدفع والتأمين وسبب الإلغاء والبدائل.

بعد الإلغاء:

- حرر Slot.
- سجل التاريخ.
- شغّل Refund Workflow عند الأهلية.
- اقترح إعادة الحجز.
- أرسل إشعارًا.

No-show يحتاج صلاحية وفترة سماح وسجل سبب.

---

## 16. التأمين وNPHIES

حالات التأمين:

```text
not_checked
checking
eligible
not_eligible
approval_required
pending_approval
approved
partially_approved
rejected
expired
technical_error
```

القواعد:

- لا تدّعِ اتصال NPHIES دون تكامل فعلي.
- افصل Mock Adapter عن Production.
- لا تعرض Mock Result كحقيقة.
- سجل Request ID دون بيانات حساسة.
- أضف Retry آمنًا للأخطاء التقنية فقط.

---

## 17. الدفع والفاتورة

اعرض السعر والتأمين ومساهمة المريض والدفعة المقدمة وسياسة الاسترداد.

الحالات:

```text
not_required
pending
processing
paid
partially_paid
failed
refunded
partially_refunded
```

لا تؤكد موعدًا مشروطًا بالدفع حتى يصل Callback صحيح. استخدم Webhook موثّقًا وتحققًا من التوقيع وIdempotency.

---

## 18. بوابة المريض

طوّر:

```text
/patient
/patient/appointments
/patient/reports
/patient/prescriptions
/patient/billing
/patient/insurance
/patient/requests
/patient/family
/patient/profile
```

اعرض الموعد القادم والإجراءات والتقارير والوصفات والتأمين والفواتير والطلبات والعائلة والإشعارات والعروض والخدمات المقترحة.

المريض يرى سجلاته والتابعين المصرح بهم فقط.

---

## 19. لوحة الطبيب

أنشئ `/doctor` ويعرض:

- جدول اليوم.
- المرضى المنتظرون.
- الحالة الحالية.
- الموعد القادم.
- التأخيرات.
- نوع الزيارة.
- الملاحظات المصرح بها.
- حالة التأمين عند الحاجة.
- طلب متابعة.
- إنهاء الزيارة.

لا تبنِ EMR كاملًا دون اعتماد مستقل؛ جهّز Integration Interface.

---

## 20. لوحة مدير الفرع

اعرض مواعيد اليوم والحضور والانتظار والإلغاء وNo-show وإشغال الأطباء والعيادات والفترات المتاحة ومتوسط الانتظار والطلبات المتأخرة والتأمين والتحصيل والتكاملات.

الفلاتر:

- التاريخ.
- الطبيب.
- التخصص.
- الخدمة.
- العيادة.
- الحالة.
- المصدر.
- التأمين.

استخدم بيانات حقيقية فقط.

---

## 21. الإشعارات

القنوات:

- In-app.
- SMS.
- WhatsApp.
- Email.
- Push.

الأحداث تشمل الحجز والتذكير والتعديل والإلغاء والوصول والطابور وقائمة الانتظار والتأمين والدفع والمتابعة.

الحالات:

```text
queued
sent
delivered
failed
unknown
```

لا تعتبر فتح WhatsApp إثباتًا للتسليم.

---

## 22. نموذج البيانات

افحص الموجود قبل إنشاء:

```text
patients
patient_identifiers
dependents
branches
clinics
specialties
services
doctors
doctor_specialties
doctor_branches
doctor_schedules
schedule_exceptions
appointment_slots
slot_holds
appointments
appointment_status_history
appointment_notes
patient_check_ins
queue_entries
waiting_list_entries
insurance_providers
patient_insurance_policies
insurance_eligibility_checks
insurance_approvals
estimates
invoices
payments
refunds
notifications
notification_delivery_logs
audit_logs
system_settings
integration_logs
```

استخدم UUID وtimestamptz وForeign Keys وIndexes وCheck Constraints وRLS وBranch Scope وImmutable Histories.

---

## 23. إعدادات Super Admin

تحكم في:

- مدة Slot Hold.
- أفق الحجز.
- Same-day booking.
- مدة الموعد.
- الإلغاء وإعادة الجدولة.
- Check-in Window.
- No-show Grace.
- Waiting-list Rules.
- التذكيرات.
- الدفع والتأمين.
- Overbooking.
- القنوات والحالات.
- أرقام المراجع.
- Templates.
- Feature Flags.

لا تضع السياسات Hardcoded.

---

## 24. الصلاحيات

الأدوار:

- Super Admin.
- Center Admin.
- Branch Manager.
- Receptionist.
- Doctor.
- Billing Officer.
- Insurance Officer.
- Support Agent.
- Auditor.
- Patient.

طبّق الصلاحيات في UI وServer/API وDatabase/RLS.

اختبر Cross-patient وCross-branch وIDOR وPrivilege Escalation وUnauthorized Export وFile Access.

---

## 25. التصميم

- هوية أصلية لمجمع باعشن.
- Light Medical Theme.
- Dark Admin Mode اختياري.
- RTL وLTR.
- Mobile First.
- WCAG 2.2 AA.
- App-like Booking.
- Enterprise Admin Tables.
- Status Colors موحدة.
- Reduced Motion.
- طابع جازان محدود.
- عدم نسخ Medinous.
- عدم استخدام شعارات اعتماد وهمية.

---

## 26. الذكاء الاصطناعي

الاستخدامات الآمنة:

- أقرب موعد.
- بدائل التوفر.
- تلخيص العمليات.
- تصنيف الطلبات.
- صياغة الرسائل.
- شرح النظام.

يُمنع التشخيص والوصف الدوائي وتأكيد التأمين دون تكامل أو تغيير الحجز دون موافقة.

كل Tool يجب أن يكون Typed وPermission-aware وAudited ويتطلب التأكيد للتعديلات ومحميًا من Prompt Injection وجاهزًا لـMCP.

---

## 27. حالات الواجهة

كل شاشة تحتاج:

- Loading.
- Skeleton.
- Empty.
- Error.
- Offline.
- Retry.
- Forbidden.
- Session Expired.
- Hold Expired.
- Slot Taken.
- Payment Failed.
- Insurance Technical Error.
- Notification Pending.
- Success.

---

## 28. الاختبارات

أضف اختبارات:

```text
patient-registration
duplicate-patient-detection
new-booking
dependent-booking
any-doctor-booking
slot-race
slot-hold-expiry
booking-idempotency
rescheduling
cancellation
waiting-list
digital-check-in
queue-flow
insurance-states
payment-callback
notification-failure
patient-rbac
branch-rbac
doctor-scope
arabic-rtl
mobile-booking
admin-operations
```

شغّل TypeScript وESLint وProduction Build وUnit وIntegration وAPI وDatabase وRLS/RBAC وPlaywright على Chromium وFirefox وWebKit.

---

## 29. مراحل التنفيذ

### المرحلة الأولى

- Current Architecture.
- Route Inventory.
- Database Map.
- Existing Booking Features.
- Gap Analysis.
- Security Findings.
- Change Manifest.
- Migration and Rollback Plans.

### المرحلة الثانية

- Patient Master.
- Schedule Engine.
- Slot Inventory.
- Slot Hold.
- Atomic Booking.
- Idempotency.

### المرحلة الثالثة

- Single-page Booking.
- Front Desk.
- Check-in.
- Queue.
- Waiting List.
- Rescheduling.
- Cancellation.

### المرحلة الرابعة

- Patient Portal.
- Doctor Workspace.
- Branch Dashboard.
- Notifications.

### المرحلة الخامسة

- Insurance.
- NPHIES Adapter.
- Billing.
- Payments.
- Analytics.

### المرحلة السادسة

- Security.
- Accessibility.
- Performance.
- Cross-browser.
- Training.
- Documentation.
- Production Readiness.

---

## 30. شروط القبول

- الحجز يعمل من البداية للنهاية.
- لا يوجد Full Page Reload في رحلة الحجز.
- لا تضيع المسودة.
- يعمل Browser Back/Forward.
- يمنع الحجز المزدوج.
- يعمل Slot Hold وIdempotency.
- يظهر الحجز للمريض والاستقبال والطبيب والإدارة.
- تعمل إعادة الجدولة والإلغاء.
- يعمل Check-in والطابور وقائمة الانتظار.
- تطبق صلاحيات المريض والطبيب والفرع.
- لا توجد أزرار وهمية.
- لا توجد بيانات نجاح مزيفة.
- تنجح اختبارات البناء والأمن.

---

# أمر البدء إلى Lovable

ابدأ بالمرحلة الأولى فقط:

1. افحص النظام الحالي.
2. حدد الوظائف الموجودة.
3. حدد الفجوات.
4. قدم Change Manifest.
5. لا تنشئ جداول مكررة.
6. لا تنفذ Migration مرتفعة الخطورة قبل اعتماد المهندس حامد.

بعد الاعتماد، طوّر المنظومة على مراحل حتى تصبح نظام تسجيل ومواعيد وعيادات خارجية قويًا ومتكاملًا، وليس مجرد نموذج حجز.

## المرجع الوظيفي

استخدم Medinous كمصدر لفهم نطاق أنظمة HIS السعودية فقط:

https://medinous.com/best-hospital-management-system-in-saudi-arabia/

لا تنسخ التصميم أو الكود أو النصوص أو العلامات التجارية.
