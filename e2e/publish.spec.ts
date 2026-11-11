import { expect, seedLocalArchiveItems, test } from "./support/fixtures";

/**
 * The path a concierge-launch curator takes (bead bareaga_web-ek7.4):
 * saved piece → new public collection → publish → the collection is listed on
 * Discover and /c, names its curator, and appears on their /@handle profile.
 * Driven through the UI, not the publish API, because the regressions this
 * guards were UI defaults (publishing as unlisted, a hidden publish button).
 */
test("a curator publishes a public collection and it is findable from Discover and their profile", async ({ establishedUser }) => {
  test.setTimeout(90_000);
  const { page, handle } = establishedUser;
  const [pieceTitle] = await seedLocalArchiveItems(page, handle);
  const name = `Picks ${handle}`;

  await page.goto("/archive");
  await expect(page.getByRole("button", { name: `@${handle}` })).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "New collection" }).click();
  await expect(page.getByLabel("Ownership")).toHaveCount(0);
  await page.getByPlaceholder("e.g. Local futures").fill(name);
  await page.locator(".collection-composer select").selectOption("public");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // File the saved piece into the new collection from the Everything view.
  await page.getByRole("button", { name: /Everything/ }).click();
  await page.getByText("Organize").first().click();
  const collectionSelect = page.getByLabel(`Collection for ${pieceTitle}`);
  await collectionSelect.selectOption({ label: name });
  await page.getByRole("button", { name: new RegExp(name) }).click();

  // Unpublished: the panel is already open and defaults to the collection's own visibility.
  const publishButton = page.getByRole("button", { name: "Publish collection" });
  await expect(publishButton).toBeVisible();
  await expect(page.locator("[id^=publish-visibility-]")).toHaveValue("public");
  await publishButton.click();
  // The panel stays open after publishing and links the new page.
  const publishedLink = page.getByRole("link", { name: /^\/c\// });
  await expect(publishedLink).toBeVisible({ timeout: 20_000 });
  const slug = (await publishedLink.textContent())!.replace("/c/", "");

  await page.goto("/discover");
  await expect(page.getByRole("link", { name })).toBeVisible();
  await page.goto("/c");
  await expect(page.getByRole("link", { name })).toBeVisible();

  await page.goto(`/c/${slug}`);
  await expect(page.getByRole("link", { name: pieceTitle })).toBeVisible();
  const curator = page.locator(".public-collection-curator").getByRole("link");
  await expect(curator).toHaveAttribute("href", `/@${handle}`);

  await curator.click();
  await expect(page).toHaveURL(new RegExp(`/@${handle}$`));
  await expect(page.getByRole("link", { name })).toBeVisible();
  for (const frozen of ["Posts", "Reposts", "Replies", "Likes"]) {
    await expect(page.locator(".profile-tabs").getByText(frozen, { exact: true })).toHaveCount(0);
  }
});
