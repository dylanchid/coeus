import assert from "node:assert/strict";
import test from "node:test";
import { defaultSourceOrder } from "../feeds/sources.ts";
import {
  applyTopicPicks,
  prefsDifferOnlyByCollectionSources,
  shouldOfferSetup,
} from "./firstRun.ts";

function firstVisitPrefs() {
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

const baseline = firstVisitPrefs();

test("applyTopicPicks keeps collection sources", () => {
  const prefs = {
    ...baseline,
    sourceOrder: [...baseline.sourceOrder, "c:demo-collection"],
  };
  const next = applyTopicPicks(prefs, ["culture"]);
  assert.ok(next.sourceOrder.includes("c:demo-collection"));
  assert.ok(next.sourceOrder.includes("lithub"));
});

test("prefsDifferOnlyByCollectionSources accepts follow-only diffs", () => {
  const prefs = {
    ...baseline,
    sourceOrder: [...baseline.sourceOrder, "c:followed"],
  };
  assert.equal(prefsDifferOnlyByCollectionSources(prefs), true);
  assert.equal(prefsDifferOnlyByCollectionSources({ ...prefs, theme: "dark" }), false);
});

test("shouldOfferSetup gate truth table", () => {
  const signedIn = { signedInWithProfile: true, hasStoredPrefs: false, storedPrefsParseable: true, mergedPrefs: baseline };
  assert.equal(
    shouldOfferSetup({
      setupRaw: null,
      hasLegacyBareagaKey: false,
      hasLegacyBrpKey: false,
      ...signedIn,
    }),
    false
  );

  assert.equal(
    shouldOfferSetup({
      setupRaw: JSON.stringify({ version: 1, status: "in_progress", step: 2, topicAreaIds: ["culture"] }),
      hasStoredPrefs: true,
      hasLegacyBareagaKey: false,
      hasLegacyBrpKey: false,
      storedPrefsParseable: true,
      mergedPrefs: { ...baseline, sourceOrder: ["lithub", "parisreview"] },
      signedInWithProfile: false,
    }),
    true
  );

  assert.equal(
    shouldOfferSetup({
      setupRaw: JSON.stringify({ version: 1, status: "skipped" }),
      hasStoredPrefs: false,
      hasLegacyBareagaKey: false,
      hasLegacyBrpKey: false,
      storedPrefsParseable: true,
      mergedPrefs: baseline,
      signedInWithProfile: false,
    }),
    false
  );

  assert.equal(
    shouldOfferSetup({
      setupRaw: null,
      hasStoredPrefs: true,
      hasLegacyBareagaKey: true,
      hasLegacyBrpKey: false,
      storedPrefsParseable: false,
      mergedPrefs: null,
      signedInWithProfile: false,
    }),
    false
  );

  assert.equal(
    shouldOfferSetup({
      setupRaw: null,
      hasStoredPrefs: true,
      hasLegacyBareagaKey: false,
      hasLegacyBrpKey: false,
      storedPrefsParseable: false,
      mergedPrefs: null,
      signedInWithProfile: false,
    }),
    false
  );

  assert.equal(
    shouldOfferSetup({
      setupRaw: null,
      hasStoredPrefs: true,
      hasLegacyBareagaKey: false,
      hasLegacyBrpKey: false,
      storedPrefsParseable: true,
      mergedPrefs: { ...baseline, limit: 15 },
      signedInWithProfile: false,
    }),
    false
  );

  assert.equal(
    shouldOfferSetup({
      setupRaw: null,
      hasStoredPrefs: false,
      hasLegacyBareagaKey: false,
      hasLegacyBrpKey: false,
      storedPrefsParseable: true,
      mergedPrefs: baseline,
      signedInWithProfile: false,
    }),
    true
  );

  assert.equal(
    shouldOfferSetup({
      setupRaw: null,
      hasStoredPrefs: true,
      hasLegacyBareagaKey: false,
      hasLegacyBrpKey: false,
      storedPrefsParseable: true,
      mergedPrefs: {
        ...baseline,
        sourceOrder: [...baseline.sourceOrder, "c:curator"],
      },
      signedInWithProfile: false,
    }),
    true
  );
});