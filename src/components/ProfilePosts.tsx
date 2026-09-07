import { ExternalLinkHint } from "./ExternalLinkHint";
import { VisibilityGlyph } from "./VisibilityGlyph";
import type { ProfilePostCard } from "@/lib/publicProfile";

/**
 * The Posts tab feed column. Each row is one sourced clip: the commentary set
 * as a pull quote, the source card beneath it, and — on the owner's own view —
 * an inline visibility chip. All viewer filtering already happened in
 * deriveProfileView(); this only lays the rows out, the same contract
 * ProfileCollections works to.
 */
export function ProfilePosts({
  posts,
  isOwner,
  handle,
}: {
  posts: ProfilePostCard[];
  isOwner: boolean;
  handle: string;
}) {
  if (!posts.length) {
    return (
      <p className="profile-feed-empty">
        {isOwner
          ? "You haven’t published any posts yet."
          : `@${handle} hasn’t published any posts yet.`}
      </p>
    );
  }

  return (
    <ol className="profile-posts">
      {posts.map((post) => (
        <li className="profile-post" key={`${post.url}-${post.publishedAt}`}>
          {isOwner ? (
            <p className="profile-post-visibility">
              <VisibilityGlyph visibility={post.visibility} />
            </p>
          ) : null}
          {post.commentary ? <blockquote className="profile-post-commentary">{post.commentary}</blockquote> : null}
          <a className="profile-post-source" href={post.url} target="_blank" rel="noreferrer">
            {post.sourceName ? <span className="profile-post-source-name">{post.sourceName}</span> : null}
            <strong>{post.title}</strong>
            {post.author ? <small>{post.author}</small> : null}
            {post.excerpt ? <span className="profile-post-excerpt">{post.excerpt}</span> : null}
            <ExternalLinkHint />
          </a>
        </li>
      ))}
    </ol>
  );
}
