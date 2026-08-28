import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { Readable } from "node:stream";
import worker from "../dist/server/index.js";

const host = process.env.PREVIEW_HOST ?? "127.0.0.1";
const port = Number(process.env.PREVIEW_PORT ?? "4190");
const clientRoot = join(import.meta.dirname, "..", "dist", "client");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function assetResponse(request) {
  const url = new URL(request.url);
  const relativePath = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  const filePath = join(clientRoot, relativePath);
  if (!filePath.startsWith(clientRoot) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    return new Response("Not found", { status: 404 });
  }
  const body = Readable.toWeb(createReadStream(filePath));
  return new Response(body, { headers: { "content-type": mimeTypes[extname(filePath)] ?? "application/octet-stream" } });
}

const server = createServer(async (incoming, outgoing) => {
  const url = `http://${incoming.headers.host ?? `${host}:${port}`}${incoming.url ?? "/"}`;
  const request = new Request(url, { method: incoming.method, headers: incoming.headers, body: incoming.method === "GET" || incoming.method === "HEAD" ? undefined : Readable.toWeb(incoming), duplex: "half" });
  const response = await worker.fetch(request, { ASSETS: { fetch: assetResponse } }, { waitUntil() {}, passThroughOnException() {} });
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
  else outgoing.end();
});

server.listen(port, host, () => console.log(`RISK-ZERO preview: http://${host}:${port}`));
