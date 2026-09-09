import { expect, signOut, test } from "./support/fixtures";

test.describe("authenticated shell", () => {
  test("a signed-in account with a profile reaches the archive as itself", async ({ establishedUser }) => {
    const { page, handle } = establishedUser;
    await page.goto("/archive");

    // ProfileGate must NOT bounce a completed account to onboarding.
    await expect(page).toHaveURL(/\/archive$/);
    await expect(page.getByRole("button", { name: `@${handle}` })).toBeVisible({ timeout: 20_000 });

    const health = await page.request.get("/api/health");
    expect(health.status(), await health.text()).toBe(200);
  });

  test("a signed-in account with no profile is sent through onboarding", async ({ freshUserPage: page }) => {
    await page.goto("/archive");

    // ProfileGate redirects "needs-profile" to /welcome with a return path.
    await expect(page).toHaveURL(/\/welcome\?next=/);
    await expect(page.getByRole("heading", { name: /choose your handle/i })).toBeVisible({ timeout: 20_000 });

    const handle = `fresh_${Date.now().toString(36)}`;
    await page.getByRole("textbox", { name: "Handle" }).fill(handle);
    await page.getByRole("textbox", { name: "Display name" }).fill("Fresh Tester");
    await page.getByRole("button", { name: /continue/i }).click();

    // Lands back on the archive, now recognised as the new handle.
    await expect(page).toHaveURL(/\/archive$/);
    await expect(page.getByRole("button", { name: `@${handle}` })).toBeVisible({ timeout: 20_000 });

    // The profile row is real: the API returns it on the next load.
    const profile = await page.request.get("/api/account/profile");
    expect(profile.ok()).toBeTruthy();
    expect((await profile.json()).profile).toMatchObject({ handle });
  });

  test("signing out returns the shell to the anonymous state", async ({ establishedUser }) => {
    const { page, handle } = establishedUser;
    await page.goto("/archive");
    await expect(page.getByRole("button", { name: `@${handle}` })).toBeVisible({ timeout: 20_000 });

    await signOut(page);
    await page.reload();

    await expect(page.getByRole("link", { name: /log in/i })).toBeVisible({ timeout: 20_000 });
  });
});
