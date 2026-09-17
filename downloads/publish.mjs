#!/usr/bin/env node
// Publishes one vallus release to Bunny Storage, behind downloads.vallus.eu.
//
//   node --env-file=.env publish.mjs --version 1.4.1 [--dry-run] [--no-latest] [--force]
//
// For each package it computes the SHA-256, uploads to /<version>/ with Bunny's
// `Checksum` header (the storage rejects a body that does not match), then lists the
// directory back and compares. After the packages it writes SHA256SUMS for the
// version, and last of all latest.json - so latest never points at a release whose
// files are not all in place.
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
/** The workspace root, where both runners' pack scripts write their archives. */
const WORKSPACE = path.resolve(HERE, "..", "..");

/** Local archive (as the pack scripts name it) -> name on the download server. */
export const PACKAGES = [
    { local: "vallus-rs-dist.zip", remote: (v) => `vallus-rs-${v}.zip`, label: "Rust, browsers included" },
    { local: "vallus-rs-slim-dist.zip", remote: (v) => `vallus-rs-slim-${v}.zip`, label: "Rust, without browsers" },
    { local: "vallus-ts-dist.zip", remote: (v) => `vallus-ts-${v}.zip`, label: "TypeScript" },
];

const VERSION = /^\d+\.\d+\.\d+$/;

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
    const args = { version: null, dryRun: false, latest: true, force: false };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--version") args.version = argv[++i] ?? null;
        else if (arg.startsWith("--version=")) args.version = arg.slice("--version=".length);
        else if (arg === "--dry-run") args.dryRun = true;
        else if (arg === "--no-latest") args.latest = false;
        else if (arg === "--force") args.force = true;
        else throw new Error(`unknown argument: ${arg}`);
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
    const res = await request(`${objectUrl(settings, dir)}/`, {
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

const mib = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;

export const publish = async (args, settings, log = console.log) => {
    const { version } = args;

    const packages = PACKAGES.map((pkg) => ({ ...pkg, path: path.join(settings.packagesDir, pkg.local), name: pkg.remote(version) }));
    const missing = packages.filter((pkg) => !fs.existsSync(pkg.path));
    if (missing.length) {
        throw new Error(`missing packages - run the pack scripts first:\n  ${missing.map((pkg) => pkg.path).join("\n  ")}`);
    }

    const wrongVersion = packages
        .map((pkg) => ({ pkg, found: readPackageVersion(pkg.path) }))
        .filter(({ found }) => found !== version);
    if (wrongVersion.length) {
        throw new Error(
            `these archives are not ${version} - repack them first:\n  ` +
                wrongVersion.map(({ pkg, found }) => `${pkg.local}: ${found ?? "no VERSION or package.json inside"}`).join("\n  "),
        );
    }

    log(`vallus ${version} -> ${settings.storageUrl}/${settings.zone}/${version}/${args.dryRun ? "  (dry run)" : ""}\n`);

    for (const pkg of packages) {
        pkg.size = fs.statSync(pkg.path).size;
        pkg.sha256 = await sha256File(pkg.path);
        log(`  ${pkg.name.padEnd(28)} ${mib(pkg.size).padStart(11)}  sha256 ${pkg.sha256.slice(0, 16)}...`);
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

    log("");
    const verb = (action) => (action === "skip" ? "already there" : "upload").padEnd(13);
    for (const { pkg, action } of plans) log(`  ${verb(action)}  ${pkg.name}`);
    log(`  ${verb(sumsPlan)}  SHA256SUMS`);
    if (args.latest) log(`  ${verb("upload")}  latest.json`);

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

    if (args.latest) {
        const latest = JSON.stringify(
            {
                version,
                published_at: new Date().toISOString(),
                files: packages.map((pkg) => ({
                    name: pkg.name,
                    description: pkg.label,
                    size: pkg.size,
                    sha256: pkg.sha256,
                    url: `${settings.publicUrl}/${version}/${pkg.name}`,
                })),
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
