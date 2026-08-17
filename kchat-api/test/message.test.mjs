import { test } from "node:test";
import assert from "node:assert/strict";

import { createHandler } from "../dist/handler.js";

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
    challengeSecret: null, // challenge off — these tests exercise validation and relay
    challengeDifficulty: 15,
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
    // The literal "@channel"/"@here" must not survive — a zero-width space is inserted.
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
    // (400) — NOT challenge_failed (403). Otherwise a fixable error would burn the
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
