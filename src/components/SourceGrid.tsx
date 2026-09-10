"use client";

import { memo, useCallback, useMemo } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import type { Article, SourceFeed } from "@/lib/types";
import { SourceColumn } from "./SourceColumn";

type Props = {
  sources: SourceFeed[];
  highlightQuery: string;
  emptyMessage?: string;
  showSummaries: boolean;
  showAuthors: boolean;
  showAges: boolean;
  showEngagement: boolean;
  onReorder: (orderedIds: string[]) => void;
  onRetry?: (sourceId: string) => Promise<void> | void;
  savedArticleIds: Set<string>;
  onSave: (article: Article, sourceName: string, topic: string) => void;
  onShare: (article: Article, sourceName: string, topic: string) => void;
  onOpen: (article: Article, sourceName: string, sourceHomeUrl: string | undefined, sourceTopic: string) => void;
};

function SourceGridInner({
  sources,
  highlightQuery,
  emptyMessage,
  showSummaries,
  showAuthors,
  showAges,
  showEngagement,
  onReorder,
  onRetry,
  savedArticleIds,
  onSave,
  onShare,
  onOpen,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const itemIds = useMemo(() => sources.map((s) => s.id), [sources]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = itemIds.indexOf(String(active.id));
      const newIndex = itemIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      onReorder(arrayMove(itemIds, oldIndex, newIndex));
    },
    [itemIds, onReorder]
  );

  if (!sources.length) {
    return (
      <p className="empty-grid">
        {emptyMessage ??
          "No sources match this search. Try different keywords or clear the filter."}
      </p>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={itemIds} strategy={rectSortingStrategy}>
        <div className="coeus-grid">
          {sources.map((s) => (
            <SourceColumn
              key={s.id}
              source={s}
              highlightQuery={highlightQuery}
              showSummaries={showSummaries}
              showAuthors={showAuthors}
              showAges={showAges}
              showEngagement={showEngagement}
              onRetry={onRetry}
              savedArticleIds={savedArticleIds}
              onSave={onSave}
              onShare={onShare}
              onOpen={onOpen}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export const SourceGrid = memo(SourceGridInner);
