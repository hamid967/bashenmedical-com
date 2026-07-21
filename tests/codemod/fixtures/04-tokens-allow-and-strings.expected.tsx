// يضمن أن:
//  - سطر tokens-allow لا يُحوَّل
//  - النصوص خارج className/clsx/cn/twMerge لا تُلمس
//  - fill/stroke لا يستخدمان صيغة color:
const brand = "bg-red-500 text-white"; // نصّ ليس className — يجب ألا يتغيّر

export const D = ({ n }: { n: number }) => (
  <>
    <div className="bg-red-500 text-white" /* tokens-allow: مطلوب للتكامل مع widget طرف ثالث */ />
    <div className="bg-[color:var(--portal-error)] text-[color:var(--portal-on-primary)]" />
    <svg><path className="fill-[var(--portal-error)] stroke-[var(--portal-ink-2)]" /></svg>
    <span>{`رسالة: ${brand}`}</span>
  </>
);
