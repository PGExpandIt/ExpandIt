// Configuration from the environment. Node-only: this service runs on a host with
// outbound SMTP, loaded via --env-file locally and real env in production.

import { assertUsablePrivateKey, FREE_LICENSE_MAX_TERM_DAYS } from "./license.js";

const readEnv = (name: string): string | undefined => process.env[name];

const required = (name: string): string => {
    const value = readEnv(name);
    if (!value) throw new Error(`Missing required environment variable ${name}`);
    return value;
};

const optional = (name: string, fallback: string): string => readEnv(name) ?? fallback;

export interface Config {
    port: number;
    /** Interface to bind. Loopback locally; 0.0.0.0 in a container, where the
     *  Service - not the public network - is what reaches the port. */
    bindHost: string;
    smtp: {
        host: string;
        port: number;
        secure: boolean;
        user: string;
        pass: string;
    };
    from: string;
    fromName: string;
    codeSubject: string;
    /** Body template; {code} and {minutes} are substituted. */
    codeBody: string;
    codeTtlMinutes: number;
    /** Footer appended below the body, after the RFC 3676 `-- ` delimiter.
     *  Empty means no footer. Copied from the mailbox's webmail signature by
     *  hand - that one is a webmail feature and never reaches an SMTP send. */
    signature: string;
    /** Shared HMAC secret the edge signs /send-code requests with. */
    authSecret: string;
    rateLimitPerHour: number;
    /**
     * Free-tier licence issuing. Null when FREE_LICENSE_KEY_B64 is unset, and then
     * /send-license answers 404 - the mailer keeps sending codes exactly as before.
     */
    freeLicense: FreeLicenseConfig | null;
}

export interface FreeLicenseConfig {
    /** PEM of free-private.pem. Signs free-tier keys only; see src/license.ts. */
    privateKeyPem: string;
    /** Days until expiry. The generator's free preset uses 183; the runners accept 190 at most. */
    termDays: number;
    subject: string;
    /** Body template; {company}, {key}, {expires}, {minVersion} and {downloads} are substituted. */
    body: string;
    /** Base of the downloads host; its latest.json supplies the {downloads} links. */
    downloadsUrl: string;
    /** JSON-lines record of issued licences - see src/ledger.ts. */
    ledgerPath: string;
    /** Oldest vallus release that carries the free public key. Older ones reject the key. */
    minVersion: string;
}

const DEFAULT_LICENSE_BODY = [
    "Here is your free vallus licence.",
    "",
    "Company: {company}",
    "",
    "Licence key:",
    "{key}",
    "",
    "{downloads}",
    "",
    "Enter both in vallus under Setup > License, or Admin > System > Update license on a",
    "running instance. Type the company name exactly as above, including capital letters:",
    "the key is bound to it.",
    "",
    "The licence is valid until {expires} and covers 2 users, 1 project and one test run",
    "at a time. It needs vallus {minVersion} or newer. When it runs out, request a new one",
    "at https://vallus.eu/free/.",
].join("\n");

/**
 * The key arrives base64-encoded because a PEM is multi-line and .env files, compose
 * env_file and most secret stores are not:
 *   base64 < free-private.pem | tr -d '\n'
 */
const loadFreeLicense = (): FreeLicenseConfig | null => {
    const encoded = readEnv("FREE_LICENSE_KEY_B64")?.trim();
    if (!encoded) return null;
    const privateKeyPem = Buffer.from(encoded, "base64").toString("utf8");
    if (!privateKeyPem.includes("PRIVATE KEY")) {
        throw new Error("FREE_LICENSE_KEY_B64 does not decode to a PEM private key");
    }
    assertUsablePrivateKey(privateKeyPem);
    const termDays = Number(optional("FREE_LICENSE_TERM_DAYS", "183"));
    if (!Number.isInteger(termDays) || termDays < 1 || termDays > FREE_LICENSE_MAX_TERM_DAYS) {
        throw new Error(`FREE_LICENSE_TERM_DAYS must be 1-${FREE_LICENSE_MAX_TERM_DAYS}; the runners reject longer free keys`);
    }
    return {
        privateKeyPem,
        termDays,
        subject: optional("LICENSE_SUBJECT", "Your free vallus licence"),
        body: optional("LICENSE_BODY", DEFAULT_LICENSE_BODY).replaceAll("\\n", "\n"),
        minVersion: required("FREE_LICENSE_MIN_VERSION"),
        downloadsUrl: optional("DOWNLOADS_URL", "https://downloads.vallus.eu"),
        ledgerPath: optional("LICENSE_LEDGER_PATH", "data/licenses.jsonl"),
    };
};

export const loadConfig = (): Config => ({
    port: Number(optional("PORT", "8790")),
    bindHost: optional("BIND_HOST", "127.0.0.1"),
    smtp: {
        host: required("SMTP_HOST"),
        port: Number(optional("SMTP_PORT", "587")),
        secure: optional("SMTP_SECURE", "false") === "true",
        user: required("SMTP_USER"),
        pass: required("SMTP_PASS"),
    },
    from: optional("MAIL_FROM", required("SMTP_USER")),
    fromName: optional("MAIL_FROM_NAME", "vallus"),
    codeSubject: optional("CODE_SUBJECT", "Your vallus verification code"),
    codeBody: optional(
        "CODE_BODY",
        "Your vallus verification code is {code}. It is valid for {minutes} minutes.",
    ),
    codeTtlMinutes: Number(optional("CODE_TTL_MINUTES", "10")),
    // A multi-line footer has to survive a single-line .env, so `\n` in the value
    // is turned into a real newline here.
    signature: optional("MAIL_SIGNATURE", "").replaceAll("\\n", "\n").trim(),
    authSecret: required("MAILER_AUTH_SECRET"),
    rateLimitPerHour: Number(optional("SEND_RATE_LIMIT_PER_HOUR", "5")),
    freeLicense: loadFreeLicense(),
});
