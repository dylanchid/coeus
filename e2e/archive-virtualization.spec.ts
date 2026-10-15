import { expect, test } from "@playwright/test";

const ITEM_COUNT = 5_000;

/** Deterministic mix of card heights: bare, summary-only, summary + note + tags. */
function makeItem(index: number) {
  const shape = index % 4;
  return {
    id: `virt-${index}`,
    articleId: `virt-article-${index}`,
    title: `Virtual item ${index}${shape === 3 ? " with a deliberately long headline that wraps across several lines in the archive card" : ""}`,
    url: `https://example.com/virtual/${index}`,
    sourceName: "Example",
    topic: "Technology",
    summary: shape === 0 ? "" : "A short summary. ".repeat(shape * 6),
    author: "",
    publishedAt: null,
    // Newest-first sort puts index 0 at the top.
    savedAt: new Date(Date.UTC(2026, 0, 1) - index * 60_000).toISOString(),
    state: "unread",
    starred: false,
    collectionIds: [],
    tags: shape >= 2 ? ["alpha", "beta", "gamma"] : [],
    note: shape === 3 ? "A saved note that makes this card taller. ".repeat(4) : "",
  };
}

test("archive list stays windowed and keyboard-navigable at 5,000 items", async ({ page }) => {
  test.setTimeout(180_000);
  // Seed the local-first archive directly and stay signed out, so this exercises
  // list rendering only (first-connect sync is covered by its own beads).
  const items = Array.from({ length: ITEM_COUNT }, (_, index) => makeItem(index));
  await page.addInitScript((data) => {
    window.localStorage.setItem("coeus.archive.v1", JSON.stringify({ version: 1, items: data, collections: [], socialPosts: [] }));
  }, items);

  await page.goto("/archive");
  await expect(page.getByText(`${ITEM_COUNT} pieces`)).toBeVisible({ timeout: 60_000 });
  const rows = page.locator("ol.archive-list > li");
  await expect(rows.first()).toBeVisible();

  const stats = () => page.evaluate(() => {
    const items = [...document.querySelectorAll<HTMLElement>("ol.archive-list > li")];
    const rects = items.map((li) => li.getBoundingClientRect());
    let overlap = 0;
    for (let i = 1; i < rects.length; i += 1) if (rects[i]!.top < rects[i - 1]!.bottom - 1) overlap += 1;
    return {
      mounted: items.length,
      domNodes: document.querySelectorAll("*").length,
      firstPos: Number(items[0]?.getAttribute("aria-posinset")),
      lastPos: Number(items[items.length - 1]?.getAttribute("aria-posinset")),
      setSize: items[0]?.getAttribute("aria-setsize"),
      overlap,
      heights: new Set(rects.map((rect) => Math.round(rect.height))).size,
    };
  });

  const top = await stats();
  console.log("TOP", JSON.stringify(top));
  expect(top.mounted).toBeLessThan(40);
  expect(top.setSize).toBe(String(ITEM_COUNT));
  expect(top.overlap).toBe(0);
  expect(top.heights).toBeGreaterThan(1); // variable-height cards were measured

  // Detail state belongs to the archive list, not the virtualized row instance.
  // It must survive when the row leaves and later re-enters the mounted window.
  const firstRow = page.locator('li[data-item-id="virt-0"]');
  await firstRow.getByText("Organize").click();
  await expect(firstRow.locator("details.archive-item-tools")).toHaveAttribute("open", "");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await expect(page.locator('li[data-item-id="virt-0"] details.archive-item-tools')).toHaveAttribute("open", "");

  // Scroll to the middle, then the very end, with a frame-time probe running.
  const frames = await page.evaluate(async () => {
    const times: number[] = [];
    let last = performance.now();
    let running = true;
    const tick = (now: number) => { times.push(now - last); last = now; if (running) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const total = document.documentElement.scrollHeight;
    for (let step = 1; step <= 60; step += 1) {
      window.scrollTo(0, (total * step) / 60);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    }
    running = false;
    times.sort((a, b) => a - b);
    return { frames: times.length, p50: times[Math.floor(times.length * 0.5)], p95: times[Math.floor(times.length * 0.95)], max: times[times.length - 1] };
  });
  console.log("SCROLL", JSON.stringify(frames));
  // The document height firms up as estimated rows are measured, so one jump to
  // the bottom can land short; like a user, keep going until the end is reached.
  let end = await stats();
  let jumps = 0;
  while (end.lastPos !== ITEM_COUNT && jumps < 6) {
    await page.keyboard.press("End");
    await page.waitForTimeout(400);
    end = await stats();
    jumps += 1;
  }
  console.log("END", JSON.stringify(end), "extra End presses", jumps);
  expect(end.mounted).toBeLessThan(40);
  expect(end.lastPos).toBe(ITEM_COUNT);
  expect(end.overlap).toBe(0);

  // Keyboard: tab forward through many controls from the top; focus must always
  // land in a mounted, on-screen row (no dead zone at the window edge).
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.locator(".archive-star").first().focus();
  const seen = new Set<string>();
  for (let press = 0; press < 150; press += 1) {
    await page.keyboard.press("Tab");
    const where = await page.evaluate(() => {
      const li = document.activeElement?.closest("ol.archive-list > li");
      if (!li) return null;
      const rect = li.getBoundingClientRect();
      return { pos: li.getAttribute("aria-posinset"), visible: rect.bottom > 0 && rect.top < window.innerHeight };
    });
    expect(where, `focus left the list at Tab ${press}`).not.toBeNull();
    expect(where!.visible, `focused row off-screen at Tab ${press}`).toBe(true);
    seen.add(where!.pos!);
  }
  console.log("TAB rows reached", seen.size, "max pos", Math.max(...[...seen].map(Number)));
  expect(seen.size).toBeGreaterThan(10);
  for (let press = 0; press < 40; press += 1) await page.keyboard.press("Shift+Tab");
  const back = await page.evaluate(() => Number(document.activeElement?.closest("ol.archive-list > li")?.getAttribute("aria-posinset")));
  console.log("SHIFT+TAB landed on row", back);
  expect(back).toBeGreaterThan(0);
});
