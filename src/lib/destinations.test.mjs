import assert from "node:assert/strict";
import test from "node:test";

import { parseNotionConfig, parseObsidianGitConfig } from "./destinations.ts";

test("parseObsidianGitConfig accepts a repo with defaults for branch and pathPrefix", () => {
  const result = parseObsidianGitConfig({ repo: "acme/vault" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { repo: "acme/vault", branch: "main", pathPrefix: "" });
});

test("parseObsidianGitConfig accepts an explicit branch and pathPrefix", () => {
  const result = parseObsidianGitConfig({ repo: "acme/vault", branch: "sync", pathPrefix: "bareaga" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { repo: "acme/vault", branch: "sync", pathPrefix: "bareaga" });
});

test("parseObsidianGitConfig rejects a malformed repo", () => {
  assert.equal(parseObsidianGitConfig({ repo: "not-a-repo" }).ok, false);
  assert.equal(parseObsidianGitConfig({ repo: "" }).ok, false);
  assert.equal(parseObsidianGitConfig({}).ok, false);
});

test("parseObsidianGitConfig rejects a pathPrefix that escapes the repo", () => {
  assert.equal(parseObsidianGitConfig({ repo: "acme/vault", pathPrefix: "/abs" }).ok, false);
  assert.equal(parseObsidianGitConfig({ repo: "acme/vault", pathPrefix: "../up" }).ok, false);
});

test("parseObsidianGitConfig rejects unknown fields", () => {
  assert.equal(parseObsidianGitConfig({ repo: "acme/vault", extra: true }).ok, false);
});

test("parseObsidianGitConfig rejects a non-object", () => {
  assert.equal(parseObsidianGitConfig(null).ok, false);
  assert.equal(parseObsidianGitConfig("acme/vault").ok, false);
});

test("parseNotionConfig accepts a databaseId with an optional workspaceName", () => {
  const result = parseNotionConfig({ databaseId: "db-1", workspaceName: "Acme" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { databaseId: "db-1", workspaceName: "Acme" });
});

test("parseNotionConfig defaults workspaceName to an empty string", () => {
  const result = parseNotionConfig({ databaseId: "db-1" });
  assert.equal(result.ok, true);
  assert.equal(result.value.workspaceName, "");
});

test("parseNotionConfig rejects a missing databaseId", () => {
  assert.equal(parseNotionConfig({}).ok, false);
  assert.equal(parseNotionConfig({ databaseId: "" }).ok, false);
});

test("parseNotionConfig rejects unknown fields", () => {
  assert.equal(parseNotionConfig({ databaseId: "db-1", extra: 1 }).ok, false);
});
