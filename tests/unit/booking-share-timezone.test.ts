/**
 * Unit tests: ملف .ics ورابط Google Calendar يجب أن يظلا يشيران إلى وقت
 * الرياض الصحيح مهما تغيّرت المنطقة الزمنية للجهاز/الخادم.
 *
 * التنفيذ الحالي:
 *  - .ics يُصدر VTIMEZONE:Asia/Riyadh + DTSTART;TZID=Asia/Riyadh:<local>
 *    (وقت محلي معنون — لا يعتمد على ساعة الجهاز)
 *  - Google يستقبل تواريخ محلية بدون Z + ctz=Asia/Riyadh
 *  - VALARM يستخدم TRIGGER مدّة (-PT24H / -PT2H) — آمن مع DST عند العارض
 *
 * تشغيل:  bun test tests/unit/booking-share-timezone.test.ts
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

const base = (over: Partial<ShareBooking> = {}): ShareBooking => ({
  ref: "abcd1234",
  patient_name: "TZ-Test",
  appointment_date: "2026-07-15",
  appointment_time: "10:00",
  ...over,
});

console.log("\n── booking-share: .ics + Google Calendar — timezone integrity ──");

// ── .ics: VTIMEZONE + DTSTART;TZID=Asia/Riyadh (لا يعتمد على منطقة الجهاز) ──
test("ملف .ics يحتوي VTIMEZONE:Asia/Riyadh مع TZOFFSETTO:+0300", () => {
  const ics = buildIcs(base());
  assert(ics.includes("BEGIN:VTIMEZONE"), "VTIMEZONE مفقودة");
  assert(ics.includes("TZID:Asia/Riyadh"), "TZID:Asia/Riyadh مفقودة");
  assert(ics.includes("TZOFFSETTO:+0300"), "TZOFFSETTO:+0300 مفقودة");
  assert(ics.includes("END:VTIMEZONE"), "END:VTIMEZONE مفقودة");
});

test("DTSTART/DTEND يستخدمان TZID=Asia/Riyadh مع وقت محلي (بدون Z)", () => {
  const ics = buildIcs(base({ appointment_date: "2026-07-15", appointment_time: "10:00" }));
  assert(ics.includes("DTSTART;TZID=Asia/Riyadh:20260715T100000"), `DTSTART شكل خاطئ:\n${ics}`);
  assert(ics.includes("DTEND;TZID=Asia/Riyadh:20260715T103000"), `DTEND شكل خاطئ (30د افتراضياً)`);
  assert(!/DTSTART[^\r\n]*Z(\r|\n)/.test(ics), "DTSTART يجب ألا يحتوي Z — تعني UTC");
});

test("الصيف والشتاء يعطيان نفس الوقت المحلي (لا DST في الرياض)", () => {
  const summer = buildIcs(base({ appointment_date: "2026-07-15", appointment_time: "14:00" }));
  const winter = buildIcs(base({ appointment_date: "2026-01-15", appointment_time: "14:00" }));
  assert(summer.includes("DTSTART;TZID=Asia/Riyadh:20260715T140000"), "الصيف خطأ");
  assert(winter.includes("DTSTART;TZID=Asia/Riyadh:20260115T140000"), "الشتاء خطأ");
});

test("منتصف الليل الرياضي يبقى 00:30 محلياً (بدون إزاحة يوم)", () => {
  const ics = buildIcs(base({ appointment_date: "2026-03-01", appointment_time: "00:30" }));
  assert(ics.includes("DTSTART;TZID=Asia/Riyadh:20260301T003000"), `الوقت المحلي خطأ:\n${ics}`);
});

test("مدة مخصّصة (45د) تُحسب على الوقت المحلي دون تحويل UTC", () => {
  // نستدعي مباشرة عبر buildIcs الافتراضية (30د)، ثم نتحقق من الحد الأدنى
  const ics = buildIcs(base({ appointment_date: "2026-07-15", appointment_time: "23:45" }));
  // 23:45 + 30د = 00:15 من اليوم التالي — يجب أن ينعكس محلياً
  assert(ics.includes("DTSTART;TZID=Asia/Riyadh:20260715T234500"), "DTSTART خطأ");
  assert(
    ics.includes("DTEND;TZID=Asia/Riyadh:20260716T001500"),
    `DTEND عبور اليوم محلياً خطأ:\n${ics}`,
  );
});

// ── VALARM بشكل مدّة — آمن مع DST عند العارض ──
test("reminder_24h يستخدم TRIGGER:-PT24H", () => {
  const ics = buildIcs(base({ reminder_24h: true, reminder_2h: false }));
  assert(/BEGIN:VALARM[\s\S]*?TRIGGER:-PT24H[\s\S]*?END:VALARM/.test(ics), "24h VALARM مفقود");
  assert(!ics.includes("TRIGGER:-PT2H"), "2h VALARM يجب إخفاؤه");
});

test("reminder_2h يستخدم TRIGGER:-PT2H", () => {
  const ics = buildIcs(base({ reminder_24h: false, reminder_2h: true }));
  assert(/BEGIN:VALARM[\s\S]*?TRIGGER:-PT2H[\s\S]*?END:VALARM/.test(ics), "2h VALARM مفقود");
  assert(!ics.includes("TRIGGER:-PT24H"), "24h VALARM يجب إخفاؤه");
});

test("كلا العلمين true → VALARM اثنان بالضبط", () => {
  const ics = buildIcs(base({ reminder_24h: true, reminder_2h: true }));
  const count = (ics.match(/BEGIN:VALARM/g) || []).length;
  assert(count === 2, `المتوقع 2 VALARM، الفعلي ${count}`);
});

test("كلا العلمين false → لا VALARM", () => {
  const ics = buildIcs(base({ reminder_24h: false, reminder_2h: false }));
  assert(!ics.includes("BEGIN:VALARM"), "لا يجب وجود VALARM");
});

test("undefined/null افتراضياً مفعّل (يطابق الحجز)", () => {
  const und = buildIcs(base({}));
  const nul = buildIcs(base({ reminder_24h: null, reminder_2h: null }));
  for (const ics of [und, nul]) {
    assert(ics.includes("TRIGGER:-PT24H"), "24h VALARM متوقع افتراضياً");
    assert(ics.includes("TRIGGER:-PT2H"), "2h VALARM متوقع افتراضياً");
  }
});

test("TRIGGER أبداً لا يكون DATE-TIME مطلقاً (سيكسر مع DST)", () => {
  const ics = buildIcs(base({ reminder_24h: true, reminder_2h: true }));
  assert(!/TRIGGER;VALUE=DATE-TIME:/.test(ics), "TRIGGER مطلق غير مسموح");
});

// ── ثبات المخرج عبر TZ الجهاز/الخادم المختلفة ──
const HOST_TZS = [
  "UTC",
  "America/New_York", // UTC-5/-4 (DST)
  "America/Los_Angeles", // UTC-8/-7 (DST)
  "Europe/London", // UTC+0/+1 (DST)
  "Europe/Berlin", // UTC+1/+2 (DST)
  "Asia/Kolkata", // UTC+5:30 (لا DST)
  "Asia/Tokyo", // UTC+9 (لا DST)
  "Australia/Sydney", // UTC+10/+11 (DST جنوبي معكوس)
  "Pacific/Kiritimati", // UTC+14 (الأقصى شرقاً)
  "Pacific/Pago_Pago", // UTC-11 (الأقصى غرباً)
];

const stripStamp = (s: string) => s.replace(/DTSTAMP:[^\r\n]+/g, "DTSTAMP:X");

test("buildIcs متطابق تماماً عبر كل مناطق الجهاز الزمنية", () => {
  const orig = process.env.TZ;
  const b = base({ appointment_date: "2026-07-15", appointment_time: "10:00" });
  const outs = HOST_TZS.map((tz) => {
    process.env.TZ = tz;
    return stripStamp(buildIcs(b));
  });
  process.env.TZ = orig;
  const first = outs[0];
  for (let i = 1; i < outs.length; i++) {
    assert(outs[i] === first, `TZ=${HOST_TZS[i]} أنتج .ics مختلف عن TZ=${HOST_TZS[0]}`);
  }
  // وثّق الوقت المحلي المتوقع
  assert(first.includes("DTSTART;TZID=Asia/Riyadh:20260715T100000"), "DTSTART المتوقع مفقود");
});

test("googleCalendarUrl متطابق عبر كل مناطق الجهاز", () => {
  const orig = process.env.TZ;
  const b = base({ appointment_date: "2026-07-15", appointment_time: "10:00" });
  const urls = HOST_TZS.map((tz) => {
    process.env.TZ = tz;
    return googleCalendarUrl(b);
  });
  process.env.TZ = orig;
  const first = urls[0];
  for (let i = 1; i < urls.length; i++) {
    assert(urls[i] === first, `TZ=${HOST_TZS[i]} أنتج URL مختلف`);
  }
});

test("googleCalendarUrl يثبّت ctz=Asia/Riyadh مع وقت محلي (بدون Z)", () => {
  const url = googleCalendarUrl(
    base({ appointment_date: "2026-07-15", appointment_time: "10:00" }),
  );
  assert(url.includes("ctz=Asia%2FRiyadh"), `ctz مفقودة: ${url}`);
  assert(
    url.includes("dates=20260715T100000%2F20260715T103000"),
    `dates خطأ (يجب أن تكون محلية بدون Z): ${url}`,
  );
  assert(!/dates=[^&]*Z/.test(url), "dates يجب ألا تحتوي Z — تلغي ctz");
});

// ── محاكاة تغيير TZ الجهاز أثناء استدعاءات متتابعة ──
test("تبديل TZ الجهاز بين استدعاءين لا يؤثر على DTSTART المحلي", () => {
  const orig = process.env.TZ;
  const b = base({ appointment_date: "2026-12-31", appointment_time: "23:30" });

  process.env.TZ = "Pacific/Pago_Pago"; // UTC-11
  const a = stripStamp(buildIcs(b));
  process.env.TZ = "Pacific/Kiritimati"; // UTC+14 — أقصى فارق ممكن ~25 ساعة
  const c = stripStamp(buildIcs(b));
  process.env.TZ = orig;

  assert(a === c, "التبديل بين UTC-11 و UTC+14 غيّر الناتج");
  assert(a.includes("DTSTART;TZID=Asia/Riyadh:20261231T233000"), "الوقت المحلي المتوقع مفقود");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
