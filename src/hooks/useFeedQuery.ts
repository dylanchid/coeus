"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  clientCacheKey,
  readClientCache,
  writeClientCache,
} from "@/lib/clientCache";
import {
  fetchFeedBatch,
  friendlyFeedError,
  mergeSourceFeed,
  runFeedQuery,
  visibleSourceIds,
} from "@/lib/feedQuery";
import { orderByIds, type Topic } from "@/lib/sources";
import type { SourceFeed } from "@/lib/types";

export type FeedQueryStatus = "idle" | "loading" | "refreshing" | "success" | "error";

interface FeedQueryState {
  status: FeedQueryStatus;
  sources: SourceFeed[];
  topic: Topic | null;
  updatedAt: string | null;
  error: string | null;
}

interface UseFeedQueryOptions {
  sourceOrder: string[];
  hiddenSources: string[];
  limit: number;
  hours: number;
  topic: Topic;
}

export function useFeedQuery(options: UseFeedQueryOptions) {
  const [state, setState] = useState<FeedQueryState>({
    status: "idle",
    sources: [],
    topic: null,
    updatedAt: null,
    error: null,
  });
  const [, startTransition] = useTransition();
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const orderKey = options.sourceOrder.join(",");
  const hiddenKey = options.hiddenSources.join(",");
  const ids = useMemo(
    () => visibleSourceIds(options.sourceOrder, new Set(options.hiddenSources), options.topic),
    // Primitive keys prevent unrelated preference updates from restarting requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orderKey, hiddenKey, options.topic]
  );
  const idsKey = ids.join(",");

  const load = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    if (!orderKey) return;
    const generation = ++generationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const order = orderKey.split(",").filter(Boolean);
    const query = { ids, order, limit: options.limit, hours: options.hours };
    const cacheKey = clientCacheKey({
      ids: idsKey,
      limit: options.limit,
      hours: options.hours,
      topic: options.topic,
    });
    const cached = force ? null : readClientCache(cacheKey);
    const initialSources = cached?.sources ?? [];

    setState({
      status: cached ? "refreshing" : "loading",
      sources: cached ? orderByIds(cached.sources, order) : [],
      topic: options.topic,
      updatedAt: cached?.updatedAt ?? null,
      error: null,
    });

    if (!ids.length) {
      setState({
        status: "success",
        sources: [],
        topic: options.topic,
        updatedAt: cached?.updatedAt ?? null,
        error: null,
      });
      return;
    }

    try {
      const result = await runFeedQuery(query, {
        force,
        signal: controller.signal,
        initialSources,
        onProgress: (progress) => {
          if (generation !== generationRef.current) return;
          startTransition(() => {
            setState((previous) => ({
              ...previous,
              sources: progress.sources,
              updatedAt: progress.updatedAt ?? previous.updatedAt,
            }));
          });
        },
      });
      if (generation !== generationRef.current) return;

      const error = result.successfulBatches === 0 && result.failedIds.length
        ? "Bareaga couldn’t load these stories. Try again; your preferences are safe."
        : null;
      setState({
        status: result.successfulBatches === 0 ? "error" : "success",
        sources: result.sources,
        topic: options.topic,
        updatedAt: result.updatedAt ?? cached?.updatedAt ?? null,
        error,
      });
      if (result.successfulBatches > 0) {
        writeClientCache(cacheKey, {
          sources: result.sources,
          updatedAt: result.updatedAt ?? cached?.updatedAt ?? new Date().toISOString(),
        });
      }
    } catch (error) {
      if (controller.signal.aborted || generation !== generationRef.current) return;
      setState((previous) => ({
        ...previous,
        status: "error",
        error: friendlyFeedError(error),
      }));
    }
  }, [orderKey, ids, idsKey, options.limit, options.hours, options.topic, startTransition]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const retrySource = useCallback(async (sourceId: string) => {
    const controller = new AbortController();
    const data = await fetchFeedBatch(
      [sourceId],
      { limit: options.limit, hours: options.hours },
      { force: true, signal: controller.signal }
    );
    const source = data.sources[0];
    if (!source) return;
    setState((previous) => ({
      ...previous,
      sources: mergeSourceFeed(previous.sources, source, options.sourceOrder),
      updatedAt: data.updatedAt || previous.updatedAt,
      error: null,
    }));
  }, [options.limit, options.hours, options.sourceOrder]);

  const reorderSources = useCallback((order: string[]) => {
    setState((previous) => ({
      ...previous,
      sources: orderByIds(previous.sources, order),
    }));
  }, []);

  const currentSources = state.topic === options.topic ? state.sources : [];
  return {
    sources: currentSources,
    updatedAt: state.updatedAt,
    error: state.error,
    status: state.status,
    loading: state.status === "loading",
    refreshing: state.status === "refreshing",
    refresh: () => load({ force: true }),
    retrySource,
    reorderSources,
  };
}
