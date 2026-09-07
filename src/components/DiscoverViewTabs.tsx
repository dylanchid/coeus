import Link from "next/link";

/**
 * The segmented control between the two Discover views: "Everyone" (the
 * existing feed) and "Following" (content from people the viewer follows,
 * filtered through canSee). Real `<Link>`s carrying `?view=` — server-rendered,
 * shareable, no client island. Rendered by both trees so the control is always
 * present.
 */
export function DiscoverViewTabs({ current }: { current: "everyone" | "following" }) {
  return (
    <nav className="discover-view-tabs" aria-label="Discover views">
      <Link
        href="/discover"
        className="discover-view-tab"
        aria-current={current === "everyone" ? "page" : undefined}
      >
        Everyone
      </Link>
      <Link
        href="/discover?view=following"
        className="discover-view-tab"
        aria-current={current === "following" ? "page" : undefined}
      >
        Following
      </Link>
    </nav>
  );
}
