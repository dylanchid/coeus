import type { Page } from "@playwright/test";
import { expect, signIn, signOut, test } from "./support/fixtures";
import { newEstablishedUser } from "./support/testUsers";

type RemoteArchive = { archiveId: string; snapshot: { revision: number } };

/** Put one collection and its source item into an account's real synced archive.
 * Publishing deliberately happens through the normal HTTP endpoint afterwards,
 * so this is setup rather than a second implementation of publishing. */
async function seedCollection(page: Page, suffix: string) {
  const collectionId = `e2e-collection-${suffix}`;
  const itemId = `e2e-item-${suffix}`;
  const name = `E2E collection ${suffix}`;
  const initial = await page.request.get("/api/archive");
  expect(initial.ok(), await initial.text()).toBeTruthy();
  const remote = await initial.json() as RemoteArchive;

  const now = new Date().toISOString();
  const synced = await page.request.post("/api/archive/sync", {
    data: {
      syncVersion: 1,
      archiveId: remote.archiveId,
      clientId: `playwright-${suffix}`,
      baseRevision: remote.snapshot.revision,
      operations: [
        {
          operationId: `collection-${suffix}`,
          action: "upsert",
          entityKind: "collection",
          entityId: collectionId,
          changedFields: ["id", "name", "description", "visibility", "kind", "createdAt"],
          value: { id: collectionId, name, description: "A browser-journey fixture.", visibility: "public", kind: "personal", createdAt: now },
        },
        {
          operationId: `item-${suffix}`,
          action: "upsert",
          entityKind: "item",
          entityId: itemId,
          changedFields: ["id", "articleId", "title", "url", "sourceName", "topic", "summary", "author", "publishedAt", "savedAt", "state", "starred", "collectionIds", "tags", "note"],
          value: {
            id: itemId, articleId: `article-${suffix}`, title: `Source ${suffix}`, url: `https://example.com/${suffix}`,
            sourceName: "Example", topic: "Testing", summary: "A source item for the browser journey.", author: "E2E",
            publishedAt: now, savedAt: now, state: "kept", starred: false, collectionIds: [collectionId], tags: [], note: "private fixture note",
          },
        },
      ],
    },
  });
  expect(synced.ok(), await synced.text()).toBeTruthy();

  const published = await page.request.post("/api/collections/publish", {
    data: { collectionLocalId: collectionId, visibility: "public", curatorNote: "", attribution: "" },
  });
  expect(published.status(), await published.text()).toBe(201);
  return await published.json() as { id: string; slug: string; name: string };
}

test("a second signed-in user can follow a published collection", async ({ browser, establishedUser }) => {
  const { page: ownerPage, handle } = establishedUser;
  const suffix = Math.random().toString(36).slice(2, 8);
  const publication = await seedCollection(ownerPage, suffix);

  const followerContext = await browser.newContext();
  const followerPage = await followerContext.newPage();
  try {
    await signIn(followerPage, newEstablishedUser());
    await followerPage.goto(`/c/${publication.slug}`);
    await expect(followerPage.getByRole("heading", { name: publication.name })).toBeVisible();

    const follow = followerPage.getByRole("button", { name: "Follow" });
    await expect(follow).toBeEnabled();
    await follow.click();
    await expect(followerPage.getByRole("button", { name: "Following ✓" })).toBeVisible();

    const followed = await followerPage.request.get("/api/collections/followed");
    expect(followed.ok(), await followed.text()).toBeTruthy();
    expect((await followed.json()).publications).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: publication.id, slug: publication.slug }),
    ]));

    await followerPage.goto(`/@${handle}?tab=collections`);
    await expect(followerPage.getByRole("link", { name: publication.name })).toBeVisible();
  } finally {
    await signOut(followerPage);
    await followerContext.close();
  }
});
