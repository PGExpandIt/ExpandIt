import { test } from "node:test";
import assert from "node:assert/strict";

import { createHandler } from "../dist/handler.js";
import { sign } from "../dist/hmac.js";

const SECRET = "test-shared-secret";

const fakeSender = (opts = {}) => {
    const state = { sent: [] };
    return {
        async sendCode(email, code) {
            if (opts.fail) throw new Error("smtp boom");
            state.sent.push({ email, code });
        },
        _state: state,
    };
};

const baseConfig = (over = {}) => ({
    port: 8790,
    smtp: { host: "mail.example", port: 465, secure: true, user: "sales@vallus.eu", pass: "x" },
    from: "sales@vallus.eu",
    fromName: "vallus",
    codeSubject: "Your vallus verification code",
    codeBody: "Your vallus verification code is {code}. Valid {minutes} minutes.",
    codeTtlMinutes: 10,
    authSecret: SECRET,
    rateLimitPerHour: 100,
    ...over,
});

const send = async (handler, payload, { signature } = {}) => {
    const raw = JSON.stringify(payload);
    const sig = signature ?? (await sign(SECRET, raw));
    return handler(
        new Request("http://localhost/send-code", {
            method: "POST",
            headers: { "content-type": "application/json", "x-signature": sig },
            body: raw,
        }),
    );
};

test("a correctly signed request sends the code", async () => {
    const sender = fakeSender();
    const handler = createHandler(baseConfig(), sender);

    const res = await send(handler, { email: "alex@acme.com", code: "123456" });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.deepEqual(sender._state.sent, [{ email: "alex@acme.com", code: "123456" }]);
});

test("a bad signature is rejected and nothing is sent", async () => {
    const sender = fakeSender();
    const handler = createHandler(baseConfig(), sender);

    const res = await send(handler, { email: "alex@acme.com", code: "123456" }, { signature: "deadbeef" });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, "bad_signature");
    assert.equal(sender._state.sent.length, 0);
});

test("a signature over different bytes is rejected (tamper)", async () => {
    const sender = fakeSender();
    const handler = createHandler(baseConfig(), sender);

    // Sign one body, submit another.
    const goodSig = await sign(SECRET, JSON.stringify({ email: "a@b.co", code: "111111" }));
    const res = await handler(
        new Request("http://localhost/send-code", {
            method: "POST",
            headers: { "content-type": "application/json", "x-signature": goodSig },
            body: JSON.stringify({ email: "evil@x.co", code: "999999" }),
        }),
    );
    assert.equal(res.status, 401);
    assert.equal(sender._state.sent.length, 0);
});

test("an invalid e-mail or code is 400", async () => {
    const sender = fakeSender();
    const handler = createHandler(baseConfig(), sender);

    const badEmail = await send(handler, { email: "nope", code: "123456" });
    assert.equal(badEmail.status, 400);
    assert.equal((await badEmail.json()).error, "invalid_email");

    const badCode = await send(handler, { email: "a@b.co", code: "12" });
    assert.equal(badCode.status, 400);
    assert.equal((await badCode.json()).error, "invalid_code");

    assert.equal(sender._state.sent.length, 0);
});

test("per-recipient rate limit blocks the second send", async () => {
    const sender = fakeSender();
    const handler = createHandler(baseConfig({ rateLimitPerHour: 1 }), sender);

    assert.equal((await send(handler, { email: "a@b.co", code: "111111" })).status, 200);
    assert.equal((await send(handler, { email: "a@b.co", code: "222222" })).status, 429);
    assert.equal(sender._state.sent.length, 1);
});

test("an SMTP failure surfaces as a generic 502", async () => {
    const sender = fakeSender({ fail: true });
    const handler = createHandler(baseConfig(), sender);

    const res = await send(handler, { email: "a@b.co", code: "123456" });
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error, "send_failed");
});

test("health is open, unknown routes are 404", async () => {
    const handler = createHandler(baseConfig(), fakeSender());
    assert.equal((await handler(new Request("http://localhost/health"))).status, 200);
    assert.equal((await handler(new Request("http://localhost/nope"))).status, 404);
});
