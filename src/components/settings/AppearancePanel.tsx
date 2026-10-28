import { FONT_OPTIONS, PALETTE_OPTIONS } from "@/lib/prefs";
import type { ThemeMode, UserPrefs } from "@/lib/types";
import { ChoiceRow, type SettingsChange } from "./SettingsControls";

export function AppearancePanel({ prefs, onChange }: { prefs: UserPrefs; onChange: SettingsChange }) {
  return (
    <section className="settings-section">
      <h3>Appearance</h3>
      <ChoiceRow label="Theme" value={prefs.theme} options={["system", "light", "dark"] as ThemeMode[]}
        onPick={(theme) => onChange({ theme })} />
      <ChoiceRow label="Palette" value={prefs.palette} options={PALETTE_OPTIONS.map((palette) => palette.id)}
        onPick={(palette) => onChange({ palette })}
        format={(id) => PALETTE_OPTIONS.find((palette) => palette.id === id)?.label ?? String(id)} />
      <ChoiceRow label="Font" value={prefs.font} options={FONT_OPTIONS.map((font) => font.id)}
        onPick={(font) => onChange({ font })}
        format={(id) => FONT_OPTIONS.find((font) => font.id === id)?.label ?? String(id)} />
      <article className="settings-preview" aria-label="Appearance preview">
        <span>Reuters · World · 12m</span>
        <strong>A sample story shows your choices live.</strong>
        <p>Muted details stay quiet while the headline remains clear.</p>
      </article>
    </section>
  );
}
