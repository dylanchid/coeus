import type { UserPrefs } from "@/lib/types";

export type SettingsChange = (patch: Partial<UserPrefs>) => void;

export function ChoiceRow<T extends string | number>({
  label, value, options, onPick, format = String,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onPick: (value: T) => void;
  format?: (value: T) => string;
}) {
  return (
    <div className="settings-row">
      <span className="settings-label">{label}</span>
      <div className="settings-choices">
        {options.map((option, index) => (
          <span key={String(option)}>
            {index > 0 ? <span className="sep"> · </span> : null}
            <button type="button" aria-pressed={value === option} onClick={() => onPick(option)}>
              {format(option)}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

export function ToggleRow({ label, checked, onChange }: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="settings-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
