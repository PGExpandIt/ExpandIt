// Runs publish.mjs against a local stand-in for Bunny Storage that behaves like the
// real one where it matters: AccessKey checked, the Checksum header enforced, and a
// directory listing carrying ObjectName, Length and an uppercase Checksum.
//
//   node --test publish.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { execFileSync } from "node:child_process";

import { compareVersionsDesc, formatSums, loadSettings, parseArgs, planFile, publish, readPackageVersion, renderIndex } from "./publish.mjs";

const PASSWORD = "zone-password";
const ZONE = "vallus-downloads";

const sha = (data) => crypto.createHash("sha256").update(data).digest("hex");

/** A fake storage zone: path -> Buffer, plus a log of every request. */
const startFakeBunny = async () => {
    const objects = new Map();
    const requests = [];
    const server = http.createServer((req, res) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => {
            const body = Buffer.concat(chunks);
            const url = decodeURIComponent(req.url);
            requests.push({ method: req.method, url });
            if (req.headers.accesskey !== PASSWORD) {
                res.writeHead(401).end('{"HttpCode":401}');
                return;
            }
            const prefix = `/${ZONE}/`;
            if (!url.startsWith(prefix)) {
                res.writeHead(404).end();
                return;
            }
            const key = url.slice(prefix.length);
            if (req.method === "PUT") {
                if (req.headers.checksum && req.headers.checksum !== sha(body).toUpperCase()) {
                    res.writeHead(400).end('{"Message":"checksum mismatch"}');
                    return;
                }
                objects.set(key, body);
                res.writeHead(201).end('{"HttpCode":201}');
                return;
            }
            if (req.method === "GET" && (key.endsWith("/") || key === "")) {
                const inside = [...objects.entries()].filter(([name]) => name.startsWith(key));
                const listing = inside
                    .filter(([name]) => !name.slice(key.length).includes("/"))
                    .map(([name, data]) => ({
                        ObjectName: name.slice(key.length),
                        Length: data.length,
                        Checksum: sha(data).toUpperCase(),
                        IsDirectory: false,
                    }));
                // Subdirectories, as the real listing reports them.
                const dirs = new Set(inside.map(([name]) => name.slice(key.length)).filter((rest) => rest.includes("/")).map((rest) => rest.split("/")[0]));
                for (const dir of dirs) listing.push({ ObjectName: dir, Length: 0, Checksum: null, IsDirectory: true });
                res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(listing));
                return;
            }
            if (req.method === "GET" && objects.has(key)) {
                res.writeHead(200).end(objects.get(key));
                return;
            }
            res.writeHead(404).end();
        });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    return { url: `http://127.0.0.1:${port}`, objects, requests, close: () => new Promise((r) => server.close(r)) };
};

/** A real zip holding `files`, built with the zip CLI the pack scripts use too. */
const makeZip = (zipPath, files) => {
    const src = fs.mkdtempSync(path.join(os.tmpdir(), "vallus-zip-"));
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(src, name), content);
    execFileSync("zip", ["-qr", zipPath, "."], { cwd: src });
    fs.rmSync(src, { recursive: true, force: true });
};

const packagesDir = (version = "1.4.1") => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vallus-publish-"));
    makeZip(path.join(dir, "vallus-rs-dist.zip"), { VERSION: `${version}\n`, "image.tar.gz": "rust with browsers" });
    makeZip(path.join(dir, "vallus-rs-slim-dist.zip"), { VERSION: `${version}\n`, "image.tar.gz": "rust slim" });
    makeZip(path.join(dir, "vallus-ts-dist.zip"), { "package.json": JSON.stringify({ name: "vallus", version }) });
    return dir;
};

const bytes = (dir, name) => fs.readFileSync(path.join(dir, name));

const settingsFor = (bunny, dir, over = {}) =>
    loadSettings({
        BUNNY_STORAGE_ZONE: ZONE,
        BUNNY_STORAGE_PASSWORD: PASSWORD,
        BUNNY_STORAGE_URL: bunny.url,
        DOWNLOADS_BASE_URL: "https://downloads.vallus.eu",
        PACKAGES_DIR: dir,
        ...over,
    });

const quiet = () => {};
const puts = (bunny) => bunny.requests.filter((r) => r.method === "PUT").map((r) => r.url.replace(`/${ZONE}/`, ""));

test("a first publish uploads every package, then SHA256SUMS, then latest.json", async () => {
    const bunny = await startFakeBunny();
    try {
        const dir = packagesDir();
        await publish(parseArgs(["--version", "1.4.1"]), settingsFor(bunny, dir), quiet);

        assert.deepEqual(puts(bunny), [
            "1.4.1/vallus-rs-1.4.1.zip",
            "1.4.1/vallus-rs-slim-1.4.1.zip",
            "1.4.1/vallus-ts-1.4.1.zip",
            "1.4.1/SHA256SUMS",
            "latest.json",
            "index.html",
        ]);
        assert.deepEqual(bunny.objects.get("1.4.1/vallus-ts-1.4.1.zip"), bytes(dir, "vallus-ts-dist.zip"));

        const sums = bunny.objects.get("1.4.1/SHA256SUMS").toString();
        assert.match(sums, new RegExp(`^${sha(bytes(dir, "vallus-ts-dist.zip"))}  vallus-ts-1\\.4\\.1\\.zip$`, "m"));
        assert.equal(sums.trim().split("\n").length, 3);

        const latest = JSON.parse(bunny.objects.get("latest.json").toString());
        assert.equal(latest.version, "1.4.1");
        assert.equal(latest.files.length, 3);
        assert.equal(latest.files[0].url, "https://downloads.vallus.eu/1.4.1/vallus-rs-1.4.1.zip");
        assert.equal(latest.files[2].sha256, sha(bytes(dir, "vallus-ts-dist.zip")));
        assert.equal(latest.sha256sums, "https://downloads.vallus.eu/1.4.1/SHA256SUMS");
    } finally {
        await bunny.close();
    }
});

test("running it again skips what is already there, so an interrupted run can resume", async () => {
    const bunny = await startFakeBunny();
    try {
        const dir = packagesDir();
        const args = parseArgs(["--version", "1.4.1"]);
        await publish(args, settingsFor(bunny, dir), quiet);
        bunny.requests.length = 0;

        const { uploaded } = await publish(args, settingsFor(bunny, dir), quiet);
        assert.deepEqual(uploaded, ["latest.json", "index.html"]);
        assert.deepEqual(puts(bunny), ["latest.json", "index.html"]);
    } finally {
        await bunny.close();
    }
});

test("different bytes under a published version stop the run before anything is sent", async () => {
    const bunny = await startFakeBunny();
    try {
        const dir = packagesDir();
        bunny.objects.set("1.4.1/vallus-ts-1.4.1.zip", Buffer.from("what customers already downloaded"));

        await assert.rejects(
            publish(parseArgs(["--version", "1.4.1"]), settingsFor(bunny, dir), quiet),
            /already published with different bytes for: vallus-ts-1\.4\.1\.zip/,
        );
        assert.deepEqual(puts(bunny), []);
        assert.equal(bunny.objects.get("1.4.1/vallus-ts-1.4.1.zip").toString(), "what customers already downloaded");
    } finally {
        await bunny.close();
    }
});

test("--force replaces a published file", async () => {
    const bunny = await startFakeBunny();
    try {
        const dir = packagesDir();
        bunny.objects.set("1.4.1/vallus-ts-1.4.1.zip", Buffer.from("old"));
        await publish(parseArgs(["--version", "1.4.1", "--force"]), settingsFor(bunny, dir), quiet);
        assert.deepEqual(bunny.objects.get("1.4.1/vallus-ts-1.4.1.zip"), bytes(dir, "vallus-ts-dist.zip"));
    } finally {
        await bunny.close();
    }
});

test("--dry-run hashes and lists but sends nothing", async () => {
    const bunny = await startFakeBunny();
    try {
        await publish(parseArgs(["--version", "1.4.1", "--dry-run"]), settingsFor(bunny, packagesDir()), quiet);
        assert.deepEqual(puts(bunny), []);
    } finally {
        await bunny.close();
    }
});

test("--no-latest leaves latest.json alone", async () => {
    const bunny = await startFakeBunny();
    try {
        await publish(parseArgs(["--version", "1.4.1", "--no-latest"]), settingsFor(bunny, packagesDir()), quiet);
        assert.ok(!puts(bunny).includes("latest.json"));
        assert.ok(bunny.objects.has("1.4.1/SHA256SUMS"));
    } finally {
        await bunny.close();
    }
});

test("a missing package is named, and nothing is sent", async () => {
    const bunny = await startFakeBunny();
    try {
        const dir = packagesDir();
        fs.rmSync(path.join(dir, "vallus-rs-slim-dist.zip"));
        await assert.rejects(
            publish(parseArgs(["--version", "1.4.1"]), settingsFor(bunny, dir), quiet),
            /missing packages[\s\S]*vallus-rs-slim-dist\.zip/,
        );
        assert.equal(bunny.requests.length, 0);
    } finally {
        await bunny.close();
    }
});

test("a wrong storage password fails loudly", async () => {
    const bunny = await startFakeBunny();
    try {
        await assert.rejects(
            publish(parseArgs(["--version", "1.4.1"]), settingsFor(bunny, packagesDir(), { BUNNY_STORAGE_PASSWORD: "wrong" }), quiet),
            /listing \/1\.4\.1\/ failed: HTTP 401/,
        );
    } finally {
        await bunny.close();
    }
});

test("arguments and settings are validated", () => {
    assert.throws(() => parseArgs([]), /--version X\.Y\.Z is required/);
    assert.throws(() => parseArgs(["--version", "1.4"]), /--version X\.Y\.Z is required/);
    assert.throws(() => parseArgs(["--version", "1.4.1", "--yes"]), /unknown argument: --yes/);
    assert.deepEqual(parseArgs(["--version=1.4.1", "--dry-run"]), { version: "1.4.1", dryRun: true, latest: true, force: false, indexOnly: false });
    assert.deepEqual(parseArgs(["--index-only"]).indexOnly, true);
    assert.throws(() => parseArgs(["--index-only", "--version", "1.4.1"]), /--index-only takes no other option/);
    assert.throws(() => loadSettings({}), /BUNNY_STORAGE_ZONE and BUNNY_STORAGE_PASSWORD/);
    assert.equal(loadSettings({ BUNNY_STORAGE_ZONE: "z", BUNNY_STORAGE_PASSWORD: "p" }).storageUrl, "https://storage.bunnycdn.com");
});

test("archives built as another version are refused before anything is sent", async () => {
    const bunny = await startFakeBunny();
    try {
        const dir = packagesDir("1.4.0");
        await assert.rejects(
            publish(parseArgs(["--version", "1.4.1"]), settingsFor(bunny, dir), quiet),
            /not 1\.4\.1 - repack them first[\s\S]*vallus-rs-dist\.zip: 1\.4\.0[\s\S]*vallus-ts-dist\.zip: 1\.4\.0/,
        );
        assert.equal(bunny.requests.length, 0);
    } finally {
        await bunny.close();
    }
});

test("an archive with no version inside is refused, not guessed", async () => {
    const bunny = await startFakeBunny();
    try {
        const dir = packagesDir();
        fs.rmSync(path.join(dir, "vallus-rs-slim-dist.zip"));
        makeZip(path.join(dir, "vallus-rs-slim-dist.zip"), { "image.tar.gz": "packed before VERSION existed" });
        await assert.rejects(
            publish(parseArgs(["--version", "1.4.1"]), settingsFor(bunny, dir), quiet),
            /vallus-rs-slim-dist\.zip: no VERSION or package\.json inside/,
        );
        assert.equal(readPackageVersion(path.join(dir, "vallus-rs-dist.zip")), "1.4.1");
        assert.equal(readPackageVersion(path.join(dir, "vallus-ts-dist.zip")), "1.4.1");
    } finally {
        await bunny.close();
    }
});

test("planFile compares checksums case-insensitively", () => {
    const listing = [{ ObjectName: "a.zip", Checksum: "ABC", IsDirectory: false }];
    assert.equal(planFile(listing, "a.zip", "abc", false), "skip");
    assert.equal(planFile(listing, "a.zip", "def", false), "conflict");
    assert.equal(planFile(listing, "a.zip", "def", true), "upload");
    assert.equal(planFile(listing, "b.zip", "abc", false), "upload");
    assert.equal(formatSums([{ sha256: "AB", name: "x.zip" }]), "ab  x.zip\n");
});

test("index.html lists every published version, newest first, marking the one latest.json names", async () => {
    const bunny = await startFakeBunny();
    try {
        await publish(parseArgs(["--version", "1.4.2"]), settingsFor(bunny, packagesDir("1.4.2")), quiet);
        // An older line published afterwards, without taking over latest.json.
        await publish(parseArgs(["--version", "1.4.1", "--no-latest"]), settingsFor(bunny, packagesDir("1.4.1")), quiet);

        const html = bunny.objects.get("index.html").toString();
        assert.ok(html.indexOf("vallus 1.4.2") < html.indexOf("vallus 1.4.1"), "newest first");
        assert.match(html, /vallus 1\.4\.2 <span class="badge">latest<\/span>/);
        assert.doesNotMatch(html, /vallus 1\.4\.1 <span class="badge">/);
        assert.match(html, /href="1\.4\.1\/vallus-rs-slim-1\.4\.1\.zip"/);
        assert.match(html, /href="1\.4\.2\/SHA256SUMS"/);
        assert.match(html, /Rust, without browsers/);
    } finally {
        await bunny.close();
    }
});

test("--index-only rebuilds the page and sends nothing else", async () => {
    const bunny = await startFakeBunny();
    try {
        await publish(parseArgs(["--version", "1.4.1"]), settingsFor(bunny, packagesDir()), quiet);
        bunny.objects.delete("index.html");
        const before = puts(bunny).length;

        await publish(parseArgs(["--index-only", "--dry-run"]), settingsFor(bunny, packagesDir()), quiet);
        assert.equal(puts(bunny).length, before, "a dry run uploads nothing");

        await publish(parseArgs(["--index-only"]), settingsFor(bunny, packagesDir()), quiet);
        assert.deepEqual(puts(bunny).slice(before), ["index.html"]);
        assert.match(bunny.objects.get("index.html").toString(), /vallus 1\.4\.1/);
    } finally {
        await bunny.close();
    }
});

test("renderIndex sorts numerically, skips foreign files and escapes names", () => {
    assert.deepEqual(["1.9.0", "1.10.0", "1.4.2"].sort(compareVersionsDesc), ["1.10.0", "1.9.0", "1.4.2"]);
    const html = renderIndex({
        releases: [{ version: "1.4.2", files: [{ name: "vallus-ts-1.4.2.zip", size: 34877871 }, { name: "<script>.zip", size: 1 }], sums: false }],
        latest: null,
    });
    assert.match(html, /TypeScript[\s\S]*33 MB/);
    assert.doesNotMatch(html, /<script>/);
    assert.doesNotMatch(html, /SHA256SUMS<\/a>/);
    assert.match(renderIndex({ releases: [], latest: null }), /No release has been published yet/);
});
