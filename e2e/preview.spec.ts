import { expect, test } from "@playwright/test";

test("a blocked article renders the bounded reader fallback", async ({ page }) => {
  const article = {
    id: "preview-e2e",
    sourceId: "hn",
    title: "A previewable story",
    url: "https://publisher.example/story",
    summary: "A short source summary.",
    author: "Reporter",
    publishedAt: "2026-09-10T12:00:00.000Z",
    ageLabel: "1h",
  };

  await page.addInitScript(() => {
    window.localStorage.setItem("coeus.prefs.v1", JSON.stringify({
      version: 1,
      sourceOrder: ["hn"],
      hiddenSources: [],
      articlePreviewMode: "preview",
    }));
  });
  await page.route("**/api/feeds?**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      updatedAt: "2026-09-10T12:00:00.000Z",
      sources: [{ id: "hn", name: "Hacker News", topic: "tech", homeUrl: "https://news.ycombinator.com", articles: [article] }],
    }),
  }));
  await page.route("**/api/embed-compatibility?**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ compatibility: "blocked" }),
  }));
  await page.route("**/api/article-preview/reader?**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      reader: {
        title: article.title,
        byline: article.author,
        excerpt: "A bounded excerpt.",
        contentHtml: "<p>A bounded excerpt.</p>",
        wordCount: 3,
        leadImage: null,
        truncated: true,
        index: { publisherTags: [], topics: [], keywords: [] },
      },
    }),
  }));

  await page.goto("/");
  await page.getByRole("link", { name: /a previewable story/i }).click();
  await expect(page.getByRole("dialog")).toContainText("Reader view");
  await expect(page.getByRole("dialog")).toContainText("A bounded excerpt.");
  await expect(page.getByRole("link", { name: /read the full article/i })).toHaveAttribute("href", article.url);
});
