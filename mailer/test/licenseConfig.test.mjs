import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { loadConfig } from "../dist/config.js";
import { SmtpSender } from "../dist/mailer.js";

const { privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
});

const BASE_ENV = { SMTP_HOST: "mail.example", SMTP_USER: "sales@vallus.eu", SMTP_PASS: "x", MAILER_AUTH_SECRET: "s" };
const LICENSE_KEYS = ["FREE_LICENSE_KEY_B64", "FREE_LICENSE_TERM_DAYS", "FREE_LICENSE_MIN_VERSION", "LICENSE_SUBJECT", "LICENSE_BODY", "MAIL_SIGNATURE"];

/** Runs `fn` with exactly these variables set, and puts the environment back after. */
const withEnv = (vars, fn) => {
    const saved = { ...process.env };
    for (const name of [...Object.keys(BASE_ENV), ...LICENSE_KEYS]) delete process.env[name];
    Object.assign(process.env, BASE_ENV, vars);
    try {
        return fn();
    } finally {
        process.env = saved;
    }
};

const b64 = (pem) => Buffer.from(pem, "utf8").toString("base64");

test("without FREE_LICENSE_KEY_B64 licence issuing is off", () => {
    withEnv({}, () => assert.equal(loadConfig().freeLicense, null));
});

test("the base64 key decodes to the PEM, with the 183-day default term", () => {
    withEnv({ FREE_LICENSE_KEY_B64: b64(privateKey), FREE_LICENSE_MIN_VERSION: "1.5.0" }, () => {
        const { freeLicense } = loadConfig();
        assert.equal(freeLicense.privateKeyPem, privateKey);
        assert.equal(freeLicense.termDays, 183);
        assert.equal(freeLicense.minVersion, "1.5.0");
    });
});

test("a key that is not a PEM private key fails at startup", () => {
    withEnv({ FREE_LICENSE_KEY_B64: b64("hello"), FREE_LICENSE_MIN_VERSION: "1.5.0" }, () => {
        assert.throws(() => loadConfig(), /does not decode to a PEM private key/);
    });
    withEnv({ FREE_LICENSE_KEY_B64: b64("-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----"), FREE_LICENSE_MIN_VERSION: "1.5.0" }, () => {
        assert.throws(() => loadConfig());
    });
});

test("a term longer than the runners accept fails at startup", () => {
    withEnv({ FREE_LICENSE_KEY_B64: b64(privateKey), FREE_LICENSE_MIN_VERSION: "1.5.0", FREE_LICENSE_TERM_DAYS: "365" }, () => {
        assert.throws(() => loadConfig(), /FREE_LICENSE_TERM_DAYS must be 1-190/);
    });
});

test("the minimum version is required once the key is set", () => {
    withEnv({ FREE_LICENSE_KEY_B64: b64(privateKey) }, () => {
        assert.throws(() => loadConfig(), /FREE_LICENSE_MIN_VERSION/);
    });
});

test("the licence e-mail carries company, key, expiry and version, placeholders substituted once", async () => {
    await withEnv({ FREE_LICENSE_KEY_B64: b64(privateKey), FREE_LICENSE_MIN_VERSION: "1.5.0", MAIL_SIGNATURE: "vallus\\nsales@vallus.eu" }, async () => {
        const sender = new SmtpSender(loadConfig());
        let sent;
        sender.transport = { sendMail: async (mail) => { sent = mail; } };

        await sender.sendLicense("alex@acme.com", { company: "Acme {key}", key: "KEY.SIG", expires: "2027-03-19" });

        assert.equal(sent.to, "alex@acme.com");
        assert.equal(sent.subject, "Your free vallus licence");
        assert.match(sent.text, /Company: Acme \{key\}\n/, "a placeholder typed into the company stays literal");
        assert.match(sent.text, /Licence key:\nKEY\.SIG\n/);
        assert.match(sent.text, /valid until 2027-03-19/);
        assert.match(sent.text, /vallus 1\.5\.0 or newer/);
        assert.equal(sent.text.split("KEY.SIG").length, 2, "the key appears exactly once");
        assert.match(sent.text, /\n-- \nvallus\nsales@vallus\.eu\n$/);
    });
});
