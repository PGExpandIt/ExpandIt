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

import { compareVersionsDesc, describePackage, formatSums, loadSettings, parseArgs, planFile, publish, readPackageVersion, readPlaywrightVersion, renderIndex } from "./publish.mjs";

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

// Named and filled the way pack-rs.sh and pack-ts.mjs leave them.
const RS = "vallus-rs-playwright-1.60.0-amd64-dist.zip";
const SLIM_AMD = "vallus-rs-slim-amd64-dist.zip";
const SLIM_ARM = "vallus-rs-slim-arm64-dist.zip";
const TS = "vallus-ts-dist.zip";

const packagesDir = (version = "1.4.1") => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vallus-publish-"));
    makeZip(path.join(dir, RS), { VERSION: `${version}\n`, PLAYWRIGHT: "1.60.0\n", PLATFORM: "linux/amd64\n", "image.tar.gz": "rust with browsers" });
    makeZip(path.join(dir, SLIM_AMD), { VERSION: `${version}\n`, PLATFORM: "linux/amd64\n", "image.tar.gz": "rust slim amd64" });
    makeZip(path.join(dir, SLIM_ARM), { VERSION: `${version}\n`, PLATFORM: "linux/arm64\n", "image.tar.gz": "rust slim arm64" });
    makeZip(path.join(dir, TS), { "package.json": JSON.stringify({ name: "vallus", version }) });
    // Not a package: left alone, never uploaded.
    fs.writeFileSync(path.join(dir, "notes.txt"), "scratch");
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
            `1.4.1/${TS}`,
            `1.4.1/${RS}`,
            `1.4.1/${SLIM_AMD}`,
            `1.4.1/${SLIM_ARM}`,
            "1.4.1/SHA256SUMS",
            "1.4.1/release.json",
            "latest.json",
            "index.html",
        ]);
        assert.deepEqual(bunny.objects.get(`1.4.1/${TS}`), bytes(dir, TS));

        const sums = bunny.objects.get("1.4.1/SHA256SUMS").toString();
        assert.match(sums, new RegExp(`^${sha(bytes(dir, TS))}  vallus-ts-dist\\.zip$`, "m"));
        assert.equal(sums.trim().split("\n").length, 4);

        const latest = JSON.parse(bunny.objects.get("latest.json").toString());
        assert.equal(latest.version, "1.4.1");
        // The short list the licence e-mail shows: AMD64 runners and TypeScript.
        assert.deepEqual(latest.files.map((file) => file.name), [RS, SLIM_AMD, TS]);
        assert.equal(latest.files[0].url, `https://downloads.vallus.eu/1.4.1/${RS}`);
        assert.equal(latest.files[0].description, "Rust runner with browsers (AMD64 / x86_64, Playwright 1.60.0)");
        assert.equal(latest.files[2].description, "TypeScript runner (any CPU)");
        assert.equal(latest.files[2].sha256, sha(bytes(dir, TS)));
        assert.equal(latest.all_files.length, 4);
        assert.equal(latest.sha256sums, "https://downloads.vallus.eu/1.4.1/SHA256SUMS");
        const release = JSON.parse(bunny.objects.get("1.4.1/release.json").toString());
        assert.deepEqual(release.files.map((file) => [file.name, file.arch, file.playwright]), [
            [TS, "any", null], [RS, "amd64", "1.60.0"], [SLIM_AMD, "amd64", null], [SLIM_ARM, "arm64", null],
        ]);
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
        bunny.objects.set(`1.4.1/${TS}`, Buffer.from("what customers already downloaded"));

        await assert.rejects(
            publish(parseArgs(["--version", "1.4.1"]), settingsFor(bunny, dir), quiet),
            /already published with different bytes for: vallus-ts-dist\.zip/,
        );
        assert.deepEqual(puts(bunny), []);
        assert.equal(bunny.objects.get(`1.4.1/${TS}`).toString(), "what customers already downloaded");
    } finally {
        await bunny.close();
    }
});

test("--force replaces a published file", async () => {
    const bunny = await startFakeBunny();
    try {
        const dir = packagesDir();
        bunny.objects.set(`1.4.1/${TS}`, Buffer.from("old"));
        await publish(parseArgs(["--version", "1.4.1", "--force"]), settingsFor(bunny, dir), quiet);
        assert.deepEqual(bunny.objects.get(`1.4.1/${TS}`), bytes(dir, TS));
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

test("a directory with no packages is refused, and nothing is sent", async () => {
    const bunny = await startFakeBunny();
    try {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vallus-empty-"));
        fs.writeFileSync(path.join(dir, "vallus-rs-dist.zip"), "an old-style name is not a package");
        await assert.rejects(
            publish(parseArgs(["--version", "1.4.1"]), settingsFor(bunny, dir), quiet),
            /no packages in/,
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
            /do not match their names or 1\.4\.1 - repack them first[\s\S]*vallus-ts-dist\.zip: 1\.4\.0, not 1\.4\.1[\s\S]*vallus-rs-playwright-1\.60\.0-amd64-dist\.zip: 1\.4\.0/,
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
        fs.rmSync(path.join(dir, SLIM_AMD));
        makeZip(path.join(dir, SLIM_AMD), { "image.tar.gz": "packed before VERSION existed" });
        await assert.rejects(
            publish(parseArgs(["--version", "1.4.1"]), settingsFor(bunny, dir), quiet),
            /vallus-rs-slim-amd64-dist\.zip: no VERSION or package\.json inside/,
        );
        assert.equal(readPackageVersion(path.join(dir, RS)), "1.4.1");
        assert.equal(readPackageVersion(path.join(dir, TS)), "1.4.1");
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

test("index.html lists published versions from 1.5.0, newest first, marking the one latest.json names", async () => {
    const bunny = await startFakeBunny();
    try {
        await publish(parseArgs(["--version", "1.5.1"]), settingsFor(bunny, packagesDir("1.5.1")), quiet);
        // Older lines published afterwards, without taking over latest.json.
        await publish(parseArgs(["--version", "1.5.0", "--no-latest"]), settingsFor(bunny, packagesDir("1.5.0")), quiet);
        await publish(parseArgs(["--version", "1.4.2", "--no-latest"]), settingsFor(bunny, packagesDir("1.4.2")), quiet);

        const html = bunny.objects.get("index.html").toString();
        assert.ok(html.indexOf("vallus 1.5.1") < html.indexOf("vallus 1.5.0"), "newest first");
        assert.match(html, /vallus 1\.5\.1 <span class="badge">latest<\/span>/);
        assert.doesNotMatch(html, /vallus 1\.5\.0 <span class="badge">/);
        assert.match(html, /href="1\.5\.0\/vallus-rs-slim-amd64-dist\.zip"/);
        assert.match(html, /href="1\.5\.1\/SHA256SUMS"/);
        assert.match(html, /Rust runner with browsers<br><span class="note">Playwright 1\.60\.0<\/span>/);
        // Rows carry their architecture; TypeScript runs anywhere and shows under both.
        assert.match(html, /<tr class="only-arm64">\s*<td>Rust runner \(slim\)/);
        assert.match(html, /<tr>\s*<td>TypeScript runner/);
        // Below MIN_LISTED_VERSION: on the server, not on the page.
        assert.ok(bunny.objects.has(`1.4.2/${TS}`));
        assert.doesNotMatch(html, /1\.4\.2/);
    } finally {
        await bunny.close();
    }
});

test("--index-only rebuilds the page and sends nothing else", async () => {
    const bunny = await startFakeBunny();
    try {
        await publish(parseArgs(["--version", "1.5.0"]), settingsFor(bunny, packagesDir("1.5.0")), quiet);
        bunny.objects.delete("index.html");
        const before = puts(bunny).length;

        await publish(parseArgs(["--index-only", "--dry-run"]), settingsFor(bunny, packagesDir()), quiet);
        assert.equal(puts(bunny).length, before, "a dry run uploads nothing");

        await publish(parseArgs(["--index-only"]), settingsFor(bunny, packagesDir()), quiet);
        assert.deepEqual(puts(bunny).slice(before), ["index.html"]);
        assert.match(bunny.objects.get("index.html").toString(), /vallus 1\.5\.0/);
    } finally {
        await bunny.close();
    }
});

test("renderIndex sorts numerically, skips foreign files and escapes names", () => {
    assert.deepEqual(["1.9.0", "1.10.0", "1.4.2"].sort(compareVersionsDesc), ["1.10.0", "1.9.0", "1.4.2"]);
    const html = renderIndex({
        releases: [{ version: "1.5.0", files: [{ name: "vallus-ts-dist.zip", size: 34877871 }, { name: "<script>.zip", size: 1 }, { name: "vallus-rs-1.4.2.zip", size: 1 }], sums: false }],
        latest: null,
    });
    assert.match(html, /TypeScript[\s\S]*33 MB/);
    assert.doesNotMatch(html, /script&gt;\.zip|<script>\.zip/, "a file that is not a package is not listed");
    assert.doesNotMatch(html, /SHA256SUMS<\/a>/);
    assert.match(renderIndex({ releases: [], latest: null }), /No release has been published yet/);
    assert.match(renderIndex({ releases: [], latest: null, icon: '<svg a="1"/>' }), /<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,%3Csvg%20a%3D%221%22%2F%3E">/);
    assert.doesNotMatch(renderIndex({ releases: [], latest: null, icon: null }), /rel="icon"/);
    assert.match(renderIndex({ releases: [], latest: null }), /rel="icon"[^>]*%3Csvg/, "the site's icon.svg by default");
    assert.doesNotMatch(html, /vallus-rs-1\.4\.2\.zip/, "an old-style name is not listed");
    assert.match(renderIndex({ releases: [{ version: "1.4.1", files: [{ name: "vallus-ts-dist.zip", size: 1 }], sums: true }], latest: "1.4.1" }), /No release has been published yet/, "nothing below the minimum is listed");
});

test("the Playwright version comes from PLAYWRIGHT, or from the README of an older package", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vallus-pw-"));
    try {
        makeZip(path.join(dir, "new.zip"), { PLAYWRIGHT: "1.61.0\n", "README-PACKAGE.md": "carries Playwright v1.60.0-jammy" });
        assert.equal(readPlaywrightVersion(path.join(dir, "new.zip")), "1.61.0", "the file wins");
        makeZip(path.join(dir, "old.zip"), { "README-PACKAGE.md": "This is the **full** package: the runner carries Playwright v1.60.0-jammy and its\nbrowsers." });
        assert.equal(readPlaywrightVersion(path.join(dir, "old.zip")), "1.60.0");
        makeZip(path.join(dir, "slim.zip"), { "README-PACKAGE.md": "This is the **slim** package: the runner without browsers." });
        assert.equal(readPlaywrightVersion(path.join(dir, "slim.zip")), null);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("an image built for another CPU than its name says is refused", async () => {
    const bunny = await startFakeBunny();
    try {
        const dir = packagesDir();
        fs.rmSync(path.join(dir, SLIM_ARM));
        // What happened to 1.4.2: an arm64 image under a name customers read as amd64.
        makeZip(path.join(dir, SLIM_ARM), { VERSION: "1.4.1\n", PLATFORM: "linux/amd64\n" });
        fs.rmSync(path.join(dir, RS));
        makeZip(path.join(dir, RS), { VERSION: "1.4.1\n", PLAYWRIGHT: "1.61.0\n", PLATFORM: "linux/amd64\n" });
        await assert.rejects(
            publish(parseArgs(["--version", "1.4.1"]), settingsFor(bunny, dir), quiet),
            /vallus-rs-playwright-1\.60\.0-amd64-dist\.zip: carries Playwright 1\.61\.0, not 1\.60\.0[\s\S]*vallus-rs-slim-arm64-dist\.zip: built for linux\/amd64, not linux\/arm64/,
        );
        assert.equal(bunny.requests.length, 0);
    } finally {
        await bunny.close();
    }
});

test("the page switches between AMD64 (the default) and ARM64", () => {
    const html = renderIndex({
        releases: [{
            version: "1.5.0",
            files: [
                { name: "vallus-browsers-playwright-1.60.0-1.63.0-linux-amd64.tar.gz", size: 2e9 },
                { name: "vallus-rs-playwright-1.63.0-amd64-dist.zip", size: 1e9 },
                { name: "vallus-rs-playwright-1.61.0-amd64-dist.zip", size: 1e9 },
                { name: "vallus-ts-dist.zip", size: 3e7 },
            ],
            sums: true,
        }],
        latest: "1.5.0",
        icon: null,
    });
    assert.match(html, /<input type="radio" name="arch" id="arch-amd64" value="amd64" checked>/);
    assert.match(html, /<input type="radio" name="arch" id="arch-arm64" value="arm64">/);
    assert.match(html, /body:has\(#arch-amd64:checked\) \.only-arm64/);
    // Node first, then Rust, each under its own title row; browsers last.
    const at = (text) => html.indexOf(text);
    assert.ok(at('class="group">Node<') < at("vallus-ts-dist.zip"), "Node title above the Node package");
    assert.ok(at("vallus-ts-dist.zip") < at('class="group">Rust<'), "Rust after Node");
    assert.ok(at('class="group">Rust<') < at("playwright-1.63.0-amd64"), "Rust title above the Rust packages");
    assert.ok(at("playwright-1.63.0-amd64") < at("playwright-1.61.0-amd64"), "newest Playwright first");
    assert.ok(at("playwright-1.61.0-amd64") < at('class="group">Browsers<'), "browsers last");
    assert.match(html, /<tr class="only-amd64"><th colspan="3" class="group">Browsers<\/th><\/tr>/, "an AMD64-only group hides under ARM64");
    // Rust has only AMD64 packages here, so under ARM64 its group says so.
    assert.match(html, /<tr class="only-arm64"><td colspan="3" class="none">No ARM64 Rust packages in this release/);
    assert.doesNotMatch(html, /No AMD64 \/ x86_64/);
    assert.doesNotMatch(html, /No ARM64 Node/, "Node runs on any CPU");
    assert.match(html, /Windows on ARM/);
    assert.match(html, /1\.9 GB/, "gigabytes above a gigabyte");
});

test("describePackage knows the pack scripts' names and nothing else", () => {
    assert.deepEqual(
        ["vallus-rs-playwright-1.63.0-arm64-dist.zip", "vallus-rs-slim-amd64-dist.zip", "vallus-ts-dist.zip", "vallus-browsers-playwright-1.60.0-1.63.0-linux-arm64.tar.gz"]
            .map((name) => [describePackage(name).kind, describePackage(name).arch]),
        [["rs", "arm64"], ["rs-slim", "amd64"], ["ts", "any"], ["browsers", "arm64"]],
    );
    for (const name of ["vallus-rs-dist.zip", "vallus-rs-1.4.2.zip", "vallus-rs-playwright-1.63.0-386-dist.zip", "SHA256SUMS"]) {
        assert.equal(describePackage(name), null, name);
    }
});
