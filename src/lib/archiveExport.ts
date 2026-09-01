import type { ArchiveCollection, ArchiveItem } from "./archive";

function yaml(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
}

function csv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function archiveToMarkdown(
  items: ArchiveItem[],
  collection?: ArchiveCollection
): string {
  const title = collection?.name ?? "Bareaga Archive";
  const header = [
    "---",
    `title: ${yaml(title)}`,
    `source: ${yaml("Bareaga")}`,
    `exported: ${yaml(new Date().toISOString())}`,
    `tags: [bareaga, archive]`,
    "---",
    "",
    `# ${title}`,
    "",
    collection?.description ?? "An open, portable archive exported from Bareaga.",
    "",
  ];
  const entries = items.flatMap((item) => [
    `## [${item.title}](${item.url})`,
    "",
    `- Source: ${item.sourceName}${item.author ? ` — ${item.author}` : ""}`,
    `- Saved: ${item.savedAt}`,
    `- State: ${item.state}`,
    item.tags.length ? `- Tags: ${item.tags.map((tag) => `#${tag.replace(/\s+/g, "-")}`).join(" ")}` : "",
    "",
    item.summary,
    item.note ? `\n> ${item.note.replace(/\n/g, "\n> ")}` : "",
    "",
  ].filter(Boolean));
  return [...header, ...entries].join("\n");
}

export function archiveToCsv(
  items: ArchiveItem[],
  collections: ArchiveCollection[]
): string {
  const names = new Map(collections.map((collection) => [collection.id, collection.name]));
  const rows = items.map((item) => [
    item.title,
    item.url,
    item.sourceName,
    item.author,
    item.summary,
    item.note,
    item.tags.join(", "),
    item.collectionIds.map((id) => names.get(id) ?? id).join(", "),
    item.state,
    item.starred ? "true" : "false",
    item.savedAt,
    item.publishedAt ?? "",
  ].map(csv).join(","));
  return [
    ["Name", "URL", "Source", "Author", "Summary", "Notes", "Tags", "Collections", "State", "Starred", "Saved", "Published"].map(csv).join(","),
    ...rows,
  ].join("\r\n");
}

export function itemToMarkdown(item: ArchiveItem): string {
  const quote = item.summary ? `\n\n> ${item.summary.replace(/\n/g, "\n> ")}` : "";
  const note = item.note ? `\n\n${item.note}` : "";
  return `[${item.title}](${item.url})${quote}${note}`;
}

