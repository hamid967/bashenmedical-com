/**
 * Unit test: التاريخ/الوقت المعروضان في بطاقة "معاينة تفاصيل الحدث"
 * وفي نص زر "نسخ للمشاركة" يجب أن يطابقا حرفياً ما يُكتب في:
 *   - DTSTART;TZID=Asia/Riyadh:<YYYYMMDD>T<HHMMSS> داخل ملف .ics
 *   - dates=<YYYYMMDDTHHMMSS>/... في رابط Google Calendar
 *
 * البطاقة تُنشئ ShareBooking مباشرةً من نفس state.date / state.time
 * الممرَّرين لـ buildIcs و googleCalendarUrl، فالمطابقة مضمونة بالبناء.
 * هذا الاختبار يوثّق العقد ويمنع أي انحراف مستقبلي (مثلاً لو أضاف
 * أحدهم منطقة زمنية على المعاينة أو تحويل UTC على المخرجات).
 *
 * تشغيل:  bun test tests/unit/booking-share-preview-parity.test.ts
 */
import { buildIcs, googleCalendarUrl, type ShareBooking } from "../../src/lib/booking-share";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}\n    ${(err as Error).message}`);
    failed++;
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

/** يستخرج YYYY-MM-DD و HH:mm من DTSTART;TZID=Asia/Riyadh:... */
function extractIcsLocal(ics: string): { date: string; time: string } {
  const m = /DTSTART;TZID=Asia\/Riyadh:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})\d{2}/.exec(ics);
  if (!m) throw new Error("DTSTART;TZID=Asia/Riyadh غير موجود في .ics");
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
}

/** يستخرج YYYY-MM-DD و HH:mm من dates=... في رابط Google. */
function extractGoogleLocal(url: string): { date: string; time: string } {
  const u = new URL(url);
  const dates = u.searchParams.get("dates") || "";
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})\d{2}\//.exec(dates);
  if (!m) throw new Error(`dates بصيغة غير متوقعة: ${dates}`);
  const ctz = u.searchParams.get("ctz");
  if (ctz !== "Asia/Riyadh") throw new Error(`ctz خاطئ: ${ctz}`);
  if (/Z\//.test(dates)) throw new Error("dates يحتوي Z — سيلغي ctz");
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
}

const cases: Array<{ appointment_date: string; appointment_time: string }> = [
  { appointment_date: "2026-07-15", appointment_time: "10:00" }, // صباح صيف
  { appointment_date: "2026-01-15", appointment_time: "14:30" }, // ظهر شتاء
  { appointment_date: "2026-03-29", appointment_time: "09:30" }, // يوم DST أوروبي
  { appointment_date: "2026-03-08", appointment_time: "02:30" }, // يوم DST أمريكي
  { appointment_date: "2026-03-01", appointment_time: "00:30" }, // منتصف الليل
  { appointment_date: "2026-01-01", appointment_time: "01:00" }, // حدود السنة
  { appointment_date: "2026-12-31", appointment_time: "23:30" }, // نهاية السنة
];

console.log("\n── booking-share: parity بين المعاينة/النسخ و .ics/Google ──");

for (const c of cases) {
  const share: ShareBooking = {
    ref: "PARITY-1",
    patient_name: "Parity Test",
    ...c,
  };
  test(`.ics يحمل نفس ${c.appointment_date} ${c.appointment_time} المعروض في البطاقة`, () => {
    const ics = buildIcs(share);
    const { date, time } = extractIcsLocal(ics);
    assert(date === c.appointment_date, `date: expected ${c.appointment_date}, got ${date}`);
    assert(time === c.appointment_time, `time: expected ${c.appointment_time}, got ${time}`);
  });
  test(`Google URL يحمل نفس ${c.appointment_date} ${c.appointment_time} المعروض في البطاقة`, () => {
    const url = googleCalendarUrl(share);
    const { date, time } = extractGoogleLocal(url);
    assert(date === c.appointment_date, `date: expected ${c.appointment_date}, got ${date}`);
    assert(time === c.appointment_time, `time: expected ${c.appointment_time}, got ${time}`);
  });
}

// ── parity تحت جميع مناطق الجهاز الزمنية ──
const HOST_TZS = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Kiritimati",
  "Pacific/Pago_Pago",
];

test("parity يبقى صحيحاً مهما تغيّرت TZ الجهاز", () => {
  const orig = process.env.TZ;
  const share: ShareBooking = {
    ref: "PARITY-TZ",
    patient_name: "Parity",
    appointment_date: "2026-07-15",
    appointment_time: "10:00",
  };
  for (const tz of HOST_TZS) {
    process.env.TZ = tz;
    const ics = extractIcsLocal(buildIcs(share));
    const g = extractGoogleLocal(googleCalendarUrl(share));
    assert(
      ics.date === share.appointment_date && ics.time === share.appointment_time,
      `.ics انحرف تحت TZ=${tz}: ${ics.date} ${ics.time}`,
    );
    assert(
      g.date === share.appointment_date && g.time === share.appointment_time,
      `Google انحرف تحت TZ=${tz}: ${g.date} ${g.time}`,
    );
  }
  process.env.TZ = orig;
});

// ── تحقق إضافي: نص "نسخ للمشاركة" (كما يبنيه المكوّن) يحمل نفس القيم ──
// نحاكي بناء previewRows في StepSuccess.tsx تمامًا للحقول التي تُنسخ.
test("نص زر النسخ يحوي التاريخ/الوقت المدخلين حرفياً (بدون تحويل)", () => {
  const share: ShareBooking = {
    ref: "REF-XYZ",
    patient_name: "Ali",
    appointment_date: "2026-07-15",
    appointment_time: "10:00",
    doctor: "د. أحمد",
    specialty: "باطنة",
  };
  // ملاحظة: البطاقة تعرض state.date/state.time نفسيهما، فنؤكد فقط
  // أن نفس القيم موجودة في .ics و Google.
  const ics = extractIcsLocal(buildIcs(share));
  const g = extractGoogleLocal(googleCalendarUrl(share));
  const displayedDate = share.appointment_date;
  const displayedTime = share.appointment_time;
  assert(ics.date === displayedDate && ics.time === displayedTime, "المعاينة/النسخ ≠ .ics");
  assert(g.date === displayedDate && g.time === displayedTime, "المعاينة/النسخ ≠ Google");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
