// Local preview of the static export.
//
// If next.config.ts sets a basePath, every asset in the exported HTML is requested
// under that prefix, so serving out/ at "/" loads the page but 404s all CSS and JS.
// The prefix is read back out of the built HTML rather than hardcoded, so this keeps
// working whatever basePath is configured - including none at all.

import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(process.cwd(), "out");
const PORT = Number(process.env.PORT ?? 4000);

const detectBasePath = async () => {
    try {
        const html = await readFile(join(ROOT, "index.html"), "utf8");
        return html.match(/(?:href|src)="([^"]*)\/_next\//)?.[1] ?? "";
    } catch {
        console.error("out/ not found - run `npm run build` first.");
        process.exit(1);
    }
};

const BASE_PATH = await detectBasePath();

const CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".avif": "image/avif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
};

const resolveFile = async (urlPath) => {
    // Strip the base path, then keep the result inside out/ no matter what was requested.
    const withoutBase =
        BASE_PATH && urlPath.startsWith(BASE_PATH)
            ? urlPath.slice(BASE_PATH.length) || "/"
            : urlPath;
    const safe = normalize(decodeURIComponent(withoutBase)).replace(/^(\.\.[/\\])+/, "");
    const candidates =
        safe === "/" || safe.endsWith("/")
            ? [join(ROOT, safe, "index.html")]
            : [join(ROOT, safe), join(ROOT, `${safe}.html`), join(ROOT, safe, "index.html")];

    for (const candidate of candidates) {
        if (!candidate.startsWith(ROOT)) continue;
        try {
            const info = await stat(candidate);
            if (info.isFile()) return candidate;
        } catch {
            // try the next candidate
        }
    }
    return null;
};

const server = createServer(async (request, response) => {
    const urlPath = new URL(request.url ?? "/", "http://localhost").pathname;

    if (BASE_PATH && urlPath === "/") {
        response.writeHead(302, { Location: `${BASE_PATH}/` });
        response.end();
        return;
    }

    const file = await resolveFile(urlPath);
    if (!file) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end(`404 - not found in out/ (try ${BASE_PATH}/)`);
        return;
    }

    response.writeHead(200, {
        "Content-Type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
    });
    createReadStream(file).pipe(response);
});

server.listen(PORT, () => {
    console.log(`Preview of out/ ready on http://localhost:${PORT}${BASE_PATH}/`);
});
