import { expect, test } from "./support/fixtures";

test("mobile curator pastes fifteen links and publishes unlisted", async ({ establishedUser }) => {
  test.setTimeout(120_000);
  const { page, handle } = establishedUser;
  await page.setViewportSize({ width: 390, height: 844 });

  const resolved = Array.from({ length: 15 }, (_, index) => ({
    url: `https://example.com/mobile/${index}`,
    ok: true,
    title: `Article ${index}`,
    sourceName: "Example",
    author: "",
    excerpt: `Summary ${index}`,
  }));

  await page.route("**/api/archive/resolve-links", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(resolved),
    });
  });

  await page.goto("/archive");
  await expect(page.getByRole("button", { name: `@${handle}` })).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "New collection" }).click();
  const collectionName = `Mobile paste ${handle}`;
  await page.getByPlaceholder("e.g. Local futures").fill(collectionName);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("heading", { name: collectionName })).toBeVisible();

  await page.getByRole("button", { name: "Paste links" }).click();
  await page.getByLabel(/One URL per line/).fill(resolved.map((row) => row.url).join("\n"));
  await page.getByRole("button", { name: "Resolve" }).click();
  await page.getByRole("button", { name: "Add 15 entries" }).click();

  await page.getByText("Publish", { exact: true }).click();
  const sheet = page.locator(".mobile-publish-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: collectionName, exact: true }).click();
  await sheet.getByRole("button", { name: "Continue", exact: true }).click();
  await sheet.getByLabel(/Curator note/i).fill("Pilot batch from phone");
  await sheet.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(sheet.getByRole("radio", { name: "Unlisted" })).toHaveAttribute("aria-checked", "true");
  await sheet.getByRole("button", { name: "Publish", exact: true }).click();

  const publicLink = page.getByRole("link", { name: "Open public page" });
  await expect(publicLink).toBeVisible({ timeout: 25_000 });
  const href = await publicLink.getAttribute("href");
  assertSlug(href);

  await page.goto(href!);
  await expect(page.getByRole("link", { name: "Article 0" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Article 14" })).toBeVisible();
});

function assertSlug(href: string | null) {
  if (!href || !href.startsWith("/c/")) throw new Error(`Expected /c/ slug link, got ${href ?? "null"}`);
}