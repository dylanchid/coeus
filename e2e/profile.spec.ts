import type { Page } from "@playwright/test";
import { expect, signIn, signOut, test } from "./support/fixtures";
import { newEstablishedUser } from "./support/testUsers";

type RemoteArchive = { archiveId: string; snapshot: { revision: number } };

/** Put one collection and its source item into an account's real synced archive.
 * Publishing deliberately happens through the normal HTTP endpoint afterwards,
 * so this is setup rather than a second implementation of publishing. */
async function seedCollection(page: Page, suffix: string, operationSuffix = suffix) {
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
          operationId: `collection-${operationSuffix}`,
          action: "upsert",
          entityKind: "collection",
          entityId: collectionId,
          changedFields: ["id", "name", "description", "visibility", "kind", "createdAt"],
          value: { id: collectionId, name, description: "A browser-journey fixture.", visibility: "public", kind: "personal", createdAt: now },
        },
        {
          operationId: `item-${operationSuffix}`,
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
  return await published.json() as { id: string; slug: string; name: string; collectionLocalId: string };
}

async function inBatches<T>(values: readonly T[], size: number, action: (value: T) => Promise<void>): Promise<void> {
  for (let index = 0; index < values.length; index += size) {
    await Promise.all(values.slice(index, index + size).map(action));
  }
}

/** Seed enough owned content to cross both profile-feed page boundaries in one
 * archive revision. Publishing remains a real API request per object. */
async function seedPaginatedProfile(page: Page, suffix: string) {
  const initial = await page.request.get("/api/archive");
  expect(initial.ok(), await initial.text()).toBeTruthy();
  const remote = await initial.json() as RemoteArchive;
  const now = new Date().toISOString();
  const rows = Array.from({ length: 25 }, (_, index) => ({
    index,
    collectionId: `e2e-page-collection-${suffix}-${index}`,
    itemId: `e2e-page-item-${suffix}-${index}`,
  }));
  const operations = rows.flatMap(({ index, collectionId, itemId }) => [
    {
      operationId: `page-collection-${suffix}-${index}`, action: "upsert", entityKind: "collection", entityId: collectionId,
      changedFields: ["id", "name", "description", "visibility", "kind", "createdAt"],
      value: { id: collectionId, name: `Collection fixture ${suffix}-${index}`, description: "Cursor fixture.", visibility: "public", kind: "personal", createdAt: now },
    },
    {
      operationId: `page-item-${suffix}-${index}`, action: "upsert", entityKind: "item", entityId: itemId,
      changedFields: ["id", "articleId", "title", "url", "sourceName", "topic", "summary", "author", "publishedAt", "savedAt", "state", "starred", "collectionIds", "tags", "note"],
      value: {
        id: itemId, articleId: `page-article-${suffix}-${index}`, title: `Post fixture ${suffix}-${index}`, url: `https://example.com/page-${suffix}-${index}`,
        sourceName: "Example", topic: "Testing", summary: "A cursor-page fixture.", author: "E2E", publishedAt: now, savedAt: now,
        state: "kept", starred: false, collectionIds: [collectionId], tags: [], note: "private fixture note",
      },
    },
  ]);
  const synced = await page.request.post("/api/archive/sync", {
    data: { syncVersion: 1, archiveId: remote.archiveId, clientId: `page-${suffix}`, baseRevision: remote.snapshot.revision, operations },
  });
  expect(synced.ok(), await synced.text()).toBeTruthy();

  await inBatches(rows, 5, async ({ collectionId, itemId }) => {
    const [collection, post] = await Promise.all([
      page.request.post("/api/collections/publish", { data: { collectionLocalId: collectionId, visibility: "public", curatorNote: "", attribution: "" } }),
      page.request.post("/api/posts/publish", { data: { itemLocalId: itemId, visibility: "public", commentary: "" } }),
    ]);
    expect(collection.status(), await collection.text()).toBe(201);
    expect(post.status(), await post.text()).toBe(201);
  });
}

async function createReply(page: Page, targetId: string, body: string, parentId?: string): Promise<string> {
  const response = await page.request.post("/api/replies", {
    data: { targetType: "collection", targetId, ...(parentId ? { parentId } : {}), body },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json() as { replyId: string }).replyId;
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

test("a retired handle returns a 308 to its canonical profile", async ({ establishedUser }) => {
  const { page, handle: retiredHandle } = establishedUser;
  const canonicalHandle = `ren_${Math.random().toString(36).slice(2, 8)}`;
  const saved = await page.request.put("/api/account/profile", {
    data: { handle: canonicalHandle, displayName: "Established Tester", bio: "Fixture account for authenticated Playwright journeys." },
  });
  expect(saved.ok(), await saved.text()).toBeTruthy();

  const redirect = await page.request.get(`/@${retiredHandle}`, { maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe(`/@${canonicalHandle}`);

  await page.goto(`/@${retiredHandle}`);
  await expect(page).toHaveURL(new RegExp(`/@${canonicalHandle}$`));
});

test("GET /api/collections/followed omits a collection after the owner goes private", async ({ browser, establishedUser }) => {
  const { page: ownerPage } = establishedUser;
  const suffix = `follow-revoke-${Math.random().toString(36).slice(2, 8)}`;
  const publication = await seedCollection(ownerPage, suffix);

  const followerContext = await browser.newContext();
  const followerPage = await followerContext.newPage();
  try {
    await signIn(followerPage, newEstablishedUser());
    const followed = await followerPage.request.post("/api/collections/follow", {
      data: { publicationId: publication.id },
    });
    expect(followed.status(), await followed.text()).toBe(204);

    const before = await followerPage.request.get("/api/collections/followed");
    expect(before.ok(), await before.text()).toBeTruthy();
    expect((await before.json()).publications).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: publication.id }),
    ]));

    const privatePublication = await ownerPage.request.post("/api/collections/publish", {
      data: { collectionLocalId: publication.collectionLocalId, visibility: "private", curatorNote: "", attribution: "" },
    });
    expect(privatePublication.status(), await privatePublication.text()).toBe(201);

    const after = await followerPage.request.get("/api/collections/followed");
    expect(after.ok(), await after.text()).toBeTruthy();
    expect((await after.json()).publications).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: publication.id }),
    ]));

    const sneakFollow = await followerPage.request.post("/api/collections/follow", {
      data: { publicationId: publication.id },
    });
    expect(sneakFollow.status()).toBe(403);
  } finally {
    await signOut(followerPage);
    await followerContext.close();
  }
});

test("a profile follower loses a private collection after revocation", async ({ browser, establishedUser }) => {
  const { page: ownerPage, handle } = establishedUser;
  const suffix = `revoke-${Math.random().toString(36).slice(2, 8)}`;
  const publication = await seedCollection(ownerPage, suffix);

  const followerContext = await browser.newContext();
  const followerPage = await followerContext.newPage();
  try {
    await signIn(followerPage, newEstablishedUser());
    await followerPage.goto(`/@${handle}`);
    await followerPage.getByRole("button", { name: "Follow" }).click();
    await expect(followerPage.getByRole("button", { name: "Following ✓" })).toBeVisible();

    await followerPage.goto(`/c/${publication.slug}`);
    await expect(followerPage.getByRole("heading", { name: publication.name })).toBeVisible();

    const privatePublication = await ownerPage.request.post("/api/collections/publish", {
      data: { collectionLocalId: publication.collectionLocalId, visibility: "private", curatorNote: "", attribution: "" },
    });
    expect(privatePublication.status(), await privatePublication.text()).toBe(201);

    await followerPage.goto(`/c/${publication.slug}`);
    await expect(followerPage.getByText("404")).toBeVisible();
  } finally {
    await signOut(followerPage);
    await followerContext.close();
  }
});

test("profile feed and thread cursor links walk real page boundaries", async ({ browser, establishedUser }) => {
  test.setTimeout(120_000);
  const { page, handle } = establishedUser;
  const suffix = Math.random().toString(36).slice(2, 8);
  await seedPaginatedProfile(page, suffix);

  for (const tab of ["collections", "posts"] as const) {
    await page.goto(`/@${handle}?tab=${tab}`);
    const older = page.getByRole("link", { name: "Older →" });
    await expect(older).toBeVisible();
    await older.click();
    await expect(page).toHaveURL(new RegExp(`/@${handle}\\?tab=${tab}&cursor=`));
    await expect(page.getByRole("link", { name: "← Newest" })).toBeVisible();
  }

  const publication = await seedCollection(page, `thread-${suffix}`);
  const root = await createReply(page, publication.id, `Thread root ${suffix}`);
  await inBatches(Array.from({ length: 201 }, (_, index) => index), 12, async (index) => {
    await createReply(page, publication.id, `Thread reply ${suffix}-${index}`, root);
  });

  await page.goto(`/@${handle}?tab=replies`);
  const threadLink = page.getByRole("link", { name: "View all 201 replies →" });
  await expect(threadLink).toBeVisible();
  await threadLink.click();
  await expect(page).toHaveURL(new RegExp(`/@${handle}/replies/${root}$`));
  await expect(page.getByRole("link", { name: "Older replies →" })).toBeVisible();
  await page.getByRole("link", { name: "Older replies →" }).click();
  await expect(page).toHaveURL(new RegExp(`/@${handle}/replies/${root}\\?cursor=`));
  await expect(page.getByRole("link", { name: "← Start of thread" })).toBeVisible();

  // AppShell's local-first archive can sync the fixture browser's default
  // archive while this page is open. Restore the target collection using a new
  // operation id, then verify republishing retains the target id the reply has.
  const restored = await seedCollection(page, `thread-${suffix}`, `restore-thread-${suffix}`);
  expect(restored.id).toBe(publication.id);

  const revoked = await page.request.post("/api/collections/publish", {
    data: { collectionLocalId: restored.collectionLocalId, visibility: "private", curatorNote: "", attribution: "" },
  });
  expect(revoked.status(), await revoked.text()).toBe(201);

  const visitorContext = await browser.newContext();
  try {
    const visitorPage = await visitorContext.newPage();
    await visitorPage.goto(`/@${handle}/replies/${root}`);
    await expect(visitorPage.getByText("404")).toBeVisible();
  } finally {
    await visitorContext.close();
  }
});
