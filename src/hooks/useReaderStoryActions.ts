"use client";

import { useCallback, useState } from "react";
import { archiveArticle } from "@/lib/archive";
import type { ArchiveData } from "@/lib/archive/archiveTypes";
import type { Article, EmbedCompatibility, UserPrefs } from "@/lib/types";

export type ReaderShareTarget = { article: Article; sourceName: string; topic: string };
export type ReaderPreviewTarget = {
  article: Article;
  sourceName: string;
  sourceHomeUrl?: string;
  sourceTopic: string;
  compatibility: EmbedCompatibility;
};

async function resolveEmbedCompatibility(url: string): Promise<EmbedCompatibility> {
  try {
    const response = await fetch(`/api/embed-compatibility?url=${encodeURIComponent(url)}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return "unknown";
    const data = (await response.json()) as { compatibility?: EmbedCompatibility };
    return data.compatibility === "allowed" || data.compatibility === "blocked"
      ? data.compatibility : "unknown";
  } catch {
    return "unknown";
  }
}

export function useReaderStoryActions({ updateArchive, previewMode, persist }: {
  updateArchive: (update: (current: ArchiveData) => ArchiveData) => Promise<boolean>;
  previewMode: UserPrefs["articlePreviewMode"] | undefined;
  persist: (patch: Partial<UserPrefs>) => void;
}) {
  const [shareTarget, setShareTarget] = useState<ReaderShareTarget | null>(null);
  const [shareStatus, setShareStatus] = useState("");
  const [previewTarget, setPreviewTarget] = useState<ReaderPreviewTarget | null>(null);

  const saveStory = useCallback((article: Article, sourceName: string, topic: string) => {
    void updateArchive((current) => archiveArticle(current, article, sourceName, topic));
  }, [updateArchive]);
  const shareStory = useCallback((article: Article, sourceName: string, topic: string) => {
    setShareTarget({ article, sourceName, topic });
  }, []);
  const openOriginal = useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);
  const openStory = useCallback((article: Article, sourceName: string, sourceHomeUrl: string | undefined, sourceTopic: string) => {
    if (previewMode === "external") {
      openOriginal(article.url);
      return;
    }
    setPreviewTarget({ article, sourceName, sourceHomeUrl, sourceTopic, compatibility: "unknown" });
    void resolveEmbedCompatibility(article.url).then((compatibility) => {
      setPreviewTarget((current) =>
        current && current.article.url === article.url ? { ...current, compatibility } : current,
      );
    });
  }, [openOriginal, previewMode]);
  const onShareDone = useCallback((message: string) => {
    setShareStatus(message);
    window.setTimeout(() => setShareStatus(""), 2800);
  }, []);
  const choosePreview = useCallback(() => persist({ articlePreviewMode: "preview" }), [persist]);
  const chooseExternal = useCallback(() => {
    if (!previewTarget) return;
    persist({ articlePreviewMode: "external" });
    openOriginal(previewTarget.article.url);
    setPreviewTarget(null);
  }, [persist, openOriginal, previewTarget]);
  const preferExternal = useCallback(() => {
    persist({ articlePreviewMode: "external" });
    setPreviewTarget(null);
  }, [persist]);

  return {
    shareTarget, shareStatus, previewTarget, saveStory, shareStory, openStory,
    openOriginal, onShareDone, choosePreview, chooseExternal, preferExternal,
    closeShare: () => setShareTarget(null),
    closePreview: () => setPreviewTarget(null),
  };
}
