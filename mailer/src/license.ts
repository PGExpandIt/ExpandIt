// Issues free-tier licence keys, signed with the free key only.
//
// The contract is playwrightRunner-license-gen/documentation-ignored/licenseGen.md:
// base64(payloadJson) + "." + base64(RSA-SHA256 over that same payloadJson). Both
// runners hold a key signed with the free key to the free tier whatever it says, and
// reject one that expires more than 190 days out - so the payload below is the free
// preset exactly, and the term is checked here rather than discovered by a customer.
//
// Node crypto rather than Web Crypto on purpose: it is what the generator signs with,
// so a key from here and a key from `node generate.js --signer free` are byte-for-byte
// the same shape.

import crypto from "node:crypto";

/** The runners reject a free-signed key whose expiry is further away than this. */
export const FREE_LICENSE_MAX_TERM_DAYS = 190;

export interface FreeLicensePayload {
    company: string;
    expires: string;
    tier: "free";
    max_users: 2;
    max_projects: 1;
    max_instances: 1;
    max_concurrent_runs: 1;
    features: [];
}

export interface IssuedLicense {
    payload: FreeLicensePayload;
    key: string;
}

/** YYYY-MM-DD, `days` after `now`, in UTC - the date form the runners parse. */
const dateAfter = (now: Date, days: number): string => {
    const d = new Date(now.getTime());
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
};

/**
 * Field order matters only for readability - the signature covers the exact string
 * that is base64-encoded, whatever order it is in. It follows the generator's
 * buildPayload so the two sources of free keys look the same.
 */
export const buildFreePayload = (company: string, now: Date, termDays: number): FreeLicensePayload => {
    if (!Number.isInteger(termDays) || termDays < 1 || termDays > FREE_LICENSE_MAX_TERM_DAYS) {
        throw new Error(`the free licence term must be 1-${FREE_LICENSE_MAX_TERM_DAYS} days (got ${termDays})`);
    }
    return {
        company,
        expires: dateAfter(now, termDays),
        tier: "free",
        max_users: 2,
        max_projects: 1,
        max_instances: 1,
        max_concurrent_runs: 1,
        features: [],
    };
};

export const signLicense = (payload: FreeLicensePayload, privateKeyPem: string): string => {
    const json = JSON.stringify(payload);
    const signature = crypto.createSign("RSA-SHA256").update(json).sign(privateKeyPem, "base64");
    return `${Buffer.from(json, "utf8").toString("base64")}.${signature}`;
};

export const issueFreeLicense = (
    company: string,
    privateKeyPem: string,
    termDays: number,
    now: Date = new Date(),
): IssuedLicense => {
    const payload = buildFreePayload(company, now, termDays);
    return { payload, key: signLicense(payload, privateKeyPem) };
};

/**
 * Fails at startup, not on the first request, when the configured key is not a usable
 * RSA private key. A broken key would otherwise surface as a 502 to a visitor who has
 * just confirmed their e-mail.
 */
export const assertUsablePrivateKey = (privateKeyPem: string): void => {
    const key = crypto.createPrivateKey(privateKeyPem);
    if (key.asymmetricKeyType !== "rsa") {
        throw new Error(`the free licence key must be RSA (got ${key.asymmetricKeyType})`);
    }
};
