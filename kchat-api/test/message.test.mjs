import { test } from "node:test";
import assert from "node:assert/strict";

import { createHandler } from "../dist/handler.js";
import { issueCode } from "../dist/otp.js";

const OTP = { otpSecret: "otp-test-secret", mailerUrl: "http://mailer.local", mailerSecret: "mailer-shared" };

const ORIGIN = "https://vallus.eu";

// A fake kChat client with the same surface the handler uses (send + transport),
// recording the last message so tests can assert what would have been relayed.
const fakeKchat = () => {
    const state = { sent: [] };
    return {
        transport: "webhook",
        async send(message) {
            state.sent.push(message);
            return { transport: "webhook" };
        },
        _state: state,
    };
};

const baseConfig = (over = {}) => ({
    webhookUrl: "https://x.kchat.infomaniak.com/hooks/test",
    token: null,
    apiBase: null,
    channelId: null,
    defaultChannel: null,
    username: null,
    iconEmoji: null,
    messagePrefix: "New message from the vallus website",
    maxMessageChars: 4000,
    port: 8788,
    allowedOrigins: [ORIGIN],
    rateLimitPerHour: 100,
    challengeSecret: null, // challenge off - these tests exercise validation and relay
    challengeDifficulty: 15,
    // OTP off by default (all three null) so otpEnabled() is false.
    otpSecret: null,
    mailerUrl: null,
    mailerSecret: null,
    otpTtlMs: 10 * 60 * 1000,
    ...over,
});

const post = (handler, body, headers = {}) =>
    handler(
        new Request("http://localhost/message", {
            method: "POST",
            headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
            body: JSON.stringify(body),
        }),
    );

test("a valid message is relayed and echoes the transport", async () => {
    const kchat = fakeKchat();
    const handler = createHandler(baseConfig(), kchat);

    const res = await post(handler, { name: "Alex", email: "alex@acme.com", message: "Hello there" });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, transport: "webhook" });

    assert.equal(kchat._state.sent.length, 1);
    const text = kchat._state.sent[0].text;
    assert.match(text, /New message from the vallus website/);
    assert.match(text, /Alex/);
    assert.match(text, /alex@acme\.com/);
    assert.match(text, /Hello there/);
});

test("a missing message is rejected and nothing is relayed", async () => {
    const kchat = fakeKchat();
    const handler = createHandler(baseConfig(), kchat);

    const res = await post(handler, { name: "Alex", message: "   " });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "invalid_message");
    assert.equal(kchat._state.sent.length, 0);
});

test("a malformed e-mail is rejected", async () => {
    const kchat = fakeKchat();
    const handler = createHandler(baseConfig(), kchat);

    const res = await post(handler, { email: "not-an-email", message: "hi" });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "invalid_email");
    assert.equal(kchat._state.sent.length, 0);
});

test("the honeypot returns ok but relays nothing", async () => {
    const kchat = fakeKchat();
    const handler = createHandler(baseConfig(), kchat);

    const res = await post(handler, { message: "spam", website: "http://spam.example" });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(kchat._state.sent.length, 0);
});

test("broadcast mentions are defanged before relay", async () => {
    const kchat = fakeKchat();
    const handler = createHandler(baseConfig(), kchat);

    await post(handler, { message: "ping @channel and @here now" });
    const text = kchat._state.sent[0].text;
    // The literal "@channel"/"@here" must not survive - a zero-width space is inserted.
    assert.doesNotMatch(text, /@channel\b/);
    assert.doesNotMatch(text, /@here\b/);
    assert.match(text, /@\u200Bchannel/);
});

test("an over-long message is truncated to the cap", async () => {
    const kchat = fakeKchat();
    const handler = createHandler(baseConfig({ maxMessageChars: 50 }), kchat);

    const long = "x".repeat(500);
    await post(handler, { message: long });
    const text = kchat._state.sent[0].text;
    assert.ok(text.includes("x".repeat(50)), "the capped body should be present");
    assert.ok(!text.includes("x".repeat(51)), "nothing beyond the cap should be relayed");
});

test("the per-IP rate limit blocks the second message", async () => {
    const kchat = fakeKchat();
    const handler = createHandler(baseConfig({ rateLimitPerHour: 1 }), kchat);

    const first = await post(handler, { message: "one" }, { "x-forwarded-for": "203.0.113.7" });
    assert.equal(first.status, 200);
    const second = await post(handler, { message: "two" }, { "x-forwarded-for": "203.0.113.7" });
    assert.equal(second.status, 429);
    assert.equal(kchat._state.sent.length, 1);
});

test("input is validated before the challenge is spent", async () => {
    // With a challenge secret set, a mistyped e-mail must fail as invalid_email
    // (400) - NOT challenge_failed (403). Otherwise a fixable error would burn the
    // single-use challenge and force a page reload.
    const kchat = fakeKchat();
    const handler = createHandler(baseConfig({ challengeSecret: "s3cr3t" }), kchat);

    const res = await post(handler, { email: "nope", message: "hi" });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "invalid_email");
    assert.equal(kchat._state.sent.length, 0);
});

test("a challenge is required when a secret is configured", async () => {
    const kchat = fakeKchat();
    const handler = createHandler(baseConfig({ challengeSecret: "s3cr3t" }), kchat);

    const res = await post(handler, { message: "no challenge attached" });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, "challenge_failed");
    assert.equal(kchat._state.sent.length, 0);
});

test("GET /config advertises the limit and (with no secret) no challenge", async () => {
    const handler = createHandler(baseConfig(), fakeKchat());
    const res = await handler(new Request("http://localhost/config", { headers: { origin: ORIGIN } }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.maxMessageChars, 4000);
    assert.equal(body.challenge, null);
});

const postRegister = (handler, body, headers = {}) =>
    handler(
        new Request("http://localhost/register", {
            method: "POST",
            headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
            body: JSON.stringify(body),
        }),
    );

test("/register relays a free-licence request (no proof-of-work needed)", async () => {
    // Even with a challenge secret set, /register does not require the challenge -
    // the /free form does not run the PoW flow.
    const kchat = fakeKchat();
    const handler = createHandler(baseConfig({ challengeSecret: "s3cr3t" }), kchat);

    const res = await postRegister(handler, { company: "Acme Inc.", email: "alex@acme.com", marketing: true });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, transport: "webhook" });

    const text = kchat._state.sent[0].text;
    assert.match(text, /Free licence request/);
    assert.match(text, /Acme Inc\./);
    assert.match(text, /alex@acme\.com/);
    assert.match(text, /opt-in:\*\* yes/);
});

test("/register requires a company and a valid e-mail", async () => {
    const kchat = fakeKchat();
    const handler = createHandler(baseConfig(), kchat);

    const noCompany = await postRegister(handler, { email: "alex@acme.com" });
    assert.equal(noCompany.status, 400);
    assert.equal((await noCompany.json()).error, "invalid_company");

    const badEmail = await postRegister(handler, { company: "Acme", email: "nope" });
    assert.equal(badEmail.status, 400);
    assert.equal((await badEmail.json()).error, "invalid_email");

    assert.equal(kchat._state.sent.length, 0);
});

test("/register honeypot returns ok but relays nothing", async () => {
    const kchat = fakeKchat();
    const handler = createHandler(baseConfig(), kchat);

    const res = await postRegister(handler, { company: "Acme", email: "a@b.co", website: "http://bot" });
    assert.equal(res.status, 200);
    assert.equal(kchat._state.sent.length, 0);
});

test("with OTP on, /message needs a valid code+token", async () => {
    const kchat = fakeKchat();
    const handler = createHandler(baseConfig(OTP), kchat);
    const email = "alex@acme.com";
    const { code, token } = await issueCode(OTP.otpSecret, email, 60_000);

    const good = await post(handler, { message: "hi", email, code, token });
    assert.equal(good.status, 200);
    assert.equal(kchat._state.sent.length, 1);

    const bad = await post(handler, { message: "hi", email, code: "000000", token });
    assert.equal(bad.status, 403);
    assert.equal((await bad.json()).error, "code_invalid");
    assert.equal(kchat._state.sent.length, 1); // unchanged
});

test("a mistyped OTP code does not spend the per-IP budget", async () => {
    // The per-token cap in otp.ts is what bounds guessing. If the per-IP limit also
    // counted typos it would run out first, and a visitor fumbling six digits from
    // their inbox would be told "rate_limited" - the wrong problem, for an hour.
    const kchat = fakeKchat();
    const handler = createHandler(baseConfig({ ...OTP, rateLimitPerHour: 2 }), kchat);
    const email = "alex@acme.com";
    const ip = { "x-forwarded-for": "203.0.113.9" };

    for (let i = 0; i < 4; i += 1) {
        const { token } = await issueCode(OTP.otpSecret, email, 60_000);
        const res = await post(handler, { message: "hi", email, code: "000000", token }, ip);
        assert.equal(res.status, 403, `attempt ${i + 1} should still reach the OTP check`);
        assert.equal((await res.json()).reason, "wrong_code");
    }

    // Budget untouched: the real code still gets through.
    const { code, token } = await issueCode(OTP.otpSecret, email, 60_000);
    const good = await post(handler, { message: "hi", email, code, token }, ip);
    assert.equal(good.status, 200);
    assert.equal(kchat._state.sent.length, 1);
});

test("a junk token still spends the per-IP budget", async () => {
    // Only a genuine wrong code is refunded. Someone posting garbage has no token to
    // mistype, so the limit must still cut them off.
    const kchat = fakeKchat();
    const handler = createHandler(baseConfig({ ...OTP, rateLimitPerHour: 2 }), kchat);
    const ip = { "x-forwarded-for": "203.0.113.10" };
    const junk = { message: "hi", email: "alex@acme.com", code: "000000", token: "not-a-token" };

    assert.equal((await post(handler, junk, ip)).status, 403);
    assert.equal((await post(handler, junk, ip)).status, 403);
    assert.equal((await post(handler, junk, ip)).status, 429, "third is over the limit");
});

test("with OTP on, /register needs a valid code+token", async () => {
    const kchat = fakeKchat();
    const handler = createHandler(baseConfig(OTP), kchat);
    const email = "buyer@acme.com";
    const { code, token } = await issueCode(OTP.otpSecret, email, 60_000);

    const missing = await postRegister(handler, { company: "Acme", email });
    assert.equal(missing.status, 403);
    assert.equal(kchat._state.sent.length, 0);

    const ok = await postRegister(handler, { company: "Acme", email, code, token });
    assert.equal(ok.status, 200);
    assert.equal(kchat._state.sent.length, 1);
});

test("/request-code is 404 when OTP is off", async () => {
    const handler = createHandler(baseConfig(), fakeKchat());
    const res = await handler(
        new Request("http://localhost/request-code", {
            method: "POST",
            headers: { "content-type": "application/json", origin: ORIGIN },
            body: JSON.stringify({ email: "a@b.co" }),
        }),
    );
    assert.equal(res.status, 404);
});

test("/request-code issues a token and calls the mailer (signed)", async () => {
    const handler = createHandler(baseConfig(OTP), fakeKchat());
    const calls = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
        calls.push({ url: String(url), init });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    try {
        const res = await handler(
            new Request("http://localhost/request-code", {
                method: "POST",
                headers: { "content-type": "application/json", origin: ORIGIN },
                body: JSON.stringify({ email: "alex@acme.com" }),
            }),
        );
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.ok(body.token, "a token is returned");
        assert.ok(body.expiresAt > Date.now(), "an expiry is returned");

        assert.equal(calls.length, 1, "the mailer was called once");
        assert.match(calls[0].url, /\/send-code$/);
        assert.ok(calls[0].init.headers["x-signature"], "the mailer request is signed");
    } finally {
        globalThis.fetch = realFetch;
    }
});

test("a POST from a disallowed origin is 403 and relays nothing", async () => {
    const kchat = fakeKchat();
    const handler = createHandler(baseConfig(), kchat);

    const res = await handler(
        new Request("http://localhost/message", {
            method: "POST",
            headers: { "content-type": "application/json", origin: "https://evil.example" },
            body: JSON.stringify({ message: "hi" }),
        }),
    );
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, "forbidden_origin");
    assert.equal(kchat._state.sent.length, 0);
});

test("a POST with no Origin header is 403 (blocks bare curl)", async () => {
    const kchat = fakeKchat();
    const handler = createHandler(baseConfig(), kchat);

    const res = await handler(
        new Request("http://localhost/register", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ company: "Acme", email: "a@b.co" }),
        }),
    );
    assert.equal(res.status, 403);
    assert.equal(kchat._state.sent.length, 0);
});

test("an unknown route is 404 and OPTIONS is a 204 preflight", async () => {
    const handler = createHandler(baseConfig(), fakeKchat());

    const notFound = await handler(new Request("http://localhost/nope", { headers: { origin: ORIGIN } }));
    assert.equal(notFound.status, 404);

    const preflight = await handler(
        new Request("http://localhost/message", { method: "OPTIONS", headers: { origin: ORIGIN } }),
    );
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), ORIGIN);
});
