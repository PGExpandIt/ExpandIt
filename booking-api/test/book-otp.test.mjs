// Booking with e-mail verification on: /book must refuse anything that is not a
// code we actually e-mailed, and the calendar must stay untouched when it does.
//
// The calendar is a stub — these tests are about the gate in front of it, and a
// real Infomaniak account would make them untestable in CI. The mailer is stubbed
// through globalThis.fetch for the same reason: the point is what the handler does
// with the answer, not that SMTP works.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createHandler } from "../dist/handler.js";
import { issueCode } from "../dist/otp.js";

const OTP_SECRET = "booking-otp-test-secret";
const ORIGIN = "https://vallus.eu";
const EMAIL = "visitor@example.com";

/** A slot the stub calendar reports as free, far enough out to clear the lead time. */
const freeSlot = () => {
    const when = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    when.setUTCHours(7, 0, 0, 0); // 09:00 in Europe/Warsaw during DST
    while (when.getUTCDay() !== 2) when.setUTCDate(when.getUTCDate() + 1); // a Tuesday
    return when;
};

const config = () => ({
    token: "stub",
    calendarId: "1",
    timezone: "Europe/Warsaw",
    port: 0,
    allowedOrigins: [ORIGIN],
    workdays: [1, 2, 3, 4, 5],
    slotTimes: ["09:00"],
    slotMinutes: 30,
    leadHours: 24,
    horizonDays: 30,
    eventTitlePrefix: "vallus demo",
    rateLimitPerHour: 50,
    organizerEmail: null,
    organizerName: null,
    adminToken: null,
    retentionPeriod: "6m",
    holdsPerWeek: 1,
    holdTitle: "Unavailable",
    challengeSecret: null,
    challengeDifficulty: 10,
    otpSecret: OTP_SECRET,
    mailerUrl: "https://mailer.example",
    mailerSecret: "mailer-test-secret",
    otpTtlMs: 10 * 60 * 1000,
});

const stubCalendar = () => {
    const created = [];
    return {
        created,
        listBusy: async () => [],
        createEvent: async (event) => {
            created.push(event);
            return { id: "evt-1", ...event };
        },
    };
};

const post = (handler, path, body) =>
    handler(
        new Request(`https://api.example${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Origin: ORIGIN },
            body: JSON.stringify(body),
        }),
    );

const bookingBody = (extra) => ({
    name: "Visitor",
    email: EMAIL,
    start: freeSlot().toISOString(),
    ...extra,
});

test("/slots advertises that a code is required", async () => {
    const handler = createHandler(config(), stubCalendar());
    const res = await handler(new Request("https://api.example/slots", { headers: { Origin: ORIGIN } }));
    const body = await res.json();
    assert.equal(body.otp, true);
});

test("booking without a code is refused and creates nothing", async () => {
    const calendar = stubCalendar();
    const res = await post(createHandler(config(), calendar), "/book", bookingBody());

    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, "code_invalid");
    assert.equal(calendar.created.length, 0);
});

test("a valid code books the slot", async () => {
    const calendar = stubCalendar();
    const issued = await issueCode(OTP_SECRET, EMAIL, 10 * 60 * 1000);

    const res = await post(
        createHandler(config(), calendar),
        "/book",
        bookingBody({ code: issued.code, token: issued.token }),
    );

    assert.equal(res.status, 201);
    assert.equal(calendar.created.length, 1);
    assert.equal(calendar.created[0].attendeeEmail, EMAIL);
});

test("a code issued for one address does not book for another", async () => {
    const calendar = stubCalendar();
    const issued = await issueCode(OTP_SECRET, "someone.else@example.com", 10 * 60 * 1000);

    const res = await post(
        createHandler(config(), calendar),
        "/book",
        bookingBody({ code: issued.code, token: issued.token }),
    );

    assert.equal(res.status, 403);
    assert.equal(calendar.created.length, 0);
});

test("a code books once — the second attempt is refused", async () => {
    const calendar = stubCalendar();
    const issued = await issueCode(OTP_SECRET, EMAIL, 10 * 60 * 1000);
    const handler = createHandler(config(), calendar);
    const body = bookingBody({ code: issued.code, token: issued.token });

    assert.equal((await post(handler, "/book", body)).status, 201);
    assert.equal((await post(handler, "/book", body)).status, 403);
    assert.equal(calendar.created.length, 1);
});

test("/request-code e-mails a code and returns only the token", async () => {
    const sent = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
        sent.push({ url: String(url), body: JSON.parse(init.body) });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    try {
        const res = await post(createHandler(config(), stubCalendar()), "/request-code", { email: EMAIL });
        const body = await res.json();

        assert.equal(res.status, 200);
        assert.ok(body.token, "a token is returned");
        assert.equal(body.code, undefined, "the code itself must never come back to the browser");
        assert.equal(sent.length, 1);
        assert.match(sent[0].url, /\/send-code$/);
        assert.equal(sent[0].body.email, EMAIL);
        assert.match(sent[0].body.code, /^\d{6}$/);
    } finally {
        globalThis.fetch = realFetch;
    }
});

test("a mailer failure is reported as 502, not as a booking", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("boom", { status: 500 });

    try {
        const res = await post(createHandler(config(), stubCalendar()), "/request-code", { email: EMAIL });
        assert.equal(res.status, 502);
        assert.equal((await res.json()).error, "mail_failed");
    } finally {
        globalThis.fetch = realFetch;
    }
});

test("/request-code is invisible when verification is off", async () => {
    const off = { ...config(), otpSecret: null };
    const res = await post(createHandler(off, stubCalendar()), "/request-code", { email: EMAIL });
    assert.equal(res.status, 404);
});
