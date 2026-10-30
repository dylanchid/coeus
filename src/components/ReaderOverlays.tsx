import type { UserPrefs } from "@/lib/types";
import type { useReaderStoryActions } from "@/hooks/useReaderStoryActions";
import { ShareSheet } from "./ShareSheet";
import { ArticlePreview, ArticlePreviewChoice } from "./ArticlePreview";

export function ReaderOverlays({ prefs, actions }: {
  prefs: UserPrefs;
  actions: ReturnType<typeof useReaderStoryActions>;
}) {
  const { shareTarget, previewTarget } = actions;
  return <>
    {shareTarget ? (
      <ShareSheet
        article={shareTarget.article}
        sourceName={shareTarget.sourceName}
        topic={shareTarget.topic}
        onClose={actions.closeShare}
        onDone={actions.onShareDone}
      />
    ) : null}
    {previewTarget && prefs.articlePreviewMode === "ask" ? (
      <ArticlePreviewChoice
        article={previewTarget.article}
        sourceName={previewTarget.sourceName}
        onClose={actions.closePreview}
        onChoosePreview={actions.choosePreview}
        onChooseExternal={actions.chooseExternal}
      />
    ) : null}
    {previewTarget && prefs.articlePreviewMode === "preview" ? (
      <ArticlePreview
        article={previewTarget.article}
        sourceName={previewTarget.sourceName}
        sourceHomeUrl={previewTarget.sourceHomeUrl}
        sourceTopic={previewTarget.sourceTopic}
        compatibility={previewTarget.compatibility}
        onClose={actions.closePreview}
        onOpenOriginal={() => actions.openOriginal(previewTarget.article.url)}
        onPreferExternal={actions.preferExternal}
      />
    ) : null}
    {actions.shareStatus ? <p className="share-toast" role="status">{actions.shareStatus}</p> : null}
  </>;
}
