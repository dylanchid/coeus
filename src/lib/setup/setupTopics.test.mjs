import assert from "node:assert/strict";
import test from "node:test";
import {
  SETUP_TOPIC_AREAS,
  setupAreaSourceCount,
  setupAreasReferenceCatalog,
  sourceOrderForTopics,
} from "./setupTopics.ts";
import { catalogSourceIds } from "../feeds/sources.ts";

const known = new Set(catalogSourceIds());

test("setup exposes eight subject areas with 3–5 catalog sources each", () => {
  assert.equal(SETUP_TOPIC_AREAS.length, 8);
  for (const area of SETUP_TOPIC_AREAS) {
    assert.ok(area.sourceIds.length >= 3 && area.sourceIds.length <= 5);
    for (const id of area.sourceIds) {
      assert.ok(known.has(id), `${area.id} lists unknown id ${id}`);
    }
  }
  assert.equal(setupAreasReferenceCatalog(), true);
});

test("sourceOrderForTopics de-duplicates restofworld and keeps curator worlds first", () => {
  const order = sourceOrderForTopics(["business", "news", "tech"]);
  assert.equal(order.filter((id) => id === "restofworld").length, 1);
  assert.ok(order.indexOf("restofworld") < order.indexOf("hn"));
});

test("Culture and History picks match the acceptance source order", () => {
  const order = sourceOrderForTopics(["culture", "history"]);
  assert.deepEqual(order, [
    "lithub",
    "parisreview",
    "longreads",
    "electricliterature",
    "nprmusic",
    "publicdomainreview",
    "jstordaily",
    "smithsonianmag",
    "atlasobscura",
  ]);
});

test("unique setup catalog references", () => {
  assert.equal(setupAreaSourceCount(), new Set(SETUP_TOPIC_AREAS.flatMap((a) => a.sourceIds)).size);
});