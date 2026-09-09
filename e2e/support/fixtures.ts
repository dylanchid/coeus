import { test as base, expect, type Page } from "@playwright/test";
import { ESTABLISHED_USER, FRESH_USER, type TestUser } from "./testUsers";

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
    expect(
      saved.ok() || saved.status() === 409,
      `profile upsert for ${user.email}: ${saved.status()} ${await saved.text()}`,
    ).toBeTruthy();
  }
}

export async function signOut(page: Page): Promise<void> {
  await page.request.delete("/api/test/session");
}

interface AuthFixtures {
  /** A signed-in account with no profile row — sitting at onboarding. */
  freshUserPage: Page;
  /** A signed-in account with a completed profile — full app access. */
  establishedUserPage: Page;
}

export const test = base.extend<AuthFixtures>({
  freshUserPage: async ({ page }, use) => {
    await signIn(page, FRESH_USER);
    await use(page);
    await signOut(page);
  },
  establishedUserPage: async ({ page }, use) => {
    await signIn(page, ESTABLISHED_USER);
    await use(page);
    await signOut(page);
  },
});

export { expect };
