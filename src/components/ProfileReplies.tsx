"use client";

import { useRouter } from "next/navigation";
import { ExternalLinkHint } from "./ExternalLinkHint";
import { ReplyComposer } from "./ReplyComposer";
import { VisibilityGlyph } from "./VisibilityGlyph";
import type { CardTarget, ProfileReplyCard, ProfileReplyThread } from "@/lib/conversationProfile";
import type { TargetType } from "@/lib/conversation";
import type { Visibility } from "@/lib/visibility";

const DATE_FORMAT = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : DATE_FORMAT.format(date);
}

/** Owner-only: the ids and tier needed to compose a reply into a given thread.
 * Kept as a sibling map rather than folded into the derived card so no target
 * uuid ever crosses to a visitor. */
export interface ReplyComposeTarget {
  targetType: TargetType;
  targetId: string;
  targetVisibility: Visibility;
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

function ReplyBody({ card, isOwner }: { card: ProfileReplyCard; isOwner: boolean }) {
  return (
    <div className="profile-reply-card">
      {card.replyingTo ? (
        <p className="profile-reply-lead">
          replying to <a href={`/@${card.replyingTo}`}>@{card.replyingTo}</a>
        </p>
      ) : null}
      <p className="profile-reply-text">{card.body}</p>
      <p className="profile-reply-meta">
        <time dateTime={card.createdAt}>{when(card.createdAt)}</time>
        {card.edited ? <span className="profile-reply-edited">edited</span> : null}
        {isOwner ? <VisibilityGlyph visibility={card.visibility} /> : null}
      </p>
    </div>
  );
}

/**
 * The Replies tab: two rendered levels, no deeper. A thread root shows its
 * target as context; its direct responses are indented one level via a left
 * rule; anything deeper was flattened to that same level in
 * deriveReplyThreads() and renders with a "replying to @handle" lead.
 *
 * Indentation is a single left rule + padding — one level only — so the body
 * measure never drops below ~40 characters at 320px (see profile.css).
 */
export function ProfileReplies({
  threads,
  isOwner,
  handle,
  composeTargets = {},
}: {
  threads: ProfileReplyThread[];
  isOwner: boolean;
  handle: string;
  /** Owner-only, keyed by thread-root reply id. */
  composeTargets?: Record<string, ReplyComposeTarget>;
}) {
  const router = useRouter();

  if (!threads.length) {
    return (
      <p className="profile-feed-empty">
        {isOwner ? "You haven’t replied to anything yet." : `@${handle} hasn’t replied to anything yet.`}
      </p>
    );
  }

  return (
    <ol className="profile-replies">
      {threads.map((thread) => {
        const compose = isOwner ? composeTargets[thread.reply.id] : undefined;
        return (
          <li className="profile-reply-thread" key={thread.reply.id}>
            {thread.reply.target ? <TargetContext target={thread.reply.target} /> : null}
            <ReplyBody card={thread.reply} isOwner={isOwner} />

            {thread.responses.length ? (
              <ol className="profile-reply-responses">
                {thread.responses.map((response) => (
                  <li key={response.id}>
                    <ReplyBody card={response} isOwner={isOwner} />
                  </li>
                ))}
              </ol>
            ) : null}

            {thread.totalResponses !== undefined && thread.totalResponses > thread.responses.length ? (
              <p className="profile-reply-more">
                <a href={`/@${handle}/replies/${thread.reply.id}`}>
                  View all {thread.totalResponses} replies →
                </a>
              </p>
            ) : null}

            {compose ? (
              <div className="profile-reply-compose">
                <ReplyComposer
                  targetType={compose.targetType}
                  targetId={compose.targetId}
                  parentId={thread.reply.id}
                  targetVisibility={compose.targetVisibility}
                  onPosted={() => router.refresh()}
                  placeholder="Add to this thread…"
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
