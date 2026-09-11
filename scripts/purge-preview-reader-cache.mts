import { purgeCachedReaderViewsForDomain } from "../src/lib/readerViewCache.server.ts";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const domain = process.argv[2];
if (!domain) {
  throw new Error("Usage: npm run purge:preview-reader-cache -- publisher.example");
}
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error("BLOB_READ_WRITE_TOKEN is required to purge persisted reader excerpts");
}

const removed = await purgeCachedReaderViewsForDomain(domain);
console.log(`Removed ${removed} cached reader excerpt${removed === 1 ? "" : "s"} for ${domain}.`);
