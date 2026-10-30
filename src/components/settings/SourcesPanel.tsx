import { useState } from "react";
import { allSources, orderByIds } from "@/lib/feeds/sources";
import type { UserPrefs } from "@/lib/types";
import { AddSourceForm } from "../AddSourceForm";
import type { SettingsChange } from "./SettingsControls";

export function SourcesPanel({ prefs, onChange }: { prefs: UserPrefs; onChange: SettingsChange }) {
  const [sourceQuery, setSourceQuery] = useState("");
  const hidden = new Set(prefs.hiddenSources);
  const enabledSources = allSources(prefs.customSources).filter((source) => prefs.sourceOrder.includes(source.id));
  const orderedSources = orderByIds(enabledSources, prefs.sourceOrder);
  const normalizedSourceQuery = sourceQuery.trim().toLowerCase();
  const filteredSources = orderedSources.filter((source) =>
    `${source.name} ${source.topic}`.toLowerCase().includes(normalizedSourceQuery)
  );

  const toggleHidden = (id: string) => {
    const next = new Set(prefs.hiddenSources);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ hiddenSources: [...next] });
  };

  return <>
    <section className="settings-section">
      <h3>Your feeds</h3>
      <AddSourceForm prefs={prefs} onChange={onChange} />
    </section>
    <section className="settings-section">
      <h3>Sources</h3>
      <label className="source-search-label" htmlFor="settings-source-search">Search sources</label>
      <input id="settings-source-search" className="source-search-input" type="search"
        value={sourceQuery} onChange={(event) => setSourceQuery(event.target.value)} placeholder="Name or topic" />
      <p className="settings-actions">
        <button type="button" onClick={() => onChange({ hiddenSources: [] })}
          disabled={prefs.hiddenSources.length === 0}>Show all</button>
        {" · "}
        <button type="button" onClick={() => onChange({ hiddenSources: orderedSources.map((source) => source.id) })}
          disabled={orderedSources.length > 0 && orderedSources.every((source) => hidden.has(source.id))}>Hide all</button>
      </p>
      <ul className="settings-sources">
        {filteredSources.map((source) => {
          const isHidden = hidden.has(source.id);
          return (
            <li key={source.id} className={isHidden ? "is-hidden" : undefined}>
              <label>
                <input type="checkbox" checked={!isHidden} onChange={() => toggleHidden(source.id)} />
                <span>{source.name}</span>
                <span className="topic-tag">{source.topic}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  </>;
}
