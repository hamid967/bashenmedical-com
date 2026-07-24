/**
 * Client-safe AI safety helpers: emergency keyword detection, medical
 * red-flag classification, PII masking, and assistant output sanitization.
 * Pure functions only — safe for both server and browser.
 */

export const EMERGENCY_KEYWORDS_AR = [
  "ألم صدر",
  "ألم في الصدر",
  "ضيق تنفس",
  "ضيق نفس",
  "صعوبة تنفس",
  "نزيف حاد",
  "نزيف شديد",
  "فقدان وعي",
  "إغماء",
  "سكتة",
  "جلطة",
  "تشنج",
  "اختناق",
  "حمّى شديدة",
  "تسمم",
  "انتحار",
  "أنا هأموت",
  "بأموت",
  "لا أستطيع التنفس",
  "دم كثير",
  "حادث",
];
export const EMERGENCY_KEYWORDS_EN = [
  "chest pain",
  "cannot breathe",
  "can't breathe",
  "shortness of breath",
  "severe bleeding",
  "unconscious",
  "stroke",
  "seizure",
  "choking",
  "overdose",
  "suicide",
  "kill myself",
  "heart attack",
];

export const MEDICAL_DIAGNOSIS_TRIGGERS_AR = [
  "شخّص",
  "شخص لي",
  "ما هو مرضي",
  "ماذا لدي",
  "أي دواء",
  "ما الجرعة",
  "أوقف الدواء",
  "استبدل الدواء",
  "فسّر تحليلي",
  "حلل نتيجتي",
];
export const MEDICAL_DIAGNOSIS_TRIGGERS_EN = [
  "diagnose",
  "what disease",
  "what do i have",
  "prescribe",
  "dosage",
  "stop taking",
  "interpret my lab",
  "read my report",
];

const PROMPT_INJECTION_PATTERNS = [
  /ignore (all )?previous instructions?/i,
  /disregard (the )?system prompt/i,
  /reveal (the )?system prompt/i,
  /print (?:the )?(?:system )?prompt/i,
  /(you are|act as) (?:a )?(?:developer|admin|super|root|dan|jailbroken)/i,
  /developer mode/i,
  /do anything now/i,
  /bypass (?:the )?(?:safety|filter|guard)/i,
  /system\s*:\s*you are/i,
  /<\/?\s*(?:system|assistant|instructions)\s*>/i,
  /تجاهل (كل )?التعليمات/i,
  /اكشف (لي )?التعليمات/i,
  /أنت الآن مطور/i,
  /تجاوز (?:فلتر|قواعد|الحماية)/i,
  /اعمل بدون قيود/i,
];

export type SafetyClass =
  | { kind: "ok" }
  | { kind: "emergency"; matched: string }
  | { kind: "medical_diagnosis"; matched: string }
  | { kind: "prompt_injection"; matched: string };

export function classifyUserMessage(text: string): SafetyClass {
  const t = (text ?? "").toLowerCase();
  for (const k of EMERGENCY_KEYWORDS_AR)
    if (text.includes(k)) return { kind: "emergency", matched: k };
  for (const k of EMERGENCY_KEYWORDS_EN)
    if (t.includes(k)) return { kind: "emergency", matched: k };
  for (const p of PROMPT_INJECTION_PATTERNS) {
    const m = text.match(p);
    if (m) return { kind: "prompt_injection", matched: m[0] };
  }
  for (const k of MEDICAL_DIAGNOSIS_TRIGGERS_AR)
    if (text.includes(k)) return { kind: "medical_diagnosis", matched: k };
  for (const k of MEDICAL_DIAGNOSIS_TRIGGERS_EN)
    if (t.includes(k)) return { kind: "medical_diagnosis", matched: k };
  return { kind: "ok" };
}

export const EMERGENCY_MESSAGE_AR =
  "هذه الأعراض قد تكون طارئة. الرجاء الاتصال فورًا بالإسعاف على **997** أو التوجه لأقرب طوارئ. لا يمكن للمساعد الذكي تشخيص الحالات الطبية.";
export const EMERGENCY_MESSAGE_EN =
  "These symptoms may indicate a medical emergency. Please call **997** immediately or go to the nearest emergency room. This assistant cannot diagnose medical conditions.";

export const MEDICAL_REFUSAL_AR =
  "لا يمكنني تشخيص المرض أو وصف الدواء أو تعديل الجرعات أو تفسير التقارير الطبية. أنصحك بحجز موعد مع الطبيب المختص أو التواصل مع طبيبك الحالي عبر البوابة.";
export const MEDICAL_REFUSAL_EN =
  "I cannot diagnose conditions, prescribe medications, adjust dosages, or interpret medical reports. Please book an appointment with a specialist or contact your treating physician via the portal.";

/**
 * Mask common PII in text: national IDs, phones, emails, insurance policy numbers,
 * credit cards, IBANs. Applied BOTH to inbound user turns (before sending to the
 * model) and to outbound assistant text (defense-in-depth for streamed output).
 */
export function maskSensitive(input: string): string {
  if (!input) return input;
  let out = input;
  // 10-digit Saudi national IDs / iqama (1xxxxxxxxx / 2xxxxxxxxx)
  out = out.replace(/\b([12]\d{9})\b/g, (m) => `••••••${m.slice(-4)}`);
  // Credit cards (13-19 digits, allow spaces/dashes)
  out = out.replace(/\b(?:\d[ -]*?){13,19}\b/g, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) return m;
    return `••••-••••-••••-${digits.slice(-4)}`;
  });
  // IBAN (SA + 22 digits, optional spaces)
  out = out.replace(/\bSA\d{2}(?:[ ]?\d){20}\b/gi, (m) => {
    const compact = m.replace(/\s+/g, "");
    return `SA••••••••••••••••••${compact.slice(-4)}`;
  });
  // Emails
  out = out.replace(
    /\b([A-Z0-9._%+-]{1,64})@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi,
    (_, local: string, domain: string) => {
      const head = local.slice(0, Math.min(2, local.length));
      return `${head}••••@${domain}`;
    },
  );
  // Long phone numbers (7+ digits with optional + and separators)
  out = out.replace(/\+?\d[\d\s-]{7,}\d/g, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length < 7) return m;
    return `${digits.slice(0, 3)}••••${digits.slice(-2)}`;
  });
  return out;
}

/**
 * Sanitize outgoing assistant text before returning it to the client.
 * Applies the same PII masking as inbound user text so leaked identifiers
 * from grounding context or model hallucinations do not reach the browser.
 */
export function sanitizeAssistantText(input: string): string {
  return maskSensitive(input ?? "");
}

/**
 * Quick heuristic used by post-generation guards. Returns true if the assistant
 * text contains language that reads as a definitive medical diagnosis or a
 * dosage/prescription instruction — which the assistant is never allowed to do.
 */
const MEDICAL_OUTPUT_PATTERNS = [
  /\byou (?:have|are suffering from|are diagnosed with)\b/i,
  /\btake\s+\d+\s*(?:mg|ml|tablets?|pills?|capsules?)\b/i,
  /\bstop\s+taking\s+/i,
  /\bincrease\s+(?:the\s+)?dose\b/i,
  /أنت مصاب/,
  /تشخيصك (?:هو )?/,
  /تناول \d+\s*(?:مجم|ملغ|حبة|كبسولة)/,
  /أوقف الدواء/,
  /زد الجرعة/,
];
export function looksLikeMedicalDirective(text: string): boolean {
  if (!text) return false;
  return MEDICAL_OUTPUT_PATTERNS.some((p) => p.test(text));
}
