export type DestinationKind = "obsidian_git" | "notion";
export type DestinationStatus = "active" | "auth_error" | "disabled";
export type DestinationDeliveryStatus =
  | "pending"
  | "delivered"
  | "failed_retryable"
  | "failed_auth"
  | "deleted_remote";

export interface ObsidianGitConfig {
  repo: string;
  branch: string;
  pathPrefix: string;
}

export interface NotionConfig {
  databaseId: string;
  workspaceName: string;
}

export interface Destination {
  id: string;
  archiveId: string;
  kind: DestinationKind;
  status: DestinationStatus;
  displayName: string;
  config: ObsidianGitConfig | NotionConfig;
  createdAt: string;
  updatedAt: string;
}

/** One item's delivery watermark for a destination, driven off ArchiveSyncSnapshot.entityVersions. */
export interface DestinationDelivery {
  destinationId: string;
  itemId: string;
  externalRef: string | null;
  lastDeliveredRevision: number;
  status: DestinationDeliveryStatus;
  lastAttemptedAt: string | null;
  lastError: string | null;
  lastHttpStatus: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const GIT_REF_PATTERN = /^[^\s~^:?*[\\]+$/;

export type ObsidianGitConfigParseResult =
  | { ok: true; value: ObsidianGitConfig }
  | { ok: false; error: string };

/** Runtime validation for the non-secret Obsidian/GitHub connect form. */
export function parseObsidianGitConfig(raw: unknown): ObsidianGitConfigParseResult {
  if (!isRecord(raw)) return { ok: false, error: "Obsidian config must be a JSON object" };
  const allowed = new Set(["repo", "branch", "pathPrefix"]);
  const unknownField = Object.keys(raw).find((key) => !allowed.has(key));
  if (unknownField) return { ok: false, error: `Unknown obsidian config field: ${unknownField}` };
  if (!isNonEmptyString(raw.repo, 200) || !REPO_PATTERN.test(raw.repo)) {
    return { ok: false, error: "repo must look like owner/name" };
  }
  const branch = raw.branch === undefined ? "main" : raw.branch;
  if (!isNonEmptyString(branch, 200) || !GIT_REF_PATTERN.test(branch)) {
    return { ok: false, error: "branch is invalid" };
  }
  const pathPrefix = raw.pathPrefix === undefined ? "" : raw.pathPrefix;
  if (!isBoundedString(pathPrefix, 200) || pathPrefix.startsWith("/") || pathPrefix.includes("..")) {
    return { ok: false, error: "pathPrefix is invalid" };
  }
  return { ok: true, value: { repo: raw.repo, branch, pathPrefix } };
}

export type NotionConfigParseResult =
  | { ok: true; value: NotionConfig }
  | { ok: false; error: string };

/** Runtime validation for the non-secret Notion config recorded by the OAuth callback. */
export function parseNotionConfig(raw: unknown): NotionConfigParseResult {
  if (!isRecord(raw)) return { ok: false, error: "Notion config must be a JSON object" };
  const allowed = new Set(["databaseId", "workspaceName"]);
  const unknownField = Object.keys(raw).find((key) => !allowed.has(key));
  if (unknownField) return { ok: false, error: `Unknown notion config field: ${unknownField}` };
  if (!isNonEmptyString(raw.databaseId, 100)) return { ok: false, error: "databaseId must be a non-empty string" };
  const workspaceName = raw.workspaceName === undefined ? "" : raw.workspaceName;
  if (!isBoundedString(workspaceName, 200)) return { ok: false, error: "workspaceName is invalid" };
  return { ok: true, value: { databaseId: raw.databaseId, workspaceName } };
}
