import { test } from "node:test";
import assert from "node:assert/strict";

import { issueCode, verifyCode } from "../dist/otp.js";

const SECRET = "otp-test-secret";

test("a freshly issued code verifies for the same e-mail", async () => {
    const { code, token } = await issueCode(SECRET, "Alex@Acme.com", 60_000);
    // Case-insensitive on the e-mail (normalised both sides).
    assert.deepEqual(await verifyCode(SECRET, "alex@acme.com", code, token), { ok: true });
});

test("a wrong code is rejected", async () => {
    const { token } = await issueCode(SECRET, "a@b.co", 60_000);
    const r = await verifyCode(SECRET, "a@b.co", "000000", token);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "wrong_code");
});

test("a code is single-use", async () => {
    const { code, token } = await issueCode(SECRET, "a@b.co", 60_000);
    assert.deepEqual(await verifyCode(SECRET, "a@b.co", code, token), { ok: true });
    const second = await verifyCode(SECRET, "a@b.co", code, token);
    assert.equal(second.ok, false);
});

test("a code bound to one e-mail does not verify for another", async () => {
    const { code, token } = await issueCode(SECRET, "a@b.co", 60_000);
    const r = await verifyCode(SECRET, "someone@else.com", code, token);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "wrong_code");
});

test("an expired code is rejected", async () => {
    const { code, token } = await issueCode(SECRET, "a@b.co", -1); // already expired
    const r = await verifyCode(SECRET, "a@b.co", code, token);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "expired");
});

test("a token signed with another secret is rejected", async () => {
    const { code, token } = await issueCode("other-secret", "a@b.co", 60_000);
    const r = await verifyCode(SECRET, "a@b.co", code, token);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "wrong_code");
});

test("guessing is capped per token", async () => {
    const { token } = await issueCode(SECRET, "a@b.co", 60_000);
    for (let i = 0; i < 5; i += 1) await verifyCode(SECRET, "a@b.co", "000000", token);
    const r = await verifyCode(SECRET, "a@b.co", "111111", token);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "too_many");
});

test("junk tokens are rejected without throwing", async () => {
    for (const junk of ["", "no-dot", "a.b.c", "..", "%%%.%%%"]) {
        const r = await verifyCode(SECRET, "a@b.co", "123456", junk);
        assert.equal(r.ok, false);
    }
});
