import type { Page } from "@playwright/test";
import { expect, seedFirstRunSkipped, signIn, signOut, test } from "./support/fixtures";
import { newEstablishedUser } from "./support/testUsers";

type RemoteArchive = { archiveId: string; snapshot: { revision: number } };

async function seedCollection(page: Page, suffix: string) {
  const collectionId = `e2e-reader-collection-${suffix}`;
  const itemId = `e2e-reader-item-${suffix}`;
  const name = `Reader picks ${suffix}`;
  const initial = await page.request.get("/api/archive");
  expect(initial.ok(), await initial.text()).toBeTruthy();
  const remote = await initial.json() as RemoteArchive;
  const now = new Date().toISOString();
  const synced = await page.request.post("/api/archive/sync", {
    data: {
      syncVersion: 1,
      archiveId: remote.archiveId,
      clientId: `playwright-reader-${suffix}`,
      baseRevision: remote.snapshot.revision,
      operations: [
        {
          operationId: `collection-${suffix}`,
          action: "upsert",
          entityKind: "collection",
          entityId: collectionId,
          changedFields: ["id", "name", "description", "visibility", "kind", "createdAt"],
          value: { id: collectionId, name, description: "Reader follow fixture.", visibility: "public", kind: "personal", createdAt: now },
        },
        {
          operationId: `item-${suffix}`,
          action: "upsert",
          entityKind: "item",
          entityId: itemId,
          changedFields: ["id", "articleId", "title", "url", "sourceName", "topic", "summary", "author", "publishedAt", "savedAt", "state", "starred", "collectionIds", "tags", "note"],
          value: {
            id: itemId, articleId: `article-${suffix}`, title: `Reader entry ${suffix}`, url: `https://example.com/reader-${suffix}`,
            sourceName: "Example", topic: "Testing", summary: "Fixture summary.", author: "E2E",
            publishedAt: now, savedAt: now, state: "kept", starred: false, collectionIds: [collectionId], tags: [], note: "",
          },
        },
      ],
    },
  });
  expect(synced.ok(), await synced.text()).toBeTruthy();

  const published = await page.request.post("/api/collections/publish", {
    data: { collectionLocalId: collectionId, visibility: "public", curatorNote: "Fixture lede", attribution: "" },
  });
  expect(published.status(), await published.text()).toBe(201);
  return await published.json() as { id: string; slug: string; name: string };
}

function collectionSourceId(slug: string): string {
  return `c:${slug}`;
}

async function waitForCollectionInPrefs(page: Page, sourceId: string): Promise<void> {
  await expect.poll(async () => page.evaluate((id) => {
    const raw = localStorage.getItem("coeus.prefs.v1");
    if (!raw) return false;
    const prefs = JSON.parse(raw) as { sourceOrder?: string[] };
    return prefs.sourceOrder?.includes(id) ?? false;
  }, sourceId)).toBe(true);
}

test("follow collection wires a Reader column without disturbing profile follows", async ({ browser, establishedUser }) => {
  test.setTimeout(120_000);
  const { page: ownerPage, handle } = establishedUser;
  const suffix = Math.random().toString(36).slice(2, 8);
  const publication = await seedCollection(ownerPage, suffix);
  const sourceId = collectionSourceId(publication.slug);

  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  await seedFirstRunSkipped(guestPage);
  await guestPage.route("**/*", (route) => {
    const url = route.request().url();
    if (url.includes("example.com")) return route.fulfill({ status: 200, body: "<html></html>", contentType: "text/html" });
    return route.continue();
  });

  try {
    await guestPage.goto(`/c/${publication.slug}`);
    await expect(guestPage.getByRole("heading", { name: publication.name })).toBeVisible();
    const follow = guestPage.locator(".public-collection-hero").getByRole("button", { name: "Follow collection" });
    await expect(follow).toBeEnabled();
    await follow.click();
    await expect(guestPage.locator(".public-collection-hero").getByRole("button", { name: "Following collection ✓" })).toBeVisible();
    await waitForCollectionInPrefs(guestPage, sourceId);

    await guestPage.goto("/");
    const column = guestPage.locator(`.source-col[data-source="${sourceId}"]`);
    await expect(column).toBeVisible({ timeout: 30_000 });
    await expect(column.locator(".source-collection-kicker")).toHaveText("[COLLECTION]");
    await expect(column.getByRole("link", { name: new RegExp(publication.name) })).toHaveAttribute("href", `/c/${publication.slug}`);
    await expect(column.getByRole("link", { name: `Reader entry ${suffix}` })).toBeVisible();

    await guestPage.goto(`/c/${publication.slug}`);
    await guestPage.locator(".public-collection-hero").getByRole("button", { name: "Following collection ✓" }).click();
    await expect(guestPage.locator(".public-collection-hero").getByRole("button", { name: "Follow collection" })).toBeVisible();
    await guestPage.goto("/");
    await expect(guestPage.locator(`.source-col[data-source="${sourceId}"]`)).toHaveCount(0);
    await guestPage.reload();
    await expect(guestPage.locator(`.source-col[data-source="${sourceId}"]`)).toHaveCount(0);
  } finally {
    await guestContext.close();
  }

  const followerContext = await browser.newContext();
  const followerPage = await followerContext.newPage();
  await seedFirstRunSkipped(followerPage);
  await followerPage.route("**/*", (route) => {
    const url = route.request().url();
    if (url.includes("example.com")) return route.fulfill({ status: 200, body: "<html></html>", contentType: "text/html" });
    return route.continue();
  });
  try {
    await signIn(followerPage, newEstablishedUser());
    await followerPage.goto(`/c/${publication.slug}`);
    const follow = followerPage.locator(".public-collection-hero").getByRole("button", { name: "Follow collection" });
    await follow.click();
    await expect(followerPage.locator(".public-collection-hero").getByRole("button", { name: "Following collection ✓" })).toBeVisible();
    await waitForCollectionInPrefs(followerPage, sourceId);

    const followed = await followerPage.request.get("/api/collections/followed");
    expect(followed.ok(), await followed.text()).toBeTruthy();
    expect((await followed.json()).publications).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: publication.id, slug: publication.slug }),
    ]));

    await followerPage.goto("/");
    await expect(followerPage.locator(`.source-col[data-source="${sourceId}"]`)).toBeVisible({ timeout: 30_000 });
    const prefsBeforeProfileFollow = await followerPage.evaluate(() => localStorage.getItem("coeus.prefs.v1"));
    const orderBefore = JSON.parse(prefsBeforeProfileFollow ?? "{}").sourceOrder as string[];
    await followerPage.goto(`/@${handle}`);
    const profileFollow = followerPage.getByRole("link", { name: `Follow @${handle}` });
    if (await profileFollow.count()) {
      await profileFollow.click();
    } else {
      await followerPage.getByRole("button", { name: `Follow @${handle}` }).click();
    }
    await followerPage.goto("/");
    const prefsAfterProfileFollow = await followerPage.evaluate(() => localStorage.getItem("coeus.prefs.v1"));
    const orderAfter = JSON.parse(prefsAfterProfileFollow ?? "{}").sourceOrder as string[];
    expect(orderAfter).toEqual(orderBefore);
    await expect(followerPage.locator(`.source-col[data-source="${sourceId}"]`)).toBeVisible({ timeout: 30_000 });
  } finally {
    await signOut(followerPage);
    await followerContext.close();
  }
});