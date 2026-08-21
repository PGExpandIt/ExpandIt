// All configuration comes from the environment. Nothing here may ever reach the
// browser: the webhook URL — or the bot token — lets the holder post into the
// channel, so it stays on this service.

// Nothing here touches the filesystem: on Bunny Edge Scripting there is none.
// Locally the .env file is loaded by Node itself via --env-file (see package.json);
// on the edge the values come from the script's environment variables and secrets.

/**
 * Reads an environment variable on whichever runtime this is.
 *
 * Bunny's docs give two ways of doing it — `Deno.env.get` and `process.env` — and
 * which one exists depends on the runtime the script ends up on. Checking both
 * means the same build works under Node locally and on the edge in production.
 */
const readEnv = (name: string): string | undefined => {
    const deno = (globalThis as any).Deno;
    if (deno?.env?.get) {
        const value = deno.env.get(name);
        if (value !== undefined) return value;
    }
    return (globalThis as any).process?.env?.[name];
};

const optional = (name: string, fallback: string): string => readEnv(name) ?? fallback;

const list = (name: string, fallback: string): string[] =>
    optional(name, fallback)
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);

export interface Config {
    /** Incoming-webhook URL. When set, this is the transport. */
    webhookUrl: string | null;
    /** Bot/personal-access token — the fallback transport when no webhook is set. */
    token: string | null;
    /** API origin for the token transport, e.g. https://<org>.kchat.infomaniak.com */
    apiBase: string | null;
    /** Target channel id for the token transport. */
    channelId: string | null;
    /** Channel name override for the webhook transport (optional). */
    defaultChannel: string | null;
    /** Display name for webhook posts (optional). */
    username: string | null;
    /** Icon emoji for webhook posts, e.g. ":envelope:" (optional). */
    iconEmoji: string | null;
    /**
     * Optional path prefix stripped from the request before routing. Lets the same
     * script answer both directly (`/message`) and behind a same-origin reverse
     * proxy that forwards under a prefix (`/api/kchat/message`). Empty by default.
     */
    basePath: string;
    /** Prefix line prepended to every relayed message. */
    messagePrefix: string;
    /** Hard cap on the message body; longer input is truncated. */
    maxMessageChars: number;
    port: number;
    allowedOrigins: string[];
    /** Per-IP message attempts allowed per hour. */
    rateLimitPerHour: number;
    /**
     * Secret signing the proof-of-work challenges. Unset disables the challenge —
     * the honeypot and the rate limit still apply, but POST /message becomes
     * reachable without loading the page first. Must be identical across all edge
     * instances, so it has to come from the environment rather than be generated
     * per process.
     */
    challengeSecret: string | null;
    /**
     * Leading zero bits required. 15 averages ~0.3 s in a browser and stays under a
     * second in the bad case, which is invisible because the browser solves it while
     * the form is being filled in. Each extra bit doubles the work.
     */
    challengeDifficulty: number;
    /**
     * OTP e-mail verification. Enabled only when all three are set (secret + mailer
     * URL + mailer shared secret); otherwise /request-code is off and the message
     * endpoints fall back to the proof-of-work challenge.
     */
    otpSecret: string | null;
    mailerUrl: string | null;
    mailerSecret: string | null;
    /** How long an issued code stays valid, in ms. */
    otpTtlMs: number;
}

export { readEnv };

export const loadConfig = (): Config => {
    const webhookUrl = readEnv("KCHAT_WEBHOOK_URL")?.trim() || null;
    const token = readEnv("KCHAT_TOKEN")?.trim() || null;
    const apiBase = readEnv("KCHAT_API_BASE")?.trim().replace(/\/$/, "") || null;
    const channelId = readEnv("KCHAT_CHANNEL_ID")?.trim() || null;

    // One transport must be fully configured, or the service can do nothing.
    const webhookReady = webhookUrl !== null;
    const tokenReady = token !== null && apiBase !== null && channelId !== null;
    if (!webhookReady && !tokenReady) {
        throw new Error(
            "No kChat transport configured: set KCHAT_WEBHOOK_URL, or all of " +
                "KCHAT_API_BASE, KCHAT_TOKEN and KCHAT_CHANNEL_ID.",
        );
    }

    return {
        webhookUrl,
        token,
        apiBase,
        channelId,
        basePath: (readEnv("KCHAT_BASE_PATH")?.trim() || "").replace(/\/$/, ""),
        defaultChannel: readEnv("KCHAT_CHANNEL")?.trim() || null,
        username: readEnv("KCHAT_USERNAME")?.trim() || null,
        iconEmoji: readEnv("KCHAT_ICON_EMOJI")?.trim() || null,
        messagePrefix: optional("KCHAT_MESSAGE_PREFIX", "New message from the vallus website"),
        maxMessageChars: Number(optional("KCHAT_MAX_MESSAGE_CHARS", "4000")),
        port: Number(optional("PORT", "8788")),
        allowedOrigins: list("ALLOWED_ORIGINS", "https://vallus.eu"),
        rateLimitPerHour: Number(optional("KCHAT_RATE_LIMIT_PER_HOUR", "5")),
        challengeSecret: readEnv("KCHAT_CHALLENGE_SECRET")?.trim() || null,
        challengeDifficulty: Number(optional("KCHAT_CHALLENGE_DIFFICULTY", "15")),
        otpSecret: readEnv("KCHAT_OTP_SECRET")?.trim() || null,
        mailerUrl: readEnv("KCHAT_MAILER_URL")?.trim().replace(/\/$/, "") || null,
        mailerSecret: readEnv("KCHAT_MAILER_SECRET")?.trim() || null,
        otpTtlMs: Number(optional("KCHAT_OTP_TTL_MINUTES", "10")) * 60 * 1000,
    };
};
