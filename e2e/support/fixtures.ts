import { test as base, expect, type Page } from "@playwright/test";
import { newEstablishedUser, newFreshUser, type TestUser } from "./testUsers";

/**
 * Signs `user` in on `page` by calling the test-only session route, which sets
 * the same `sb-*` cookies the OAuth callback would. When the user carries a
 * `profile`, it is upserted through the real profile API so the account lands
 * in the "ready" state rather than "needs-profile".
 */
export async function signIn(page: Page, user: TestUser): Promise<void> {
  const session = await page.request.post("/api/test/session", {
    data: { email: user.email, userMetadata: user.userMetadata },
  });
  expect(session.ok(), `test session for ${user.email}: ${await session.text()}`).toBeTruthy();

  if (user.profile) {
    const saved = await page.request.put("/api/account/profile", { data: user.profile });
    expect(saved.ok(), `profile upsert for ${user.email}: ${saved.status()} ${await saved.text()}`).toBeTruthy();
  }
}

/**
 * New accounts start with an empty archive (no demo seed), so journeys that
 * need saved pieces put their own into local storage before the app boots.
 * Written only when storage is empty, so a later reload keeps the app's edits.
 */
export async function seedLocalArchiveItems(page: Page, suffix: string, count = 1): Promise<string[]> {
  const now = Date.now();
  const items = Array.from({ length: count }, (_, index) => ({
    id: `e2e-local-${suffix}-${index}`,
    articleId: `e2e-local-article-${suffix}-${index}`,
    title: `Saved piece ${suffix} ${index}`,
    url: `https://example.com/saved/${suffix}/${index}`,
    sourceName: "Example",
    topic: "Testing",
    summary: "A saved piece for a browser journey.",
    author: "E2E",
    publishedAt: null,
    savedAt: new Date(now - index * 60_000).toISOString(),
    state: "unread",
    starred: false,
    collectionIds: [],
    tags: [],
    note: "",
  }));
  const archive = {
    version: 1,
    items,
    collections: [{ id: "inbox", name: "Inbox", description: "", visibility: "private", kind: "personal", createdAt: new Date(now).toISOString() }],
    socialPosts: [],
  };
  await page.addInitScript((data) => {
    if (!window.localStorage.getItem("coeus.archive.v1")) window.localStorage.setItem("coeus.archive.v1", data);
  }, JSON.stringify(archive));
  return items.map((item) => item.title);
}

export async function signOut(page: Page): Promise<void> {
  await page.request.delete("/api/test/session");
}

interface AuthFixtures {
  /** A signed-in account with no profile row — sitting at onboarding. */
  freshUserPage: Page;
  /** A signed-in account with a completed profile, plus its chosen handle. */
  establishedUser: { page: Page; handle: string };
}

export const test = base.extend<AuthFixtures>({
  freshUserPage: async ({ page }, use) => {
    // A brand-new identity each test: the onboarding journey creates a profile
    // row, so a fixed user would only be "fresh" on the first run.
    await signIn(page, newFreshUser());
    await use(page);
    await signOut(page);
  },
  establishedUser: async ({ page }, use) => {
    // Also unique per test — parallel workers would otherwise race on one
    // profile row and one handle.
    const user = newEstablishedUser();
    await signIn(page, user);
    await use({ page, handle: user.profile.handle });
    await signOut(page);
  },
});

export { expect };
