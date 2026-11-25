import { expect, test } from "./support/fixtures";

const DEFAULT_READER_ORDER = [
  "lithub", "aeon", "marginalian", "parisreview", "longreads", "electricliterature",
  "openculture", "hyperallergic", "colossal", "dezeen", "filmcomment", "nprmusic",
  "printmag", "publicdomainreview", "jstordaily", "quanta", "scientificamerican",
  "restofworld", "guardian", "npr", "arstechnica", "hn",
] as const;

test.describe("guided first-run setup", () => {
  test.use({ firstRun: true });

  test("fresh browser offers setup with visible Skip", async ({ page }) => {
    await page.goto("/");
    const dialog = page.getByRole("dialog", { name: /pick a few worlds/i });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByRole("button", { name: "Skip, just read" })).toBeVisible();
    await dialog.getByRole("button", { name: "Skip, just read" }).click();
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("dialog", { name: /pick a few worlds/i })).toHaveCount(0);
  });

  test("skip dismisses setup and Reader columns load", async ({ page }) => {
    await page.goto("/");
    const dialog = page.getByRole("dialog", { name: /pick a few worlds/i });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole("button", { name: "Skip, just read" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".feed-status")).toContainText(/Loading sources|stories from/i, { timeout: 20_000 });
    await expect(page.locator('.source-col[data-source="lithub"]')).toBeVisible({ timeout: 30_000 });
  });

  test("topic picks survive skip on step two", async ({ page }) => {
    await page.goto("/");
    const dialog = page.getByRole("dialog", { name: /pick a few worlds/i });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole("button", { name: "Culture" }).click();
    await dialog.getByRole("button", { name: "History" }).click();
    await dialog.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("dialog", { name: /claim an @handle/i })).toBeVisible();
    await page.getByRole("button", { name: "Skip, just read" }).click();
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("coeus.prefs.v1"))).toBeTruthy();
    const stored = await page.evaluate(() => window.localStorage.getItem("coeus.prefs.v1"));
    const prefs = JSON.parse(stored ?? "{}");
    expect(prefs.sourceOrder).toEqual([
      "lithub",
      "parisreview",
      "longreads",
      "electricliterature",
      "nprmusic",
      "publicdomainreview",
      "jstordaily",
      "smithsonianmag",
      "atlasobscura",
    ]);
  });

  test("returning edited prefs skip the dialog", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "coeus.prefs.v1",
        JSON.stringify({
          version: 1,
          theme: "dark",
          sourceOrder: [
            "lithub", "aeon", "marginalian", "parisreview", "longreads", "electricliterature",
            "openculture", "hyperallergic", "colossal", "dezeen", "filmcomment", "nprmusic",
            "printmag", "publicdomainreview", "jstordaily", "quanta", "scientificamerican",
            "restofworld", "guardian", "npr", "arstechnica", "hn",
          ],
        })
      );
    });
    await page.goto("/");
    await expect(page.getByRole("dialog", { name: /pick a few worlds/i })).toHaveCount(0);
  });

  test("follow-only prefs still offer setup", async ({ page }) => {
    await page.addInitScript((order) => {
      window.localStorage.setItem(
        "coeus.prefs.v1",
        JSON.stringify({
          version: 1,
          sourceOrder: [...order, "c:curators-desk"],
          customSources: [{
            id: "c:curators-desk",
            name: "Curator's desk",
            feedUrl: "/c/curators-desk/rss.xml",
            homeUrl: "/c/curators-desk",
            topic: "all",
            topics: [],
            tags: ["coeus-collection"],
            description: "Published collection on Coeus",
            language: "Unknown",
            region: "Global",
            sourceType: "publisher",
            cadence: "daily",
            depth: "mixed",
            defaultRank: 50,
          }],
        })
      );
    }, [...DEFAULT_READER_ORDER]);
    await page.goto("/");
    await expect(page.getByRole("dialog", { name: /pick a few worlds/i })).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => page.evaluate(() => {
      const raw = window.localStorage.getItem("coeus.prefs.v1");
      if (!raw) return false;
      return (JSON.parse(raw) as { sourceOrder?: string[] }).sourceOrder?.includes("c:curators-desk") ?? false;
    })).toBe(true);
    await page.getByRole("button", { name: "Skip, just read" }).click();
    await expect.poll(async () => {
      const stored = await page.evaluate(() => window.localStorage.getItem("coeus.prefs.v1"));
      const order = JSON.parse(stored ?? "{}").sourceOrder as string[] | undefined;
      return order?.includes("c:curators-desk") ?? false;
    }).toBe(true);
  });
});