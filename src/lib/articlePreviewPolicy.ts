export const PREVIEW_AGENT = "CoeusPreview";

export function isPreviewOptedOut(hostname: string, domains: string[]): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return domains.some((domain) => {
    const normalized = domain.trim().toLowerCase().replace(/^\./, "");
    return normalized && (host === normalized || host.endsWith(`.${normalized}`));
  });
}

type RobotsRule = { allow: boolean; path: string };
type RobotsGroup = { agents: string[]; rules: RobotsRule[] };

function robotsGroups(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let group: RobotsGroup | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) { group = null; continue; }
    const match = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();
    if (field === "user-agent") {
      if (!group || group.rules.length) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && group && value) {
      group.rules.push({ allow: field === "allow", path: value });
    }
  }
  return groups;
}

function ruleMatches(path: string, rule: string): boolean {
  const anchored = rule.endsWith("$");
  const escaped = rule.slice(0, anchored ? -1 : undefined).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`).test(path);
}

/** Implements the Allow/Disallow precedence needed for CoeusPreview robots compliance. */
export function robotsAllowsUrl(robotsText: string, url: URL, userAgent = PREVIEW_AGENT): boolean {
  const target = `${url.pathname}${url.search}`;
  const agent = userAgent.toLowerCase();
  const groups = robotsGroups(robotsText);
  const exact = groups.filter((group) => group.agents.includes(agent));
  const wildcard = groups.filter((group) => group.agents.includes("*"));
  const applicable = exact.length ? exact : wildcard;
  const matches = applicable.flatMap((group) => group.rules).filter((rule) => ruleMatches(target, rule.path));
  if (!matches.length) return true;
  matches.sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return matches[0].allow;
}

/** Honors explicit page-level instructions in addition to robots.txt. */
export function pageDisallowsPreview(html: string, headers: Headers): boolean {
  const header = headers.get("x-robots-tag") ?? "";
  const meta = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .filter((match) => /(?:name|http-equiv)\s*=\s*["']?(?:robots|coeus-preview)["']?(?:\s|>|\/)/i.test(match[0]))
    .map((match) => /content\s*=\s*["']([^"']*)["']/i.exec(match[0])?.[1] ?? "")
    .join(",");
  return /\b(?:none|noindex|noimageindex|nosnippet|noarchive|no-preview)\b/i.test(`${header},${meta}`);
}

/** Conservative detection for common publisher-declared access restrictions. */
export function pageAppearsAccessRestricted(html: string, headers: Headers): boolean {
  if (headers.has("www-authenticate")) return true;
  const declaresPaidStructuredData = /isAccessibleForFree/i.test(html) && /(?:content\s*=\s*["']?(?:false|0)|[:=]\s*(?:false|0))/i.test(html);
  return declaresPaidStructuredData || /(?:paywall|content[_-]?tier)["']?\s*[:=]\s*["']?(?:premium|paid|subscriber)/i.test(html);
}

/**
 * Produces inert markup for the renderer. The original document is fetched
 * server-side; it is never navigated to by Chromium, and all subrequests are
 * blocked. Remove whole executable/fallback blocks rather than just their
 * tags—otherwise analytics/config JavaScript becomes visible page text.
 */
export function prepareStaticPreviewHtml(html: string, baseUrl: string): string {
  const stylesheets = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /\brel\s*=\s*["']?[^"'>]*\bstylesheet\b/i.test(tag))
    .join("");
  const stripped = html
    .replace(/<(?:script|template|noscript)\b[^>]*>[\s\S]*?<\/(?:script|template|noscript)\s*>/gi, "")
    .replace(/<\/?(?:iframe|frame|object|embed|form|video|audio|source|track|link|base)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  const safeBaseUrl = baseUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<!doctype html><html><head><meta charset="utf-8"><base href="${safeBaseUrl}">${stylesheets}<style>
    html { background:#fff; color:#161616; } body { margin: 28px; max-width: 1040px; font: 18px/1.5 system-ui, sans-serif; overflow:hidden; }
    img { max-width:100%; height:auto; } a { color:#164e9b; } pre { white-space:pre-wrap; }
  </style></head><body>${stripped}</body></html>`;
}
