import { test } from "node:test";
import assert from "node:assert/strict";

import { DownloadsDirectory, formatDownloads, parseRelease } from "../dist/downloads.js";

const BASE = "https://downloads.vallus.eu";

// The shape downloads/publish.mjs writes.
const LATEST = {
    version: "1.4.2",
    published_at: "2026-09-17T14:05:18.222Z",
    files: [
        { name: "vallus-rs-1.4.2.zip", description: "Rust, browsers included", size: 981514345, sha256: "a", url: `${BASE}/1.4.2/vallus-rs-1.4.2.zip` },
        { name: "vallus-rs-slim-1.4.2.zip", description: "Rust, without browsers", size: 76613607, sha256: "b", url: `${BASE}/1.4.2/vallus-rs-slim-1.4.2.zip` },
        { name: "vallus-ts-1.4.2.zip", description: "TypeScript", size: 34877871, sha256: "c", url: `${BASE}/1.4.2/vallus-ts-1.4.2.zip` },
    ],
    sha256sums: `${BASE}/1.4.2/SHA256SUMS`,
};

const respond = (body, ok = true) => async () => ({ ok, json: async () => body });

test("the e-mail section lists every package of the current release with its size", () => {
    assert.equal(
        formatDownloads(parseRelease(LATEST, BASE), BASE),
        [
            "Download vallus 1.4.2:",
            `- Rust, browsers included (936 MB): ${BASE}/1.4.2/vallus-rs-1.4.2.zip`,
            `- Rust, without browsers (73 MB): ${BASE}/1.4.2/vallus-rs-slim-1.4.2.zip`,
            `- TypeScript (33 MB): ${BASE}/1.4.2/vallus-ts-1.4.2.zip`,
            `SHA-256 checksums: ${BASE}/1.4.2/SHA256SUMS`,
        ].join("\n"),
    );
});

test("a link off the downloads host is never mailed", () => {
    const tampered = {
        ...LATEST,
        files: [...LATEST.files, { name: "evil.zip", description: "Evil", size: 1, url: "https://evil.example/vallus.zip" }],
        sha256sums: "https://downloads.vallus.eu.evil.example/SHA256SUMS",
    };
    const text = formatDownloads(parseRelease(tampered, BASE), BASE);
    assert.doesNotMatch(text, /evil/);
    assert.match(text, /vallus-ts-1\.4\.2\.zip/);
});

test("nothing usable in latest.json falls back to the downloads page", () => {
    for (const raw of [null, "x", {}, { version: "1.4.2", files: [] }, { version: "../1", files: LATEST.files }]) {
        assert.equal(parseRelease(raw, BASE), null, JSON.stringify(raw));
    }
    assert.equal(formatDownloads(null, `${BASE}/`), `Download vallus: ${BASE}/ lists every release with its packages and checksums.`);
});

test("an unreachable downloads host does not fail the e-mail", async () => {
    const directory = new DownloadsDirectory(BASE, async () => { throw new Error("ENOTFOUND"); });
    assert.match(await directory.section(), /^Download vallus: https:\/\/downloads\.vallus\.eu\/ lists every release/);
    const notFound = new DownloadsDirectory(BASE, respond({}, false));
    assert.match(await notFound.section(), /^Download vallus: https:\/\/downloads\.vallus\.eu\/ lists every release/);
});

test("a fetched release is reused for a few minutes, and kept when a refresh fails", async () => {
    let now = 0;
    let calls = 0;
    let fail = false;
    const directory = new DownloadsDirectory(BASE, async () => {
        calls += 1;
        if (fail) throw new Error("down");
        return { ok: true, json: async () => LATEST };
    }, () => now);

    await directory.section();
    now = 60_000;
    await directory.section();
    assert.equal(calls, 1, "a burst of licences asks once");

    now = 10 * 60_000;
    fail = true;
    const text = await directory.section();
    assert.equal(calls, 2, "stale after the cache time");
    assert.match(text, /^Download vallus 1\.4\.2:/, "the last good release beats the link to the page");
});
