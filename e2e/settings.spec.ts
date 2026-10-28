import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("mobile settings stays within the viewport and traps keyboard focus", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Settings menu" });
  await trigger.click();
  await page.getByRole("menuitem", { name: "Settings" }).click();

  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Done" })).toBeFocused();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(845);

  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
});
