import { expect, test } from "@playwright/test";

test("public shell stays usable without a signed-in Supabase session", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /archive/i })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: /archive/i }).click();
  await expect(page).toHaveURL(/\/archive$/);
  await expect(page.getByRole("heading", { name: /everything worth returning/i })).toBeVisible();
});

test("health endpoint is available to the browser journey", async ({ request }) => {
  const response = await request.get("/api/health");
  expect([200, 503]).toContain(response.status());
});
