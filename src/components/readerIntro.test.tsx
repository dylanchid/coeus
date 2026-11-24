import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { JSDOM } from "jsdom";

const hookPath = join(tmpdir(), "coeus-next-navigation-ssr-hook.mjs");
writeFileSync(
  hookPath,
  `export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/navigation") {
    const body =
      "export function useRouter(){return{push(){},replace(){},refresh(){},back(){},forward(){},prefetch(){}};}" +
      "export function usePathname(){return '/sources';}" +
      "export function useSearchParams(){return new URLSearchParams();}";
    return { url: "data:text/javascript," + encodeURIComponent(body), shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
`,
);
register(hookPath, import.meta.url);

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});

Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  CustomEvent: dom.window.CustomEvent,
  Event: dom.window.Event,
  KeyboardEvent: dom.window.KeyboardEvent,
  getComputedStyle: dom.window.getComputedStyle,
  localStorage: dom.window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
dom.window.requestAnimationFrame = (callback) => {
  callback(0);
  return 1;
};
dom.window.cancelAnimationFrame = () => undefined;
globalThis.fetch = async () => new Response(null, { status: 401 });

const React = await import("react");
const { renderToString } = await import("react-dom/server");
const { ReaderIntro } = await import("./ReaderIntro");
const { SourcesApp } = await import("./DiscoverSourcesApp");
const { AppProviders } = await import("./AppProviders");

test("ReaderIntro renderToString includes intro and navigation links", () => {
  const html = renderToString(React.createElement(ReaderIntro));
  assert.match(html, /A personal front page for the open web/);
  assert.match(html, /Published collections/);
  assert.match(html, /Browse/);
  assert.ok(html.includes("111"));
  assert.match(html, /Loading your sources/);
  assert.match(html, /href="\/c"/);
  assert.match(html, /href="\/sources"/);
});

test("SourcesApp pre-hydration render lists the catalog with disabled Add controls", () => {
  const html = renderToString(
    React.createElement(AppProviders, null, React.createElement(SourcesApp)),
  );
  assert.match(html, /Literary Hub/);
  assert.match(html, /Aeon/);
  assert.match(html, /Hacker News/);
  assert.doesNotMatch(html, /Loading source directory/);
  assert.match(html, /\+ Add/);
  assert.match(html, /aria-disabled="true"/);
});