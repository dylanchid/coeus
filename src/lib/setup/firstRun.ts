import { defaultSourceOrder } from "../feeds/sources.ts";
import type { UserPrefs } from "../types.ts";
import { sourceOrderForTopics } from "./setupTopics.ts";

function firstVisitPrefs(): UserPrefs {
  return {
    version: 1,
    customSources: [],
    sourceOrder: defaultSourceOrder(),
    hiddenSources: [],
    theme: "system",
    limit: 10,
    hours: 24,
    lastSearch: "",
    showSummaries: false,
    showAuthors: false,
    showAges: true,
    showEngagement: true,
    columns: 3,
    homeView: "grid",
    storyRepresentation: "detailed",
    articlePreviewMode: "ask",
    font: "mono",
    palette: "ink",
    density: "comfortable",
    keywordRules: [],
    sourceWeights: {},
    sourceRatings: {},
  };
}

export const SETUP_STORAGE_KEY = "coeus.setup.v1";

export type SetupStatus = "in_progress" | "skipped" | "done";

export type SetupRecord = {
  version: 1;
  status: SetupStatus;
  step?: 1 | 2;
  topicAreaIds?: string[];
  hintDismissed?: boolean;
};

export function parseSetupRecord(raw: string | null): SetupRecord | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SetupRecord>;
    if (value.version !== 1) return null;
    if (value.status !== "in_progress" && value.status !== "skipped" && value.status !== "done") {
      return null;
    }
    return {
      version: 1,
      status: value.status,
      step: value.step === 1 || value.step === 2 ? value.step : undefined,
      topicAreaIds: Array.isArray(value.topicAreaIds)
        ? value.topicAreaIds.filter((id): id is string => typeof id === "string")
        : undefined,
      hintDismissed: value.hintDismissed === true,
    };
  } catch {
    return null;
  }
}

export function readSetupRecord(storage: Pick<Storage, "getItem"> = localStorage): SetupRecord | null {
  return parseSetupRecord(storage.getItem(SETUP_STORAGE_KEY));
}

export function writeSetupRecord(
  record: SetupRecord,
  storage: Pick<Storage, "setItem"> = localStorage
): void {
  storage.setItem(SETUP_STORAGE_KEY, JSON.stringify(record));
}

function collectionSourceIds(order: readonly string[]): string[] {
  return order.filter((id) => id.startsWith("c:"));
}

function stripCollectionSources(order: readonly string[]): string[] {
  return order.filter((id) => !id.startsWith("c:"));
}

/** True when stored prefs differ from a first visit only by followed collection sources. */
export function prefsDifferOnlyByCollectionSources(stored: UserPrefs): boolean {
  const baseline = firstVisitPrefs();
  const baselineOrder = baseline.sourceOrder;
  const storedSansCollections = stripCollectionSources(stored.sourceOrder);
  if (JSON.stringify(storedSansCollections) !== JSON.stringify(baselineOrder)) return false;

  const collectionIds = collectionSourceIds(stored.sourceOrder);
  const expectedOrder = [...baselineOrder, ...collectionIds];
  if (JSON.stringify(stored.sourceOrder) !== JSON.stringify(expectedOrder)) return false;

  const { sourceOrder: storedSansCheck, ...storedRest } = stored;
  const { sourceOrder: baselineSansCheck, ...baselineRest } = baseline;
  void storedSansCheck;
  void baselineSansCheck;
  return JSON.stringify(storedRest) === JSON.stringify(baselineRest);
}

export function shouldOfferSetup(input: {
  setupRaw: string | null;
  hasStoredPrefs: boolean;
  hasLegacyBareagaKey: boolean;
  hasLegacyBrpKey: boolean;
  storedPrefsParseable: boolean;
  mergedPrefs: UserPrefs | null;
  signedInWithProfile: boolean;
}): boolean {
  if (input.signedInWithProfile) return false;
  const record = parseSetupRecord(input.setupRaw);
  if (record?.status === "skipped" || record?.status === "done") return false;
  if (record?.status === "in_progress") return true;
  if (input.hasLegacyBareagaKey || input.hasLegacyBrpKey) return false;
  if (!input.hasStoredPrefs) return true;
  if (!input.storedPrefsParseable) return false;
  if (!input.mergedPrefs) return false;
  return prefsDifferOnlyByCollectionSources(input.mergedPrefs);
}

export function applyTopicPicks(prefs: UserPrefs, topicAreaIds: readonly string[]): UserPrefs {
  const pickedOrder = sourceOrderForTopics(topicAreaIds);
  const collectionSources = collectionSourceIds(prefs.sourceOrder);
  const known = new Set([...pickedOrder, ...collectionSources]);
  const nextOrder = [...pickedOrder];
  for (const id of collectionSources) {
    if (!nextOrder.includes(id)) nextOrder.push(id);
  }
  for (const id of prefs.sourceOrder) {
    if (id.startsWith("c:") && !known.has(id) && !nextOrder.includes(id)) nextOrder.push(id);
  }
  return { ...prefs, sourceOrder: nextOrder };
}

export function shouldShowSetupHint(record: SetupRecord | null): boolean {
  return record?.status === "done" && record.hintDismissed !== true;
}

export function dismissSetupHint(record: SetupRecord): SetupRecord {
  return { ...record, hintDismissed: true };
}