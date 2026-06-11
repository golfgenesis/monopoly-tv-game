// Tiny dependency-free static file server with SPA fallback.
// Usage: node scripts/static.mjs <rootDir> <port>
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";

const root = process.argv[2];
const port = Number(process.argv[3] || 8080);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json"
};

async function send(res, file, status = 200) {
  const data = await readFile(file);
  res.writeHead(status, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  res.end(data);
}

createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    // Block path traversal, then resolve under root.
    const safe = normalize(urlPath).replace(/^(\.\.([/\\]|$))+/, "");
    let file = join(root, safe);
    let info = await stat(file).catch(() => null);
    if (info && info.isDirectory()) {
      file = join(file, "index.html");
      info = await stat(file).catch(() => null);
    }
    if (info && info.isFile()) return await send(res, file);
    // Single-page-app fallback.
    return await send(res, join(root, "index.html"));
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(port, "0.0.0.0", () => console.log(`[static] ${root} → http://0.0.0.0:${port}`));
