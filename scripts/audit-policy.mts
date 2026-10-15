/**
 * Dependency-audit policy for CI (`npm run audit:ci`).
 *
 * Fails on any `high`+ advisory, like `npm audit --audit-level=high`, except
 * advisories listed in ACCEPTED below. An exception must be dev-only (it never
 * ships in the production bundle), name its advisory, say why no fix applies,
 * and expire. Once it expires, or once the advisory reaches a production
 * dependency, it fails again.
 */
import { execFileSync } from "node:child_process";

interface Accepted {
  advisory: string;
  expires: string;
  reason: string;
}

const ACCEPTED: Accepted[] = [
  {
    advisory: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
    expires: "2026-11-15",
    reason:
      "braces (all versions) via micromatch/fast-glob in @next/eslint-plugin-next; lint-only, no patched release. npm's only fix downgrades eslint-config-next to 14.",
  },
];

const FAILING = new Set(["high", "critical"]);

interface Vulnerability {
  severity: string;
  via: (string | { url?: string; severity?: string })[];
}

function audit(omitDev: boolean): Record<string, Vulnerability> {
  const args = ["audit", "--json", ...(omitDev ? ["--omit=dev"] : [])];
  let out: string;
  try {
    out = execFileSync("npm", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
    out = (error as { stdout?: string }).stdout ?? "";
  }
  return (JSON.parse(out) as { vulnerabilities?: Record<string, Vulnerability> }).vulnerabilities ?? {};
}

/** High+ advisory URLs a package is directly flagged for (not ones inherited through `via`). */
function advisories(vulnerability: Vulnerability): string[] {
  return vulnerability.via.flatMap((v) => (typeof v === "object" && v.url && FAILING.has(v.severity ?? "") ? [v.url] : []));
}

const today = new Date().toISOString().slice(0, 10);
const active = new Map(ACCEPTED.filter((a) => a.expires >= today).map((a) => [a.advisory, a]));
for (const a of ACCEPTED) if (a.expires < today) console.error(`Audit exception expired ${a.expires}: ${a.advisory}`);

const all = audit(false);
const production = audit(true);
const failures: string[] = [];
const accepted = new Set<string>();

for (const [name, vulnerability] of Object.entries(all)) {
  if (!FAILING.has(vulnerability.severity)) continue;
  const own = advisories(vulnerability);
  // Packages flagged only because they depend on a vulnerable package are
  // covered by the root advisory's verdict below.
  if (!own.length) continue;
  for (const url of own) {
    if (active.has(url) && !(name in production)) accepted.add(url);
    else failures.push(`${name} (${vulnerability.severity}) ${url}${name in production ? " [production]" : ""}`);
  }
}

for (const url of accepted) console.log(`Accepted until ${active.get(url)!.expires}: ${url} (${active.get(url)!.reason})`);
if (failures.length) {
  console.error(`\n${failures.length} unaccepted high+ advisor${failures.length === 1 ? "y" : "ies"}:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log("Dependency audit policy: pass");
