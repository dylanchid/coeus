import { expect, test } from "./support/fixtures";

test("a signed-in user connects Notion through the mocked OAuth provider", async ({ establishedUser }) => {
  const { page } = establishedUser;
  await page.goto("/archive");
  await page.getByText("Sync destinations", { exact: true }).click();
  const connect = page.getByRole("link", { name: /connect notion/i });
  await expect(connect).toHaveAttribute("href", "/api/archive/destinations/notion/oauth/start");

  // Start through the real app endpoint (which persists the signed nonce),
  // then stand in for the external provider by visiting its callback locally.
  const start = await page.request.get("/api/archive/destinations/notion/oauth/start", { maxRedirects: 0 });
  expect(start.status()).toBe(302);
  const authorize = new URL(String(start.headers()["location"]));
  const callback = new URL(String(authorize.searchParams.get("redirect_uri")));
  callback.protocol = new URL(page.url()).protocol;
  callback.host = new URL(page.url()).host;
  callback.searchParams.set("code", "e2e-code");
  callback.searchParams.set("state", String(authorize.searchParams.get("state")));
  await page.goto(callback.toString());
  await expect(page.getByText("Notion connected")).toBeVisible({ timeout: 20_000 });
  await page.getByText("Sync destinations", { exact: true }).click();
  await expect(page.getByText("Notion — E2E Workspace")).toBeVisible();

  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText("Notion sync started")).toBeVisible();

  const destinations = await page.request.get("/api/archive/destinations");
  expect(destinations.ok()).toBeTruthy();
  expect(await destinations.json()).toMatchObject({
    destinations: [expect.objectContaining({ kind: "notion", status: "active", displayName: "Notion — E2E Workspace" })],
  });

  await expect.poll(async () => {
    const deliveries = await page.request.get("/api/archive/destinations/notion/deliveries");
    if (!deliveries.ok()) return [];
    return (await deliveries.json() as { deliveries: { status: string; externalRef: string | null }[] }).deliveries;
  }).toEqual(expect.arrayContaining([
    expect.objectContaining({ status: "delivered", externalRef: expect.stringMatching(/^e2e-page-/) }),
  ]));
});
