import { expect, test } from "./support/fixtures";

const CATALOG_MARKERS = ["Literary Hub", "Aeon", "Hacker News"] as const;

test.describe("server HTML (no JavaScript)", () => {
  test("home includes the reader intro instead of a boot spinner", async ({ request }) => {
    const response = await request.get("/");
    expect(response.ok()).toBeTruthy();
    const html = await response.text();
    expect(html).toContain("A personal front page for the open web.");
    expect(html).toContain('href="/c"');
    expect(html).toContain('href="/sources"');
    expect(html).not.toContain("Loading…");
    expect(html).not.toMatch(/<p class="boot">Loading/);
  });

  test("sources lists the static catalog without a loading placeholder", async ({ request }) => {
    const response = await request.get("/sources");
    expect(response.ok()).toBeTruthy();
    const html = await response.text();
    expect(html).not.toContain("Loading source directory");
    let namedCount = 0;
    for (const name of CATALOG_MARKERS) {
      if (html.includes(name)) namedCount += 1;
    }
    expect(namedCount).toBe(CATALOG_MARKERS.length);
    const listRows = (html.match(/source-directory-name/g) ?? []).length;
    expect(listRows).toBeGreaterThanOrEqual(100);
  });
});

test.describe("hydrated reader and sources", () => {
  test("reader columns and source Add toggles work after prefs and feeds load", async ({ page }) => {
    const article = {
      id: "ssr-e2e",
      sourceId: "aeon",
      title: "SSR smoke story",
      url: "https://example.com/ssr-smoke",
      summary: "An excerpt.",
      author: "Reporter",
      publishedAt: "2026-09-10T12:00:00.000Z",
      ageLabel: "1h",
    };

    await page.route("**/api/feeds?**", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          updatedAt: "2026-09-10T12:00:00.000Z",
          sources: [
            {
              id: "aeon",
              name: "Aeon",
              topic: "ideas",
              homeUrl: "https://aeon.co",
              articles: [article],
            },
          ],
        }),
      }),
    );

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "A personal front page for the open web." }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /ssr smoke story/i })).toBeVisible({ timeout: 20_000 });

    await page.goto("/sources");
    const addToggle = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("button", { name: "Aeon", exact: true }) })
      .getByRole("button", { name: /\+ Add|Added ✓/ })
      .first();
    const before = await addToggle.textContent();
    await addToggle.click();
    await expect(addToggle).not.toHaveText(before ?? "");
  });
});