import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
);

async function expectShareHead(page: Page, path: string, title: string, ogTitle: string, card = "summary_large_image") {
  const response = await page.goto(path);
  expect(response?.ok(), `${path} status ${response?.status()}`).toBeTruthy();
  await expect(page).toHaveTitle(title);
  const documentTitle = await page.title();
  expect(documentTitle.split("| Coeus").length - 1).toBeLessThanOrEqual(1);
  expect(documentTitle).not.toContain("— Coeus");

  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  expect(canonical, `${path} canonical`).toBeTruthy();
  expect(new URL(canonical!).pathname).toBe(path);

  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", ogTitle);
  await expect(page.locator('meta[property="og:description"]')).not.toHaveAttribute("content", "");
  await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute("content", /opengraph-image/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", card);
  await expect(page.locator('meta[name="twitter:image"]').first()).toHaveAttribute("content", /twitter-image|opengraph-image/);
}

test("public pages unfurl with one Coeus title suffix and a self canonical", async ({ page }) => {
  await expectShareHead(page, "/", "Coeus: a personal front page for the open web", "Coeus: a personal front page for the open web");
  await expectShareHead(page, "/sources", "Sources | Coeus", "Sources");
  await expectShareHead(page, "/about", "About | Coeus", "About");
  await expectShareHead(page, "/signin", "Sign in | Coeus", "Sign in", "summary");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /nofollow/);
});

test("archive and plus stay out of the index", async ({ page }) => {
  for (const [path, title] of [
    ["/archive", "Archive | Coeus"],
    ["/plus", "Try+ | Coeus"],
  ] as const) {
    const response = await page.goto(path);
    expect(response?.ok(), `${path} status ${response?.status()}`).toBeTruthy();
    await expect(page).toHaveTitle(title);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    expect((await page.title()).includes("— Coeus")).toBe(false);
  }
});

// A signed-out visit to /welcome is redirected to /signin before the page
// metadata renders. The noindex title is what an account still setting up sees.
(supabaseConfigured ? test : test.skip)("welcome stays out of the index", async ({ freshUserPage }) => {
  const response = await freshUserPage.goto("/welcome");
  expect(response?.ok(), `welcome status ${response?.status()}`).toBeTruthy();
  await expect(freshUserPage).toHaveTitle("Welcome | Coeus");
  await expect(freshUserPage.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("robots.txt disallows sign-in and plus, and the sitemap drops retired routes", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBeTruthy();
  const robotsText = await robots.text();
  expect(robotsText).toContain("Disallow: /signin");
  expect(robotsText).toContain("Disallow: /plus");
  expect(robotsText).not.toContain("Disallow: /signin/");
  expect(robotsText).not.toContain("Disallow: /plus/");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBeTruthy();
  const xml = await sitemap.text();
  expect(xml).not.toContain("/product");
  expect(xml).not.toContain("/social");
  expect(xml).toContain("/discover");
  expect(xml).toContain("/sources");
  expect(xml).toContain("/about");
});

(supabaseConfigured ? test : test.skip)(
  "discover and the published collection index unfurl",
  async ({ page }) => {
    await expectShareHead(page, "/discover", "Discover | Coeus", "Discover");
    await expectShareHead(page, "/c", "Published collections | Coeus", "Published collections");
  },
);

async function publishCollection(
  request: APIRequestContext,
  name: string,
  visibility: "public" | "unlisted" | "private",
  curatorNote: string,
): Promise<{ slug: string; name: string }> {
  const archive = await request.get("/api/archive");
  expect(archive.ok(), await archive.text()).toBeTruthy();
  const stored = (await archive.json()) as { archiveId: string; snapshot: { revision: number } };
  const id = `meta-${visibility}-${Math.random().toString(36).slice(2, 8)}`;
  const value = {
    id,
    name,
    description: `Description for ${name}`,
    visibility: "private",
    kind: "personal",
    createdAt: new Date().toISOString(),
  };
  const sync = await request.post("/api/archive/sync", {
    data: {
      syncVersion: 1,
      archiveId: stored.archiveId,
      clientId: "e2e-metadata",
      baseRevision: stored.snapshot.revision,
      operations: [
        {
          operationId: `op-${id}`,
          action: "upsert",
          entityKind: "collection",
          entityId: id,
          changedFields: ["id", "name", "description", "visibility", "kind", "createdAt"],
          value,
        },
      ],
    },
  });
  expect(sync.ok(), await sync.text()).toBeTruthy();
  const published = await request.post("/api/collections/publish", {
    data: { collectionLocalId: id, visibility, curatorNote },
  });
  expect(published.ok(), await published.text()).toBeTruthy();
  const body = (await published.json()) as { slug: string; name: string };
  return { slug: body.slug, name: body.name };
}

(supabaseConfigured ? test : test.skip)(
  "public and unlisted collections carry share metadata; private collections 404",
  async ({ establishedUser, request }) => {
  const { page, handle } = establishedUser;
  const note = `Curator note ${"n".repeat(180)}`;
  const publicCollection = await publishCollection(page.request, `Picks ${handle}`, "public", note);
  const unlisted = await publishCollection(page.request, `Quiet ${handle}`, "unlisted", "A link-only collection.");
  const hidden = await publishCollection(page.request, `Private ${handle}`, "private", "Keep this quiet.");

  await page.goto(`/c/${publicCollection.slug}`);
  await expect(page).toHaveTitle(`${publicCollection.name} by @${handle} | Coeus`);
  expect((await page.title()).split("| Coeus").length - 1).toBe(1);
  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  expect(new URL(canonical!).pathname).toBe(`/c/${publicCollection.slug}`);
  const description = await page.locator('meta[property="og:description"]').getAttribute("content");
  expect(description?.length).toBeLessThanOrEqual(160);
  expect(description?.endsWith("…")).toBe(true);
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
  await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveAttribute(
    "href",
    new RegExp(`/c/${publicCollection.slug}/rss\\.xml$`),
  );
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);

  await page.goto(`/c/${unlisted.slug}`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveAttribute(
    "href",
    new RegExp(`/c/${unlisted.slug}/rss\\.xml$`),
  );

  const missing = await request.get(`/c/${hidden.slug}`);
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toContain("Collection not found | Coeus");

  const sitemap = await request.get("/sitemap.xml");
  const xml = await sitemap.text();
  expect(xml).toContain(`/c/${publicCollection.slug}`);
  expect(xml).toContain(`/@${handle}`);
  expect(xml).not.toContain(`/c/${unlisted.slug}`);
  expect(xml).not.toContain(`/c/${hidden.slug}`);
  expect(xml).not.toContain("/product");
  expect(xml).not.toContain("/social");
  },
);

test("the default share card is a 1200 by 630 image", async ({ request }) => {
  const image = await request.get("/opengraph-image");
  expect(image.ok(), `opengraph-image status ${image.status()}`).toBeTruthy();
  expect(image.headers()["content-type"]).toContain("image/png");
  const bytes = await image.body();
  expect(bytes.byteLength).toBeGreaterThan(1000);
  // PNG IHDR width and height are 4-byte big-endian integers at offsets 16 and 20.
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(630);

  const twitter = await request.get("/twitter-image");
  expect(twitter.ok(), `twitter-image status ${twitter.status()}`).toBeTruthy();
  expect(twitter.headers()["content-type"]).toContain("image/png");
});
