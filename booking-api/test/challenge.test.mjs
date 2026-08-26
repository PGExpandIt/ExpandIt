import { test } from "node:test";
import assert from "node:assert/strict";

import { issueChallenge, verifyChallenge } from "../dist/challenge.js";

const SECRET = "test-secret-do-not-use";
const OPTS = { minAgeMs: 0, maxAgeMs: 60_000 };

/** The same work the browser does: find a counter whose digest has enough zero bits. */
const solve = async (salt, difficulty) => {
    const encoder = new TextEncoder();
    for (let counter = 0; ; counter += 1) {
        const digest = new Uint8Array(
            await crypto.subtle.digest("SHA-256", encoder.encode(`${salt}:${counter}`)),
        );
        let bits = 0;
        for (const byte of digest) {
            if (byte === 0) {
                bits += 8;
                continue;
            }
            bits += Math.clz32(byte) - 24;
            break;
        }
        if (bits >= difficulty) return counter;
    }
};

test("a correctly solved challenge is accepted", async () => {
    const challenge = await issueChallenge(SECRET, 10);
    const solution = await solve(challenge.salt, challenge.difficulty);
    assert.deepEqual(await verifyChallenge(SECRET, challenge.token, solution, OPTS), { ok: true });
});

test("a wrong counter is rejected", async () => {
    const challenge = await issueChallenge(SECRET, 12);
    const result = await verifyChallenge(SECRET, challenge.token, 1, OPTS);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "wrong_solution");
});

test("a token signed with another secret is rejected", async () => {
    const challenge = await issueChallenge("someone-elses-secret", 8);
    const solution = await solve(challenge.salt, challenge.difficulty);
    const result = await verifyChallenge(SECRET, challenge.token, solution, OPTS);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "bad_signature");
});

test("a tampered difficulty is rejected - the signature covers it", async () => {
    // Forge a payload asking for zero work, keeping the original signature.
    const challenge = await issueChallenge(SECRET, 20);
    const [, signature] = challenge.token.split(".");
    const forged =
        Buffer.from(JSON.stringify({ n: "x", t: Date.now(), d: 0 }))
            .toString("base64url") + "." + signature;

    const result = await verifyChallenge(SECRET, forged, 0, OPTS);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "bad_signature");
});

test("the same solution cannot be replayed", async () => {
    const challenge = await issueChallenge(SECRET, 10);
    const solution = await solve(challenge.salt, challenge.difficulty);

    assert.deepEqual(await verifyChallenge(SECRET, challenge.token, solution, OPTS), { ok: true });
    const second = await verifyChallenge(SECRET, challenge.token, solution, OPTS);
    assert.equal(second.ok, false);
    assert.equal(second.reason, "replayed");
});

test("an instant submission is refused", async () => {
    const challenge = await issueChallenge(SECRET, 8);
    const solution = await solve(challenge.salt, challenge.difficulty);
    const result = await verifyChallenge(SECRET, challenge.token, solution, {
        minAgeMs: 3_000,
        maxAgeMs: 60_000,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "too_fast");
});

test("a stale challenge is refused", async () => {
    const challenge = await issueChallenge(SECRET, 8);
    const solution = await solve(challenge.salt, challenge.difficulty);
    const result = await verifyChallenge(SECRET, challenge.token, solution, {
        minAgeMs: 0,
        maxAgeMs: -1, // everything is already too old
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "expired");
});

test("junk is rejected without throwing", async () => {
    for (const junk of ["", "not-a-token", "a.b", "..", "%%%.%%%"]) {
        const result = await verifyChallenge(SECRET, junk, 0, OPTS);
        assert.equal(result.ok, false, `expected refusal for ${JSON.stringify(junk)}`);
    }
});

test("the default difficulty stays within a reasonable browser budget", async () => {
    const challenge = await issueChallenge(SECRET, 15);
    const started = Date.now();
    await solve(challenge.salt, challenge.difficulty);
    const elapsed = Date.now() - started;
    // Node here is roughly comparable to a browser; a person must not be made to wait.
    // Averages ~0.3 s; the ceiling is generous because proof-of-work is a coin flip
    // and CI machines vary. Anything near it means the difficulty is set too high.
    assert.ok(elapsed < 5_000, `solving took ${elapsed} ms, which is too slow for a visitor`);
    console.log(`      (difficulty 15 solved in ${elapsed} ms)`);
});
