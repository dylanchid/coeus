"use client";

import { useState } from "react";
import { TOPICS } from "@/lib/sources";
import type { SourceDef, UserPrefs } from "@/lib/types";

interface Preview {
  id: string;
  name: string;
  feedUrl: string;
  homeUrl: string;
  description: string;
  itemCount: number;
}

type PreviewResponse =
  | { ok: true; preview: Preview }
  | { ok: false; error: string };

export function AddSourceForm({
  prefs,
  onChange,
}: {
  prefs: UserPrefs;
  onChange: (patch: Partial<UserPrefs>) => void;
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [name, setName] = useState("");
  const [topic, setTopic] = useState<string>("all");
  const [addedName, setAddedName] = useState<string | null>(null);

  const runPreview = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    setPreview(null);
    setAddedName(null);
    try {
      const response = await fetch("/api/sources/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = (await response.json()) as PreviewResponse;
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setPreview(data.preview);
      setName(data.preview.name);
    } catch {
      setError("Bareaga couldn't reach the feed service. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const addSource = () => {
    if (!preview) return;
    const known = new Set([
      ...prefs.sourceOrder,
      ...prefs.customSources.map((source) => source.id),
    ]);
    let id = preview.id;
    let suffix = 2;
    while (known.has(id)) {
      id = `${preview.id}-${suffix}`;
      suffix += 1;
    }
    const source: SourceDef = {
      id,
      name: name.trim() || preview.name,
      feedUrl: preview.feedUrl,
      homeUrl: preview.homeUrl,
      topic,
      topics: [],
      tags: ["custom"],
      description: preview.description || "User-added feed",
      language: "Unknown",
      region: "Global",
      sourceType: "publisher",
      cadence: "daily",
      depth: "mixed",
      defaultRank: 50,
    };
    onChange({
      customSources: [...prefs.customSources, source],
      sourceOrder: [...prefs.sourceOrder, id],
    });
    setAddedName(source.name);
    setPreview(null);
    setUrl("");
  };

  return (
    <div className="add-source-form">
      <label>
        <span>Add your own feed</span>
        <div className="add-source-row">
          <input
            type="url"
            inputMode="url"
            value={url}
            placeholder="https://example.substack.com"
            onChange={(event) => {
              setUrl(event.target.value);
              setAddedName(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void runPreview();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void runPreview()}
            disabled={!url.trim() || loading}
          >
            {loading ? "Checking…" : "Preview"}
          </button>
        </div>
      </label>
      <p className="add-source-hint">
        Paste a Substack, blog, or any RSS/Atom feed URL. Fetches run through
        the same SSRF-hardened path as built-in sources.
      </p>
      {error ? (
        <p className="add-source-error" role="alert">
          {error}
        </p>
      ) : null}
      {preview ? (
        <div className="add-source-preview">
          <label>
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            <span>Topic</span>
            <select value={topic} onChange={(event) => setTopic(event.target.value)}>
              {TOPICS.map((value) => (
                <option key={value} value={value}>
                  {value === "all" ? "Unsorted" : value}
                </option>
              ))}
            </select>
          </label>
          <p className="add-source-meta">
            {preview.description || "No description provided."} · {preview.itemCount} recent{" "}
            {preview.itemCount === 1 ? "item" : "items"}
          </p>
          <button type="button" onClick={addSource}>
            Add to reader
          </button>
        </div>
      ) : null}
      {addedName ? (
        <p className="add-source-status" role="status">
          Added “{addedName}.” Find it in your source list.
        </p>
      ) : null}
      {prefs.customSources.length ? (
        <ul className="add-source-list">
          {prefs.customSources.map((source) => (
            <li key={source.id}>
              <span>{source.name}</span>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    customSources: prefs.customSources.filter((item) => item.id !== source.id),
                    sourceOrder: prefs.sourceOrder.filter((id) => id !== source.id),
                    hiddenSources: prefs.hiddenSources.filter((id) => id !== source.id),
                  })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
