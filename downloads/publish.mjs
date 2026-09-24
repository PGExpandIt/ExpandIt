#!/usr/bin/env node
// Publishes one vallus release to Bunny Storage, behind downloads.vallus.eu.
//
//   node --env-file=.env publish.mjs --version 1.4.1 [--dry-run] [--no-latest] [--force]
//   node --env-file=.env publish.mjs --index-only [--dry-run]
//
// The packages are whatever the pack scripts left in PACKAGES_DIR under the names they
// give them - vallus-rs-playwright-<pw>-<arch>-dist.zip, vallus-rs-slim-<arch>-dist.zip,
// vallus-ts-dist.zip, vallus-browsers-playwright-<from>-<to>-linux-<arch>.tar.gz - and
// they keep those names on the server, under /<version>/.
//
// For each package it computes the SHA-256, uploads to /<version>/ with Bunny's
// `Checksum` header (the storage rejects a body that does not match), then lists the
// directory back and compares. After the packages it writes SHA256SUMS for the
// version, and last of all latest.json - so latest never points at a release whose
// files are not all in place. Then index.html, the page downloads.vallus.eu/ shows:
// Bunny Storage lists nothing on its own, so the list of every published version is
// rebuilt from the storage listing after each run (--index-only rebuilds just that).
//
// A published version is immutable: a file already there with a different checksum
// stops the run, because customers verify against the SHA256SUMS they downloaded and
// air-gapped sites may already have the old bytes. --force overrides that, knowingly.
// A file already there with the same checksum is skipped, so a run that died halfway
// through a 1 GB upload can simply be started again.
//
// No dependencies: node:https streams the body with a Content-Length, which a 1 GB
// package needs - nothing is read into memory.

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/**
 * The site's own favicon (src/app/icon.svg), embedded in index.html as a data URI:
 * the downloads host serves nothing but what publish.mjs uploads, and one copy of the
 * icon means the two sites cannot drift. Null when the file is not there.
 */
const readIcon = () => {
    try {
        return fs.readFileSync(path.resolve(HERE, "..", "src", "app", "icon.svg"), "utf8");
    } catch {
        return null;
    }
};

/** The workspace root, where both runners' pack scripts write their archives. */
const WORKSPACE = path.resolve(HERE, "..", "..");

const VERSION = /^\d+\.\d+\.\d+$/;
const ARCHES = ["amd64", "arm64"];

/** What each CPU architecture means to someone choosing a download. */
export const ARCH_LABELS = {
    amd64: { name: "AMD64 / x86_64", hint: "Intel and AMD: most servers and VPSs, Windows and Linux PCs with Docker Desktop, Intel Macs." },
    arm64: { name: "ARM64", hint: "AWS Graviton, Ampere, Raspberry Pi 64-bit, Apple Silicon Macs, Windows on ARM." },
};

/**
 * What a file is, from its name alone, or null when it is not a package. The names are
 * the pack scripts' own, so the server listing describes itself and the page needs no
 * record of what was uploaded. Order is the order the page lists them in.
 */
export const describePackage = (name) => {
    let m = name.match(/^vallus-rs-playwright-(\d+\.\d+\.\d+)-(amd64|arm64)-dist\.zip$/);
    if (m) return { kind: "rs", order: 1, arch: m[2], playwright: m[1], label: "Rust runner with browsers", note: `Playwright ${m[1]}` };
    m = name.match(/^vallus-rs-slim-(amd64|arm64)-dist\.zip$/);
    if (m) return { kind: "rs-slim", order: 2, arch: m[1], playwright: null, label: "Rust runner (slim)", note: "no browsers - install separately" };
    if (name === "vallus-ts-dist.zip") {
        return { kind: "ts", order: 0, arch: "any", playwright: null, label: "TypeScript runner", note: "any CPU - no browsers, install separately" };
    }
    m = name.match(/^vallus-browsers-playwright-(\d+\.\d+\.\d+)-(\d+\.\d+\.\d+)-linux-(amd64|arm64)\.tar\.gz$/);
    if (m) return { kind: "browsers", order: 3, arch: m[3], playwright: null, label: "Browsers only, no vallus", note: `Playwright ${m[1]} - ${m[2]}` };
    return null;
};

/** The groups the page's table is split into, in order, by package kind. */
const FAMILIES = [
    { title: "Node", kinds: ["ts"] },
    { title: "Rust", kinds: ["rs", "rs-slim"] },
    { title: "Browsers", kinds: ["browsers"] },
];

/** Packages first by kind, then newest Playwright first. */
const comparePackages = (a, b) => {
    const [x, y] = [describePackage(a.name), describePackage(b.name)];
    if (x.order !== y.order) return x.order - y.order;
    if (x.playwright && y.playwright && x.playwright !== y.playwright) return compareVersionsDesc(x.playwright, y.playwright);
    return a.name.localeCompare(b.name);
};

// ── pure helpers (exported for the tests) ─────────────────────────────────────

export const sha256File = (file) =>
    new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha256");
        fs.createReadStream(file)
            .on("error", reject)
            .on("data", (chunk) => hash.update(chunk))
            .on("end", () => resolve(hash.digest("hex")));
    });

/**
 * The version an archive was built as: VERSION (the Rust packages, written by
 * pack-rs.sh) or package.json (the TS package). Null when it carries neither.
 *
 * Checked because the archive names carry no version - vallus-rs-dist.zip is whatever
 * was packed last - and filing a 1.4.0 build under /1.4.1/ would hand customers a
 * download that rejects the very free keys 1.4.1 exists for.
 */
export const readPackageVersion = (zipPath) => {
    const read = (entry) => {
        try {
            return execFileSync("unzip", ["-p", zipPath, entry], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1024 * 1024 });
        } catch {
            return null;
        }
    };
    const plain = read("VERSION")?.trim();
    if (plain) return plain;
    const manifest = read("package.json");
    if (!manifest) return null;
    try {
        return JSON.parse(manifest).version ?? null;
    } catch {
        return null;
    }
};

/**
 * The Playwright version a full Rust package carries browsers for. PLAYWRIGHT (written
 * by pack-rs.sh) when present, else the "carries Playwright v1.60.0-jammy" sentence of
 * README-PACKAGE.md, which packages from before that file have. Null when neither
 * names one - the slim and TypeScript packages carry no browsers.
 */
/** One small text file from inside a zip, or null. */
const readZipEntry = (zipPath, entry) => {
    try {
        return execFileSync("unzip", ["-p", zipPath, entry], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1024 * 1024 });
    } catch {
        return null;
    }
};

/** The architecture a Rust package's image was built for (PLATFORM, e.g. linux/amd64), or null. */
export const readPackagePlatform = (zipPath) => readZipEntry(zipPath, "PLATFORM")?.trim() || null;

export const readPlaywrightVersion = (zipPath) => {
    const read = (entry) => {
        try {
            return execFileSync("unzip", ["-p", zipPath, entry], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1024 * 1024 });
        } catch {
            return null;
        }
    };
    const plain = read("PLAYWRIGHT")?.trim();
    if (plain && VERSION.test(plain)) return plain;
    return read("README-PACKAGE.md")?.match(/carries Playwright v?(\d+\.\d+\.\d+)/)?.[1] ?? null;
};

/** `sha256sum -c` format: lowercase hash, two spaces, file name. */
export const formatSums = (entries) =>
    entries.map(({ sha256, name }) => `${sha256.toLowerCase()}  ${name}`).join("\n") + "\n";

/**
 * What to do with one file, given the directory listing already on the server.
 * "upload" when absent, "skip" when the same bytes are there, "conflict" when other
 * bytes are - which only --force turns into "upload".
 */
export const planFile = (listing, name, sha256, force) => {
    const existing = listing.find((entry) => !entry.IsDirectory && entry.ObjectName === name);
    if (!existing) return "upload";
    if (String(existing.Checksum ?? "").toUpperCase() === sha256.toUpperCase()) return "skip";
    return force ? "upload" : "conflict";
};

export const parseArgs = (argv) => {
    const args = { version: null, dryRun: false, latest: true, force: false, indexOnly: false };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--index-only") args.indexOnly = true;
        else if (arg === "--version") args.version = argv[++i] ?? null;
        else if (arg.startsWith("--version=")) args.version = arg.slice("--version=".length);
        else if (arg === "--dry-run") args.dryRun = true;
        else if (arg === "--no-latest") args.latest = false;
        else if (arg === "--force") args.force = true;
        else throw new Error(`unknown argument: ${arg}`);
    }
    if (args.indexOnly) {
        if (args.version || args.force || !args.latest) throw new Error("--index-only takes no other option than --dry-run");
        return args;
    }
    if (!args.version || !VERSION.test(args.version)) {
        throw new Error("--version X.Y.Z is required, e.g. --version 1.4.1");
    }
    return args;
};

export const loadSettings = (env) => {
    const zone = env.BUNNY_STORAGE_ZONE?.trim();
    const password = env.BUNNY_STORAGE_PASSWORD?.trim();
    if (!zone || !password) throw new Error("set BUNNY_STORAGE_ZONE and BUNNY_STORAGE_PASSWORD (see .env.example)");
    return {
        zone,
        password,
        // Full origin, so a region (https://uk.storage.bunnycdn.com) or a local stand-in
        // for the tests (http://127.0.0.1:port) is a matter of configuration.
        storageUrl: (env.BUNNY_STORAGE_URL?.trim() || "https://storage.bunnycdn.com").replace(/\/$/, ""),
        publicUrl: (env.DOWNLOADS_BASE_URL?.trim() || "https://downloads.vallus.eu").replace(/\/$/, ""),
        // Optional: the account API key, to purge latest.json from the CDN cache.
        apiKey: env.BUNNY_API_KEY?.trim() || null,
        packagesDir: env.PACKAGES_DIR?.trim() || WORKSPACE,
    };
};

/**
 * The oldest version the page lists. Older ones stay on the server - customers may
 * hold links to them - but are not offered: before 1.4.2 no build accepts the free
 * keys the website hands out, and a 1.4.1 package shipped a free key nobody could sign.
 */
export const MIN_LISTED_VERSION = "1.5.0";

/** Newest first, numerically: 1.10.0 above 1.9.0. */
export const compareVersionsDesc = (a, b) => {
    const [x, y] = [a, b].map((v) => v.split(".").map(Number));
    for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return y[i] - x[i];
    return 0;
};

const escapeHtml = (text) =>
    String(text).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const humanSize = (bytes) => {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};


/**
 * The page at downloads.vallus.eu/: every published version, newest first, each with
 * its packages, sizes and SHA256SUMS, and a switch between CPU architectures - AMD64 by
 * default, because that is what most servers are. `releases` is [{ version, files:
 * [{ name, size }], sums }] as read from the storage listing; `latest` is the version
 * latest.json names. Links are relative, so the page works under any host name.
 *
 * The switch is two radio buttons and CSS (:has), so it works without JavaScript; a few
 * lines of script only keep the choice in the address (#arm64) so a link can carry it.
 */
export const renderIndex = ({ releases, latest, icon = readIcon() }) => {
    const sorted = releases
        .filter((release) => compareVersionsDesc(release.version, MIN_LISTED_VERSION) <= 0)
        .sort((a, b) => compareVersionsDesc(a.version, b.version));
    const section = (release) => {
        const packages = release.files.filter((file) => describePackage(file.name)).sort(comparePackages);
        const row = (file) => {
            const info = describePackage(file.name);
            const cls = info.arch === "any" ? "" : ` class="only-${info.arch}"`;
            return `        <tr${cls}>
          <td>${escapeHtml(info.label)}<br><span class="note">${escapeHtml(info.note)}</span></td>
          <td><a href="${escapeHtml(`${release.version}/${file.name}`)}">${escapeHtml(file.name)}</a></td>
          <td class="size">${escapeHtml(humanSize(file.size))}</td>
        </tr>`;
        };
        // One titled group per runner - Node, then Rust - each heading its own rows.
        const rows = FAMILIES.map((family) => {
            const members = packages.filter((file) => family.kinds.includes(describePackage(file.name).kind));
            if (members.length === 0) return "";
            const arches = new Set(members.map((file) => describePackage(file.name).arch));
            // A group present for one architecture only (the browsers) hides with it;
            // a runner group stays and says what is missing for the other.
            const only = !arches.has("any") && arches.size === 1 && family.title === "Browsers" ? ` class="only-${[...arches][0]}"` : "";
            const missing = arches.has("any") || only
                ? ""
                : ARCHES.filter((arch) => !arches.has(arch))
                      .map((arch) => `\n        <tr class="only-${arch}"><td colspan="3" class="none">No ${escapeHtml(ARCH_LABELS[arch].name)} ${escapeHtml(family.title)} packages in this release.</td></tr>`)
                      .join("");
            return `        <tr${only}><th colspan="3" class="group">${escapeHtml(family.title)}</th></tr>\n${members.map(row).join("\n")}${missing}`;
        }).filter(Boolean).join("\n");
        const badge = release.version === latest ? ' <span class="badge">latest</span>' : "";
        const sums = release.sums
            ? `\n      <p class="sums"><a href="${escapeHtml(`${release.version}/SHA256SUMS`)}">SHA256SUMS</a> - verify with <code>sha256sum -c SHA256SUMS</code></p>`
            : "";
        return `    <section id="v${escapeHtml(release.version)}">
      <h2>vallus ${escapeHtml(release.version)}${badge}</h2>
      <table>
        <thead><tr><th>Package</th><th>File</th><th class="size">Size</th></tr></thead>
        <tbody>
${rows}
        </tbody>
      </table>${sums}
    </section>`;
    };
    const body = sorted.length ? sorted.map(section).join("\n") : "    <p>No release has been published yet.</p>";
    // What the machine has to have. The runner itself is small; the browsers are not,
    // and what they cost depends on where a run happens - in a container of its own, or
    // beside the server - not on which runner you took.
    const requirements = `    <section id="requirements">
      <h2>Minimum requirements</h2>
      <table>
        <thead><tr><th>Running tests</th><th>Minimum</th><th>Recommended</th><th>Disk</th></tr></thead>
        <tbody>
        <tr>
          <td>In Docker</td>
          <td>Docker 24+, 2 CPU, 4 GB RAM, one worker per run</td>
          <td>4 CPU, 8 GB RAM; about 1 GB of RAM per parallel worker</td>
          <td>20 GB: ~4 GB per Playwright version it builds a run image for, plus reports and run history</td>
        </tr>
        <tr>
          <td>On the machine itself</td>
          <td>2 CPU, 2 GB RAM, one worker, headless</td>
          <td>2-4 CPU, 4 GB RAM; a browser takes 0.5-1 GB while a test runs</td>
          <td>10 GB: ~2 GB for the browsers (less with Chromium alone), plus reports and run history</td>
        </tr>
        </tbody>
      </table>
      <p class="hint">In Docker means a container per run - the Rust slim package, or either
        runner with the container executor on. On the machine itself means the TypeScript
        runner, or the Rust package with browsers and that executor off. Linux, macOS or
        Windows, on the CPU the package names; the TypeScript runner also needs Node 18+.
        Node test projects install with npm, or with bun when bun is installed on the
        machine running vallus; Playwright itself always runs under Node.
        Keep run history pruned (Admin &gt; System &gt; retention) so reports do not fill the disk.</p>
    </section>`;
    const switchHtml = ARCHES.map(
        (arch, i) => `      <input type="radio" name="arch" id="arch-${arch}" value="${arch}"${i === 0 ? " checked" : ""}>
      <label for="arch-${arch}">${escapeHtml(ARCH_LABELS[arch].name)}</label>`,
    ).join("\n");
    const hints = ARCHES.map((arch) => `    <p class="hint only-${arch}">${escapeHtml(ARCH_LABELS[arch].hint)}</p>`).join("\n");
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>vallus downloads</title>${icon ? `\n  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${escapeHtml(encodeURIComponent(icon.trim()))}">` : ""}
  <meta name="description" content="Download vallus, the self-hosted Playwright test runner: every release for AMD64 and ARM64, with checksums.">
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; background: #100f0d; color: #f2f0ea; font: 15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
    main { max-width: 900px; margin: 0 auto; padding: 48px 20px 64px; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    h2 { font-size: 18px; margin: 40px 0 12px; }
    p { color: #a29c91; margin: 8px 0; }
    a { color: #7dd3a0; }
    a:hover { color: #4ea87a; }
    table { width: 100%; border-collapse: collapse; background: #1c1a17; border: 1px solid #2c2925; border-radius: 8px; overflow: hidden; }
    th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid #2c2925; vertical-align: top; }
    th { color: #a29c91; font-weight: 500; font-size: 13px; }
    tr:last-child td { border-bottom: 0; }
    td a { white-space: nowrap; }
    .size { text-align: right; white-space: nowrap; color: #a29c91; }
    .badge { font-size: 12px; color: #100f0d; background: #7dd3a0; border-radius: 999px; padding: 2px 8px; vertical-align: middle; }
    .sums, .hint { font-size: 13px; }
    .note { font-size: 12px; color: #7dd3a0; }
    .none { color: #a29c91; font-style: italic; }
    th.group { color: #f2f0ea; background: #171613; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; color: #f2f0ea; }
    .arch { display: inline-flex; margin: 24px 0 4px; border: 1px solid #2c2925; border-radius: 999px; padding: 3px; background: #1c1a17; }
    .arch input { position: absolute; opacity: 0; pointer-events: none; }
    .arch label { cursor: pointer; padding: 6px 16px; border-radius: 999px; font-size: 14px; color: #a29c91; }
    .arch input:checked + label { background: #7dd3a0; color: #100f0d; font-weight: 600; }
    .arch input:focus-visible + label { outline: 2px solid #7dd3a0; outline-offset: 2px; }
    body:has(#arch-amd64:checked) .only-arm64,
    body:has(#arch-arm64:checked) .only-amd64 { display: none; }
    @media (max-width: 600px) { td:first-child, th:first-child:not(.group) { display: none; } td a { white-space: normal; word-break: break-all; } }
  </style>
</head>
<body>
  <main>
    <h1>vallus downloads</h1>
    <p>Every vallus release, newest first. vallus needs a licence key to start -
      <a href="https://vallus.eu/free/">request a free one</a> or see <a href="https://vallus.eu/">vallus.eu</a>.
      Machine-readable: <a href="latest.json">latest.json</a>.</p>
    <p>The Rust runner with browsers comes once per Playwright version. The slim and TypeScript
      runners come without browsers.</p>
    <div class="arch" role="radiogroup" aria-label="CPU architecture">
${switchHtml}
    </div>
${hints}
${body}
${requirements}
  </main>
  <script>
    (() => {
      const pick = (arch) => { const input = document.getElementById("arch-" + arch); if (input) input.checked = true; };
      pick(location.hash.slice(1));
      document.querySelectorAll('input[name="arch"]').forEach((input) =>
        input.addEventListener("change", () => history.replaceState(null, "", "#" + input.value)));
    })();
  </script>
</body>
</html>
`;
};

// ── Bunny Storage over HTTP ───────────────────────────────────────────────────

const request = (url, { method, headers = {}, body = null, bodyFile = null }) =>
    new Promise((resolve, reject) => {
        const target = new URL(url);
        const client = target.protocol === "http:" ? http : https;
        const req = client.request(target, { method, headers }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
            res.on("error", reject);
        });
        req.on("error", reject);
        if (bodyFile) {
            fs.createReadStream(bodyFile).on("error", reject).pipe(req);
        } else {
            req.end(body ?? undefined);
        }
    });

const objectUrl = (settings, remotePath) =>
    `${settings.storageUrl}/${encodeURIComponent(settings.zone)}/${remotePath.split("/").map(encodeURIComponent).join("/")}`;

export const listDirectory = async (settings, dir) => {
    // The root is the zone itself: `zone/`, not `zone//`.
    const url = dir ? `${objectUrl(settings, dir)}/` : `${settings.storageUrl}/${encodeURIComponent(settings.zone)}/`;
    const res = await request(url, {
        method: "GET",
        headers: { AccessKey: settings.password, Accept: "application/json" },
    });
    if (res.status === 404) return [];
    if (res.status !== 200) throw new Error(`listing /${dir}/ failed: HTTP ${res.status} ${res.text.slice(0, 200)}`);
    return JSON.parse(res.text);
};

const upload = async (settings, remotePath, { file = null, content = null, sha256 }) => {
    const size = file ? fs.statSync(file).size : Buffer.byteLength(content);
    const res = await request(objectUrl(settings, remotePath), {
        method: "PUT",
        headers: {
            AccessKey: settings.password,
            "Content-Type": "application/octet-stream",
            "Content-Length": String(size),
            // Bunny recomputes the hash and refuses the object when it differs, so a body
            // cut short or corrupted on the way never becomes a published file.
            Checksum: sha256.toUpperCase(),
        },
        bodyFile: file,
        body: content,
    });
    if (res.status !== 201) throw new Error(`upload of /${remotePath} failed: HTTP ${res.status} ${res.text.slice(0, 200)}`);
};

/**
 * Every published version as the storage holds it: a directory named X.Y.Z per
 * release, and latest.json at the root. Read from the server rather than from this
 * run, so the page also lists what earlier runs - or other machines - published.
 */
export const readReleases = async (settings) => {
    const root = await listDirectory(settings, "");
    const versions = root.filter((entry) => entry.IsDirectory && VERSION.test(entry.ObjectName)).map((entry) => entry.ObjectName);
    const releases = [];
    for (const version of versions) {
        const listing = await listDirectory(settings, version);
        releases.push({
            version,
            files: listing.filter((entry) => !entry.IsDirectory && describePackage(entry.ObjectName)).map((entry) => ({ name: entry.ObjectName, size: entry.Length })),
            sums: listing.some((entry) => !entry.IsDirectory && entry.ObjectName === "SHA256SUMS"),
        });
    }
    let latest = null;
    const res = await request(objectUrl(settings, "latest.json"), { method: "GET", headers: { AccessKey: settings.password } });
    if (res.status === 200) {
        try {
            latest = JSON.parse(res.text).version ?? null;
        } catch {
            latest = null;
        }
    }
    return { releases: releases.filter((release) => release.files.length > 0), latest };
};

/** Rebuilds and uploads index.html from what the storage now holds. */
const publishIndex = async (settings, log) => {
    const html = renderIndex(await readReleases(settings));
    await upload(settings, "index.html", { content: html, sha256: crypto.createHash("sha256").update(html).digest("hex") });
    // The page changes with every release; without a purge the CDN may keep the old list.
    const purged = (await purge(settings, `${settings.publicUrl}/index.html`)) && (await purge(settings, `${settings.publicUrl}/`));
    if (!purged) log("  ! BUNNY_API_KEY not set - index.html was not purged from the CDN cache.");
};

const purge = async (settings, url) => {
    if (!settings.apiKey) return false;
    const res = await request(`https://api.bunny.net/purge?url=${encodeURIComponent(url)}`, {
        method: "POST",
        headers: { AccessKey: settings.apiKey },
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`purge of ${url} failed: HTTP ${res.status}`);
    return true;
};

// ── the run ───────────────────────────────────────────────────────────────────

/** The newest-Playwright AMD64 runner, the AMD64 slim runner and TypeScript, when present. */
export const recommended = (packages) =>
    [
        packages.filter((pkg) => pkg.kind === "rs" && pkg.arch === "amd64").sort(comparePackages)[0],
        packages.find((pkg) => pkg.kind === "rs-slim" && pkg.arch === "amd64"),
        packages.find((pkg) => pkg.kind === "ts"),
    ].filter(Boolean);

const mib = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;

export const publish = async (args, settings, log = console.log) => {
    if (args.indexOnly) {
        if (args.dryRun) {
            const { releases, latest } = await readReleases(settings);
            const listed = releases.map((r) => r.version).filter((v) => compareVersionsDesc(v, MIN_LISTED_VERSION) <= 0);
            log(`index.html would list: ${listed.sort(compareVersionsDesc).join(", ") || "nothing"} (latest: ${latest ?? "none"}, from ${MIN_LISTED_VERSION})`);
            log("\nDry run - nothing was sent.");
            return { uploaded: [] };
        }
        await publishIndex(settings, log);
        log(`Updated ${settings.publicUrl}/`);
        return { uploaded: ["index.html"] };
    }
    const { version } = args;

    // Every package the pack scripts left in the directory, by the names they give them.
    const found = fs.existsSync(settings.packagesDir) ? fs.readdirSync(settings.packagesDir) : [];
    const packages = found
        .filter((name) => describePackage(name))
        .map((name) => ({ name, path: path.join(settings.packagesDir, name), ...describePackage(name) }))
        .sort(comparePackages);
    if (packages.length === 0) {
        throw new Error(`no packages in ${settings.packagesDir} - run the pack scripts first`);
    }

    // What each archive says about itself must agree with its name and the release: a
    // 1.4.0 build filed under /1.4.1/, or an arm64 image named amd64, is a download that
    // does not work, and the name is all a customer chooses by.
    const problems = [];
    for (const pkg of packages) {
        if (pkg.kind === "browsers") continue; // no vallus inside, nothing versioned to check
        const inside = readPackageVersion(pkg.path);
        if (inside !== version) problems.push(`${pkg.name}: ${inside ?? "no VERSION or package.json inside"}, not ${version}`);
        if (pkg.kind === "rs" || pkg.kind === "rs-slim") {
            const platform = readPackagePlatform(pkg.path);
            if (platform !== `linux/${pkg.arch}`) problems.push(`${pkg.name}: built for ${platform ?? "an unknown platform (no PLATFORM inside)"}, not linux/${pkg.arch}`);
        }
        if (pkg.kind === "rs") {
            const playwright = readPlaywrightVersion(pkg.path);
            if (playwright !== pkg.playwright) problems.push(`${pkg.name}: carries Playwright ${playwright ?? "unknown"}, not ${pkg.playwright}`);
        }
    }
    if (problems.length) {
        throw new Error(`these archives do not match their names or ${version} - repack them first:\n  ${problems.join("\n  ")}`);
    }

    log(`vallus ${version} -> ${settings.storageUrl}/${settings.zone}/${version}/${args.dryRun ? "  (dry run)" : ""}\n`);

    for (const pkg of packages) {
        pkg.size = fs.statSync(pkg.path).size;
        pkg.sha256 = await sha256File(pkg.path);
        log(`  ${pkg.name.padEnd(60)} ${mib(pkg.size).padStart(11)}  sha256 ${pkg.sha256.slice(0, 16)}...`);
    }

    const listing = await listDirectory(settings, version);
    const plans = packages.map((pkg) => ({ pkg, action: planFile(listing, pkg.name, pkg.sha256, args.force) }));
    const conflicts = plans.filter((plan) => plan.action === "conflict");
    if (conflicts.length) {
        throw new Error(
            `${version} is already published with different bytes for: ${conflicts.map((plan) => plan.pkg.name).join(", ")}.\n` +
                "A published version must not change under customers who already verified it. Release a new version, " +
                "or pass --force if this really is a correction nobody has downloaded yet.",
        );
    }

    const sums = formatSums(packages);
    const sumsSha = crypto.createHash("sha256").update(sums).digest("hex");
    const sumsPlan = planFile(listing, "SHA256SUMS", sumsSha, args.force);
    if (sumsPlan === "conflict") {
        throw new Error(`${version}/SHA256SUMS already exists with different content; pass --force to replace it`);
    }

    // The release's packages described, for tools: added to a published version too, as it
    // describes the packages rather than changing them.
    const describe = (pkg) => ({
        name: pkg.name,
        description: pkg.label,
        kind: pkg.kind,
        arch: pkg.arch,
        playwright: pkg.playwright,
        size: pkg.size,
        sha256: pkg.sha256,
        url: `${settings.publicUrl}/${version}/${pkg.name}`,
    });
    const releaseJson = JSON.stringify({ version, files: packages.map(describe) }, null, 2) + "\n";
    const releaseSha = crypto.createHash("sha256").update(releaseJson).digest("hex");
    const releasePlan = planFile(listing, "release.json", releaseSha, true);

    log("");
    const verb = (action) => (action === "skip" ? "already there" : "upload").padEnd(13);
    for (const { pkg, action } of plans) log(`  ${verb(action)}  ${pkg.name}`);
    log(`  ${verb(sumsPlan)}  SHA256SUMS`);
    log(`  ${verb(releasePlan)}  release.json`);
    if (args.latest) log(`  ${verb("upload")}  latest.json`);
    log(`  ${verb("upload")}  index.html`);

    if (args.dryRun) {
        log("\nDry run - nothing was sent.");
        return { uploaded: [], packages };
    }

    const uploaded = [];
    for (const { pkg, action } of plans) {
        if (action === "skip") continue;
        log(`\n  sending ${pkg.name} (${mib(pkg.size)})...`);
        const started = Date.now();
        await upload(settings, `${version}/${pkg.name}`, { file: pkg.path, sha256: pkg.sha256 });
        log(`  done in ${Math.round((Date.now() - started) / 1000)} s`);
        uploaded.push(pkg.name);
    }

    // Read the directory back: the Checksum header already made Bunny verify each body,
    // this confirms every package - uploaded now or skipped - is there as expected.
    const after = await listDirectory(settings, version);
    for (const pkg of packages) {
        if (planFile(after, pkg.name, pkg.sha256, false) !== "skip") {
            throw new Error(`/${version}/${pkg.name} is not on the server with the expected checksum after upload`);
        }
    }

    if (sumsPlan !== "skip") {
        await upload(settings, `${version}/SHA256SUMS`, { content: sums, sha256: sumsSha });
        uploaded.push("SHA256SUMS");
    }
    if (releasePlan !== "skip") {
        await upload(settings, `${version}/release.json`, { content: releaseJson, sha256: releaseSha });
        uploaded.push("release.json");
    }

    if (args.latest) {
        const latest = JSON.stringify(
            {
                version,
                published_at: new Date().toISOString(),
                // The short list - what the licence e-mail offers: for AMD64, the runner
                // with the newest Playwright, the slim one and TypeScript. Descriptions
                // carry the architecture, as the mail has no switch.
                files: recommended(packages).map((pkg) => ({
                    ...describe(pkg),
                    description: `${pkg.label} (${pkg.arch === "any" ? "any CPU" : ARCH_LABELS[pkg.arch].name}${pkg.playwright ? `, Playwright ${pkg.playwright}` : ""})`,
                })),
                all_files: packages.map(describe),
                sha256sums: `${settings.publicUrl}/${version}/SHA256SUMS`,
            },
            null,
            2,
        ) + "\n";
        await upload(settings, "latest.json", { content: latest, sha256: crypto.createHash("sha256").update(latest).digest("hex") });
        uploaded.push("latest.json");
        // Versioned files never change, so the CDN may cache them for ever; latest.json
        // does change, and a cached copy would keep announcing the previous release.
        const purged = await purge(settings, `${settings.publicUrl}/latest.json`);
        if (!purged) log("\n  ! BUNNY_API_KEY not set - latest.json was not purged from the CDN cache.");
    }

    // Last: the page lists what the storage holds, so everything above must be in place.
    await publishIndex(settings, log);
    uploaded.push("index.html");

    log(`\nPublished vallus ${version}:`);
    for (const pkg of packages) log(`  ${settings.publicUrl}/${version}/${pkg.name}`);
    log(`  ${settings.publicUrl}/${version}/SHA256SUMS`);
    return { uploaded, packages };
};

const main = async () => {
    const args = parseArgs(process.argv.slice(2));
    const settings = loadSettings(process.env);
    await publish(args, settings);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(`\n${error instanceof Error ? error.message : error}\n`);
        process.exit(1);
    });
}
