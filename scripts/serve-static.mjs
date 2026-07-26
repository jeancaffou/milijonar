import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(scriptDir, "..", "_site");
const defaultDocument = "index.html";
const notFoundDocument = path.join(outputDir, "404.html");

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
]);

function contentType(filePath) {
  return mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
}

async function fileMetadata(filePath) {
  try {
    return await stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }
}

async function resolveRequestPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const candidate = path.resolve(outputDir, `.${decoded}`);
  if (candidate !== outputDir && !candidate.startsWith(`${outputDir}${path.sep}`)) return null;

  const metadata = await fileMetadata(candidate);
  if (metadata?.isDirectory()) return path.join(candidate, defaultDocument);
  if (metadata?.isFile()) return candidate;

  if (!path.extname(candidate)) {
    const indexCandidate = path.join(candidate, defaultDocument);
    if ((await fileMetadata(indexCandidate))?.isFile()) return indexCandidate;
  }
  return null;
}

function sendFile(response, filePath, statusCode, method) {
  response.writeHead(statusCode, {
    "Content-Type": contentType(filePath),
    "Cache-Control": "no-cache",
  });
  if (method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath)
    .on("error", () => {
      if (!response.headersSent) response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Unable to read the requested file.\n");
    })
    .pipe(response);
}

if (!(await fileMetadata(path.join(outputDir, defaultDocument)))?.isFile()) {
  console.error("The built catalogue is missing. Run `npm run build` once, then retry `npm run serve`.");
  process.exitCode = 1;
} else {
  const requestedPort = Number.parseInt(process.env.CATALOG_PORT || "8080", 10);
  const port = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : 8080;
  const host = process.env.CATALOG_HOST || "127.0.0.1";

  const server = createServer(async (request, response) => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, HEAD" });
        response.end("Method not allowed.\n");
        return;
      }

      const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
      const filePath = await resolveRequestPath(url.pathname);
      if (filePath) {
        sendFile(response, filePath, 200, request.method);
        return;
      }

      if ((await fileMetadata(notFoundDocument))?.isFile()) {
        sendFile(response, notFoundDocument, 404, request.method);
        return;
      }
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found.\n");
    } catch (error) {
      console.error(error);
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Internal server error.\n");
    }
  });

  server.listen(port, host, () => {
    console.log(`Milijonar catalogue preview: http://${host}:${port}/sl/`);
    console.log(`English catalogue: http://${host}:${port}/en/`);
    console.log("This preview does not watch or rebuild files. Press Ctrl+C to stop it.");
  });

  const close = () => server.close(() => process.exit(0));
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}
