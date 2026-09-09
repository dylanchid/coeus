import { expect, test } from "./support/fixtures";

test("an archive edit syncs to the server and survives reload", async ({ establishedUser }) => {
  const { page, handle } = establishedUser;
  await page.goto("/archive");
  await expect(page.getByRole("button", { name: `@${handle}` })).toBeVisible({ timeout: 20_000 });

  const star = page.locator(".archive-star").first();
  await expect(star).toBeVisible({ timeout: 20_000 });
  const label = await star.getAttribute("aria-label");
  const match = /^(Star|Unstar) (.+)$/.exec(label ?? "");
  expect(match).not.toBeNull();
  const [, action, title] = match!;
  const starred = action === "Star";
  const nextLabel = `${starred ? "Unstar" : "Star"} ${title}`;

  await star.click();
  await expect(star).toHaveAttribute("aria-label", nextLabel);

  await expect.poll(async () => {
    const response = await page.request.get("/api/archive");
    if (!response.ok()) return false;
    const archive = await response.json() as { snapshot: { archive: { items: { title: string; starred: boolean }[] } } };
    return archive.snapshot.archive.items.find((item) => item.title === title)?.starred === starred;
  }, { timeout: 20_000 }).toBe(true);

  await page.reload();
  await expect(page.getByRole("button", { name: nextLabel })).toBeVisible({ timeout: 20_000 });
});
