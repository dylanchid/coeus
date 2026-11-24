import { expect, test } from "./support/fixtures";

test("profile RSS feed returns public collections only", async ({ establishedUser }) => {
  const { page, handle } = establishedUser;
  const suffix = Math.random().toString(36).slice(2, 8);
  const collectionId = `e2e-rss-collection-${suffix}`;
  const itemId = `e2e-rss-item-${suffix}`;
  const name = `RSS public ${suffix}`;

  const initial = await page.request.get("/api/archive");
  expect(initial.ok(), await initial.text()).toBeTruthy();
  const remote = await initial.json() as { archiveId: string; snapshot: { revision: number } };
  const now = new Date().toISOString();

  const synced = await page.request.post("/api/archive/sync", {
    data: {
      syncVersion: 1,
      archiveId: remote.archiveId,
      clientId: `rss-${suffix}`,
      baseRevision: remote.snapshot.revision,
      operations: [
        {
          operationId: `rss-collection-${suffix}`,
          action: "upsert",
          entityKind: "collection",
          entityId: collectionId,
          changedFields: ["id", "name", "description", "visibility", "kind", "createdAt"],
          value: { id: collectionId, name, description: "Public RSS fixture.", visibility: "public", kind: "personal", createdAt: now },
        },
        {
          operationId: `rss-item-${suffix}`,
          action: "upsert",
          entityKind: "item",
          entityId: itemId,
          changedFields: ["id", "articleId", "title", "url", "sourceName", "topic", "summary", "author", "publishedAt", "savedAt", "state", "starred", "collectionIds", "tags", "note"],
          value: {
            id: itemId, articleId: `article-${suffix}`, title: `Source ${suffix}`, url: `https://example.com/rss-${suffix}`,
            sourceName: "Example", topic: "Testing", summary: "RSS fixture item.", author: "E2E",
            publishedAt: now, savedAt: now, state: "kept", starred: false, collectionIds: [collectionId], tags: [], note: "",
          },
        },
      ],
    },
  });
  expect(synced.ok(), await synced.text()).toBeTruthy();

  const published = await page.request.post("/api/collections/publish", {
    data: { collectionLocalId: collectionId, visibility: "public", curatorNote: `Note ${suffix}`, attribution: "" },
  });
  expect(published.status(), await published.text()).toBe(201);
  const pub = await published.json() as { slug: string };

  const refreshed = await page.request.get("/api/archive");
  expect(refreshed.ok(), await refreshed.text()).toBeTruthy();
  const remoteAfter = await refreshed.json() as { archiveId: string; snapshot: { revision: number } };

  const unlistedId = `e2e-rss-unlisted-${suffix}`;
  await page.request.post("/api/archive/sync", {
    data: {
      syncVersion: 1,
      archiveId: remoteAfter.archiveId,
      clientId: `rss-unlisted-${suffix}`,
      baseRevision: remoteAfter.snapshot.revision,
      operations: [
        {
          operationId: `rss-unlisted-collection-${suffix}`,
          action: "upsert",
          entityKind: "collection",
          entityId: unlistedId,
          changedFields: ["id", "name", "description", "visibility", "kind", "createdAt"],
          value: { id: unlistedId, name: `Unlisted RSS ${suffix}`, description: "Hidden.", visibility: "unlisted", kind: "personal", createdAt: now },
        },
      ],
    },
  });
  const unlistedPub = await page.request.post("/api/collections/publish", {
    data: { collectionLocalId: unlistedId, visibility: "unlisted", curatorNote: "", attribution: "" },
  });
  expect(unlistedPub.status(), await unlistedPub.text()).toBe(201);

  const feed = await page.request.get(`/@${handle}/rss.xml`);
  expect(feed.status()).toBe(200);
  expect(feed.headers()["content-type"] ?? "").toMatch(/application\/rss\+xml/);
  const xml = await feed.text();
  expect(xml).toContain(`<title>${name}</title>`);
  expect(xml).toContain(`/c/${pub.slug}`);
  expect(xml).toContain(`Note ${suffix}`);
  expect(xml).not.toContain(`Unlisted RSS ${suffix}`);
});

test("profile RSS redirects a retired handle with 308", async ({ establishedUser }) => {
  const { page, handle: retiredHandle } = establishedUser;
  const canonicalHandle = `rss_${Math.random().toString(36).slice(2, 8)}`;
  const saved = await page.request.put("/api/account/profile", {
    data: { handle: canonicalHandle, displayName: "Established Tester", bio: "Fixture account for authenticated Playwright journeys." },
  });
  expect(saved.ok(), await saved.text()).toBeTruthy();

  const redirect = await page.request.get(`/@${retiredHandle}/rss.xml`, { maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe(`/@${canonicalHandle}/rss.xml`);
});

test("unknown profile RSS returns 404", async ({ page }) => {
  const missing = await page.request.get(`/@no_such_profile_${Math.random().toString(36).slice(2)}/rss.xml`);
  expect(missing.status()).toBe(404);
});