import Link from "next/link";
import { ExternalLinkHint } from "./ExternalLinkHint";
import { VisibilityGlyph } from "./VisibilityGlyph";
import type { CardTarget } from "@/lib/conversationProfile";
import type { ThreadView } from "@/lib/threadPage";

const DATE_FORMAT = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : DATE_FORMAT.format(date);
}

function TargetContext({ target }: { target: CardTarget }) {
  return (
    <p className="profile-reply-context">
      <span className="profile-reply-context-kind">
        {target.kind === "collection" ? "On collection" : "On post"}
      </span>{" "}
      {target.kind === "collection" ? (
        <a href={`/c/${target.slug}`}>{target.name}</a>
      ) : (
        <a href={target.url} target="_blank" rel="noreferrer">
          {target.title}
          <ExternalLinkHint />
        </a>
      )}{" "}
      <a className="profile-reply-context-owner" href={`/@${target.ownerHandle}`}>
        @{target.ownerHandle}
      </a>
    </p>
  );
}

/**
 * The dedicated thread page (`/@handle/replies/[replyId]`). Unlike the Replies
 * tab — two rendered levels, capped per level — this walks EVERY descendant of
 * the root, oldest first, paginated by a `?cursor=` link. Depth is a "replying
 * to @handle" lead, never indentation, so the body measure holds at 320px no
 * matter how deep the real tree runs.
 *
 * Server component, zero client JS: all viewer filtering already happened in
 * deriveThreadView().
 */
export function ProfileThread({
  handle,
  isOwner,
  view,
  hasMore,
  nextCursor,
  onCursor,
}: {
  handle: string;
  isOwner: boolean;
  view: ThreadView;
  hasMore: boolean;
  nextCursor: string | null;
  onCursor: boolean;
}) {
  const { root, replies } = view;
  const base = `/@${handle}/replies/${root.id}`;

  return (
    <div className="profile-page profile-thread">
      <header className="follow-list-head">
        <p className="archive-eyebrow">
          <Link href={`/@${handle}?tab=replies`}>← @{handle}’s replies</Link>
        </p>
      </header>

      <article className="profile-reply-thread profile-thread-root">
        <TargetContext target={root.target} />
        <div className="profile-reply-card">
          <p className="profile-reply-lead">
            <a href={`/@${root.authorHandle}`}>@{root.authorHandle}</a>
          </p>
          <p className="profile-reply-text">{root.body}</p>
          <p className="profile-reply-meta">
            <time dateTime={root.createdAt}>{when(root.createdAt)}</time>
            {root.edited ? <span className="profile-reply-edited">edited</span> : null}
            {isOwner ? <VisibilityGlyph visibility={root.visibility} /> : null}
          </p>
        </div>
      </article>

      {replies.length ? (
        <ol className="profile-thread-replies">
          {replies.map((reply) => (
            <li className="profile-reply-card" key={reply.id}>
              <p className="profile-reply-lead">
                <a href={`/@${reply.authorHandle}`}>@{reply.authorHandle}</a>
                {reply.replyingTo ? (
                  <>
                    {" "}
                    replying to <a href={`/@${reply.replyingTo}`}>@{reply.replyingTo}</a>
                  </>
                ) : null}
              </p>
              <p className="profile-reply-text">{reply.body}</p>
              <p className="profile-reply-meta">
                <time dateTime={reply.createdAt}>{when(reply.createdAt)}</time>
                {reply.edited ? <span className="profile-reply-edited">edited</span> : null}
                {isOwner ? <VisibilityGlyph visibility={reply.visibility} /> : null}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="profile-feed-empty">No replies in this thread yet.</p>
      )}

      <nav className="profile-feed-pagination" aria-label="Pagination">
        {onCursor ? <Link href={base}>← Start of thread</Link> : <span />}
        {hasMore && nextCursor ? (
          <Link href={`${base}?cursor=${encodeURIComponent(nextCursor)}`}>Older replies →</Link>
        ) : null}
      </nav>
    </div>
  );
}
