import { expect, test } from "./support/fixtures";

const PAPER_BG = "rgb(244, 241, 234)";
const PAPER_FG = "rgb(22, 21, 18)";
const TERMINAL_BG = "rgb(10, 18, 10)";

function seedDarkTerminalPrefs() {
  return () => {
    window.localStorage.setItem(
      "coeus.prefs.v1",
      JSON.stringify({
        version: 1,
        customSources: [],
        sourceOrder: [],
        hiddenSources: [],
        theme: "dark",
        palette: "terminal",
        font: "serif",
        density: "comfortable",
        limit: 10,
        hours: 24,
        lastSearch: "",
        showSummaries: false,
        showAuthors: false,
        showAges: true,
        showEngagement: true,
        columns: 3,
        homeView: "grid",
        storyRepresentation: "detailed",
        articlePreviewMode: "ask",
        keywordRules: [],
        sourceWeights: {},
        sourceRatings: {},
      }),
    );
  };
}

test.describe("look-1 public Paper pin", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(seedDarkTerminalPrefs());
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith("http://localhost:") || url.startsWith("http://127.0.0.1:")) {
        return route.continue();
      }
      return route.abort();
    });
  });

  test("public routes render Archive Paper despite dark Terminal prefs", async ({ page }) => {
    const publicPaths = ["/about", "/signin"];
    const collection = await page.goto("/c");
    if (collection?.ok()) {
      publicPaths.push("/c");
    }
    for (const path of publicPaths) {
      await page.goto(path);
      await expect(page.locator("body")).toHaveCSS("background-color", PAPER_BG);
      await expect(page.locator("body")).toHaveCSS("color", PAPER_FG);
    }
  });

  test("reader home keeps the visitor Terminal palette", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-palette", "terminal", { timeout: 15_000 });
    await expect(page.locator("body")).toHaveCSS("background-color", TERMINAL_BG);
  });

  test("published collections title uses Newsreader", async ({ page }) => {
    const response = await page.goto("/c");
    test.skip(!response?.ok(), "/c requires Supabase in the Playwright web server environment");
    const h1 = page.getByRole("heading", { level: 1, name: "Public collections" });
    await expect(h1).toBeVisible();
    const family = await h1.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family.toLowerCase()).toMatch(/newsreader/);
  });
});