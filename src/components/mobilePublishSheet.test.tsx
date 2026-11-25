import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { useState } from "react";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/archive" });
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
Object.defineProperty(dom.window.navigator, "clipboard", { configurable: true, value: { writeText: async () => undefined } });

const { cleanup, fireEvent, render, screen, waitFor, within } = await import("@testing-library/react");
const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
const { MobilePublishSheet } = await import("./MobilePublishSheet");
const { createDemoArchive } = await import("@/lib/archive/archiveFixtures");
import type { ArchiveData } from "@/lib/archive";
import type { CollectionPublication, PublicationVisibility } from "@/lib/publications/collectionPublication";

afterEach(() => cleanup());

function archiveWithPrivateHumaneInternet(): ArchiveData {
  const archive = createDemoArchive();
  return {
    ...archive,
    collections: archive.collections.map((collection) =>
      collection.id === "humane-internet" ? { ...collection, visibility: "private" } : collection,
    ),
  };
}

function applyPublishedVisibility(
  data: ArchiveData,
  collectionId: string,
  visibility: PublicationVisibility,
): ArchiveData {
  return {
    ...data,
    collections: data.collections.map((collection) =>
      collection.id === collectionId ? { ...collection, visibility } : collection,
    ),
  };
}

/** Parent shell only supplies archive state; MobilePublishSheet is the component under test. */
function MobilePublishParent() {
  const [data, setData] = useState(archiveWithPrivateHumaneInternet);
  const selected = data.collections.find((collection) => collection.id === "humane-internet");

  const onPublish = async (visibility: PublicationVisibility) => {
    const published = {
      id: "publication-1",
      slug: "humane-internet",
      visibility,
      collectionLocalId: "humane-internet",
    } as CollectionPublication;
    setData((current) => applyPublishedVisibility(current, "humane-internet", visibility));
    return published;
  };

  return (
    <>
      <p className="archive-eyebrow">
        {selected ? `${selected.kind} collection · ${selected.visibility}` : ""}
      </p>
      <MobilePublishSheet
        open
        onClose={() => undefined}
        data={data}
        collectionId="humane-internet"
        setCollectionId={() => undefined}
        selectedCollection={selected}
        onCreateCollection={() => undefined}
        onOpenPasteLinks={() => undefined}
        onOpenSelectItems={() => undefined}
        authSignedIn
        waitingForSync={false}
        publication={undefined}
        busy={false}
        signInHref="/signin"
        onPublish={onPublish}
      />
    </>
  );
}

test("Mobile publish sheet reflects updated collection visibility after publish", async () => {
  const router = { push: () => undefined, replace: () => undefined, refresh: () => undefined, back: () => undefined, forward: () => undefined, prefetch: () => undefined };
  render(
    <AppRouterContext.Provider value={router as never}>
      <MobilePublishParent />
    </AppRouterContext.Provider>,
  );
  assert.match(screen.getByText(/personal collection · private/).textContent ?? "", /private/);
  const sheet = within(await screen.findByRole("dialog", { name: "Publish collection" }));
  fireEvent.click(sheet.getByRole("button", { name: /humane internet/i }));
  fireEvent.click(sheet.getByRole("button", { name: "Continue" }));
  fireEvent.click(sheet.getByRole("button", { name: "Continue" }));
  fireEvent.click(sheet.getByRole("radio", { name: "Published" }));
  fireEvent.click(sheet.getByRole("button", { name: "Publish" }));
  await screen.findByText(/Published at \/c\/humane-internet/);
  await waitFor(() => assert.match(screen.getByText(/personal collection · public/).textContent ?? "", /public/));
});