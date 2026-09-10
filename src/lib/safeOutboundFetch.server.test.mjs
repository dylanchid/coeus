import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { fetchValidatedHttps, OutboundResponseTooLargeError } from "./safeOutboundFetch.server.ts";

async function withServer(handler, run) {
  const directory = await mkdtemp(join(tmpdir(), "coeus-https-"));
  const keyPath = join(directory, "key.pem");
  const certPath = join(directory, "cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", certPath, "-subj", "/CN=localhost", "-days", "1"], { stdio: "ignore" });
  const server = createServer({ key: await readFile(keyPath), cert: await readFile(certPath) }, handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const prior = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  try {
    await run(new URL(`https://localhost:${port}`));
  } finally {
    if (prior === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prior;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
}

test("fetchValidatedHttps reads a real HTTPS response inside its byte limit", async () => {
  await withServer((_request, response) => response.end("hello"), async (url) => {
    const response = await fetchValidatedHttps(url, "127.0.0.1", 4, {}, 5);
    assert.equal(await response.text(), "hello");
  });
});

test("fetchValidatedHttps aborts a real streaming response once its byte limit is exceeded", async () => {
  await withServer((_request, response) => {
    response.write("1234");
    response.end("5678");
  }, async (url) => {
    await assert.rejects(() => fetchValidatedHttps(url, "127.0.0.1", 4, {}, 4), OutboundResponseTooLargeError);
  });
});
