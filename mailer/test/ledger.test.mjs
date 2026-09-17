import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createHandler } from "../dist/handler.js";
import { sign } from "../dist/hmac.js";
import { LicenseLedger, decide, emailDomain, isPersonalDomain, normaliseCompany, RENEWAL_WINDOW_DAYS } from "../dist/ledger.js";

const SECRET = "test-shared-secret";
const NOW = new Date("2026-09-17T12:00:00Z");
const DAY = 86_400_000;
const later = (days) => new Date(NOW.getTime() + days * DAY);

const freePair = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const fakeSender = () => {
    const state = { licenses: [] };
    return {
        async sendCode() {},
        async sendLicense(email, license) {
            state.licenses.push({ email, ...license });
        },
        _state: state,
    };
};

const config = {
    port: 8790,
    bindHost: "127.0.0.1",
    smtp: { host: "mail.example", port: 465, secure: true, user: "sales@vallus.eu", pass: "x" },
    from: "sales@vallus.eu",
    fromName: "vallus",
    codeSubject: "code",
    codeBody: "{code}",
    codeTtlMinutes: 10,
    signature: "",
    authSecret: SECRET,
    rateLimitPerHour: 1000,
    freeLicense: {
        privateKeyPem: freePair.privateKey,
        termDays: 183,
        subject: "s",
        body: "{key}",
        minVersion: "1.4.1",
        downloadsUrl: "https://downloads.vallus.eu",
        ledgerPath: "unused",
    },
};

const post = async (handler, email, company) => {
    const raw = JSON.stringify({ email, company });
    return handler(
        new Request("http://localhost/send-license", {
            method: "POST",
            headers: { "content-type": "application/json", "x-signature": await sign(SECRET, raw) },
            body: raw,
        }),
    );
};

/** A handler whose clock can be moved, over one shared ledger. */
const setup = (ledger = new LicenseLedger(null)) => {
    const sender = fakeSender();
    let clock = NOW;
    const handler = createHandler(config, sender, () => clock, ledger);
    return { sender, ledger, handler, at: (date) => { clock = date; } };
};

// ── the rules, pure ──

test("company names compare without case, accents, punctuation or legal form", () => {
    const same = ["ACME Sp. z o.o.", "Acme sp. z o. o.", "acme", "Acme GmbH", "ACME, Inc.", "The Acme Company Ltd"];
    for (const name of same) assert.equal(normaliseCompany(name), "acme", name);
    assert.equal(normaliseCompany("Zakład Łódź S.A."), "zaklad lodz");
    assert.equal(normaliseCompany("Smith & Sons"), "smith and sons");
    assert.notEqual(normaliseCompany("Acme Labs"), normaliseCompany("Acme"));
    assert.equal(normaliseCompany("Sp. z o.o."), "sp zoo", "only legal-form words: kept rather than emptied");
});

test("personal and disposable mailboxes are recognised by domain", () => {
    assert.equal(emailDomain("Alex@Acme.COM"), "acme.com");
    for (const domain of ["gmail.com", "wp.pl", "onet.pl", "outlook.com", "mailinator.com", "proton.me"]) {
        assert.equal(isPersonalDomain(domain), true, domain);
    }
    assert.equal(isPersonalDomain("acme.com"), false);
});

test("decide: new organisation issues, a personal mailbox goes to review", () => {
    assert.deepEqual(decide([], "alex@acme.com", "Acme", NOW), { action: "issue" });
    assert.deepEqual(decide([], "alex@gmail.com", "Acme", NOW), { action: "manual", reason: "personal_email" });
});

// ── the endpoint, over a ledger ──

test("a second request from the same domain gets the same key again, not a new one", async () => {
    const { handler, sender, ledger } = setup();
    const first = await post(handler, "alex@acme.com", "Acme Sp. z o.o.");
    assert.deepEqual(await first.json(), { ok: true, expires: "2027-03-19", reissued: false });

    // A colleague, a different spelling of the name.
    const second = await post(handler, "kim@acme.com", "ACME");
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), { ok: true, expires: "2027-03-19", reissued: true });

    const [a, b] = sender._state.licenses;
    assert.equal(b.key, a.key, "the same key, byte for byte");
    assert.equal(b.company, "Acme Sp. z o.o.", "the name the key is bound to, not the one typed now");
    assert.equal(b.email, "kim@acme.com");
    assert.equal(ledger.size, 1, "a re-send is not a new licence");
});

test("the same company name from another domain is sent to review, and gets no key", async () => {
    const { handler, sender } = setup();
    await post(handler, "alex@acme.com", "Acme");
    const res = await post(handler, "someone@acme-trading.io", "ACME Ltd");
    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), { error: "manual_review", reason: "company_has_licence" });
    assert.equal(sender._state.licenses.length, 1);
});

test("a personal mailbox is never issued a key automatically", async () => {
    const { handler, sender } = setup();
    const res = await post(handler, "alex@gmail.com", "Acme");
    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), { error: "manual_review", reason: "personal_email" });
    assert.equal(sender._state.licenses.length, 0);
});

test(`a new licence is issued from ${RENEWAL_WINDOW_DAYS} days before the old one ends`, async () => {
    const { handler, sender, ledger, at } = setup();
    await post(handler, "alex@acme.com", "Acme"); // expires 2027-03-19, 183 days out

    at(later(183 - RENEWAL_WINDOW_DAYS - 1));
    assert.equal((await (await post(handler, "alex@acme.com", "Acme")).json()).reissued, true, "15 days left: still the old key");

    at(later(183 - RENEWAL_WINDOW_DAYS));
    const renewed = await (await post(handler, "alex@acme.com", "Acme")).json();
    assert.equal(renewed.reissued, false, "14 days left: renewal");
    assert.notEqual(renewed.expires, "2027-03-19");
    assert.equal(ledger.size, 2);

    // And the renewal is what is re-sent from then on.
    const again = await (await post(handler, "alex@acme.com", "Acme")).json();
    assert.deepEqual(again, { ok: true, expires: renewed.expires, reissued: true });
    assert.equal(sender._state.licenses.at(-1).key, sender._state.licenses.at(-2).key);
});

test("an expired licence does not block a new one, for the name or the domain", async () => {
    const { handler, at } = setup();
    await post(handler, "alex@acme.com", "Acme");
    at(later(200));
    assert.equal((await (await post(handler, "kim@acme.com", "Acme")).json()).reissued, false);
});

test("requests from one company arriving together issue one key", async () => {
    const { handler, sender, ledger } = setup();
    const answers = await Promise.all([
        post(handler, "a@acme.com", "Acme"),
        post(handler, "b@acme.com", "Acme"),
        post(handler, "c@acme.com", "Acme"),
    ]);
    const bodies = await Promise.all(answers.map((res) => res.json()));
    assert.equal(bodies.filter((body) => body.reissued === false).length, 1);
    assert.equal(ledger.size, 1);
    assert.equal(new Set(sender._state.licenses.map((license) => license.key)).size, 1);
});

test("the ledger survives a restart, and a bad line does not lose the rest", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vallus-ledger-"));
    const file = path.join(dir, "nested", "licenses.jsonl");
    try {
        const first = setup(new LicenseLedger(file));
        await post(first.handler, "alex@acme.com", "Acme");
        fs.appendFileSync(file, "not json\n");

        const restarted = setup(new LicenseLedger(file));
        assert.equal(restarted.ledger.size, 1);
        const res = await post(restarted.handler, "kim@acme.com", "Acme");
        assert.equal((await res.json()).reissued, true);

        const line = JSON.parse(fs.readFileSync(file, "utf8").split("\n")[0]);
        assert.deepEqual(Object.keys(line).sort(), ["company", "companyKey", "domain", "email", "expires", "issuedAt"]);
        assert.ok(!fs.readFileSync(file, "utf8").includes("PRIVATE"), "no key material on disk");
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
