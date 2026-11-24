import { expect, test } from "@playwright/test";

const ABOUT_BANNED = [
  /\bPost\b/i,
  /\bpost\b/,
  /sourced clip/i,
  /sourced passages/i,
  /destinations/i,
  /community collections/i,
];

const SIGNIN_BANNED = [/destinations/i, /\bLog in\b/i, /Sign up/i];

test.describe("copy and wayfinding", () => {
  test("/about uses curator vocabulary and omits banned phrases", async ({ page }) => {
    await page.goto("/about");
    const html = await page.content();
    await expect(page.getByRole("heading", { name: /personal front page/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /start a collection/i })).toBeVisible();
    expect(html).toMatch(/Start a collection/);
    expect(html).toMatch(/@handle/);
    expect(html).toMatch(/RSS/i);
    for (const pattern of ABOUT_BANNED) {
      expect(html).not.toMatch(pattern);
    }
  });

  test("/signin shows Sign in copy, skip link, and no banned phrases", async ({ page }) => {
    await page.goto("/signin");
    const html = await page.content();
    await expect(page.getByRole("heading", { name: /sign in to coeus/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /skip, just read/i })).toBeVisible();
    const skipHref = await page.getByRole("link", { name: /skip, just read/i }).getAttribute("href");
    expect(skipHref).toBe("/");
    for (const pattern of SIGNIN_BANNED) {
      expect(html).not.toMatch(pattern);
    }
  });

  test("primary nav labels include Read", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    await expect(nav.getByRole("link", { name: "Read" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Discover" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Archive" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Sources" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "About" })).toBeVisible();
  });

  test("/c marks Discover as the current page", async ({ page }) => {
    await page.goto("/c");
    const discover = page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Discover" });
    await expect(discover).toHaveAttribute("aria-current", "page");
  });

  test("signed-out header reads Sign in at desktop and 390px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("header sign-in modal shows the full lede and skip link", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in" }).click();
    const modal = page.getByRole("dialog", { name: /sign in/i });
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/Claim an @handle so your published collections have an address/i)).toBeVisible();
    await expect(modal.getByRole("link", { name: /skip, just read/i })).toBeVisible();
    const skipHref = await modal.getByRole("link", { name: /skip, just read/i }).getAttribute("href");
    expect(skipHref).toBe("/");
  });
});