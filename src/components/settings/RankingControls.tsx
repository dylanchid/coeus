import { useState } from "react";
import { formatKeywordRules, parseKeywordRules } from "@/lib/feeds/ranking";
import type { SourceDef, UserPrefs } from "@/lib/types";
import type { SettingsChange } from "./SettingsControls";

export function RankingControls({ prefs, orderedSources, onChange }: {
  prefs: UserPrefs;
  orderedSources: SourceDef[];
  onChange: SettingsChange;
}) {
  const [rulesText, setRulesText] = useState(() => formatKeywordRules(prefs.keywordRules));
  const knownSourceIds = new Set(orderedSources.map((source) => source.id));
  const nonemptyLineCount = rulesText.split(/\r?\n/).filter((line) => line.trim()).length;
  const validRuleCount = parseKeywordRules(rulesText, knownSourceIds).length;

  const updateSourceWeight = (sourceId: string, weight: number) => {
    const sourceWeights = { ...prefs.sourceWeights };
    if (weight === 1) delete sourceWeights[sourceId];
    else sourceWeights[sourceId] = weight;
    onChange({ sourceWeights });
  };

  return (
    <section className="settings-section">
      <h3>Ranking</h3>
      <label className="settings-ranking-rules">
        <span>Keyword rules</span>
        <textarea
          value={rulesText}
          rows={5}
          spellCheck={false}
          placeholder={'AI +5\n"local-first" +8\ncrypto -4\n@hn Rust +3'}
          onChange={(event) => {
            const text = event.target.value;
            setRulesText(text);
            onChange({ keywordRules: parseKeywordRules(text, knownSourceIds) });
          }}
        />
      </label>
      <p className="settings-note">
        One rule per line. Weights run from −10 to +10. Prefix with a source ID,
        such as <code>@hn AI +5</code>, to scope a rule.
        {nonemptyLineCount > validRuleCount
          ? ` ${nonemptyLineCount - validRuleCount} invalid ${nonemptyLineCount - validRuleCount === 1 ? "line is" : "lines are"} ignored.`
          : ` ${validRuleCount} ${validRuleCount === 1 ? "rule" : "rules"} active.`}
      </p>
      <p className="settings-actions">
        <button type="button" disabled={!prefs.keywordRules.length} onClick={() => {
          setRulesText("");
          onChange({ keywordRules: [] });
        }}>Clear keyword rules</button>
        {" · "}
        <button type="button" disabled={!Object.keys(prefs.sourceWeights).length} onClick={() => onChange({ sourceWeights: {} })}>
          Reset source weights
        </button>
      </p>
      <ul className="settings-source-weights">
        {orderedSources.map((source) => {
          const weight = prefs.sourceWeights[source.id] ?? 1;
          return (
            <li key={source.id}>
              <label>
                <span>{source.name} <code>@{source.id}</code></span>
                <input type="range" min="0.5" max="1.5" step="0.25" value={weight}
                  onChange={(event) => updateSourceWeight(source.id, Number(event.target.value))} />
                <output>{weight.toFixed(2)}×</output>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
