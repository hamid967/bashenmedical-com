export function CheckItem({
  checked,
  onChange,
  label,
  count,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  /** Live match count under the current filter combination. */
  count?: number;
}) {
  const disabled = count === 0 && !checked;
  return (
    <label
      className={`flex items-center gap-2.5 text-sm group transition-colors ${
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:text-primary"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-border accent-primary h-4 w-4"
      />
      <span className={`flex-1 ${checked ? "font-medium text-primary" : ""}`}>{label}</span>
      {typeof count === "number" && (
        <span
          className={`text-[11px] tabular-nums transition-colors ${
            checked ? "text-primary" : "text-muted-foreground"
          }`}
          aria-label={`${count} matches`}
        >
          {count}
        </span>
      )}
    </label>
  );
}
