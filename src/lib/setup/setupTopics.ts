import { SOURCE_CATALOG, catalogSourceIds } from "../feeds/sources.ts";

export type SetupTopicArea = {
  id: string;
  label: string;
  sourceIds: readonly string[];
};

/** Guided setup: eight curator-facing worlds with starter sources from the catalog. */
export const SETUP_TOPIC_AREAS: readonly SetupTopicArea[] = [
  {
    id: "tech",
    label: "Technology",
    sourceIds: ["hn", "arstechnica", "wired", "krebsonsecurity", "mittechreview"],
  },
  {
    id: "news",
    label: "News & politics",
    sourceIds: ["guardian", "bbc", "npr", "propublica", "restofworld"],
  },
  {
    id: "business",
    label: "Business & economy",
    sourceIds: ["stratechery", "restofworld", "canarymedia", "cnbc", "fortune"],
  },
  {
    id: "science",
    label: "Science & health",
    sourceIds: ["quanta", "nature", "nasa", "scientificamerican", "stat"],
  },
  {
    id: "culture",
    label: "Culture",
    sourceIds: ["lithub", "parisreview", "longreads", "electricliterature", "nprmusic"],
  },
  {
    id: "arts",
    label: "Arts & design",
    sourceIds: ["hyperallergic", "filmcomment", "dezeen", "pitchfork", "colossal"],
  },
  {
    id: "history",
    label: "History",
    sourceIds: ["publicdomainreview", "jstordaily", "smithsonianmag", "atlasobscura"],
  },
  {
    id: "research",
    label: "Research & ideas",
    sourceIds: ["theconversation", "aeon", "marginalian", "lwn", "cloudflareblog"],
  },
] as const;

const areaById = new Map(SETUP_TOPIC_AREAS.map((area) => [area.id, area]));
const catalogIds = new Set(catalogSourceIds());

for (const area of SETUP_TOPIC_AREAS) {
  if (area.sourceIds.length < 3 || area.sourceIds.length > 5) {
    throw new Error(`Setup area ${area.id} must list 3–5 catalog sources`);
  }
  for (const id of area.sourceIds) {
    if (!catalogIds.has(id)) {
      throw new Error(`Setup area ${area.id} references unknown catalog id: ${id}`);
    }
  }
}

/** De-duplicated source order for the chosen topic areas; curator worlds precede utility feeds. */
export function sourceOrderForTopics(selectedAreaIds: readonly string[]): string[] {
  const curatedOrder = [
    "culture",
    "arts",
    "history",
    "research",
    "science",
    "news",
    "business",
    "tech",
  ];
  const selected = new Set(selectedAreaIds);
  const orderedAreas = curatedOrder
    .filter((id) => selected.has(id))
    .concat([...selected].filter((id) => !curatedOrder.includes(id)));

  const seen = new Set<string>();
  const result: string[] = [];
  for (const areaId of orderedAreas) {
    const area = areaById.get(areaId);
    if (!area) continue;
    for (const sourceId of area.sourceIds) {
      if (seen.has(sourceId)) continue;
      seen.add(sourceId);
      result.push(sourceId);
    }
  }
  return result;
}

export function setupAreaSourceCount(): number {
  return new Set(SETUP_TOPIC_AREAS.flatMap((area) => area.sourceIds)).size;
}

export function setupAreasReferenceCatalog(): boolean {
  return SETUP_TOPIC_AREAS.every((area) =>
    area.sourceIds.every((id) => SOURCE_CATALOG.some((source) => source.id === id))
  );
}