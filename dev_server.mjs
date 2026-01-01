import http from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8000);
const POLL_INTERVAL = 500;

let version = 0;

async function walkFiles(dir, files = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function snapshotMtime(root) {
  const files = await walkFiles(root);
  let newest = 0;
  for (const file of files) {
    if (file.endsWith(".pyc")) continue;
    try {
      const stat = await fs.stat(file);
      newest = Math.max(newest, stat.mtimeMs);
    } catch {
      // ignore transient file errors
    }
  }
  return newest;
}

async function watchFiles() {
  let lastMtime = await snapshotMtime(ROOT);
  setInterval(async () => {
    const current = await snapshotMtime(ROOT);
    if (current > lastMtime) {
      lastMtime = current;
      version += 1;
    }
  }, POLL_INTERVAL);
}

const mimeTypes = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".ttf": "font/ttf",
};

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end();
    return;
  }

  if (req.url === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    let lastSeen = -1;
    const interval = setInterval(() => {
      if (version !== lastSeen) {
        lastSeen = version;
        res.write(`data: ${version}\n\n`);
      }
    }, POLL_INTERVAL);
    req.on("close", () => clearInterval(interval));
    return;
  }

  const cleanUrl = req.url.split("?")[0];
  const requestedPath = cleanUrl === "/" ? "/index.html" : cleanUrl;
  const filePath = path.join(ROOT, requestedPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

watchFiles();
server.listen(PORT, () => {
  console.log(`Serving ${ROOT} on http://localhost:${PORT}`);
});
