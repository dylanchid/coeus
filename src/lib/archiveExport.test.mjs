import assert from "node:assert/strict";
import test from "node:test";
import { archiveToCsv, archiveToMarkdown, itemToMarkdown, itemToObsidianNote } from "./archiveExport.ts";

const item = {
  id: "1", articleId: "a", title: "Open, durable web", url: "https://example.com",
  sourceName: "Example", topic: "technology", summary: "A useful idea.", author: "A. Writer",
  publishedAt: null, savedAt: "2026-08-05T00:00:00.000Z", state: "kept", starred: true,
  collectionIds: ["c"], tags: ["open web"], note: "Connect this to archives.",
};
const collection = { id: "c", name: "Field Notes", description: "Shared research", visibility: "public", kind: "community", createdAt: "2026-08-05T00:00:00.000Z" };

test("Markdown export retains Obsidian-friendly metadata, links, tags, and notes", () => {
  const output = archiveToMarkdown([item], collection);
  assert.match(output, /^---/);
  assert.match(output, /#open-web/);
  assert.match(output, /\[Open, durable web\]\(https:\/\/example.com\)/);
  assert.match(output, /> Connect this to archives\./);
});

test("CSV export retains Notion-friendly columns and quotes commas", () => {
  const output = archiveToCsv([item], [collection]);
  assert.match(output, /"Name","URL"/);
  assert.match(output, /"Open, durable web"/);
  assert.match(output, /"Field Notes"/);
});

test("single item Markdown is copyable", () => {
  assert.match(itemToMarkdown(item), /^\[Open, durable web\]/);
});

test("Obsidian note carries coeus_id frontmatter and the shared Markdown body", () => {
  const note = itemToObsidianNote(item);
  assert.match(note, /^---\n/);
  assert.match(note, /coeus_id: "1"/);
  assert.match(note, /tags: \[open-web\]/);
  assert.match(note, /\[Open, durable web\]\(https:\/\/example.com\)/);
});

