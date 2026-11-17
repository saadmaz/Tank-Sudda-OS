// Production server for Tank Sudda OS: serves the built client assets and hands every other
// request to the TanStack Start handler. Runs inside the Cloudflare Container
// (see Dockerfile and worker/index.ts); configuration comes from environment
// variables set by the container platform.
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const CLIENT_DIR = join(ROOT, "dist", "client");
const SERVER_ENTRY = new URL("./dist/server/server.js", import.meta.url).href;
const PORT = Number(process.env.PORT || 8080);

// Local emulators only (e2e runs); never set in production.
const EMULATOR_CONNECT_SRC = [
  process.env.FIRESTORE_EMULATOR_HOST,
  process.env.FIREBASE_AUTH_EMULATOR_HOST,
  process.env.FIREBASE_STORAGE_EMULATOR_HOST,
]
  .filter(Boolean)
  .map((h) => ` http://${h}`)
  .join("");
const EMULATOR_IMG_SRC = process.env.FIREBASE_STORAGE_EMULATOR_HOST
  ? ` http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`
  : "";

const CSP = [
  "default-src 'self'",
  // Vite's hydration runtime needs inline scripts in production builds.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // Firebase SDKs: Firestore, Auth, Storage and realtime WebSockets.
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebase.google.com https://*.appspot.com" +
    EMULATOR_CONNECT_SRC,
  "img-src 'self' data: blob: https://storage.googleapis.com https://*.appspot.com" +
    EMULATOR_IMG_SRC,
  "font-src 'self' https://fonts.gstatic.com",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function applySecurityHeaders(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("Content-Security-Policy", CSP);
  if (req.headers["x-forwarded-proto"] === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

const MIME_TYPES = {
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain",
  ".xml": "application/xml",
};

const { default: handler } = await import(SERVER_ENTRY);
if (!handler || typeof handler.fetch !== "function") {
  console.error("[startup] The server build does not export a fetch handler");
  process.exit(1);
}

const server = createServer(async (req, res) => {
  try {
    const rawPath = new URL(req.url, "http://localhost").pathname;
    let urlPath;
    try {
      urlPath = decodeURIComponent(rawPath);
    } catch {
      urlPath = rawPath;
    }
    // Resolve, then confirm the file is still inside the client directory.
    const filePath = resolve(CLIENT_DIR, "." + urlPath);
    const inClientDir = filePath === CLIENT_DIR || filePath.startsWith(CLIENT_DIR + sep);

    if (inClientDir && existsSync(filePath) && statSync(filePath).isFile()) {
      applySecurityHeaders(req, res);
      res.setHeader("Content-Type", MIME_TYPES[extname(filePath)] || "application/octet-stream");
      if (urlPath.startsWith("/assets/")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
      createReadStream(filePath).pipe(res);
      return;
    }

    const proto = req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const url = new URL(req.url, `${proto}://${req.headers.host || "localhost"}`);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body =
      chunks.length && req.method !== "GET" && req.method !== "HEAD"
        ? Buffer.concat(chunks)
        : undefined;

    const response = await handler.fetch(
      new Request(url, { method: req.method, headers: req.headers, body }),
      {},
      {},
    );
    res.statusCode = response.status;
    applySecurityHeaders(req, res);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      Readable.fromWeb(response.body)
        .on("error", (err) => {
          console.error("[stream]", err.message);
          if (!res.writableEnded) res.destroy(err);
        })
        .pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    console.error("[request]", err.stack || err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[startup] Tank Sudda OS listening on ${PORT}`);
  // Warm firebase-admin and the login path as soon as the instance starts.
  Promise.resolve(handler.fetch(new Request("http://127.0.0.1/healthz"), {}, {}))
    .then((r) => console.log("[startup] warm-up /healthz ->", r.status))
    .catch((e) => console.warn("[startup] warm-up failed:", e?.message));
});
