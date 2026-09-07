import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateReplyRequest, ResolvedTarget, TargetRef, TargetType } from "./conversation.ts";
import { ParentReplyMismatchError, ReplyNotFoundError, TargetNotFoundError } from "./conversationErrors.ts";
import type { Visibility } from "./visibility.ts";

export interface CreatedRepost {
  repostId: string;
  createdAt: string;
  /** false when the actor had already reposted this target — the call is idempotent. */
  created: boolean;
}

export interface CreatedReply {
  replyId: string;
  /** Inherited from the target by create_reply(), never chosen by the caller. */
  visibility: Visibility;
  createdAt: string;
}

/**
 * The API layer's one door to the conversation-layer write RPCs
 * (20260906170000_conversation_layer.sql). Every write is preceded by a
 * {@link resolveTarget} + actorCanReachTarget() check in the handler — the RPCs
 * enforce structure (target exists, parent on same target, author owns the
 * reply), the handler enforces "can the actor see the target".
 */
export interface ConversationStore {
  /**
   * The live state of a like / repost / reply target. Null when the id names no
   * row, or names a collection publication that is currently unpublished — both
   * are a 404 to the caller.
   */
  resolveTarget(targetType: TargetType, targetId: string): Promise<ResolvedTarget | null>;
  /** Does the actor follow the target owner? One head-count on profile_follows. */
  actorFollows(actorId: string, ownerId: string): Promise<boolean>;

  like(actorId: string, ref: TargetRef): Promise<boolean>;
  unlike(actorId: string, ref: TargetRef): Promise<boolean>;
  repost(actorId: string, ref: TargetRef): Promise<CreatedRepost>;
  unrepost(actorId: string, ref: TargetRef): Promise<boolean>;

  createReply(authorId: string, request: CreateReplyRequest): Promise<CreatedReply>;
  updateReply(authorId: string, replyId: string, body: string): Promise<void>;
  deleteReply(authorId: string, replyId: string): Promise<boolean>;
}

export class SupabaseConversationStore implements ConversationStore {
  // A TS parameter-property constructor breaks tests importing this module under
  // node --experimental-strip-types — see collectionPublicationStore.server.ts.
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async resolveTarget(targetType: TargetType, targetId: string): Promise<ResolvedTarget | null> {
    if (targetType === "collection") {
      const { data, error } = await this.supabase
        .from("collection_publications")
        .select("id,visibility,owner_id,unpublished_at")
        .eq("id", targetId)
        .maybeSingle();
      if (error) throw error;
      if (!data || (data as { unpublished_at: string | null }).unpublished_at !== null) return null;
      const row = data as { visibility: Visibility; owner_id: string };
      return { targetType, targetId, visibility: row.visibility, ownerId: row.owner_id };
    }

    const { data, error } = await this.supabase
      .from("posts")
      .select("id,visibility,author_id")
      .eq("id", targetId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as { visibility: Visibility; author_id: string };
    return { targetType, targetId, visibility: row.visibility, ownerId: row.author_id };
  }

  async actorFollows(actorId: string, ownerId: string): Promise<boolean> {
    const { count, error } = await this.supabase
      .from("profile_follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("follower_id", actorId)
      .eq("followee_id", ownerId);
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  async like(actorId: string, ref: TargetRef): Promise<boolean> {
    return this.boolRpc("like_target", {
      p_actor_id: actorId,
      p_target_type: ref.targetType,
      p_target_id: ref.targetId,
    });
  }

  async unlike(actorId: string, ref: TargetRef): Promise<boolean> {
    return this.boolRpc("unlike_target", {
      p_actor_id: actorId,
      p_target_type: ref.targetType,
      p_target_id: ref.targetId,
    });
  }

  async repost(actorId: string, ref: TargetRef): Promise<CreatedRepost> {
    const { data, error } = await this.supabase
      .rpc("repost_target", {
        p_actor_id: actorId,
        p_target_type: ref.targetType,
        p_target_id: ref.targetId,
      })
      .single();
    if (error) throw this.mapWriteError(error);
    const row = data as { repost_id: string; created_at: string; created: boolean };
    return { repostId: row.repost_id, createdAt: row.created_at, created: row.created };
  }

  async unrepost(actorId: string, ref: TargetRef): Promise<boolean> {
    return this.boolRpc("unrepost_target", {
      p_actor_id: actorId,
      p_target_type: ref.targetType,
      p_target_id: ref.targetId,
    });
  }

  async createReply(authorId: string, request: CreateReplyRequest): Promise<CreatedReply> {
    const { data, error } = await this.supabase
      .rpc("create_reply", {
        p_author_id: authorId,
        p_target_type: request.targetType,
        p_target_id: request.targetId,
        p_parent_id: request.parentId,
        p_body: request.body,
      })
      .single();
    if (error) throw this.mapWriteError(error);
    const row = data as { reply_id: string; visibility: Visibility; created_at: string };
    return { replyId: row.reply_id, visibility: row.visibility, createdAt: row.created_at };
  }

  async updateReply(authorId: string, replyId: string, body: string): Promise<void> {
    const { error } = await this.supabase.rpc("update_reply", {
      p_author_id: authorId,
      p_reply_id: replyId,
      p_body: body,
    });
    if (error) throw this.mapWriteError(error);
  }

  async deleteReply(authorId: string, replyId: string): Promise<boolean> {
    return this.boolRpc("delete_reply", { p_author_id: authorId, p_reply_id: replyId });
  }

  private async boolRpc(fn: string, args: Record<string, unknown>): Promise<boolean> {
    const { data, error } = await this.supabase.rpc(fn, args);
    if (error) throw this.mapWriteError(error);
    return Boolean(data);
  }

  /**
   * Translate the RAISE messages the RPCs use into the API layer's error
   * vocabulary. Everything else stays a raw error → 503.
   */
  private mapWriteError(error: { message?: string }): Error {
    const message = error.message ?? "";
    if (message.includes("does not exist") || message.includes("foreign key")) {
      return new TargetNotFoundError("Target not found");
    }
    if (message.includes("different target")) {
      return new ParentReplyMismatchError("Parent reply is on a different target");
    }
    if (message.includes("Reply not found") || message.includes("Parent reply") ) {
      return new ReplyNotFoundError("Reply not found");
    }
    return error instanceof Error ? error : new Error(message || "Conversation write failed");
  }
}
