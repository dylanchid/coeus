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
    await expect(page.getByRole("status")).toContainText(/Loading sources|stories from/i, { timeout: 20_000 });
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
        })
      );
    }, [...DEFAULT_READER_ORDER]);
    await page.goto("/");
    await expect(page.getByRole("dialog", { name: /pick a few worlds/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Skip, just read" }).click();
    const stored = await page.evaluate(() => window.localStorage.getItem("coeus.prefs.v1"));
    const prefs = JSON.parse(stored ?? "{}");
    expect(prefs.sourceOrder).toContain("c:curators-desk");
  });
});