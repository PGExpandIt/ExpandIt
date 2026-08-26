// Configuration from the environment. Node-only: this service runs on a host with
// outbound SMTP, loaded via --env-file locally and real env in production.

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
}

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
});
