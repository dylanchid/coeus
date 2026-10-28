import { HOME_VIEW_OPTIONS, STORY_REPRESENTATION_OPTIONS } from "@/lib/prefs";
import type { ArticlePreviewMode, ColumnCount, DensityId, HomeViewId, StoryRepresentationId, UserPrefs } from "@/lib/types";
import { ChoiceRow, ToggleRow, type SettingsChange } from "./SettingsControls";

const COLUMNS: ColumnCount[] = [1, 2, 3, 4];

export function ReadingPanel({ prefs, onChange }: { prefs: UserPrefs; onChange: SettingsChange }) {
  return <>
    <section className="settings-section">
      <h3>Reading</h3>
      <ChoiceRow label="View" value={prefs.homeView} options={HOME_VIEW_OPTIONS.map((view) => view.id)}
        onPick={(homeView) => onChange({ homeView: homeView as HomeViewId })}
        format={(id) => HOME_VIEW_OPTIONS.find((view) => view.id === id)?.label ?? String(id)} />
      {prefs.homeView === "grid" ? (
        <ChoiceRow label="Columns" value={prefs.columns} options={COLUMNS}
          onPick={(columns) => onChange({ columns })} />
      ) : (
        <ChoiceRow label="Stories" value={prefs.storyRepresentation}
          options={STORY_REPRESENTATION_OPTIONS.map((option) => option.id)}
          onPick={(storyRepresentation) => onChange({ storyRepresentation: storyRepresentation as StoryRepresentationId })}
          format={(id) => STORY_REPRESENTATION_OPTIONS.find((option) => option.id === id)?.label ?? String(id)} />
      )}
      <ChoiceRow label="Density" value={prefs.density} options={["comfortable", "compact"] as DensityId[]}
        onPick={(density) => onChange({ density })}
        format={(density) => density === "comfortable" ? "Comfort" : "Compact"} />
      <ChoiceRow label="Headlines" value={prefs.articlePreviewMode}
        options={["ask", "preview", "external"] as ArticlePreviewMode[]}
        onPick={(articlePreviewMode) => onChange({ articlePreviewMode })}
        format={(mode) => mode === "ask" ? "Ask first" : mode === "preview" ? "Preview in Coeus" : "Open original"} />
      <dl className="mode-guide">
        <div><dt>Grid</dt><dd>Grouped by source</dd></div>
        <div><dt>Top</dt><dd>Balanced across sources</dd></div>
        <div><dt>Focus</dt><dd>Newest stories first</dd></div>
        <div><dt>Ranked</dt><dd>Your explicit rules, explained</dd></div>
      </dl>
    </section>

    {prefs.homeView === "grid" ? (
      <section className="settings-section">
        <h3>Grid details</h3>
        <ToggleRow label="Article summaries" checked={prefs.showSummaries}
          onChange={(showSummaries) => onChange({ showSummaries })} />
        <ToggleRow label="Authors" checked={prefs.showAuthors}
          onChange={(showAuthors) => onChange({ showAuthors })} />
        <ToggleRow label="Age labels" checked={prefs.showAges}
          onChange={(showAges) => onChange({ showAges })} />
        <ToggleRow label="Engagement" checked={prefs.showEngagement}
          onChange={(showEngagement) => onChange({ showEngagement })} />
      </section>
    ) : null}
  </>;
}
