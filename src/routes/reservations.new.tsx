/**
 * /reservations/new — DEPRECATED
 *
 * تم توحيد تدفقات الحجز الثلاث في المسار الواحد /book (المعالج المتكامل بـ 8 خطوات).
 * هذا الملف الآن مجرّد إعادة توجيه للحفاظ على الروابط القديمة (?doctor=...).
 *
 * لماذا؟
 *  - سابقًا كان لدينا 3 معالجات مختلفة (/book و /reservations/new و /portal/book)
 *    مع منطق تحقق مكرر ومتضارب.
 *  - وحّدنا التحقق في src/lib/booking-limits.ts والـ APIs العامة تحته.
 *  - /book هو التجربة الرسمية الوحيدة للزوّار (والمرضى غير المسجّلين).
 *  - /portal/book يبقى للمرضى المسجّلين لدعم المرافقين والتأمين.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

const searchSchema = z.object({
  doctor: z.string().optional(),
});

export const Route = createFileRoute("/reservations/new")({
  validateSearch: searchSchema,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/book",
      search: search.doctor ? { doctor: search.doctor } : {},
      replace: true,
    });
  },
});
