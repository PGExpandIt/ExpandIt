// The whole API as one Web-standard handler: Request in, Response out.
//
// Deliberately free of any runtime-specific API, so the same code serves requests
// locally under Node and on Bunny Edge Scripting (Deno). Anything that needs a
// filesystem, a socket or a process lives in config.ts or edge.ts.
//
//   browser ──GET  /config ──►  challenge + limits
//           ──POST /message──►  relayed into the kChat channel

import { issueChallenge, verifyChallenge } from "./challenge.js";
import type { Config } from "./config.js";
import type { KChat } from "./kchat.js";

const MAX_BODY_BYTES = 16 * 1024;
/** A form filled in faster than this was not filled in by a person. */
const CHALLENGE_MIN_AGE_MS = 3_000;
/** Long enough to read the page and think, short enough to bound replay. */
const CHALLENGE_MAX_AGE_MS = 60 * 60 * 1000;
const EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

/**
 * Per-IP message attempts.
 *
 * At the edge this is best-effort and nothing more: instances are many and
 * short-lived, so a caller spread across regions sees a much higher effective
 * limit than the configured one. It raises the cost of casual abuse; it is not a
 * security boundary. The honeypot and the proof-of-work challenge are what actually
 * keep the channel clean.
 */
const attempts = new Map<string, number[]>();

const rateLimited = (ip: string, perHour: number): boolean => {
    const hourAgo = Date.now() - 60 * 60 * 1000;
    const recent = (attempts.get(ip) ?? []).filter((at) => at > hourAgo);
    attempts.set(ip, recent);
    if (recent.length >= perHour) return true;
    recent.push(Date.now());
    return false;
};

const clientIp = (request: Request): string => {
    for (const header of ["x-forwarded-for", "x-real-ip", "cf-connecting-ip"]) {
        const value = request.headers.get(header);
        if (value) return value.split(",")[0].trim();
    }
    return "unknown";
};

const json = (
    status: number,
    payload: unknown,
    extraHeaders: Record<string, string> = {},
): Response =>
    new Response(JSON.stringify(payload), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            ...extraHeaders,
        },
    });

const corsHeaders = (origin: string | null, allowed: string[]): Record<string, string> => {
    // Explicit allowlist. Never reflect an arbitrary Origin back.
    if (!origin || !allowed.includes(origin)) return {};
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
    };
};

const readJsonBody = async (request: Request): Promise<any> => {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) throw new Error("Request body too large");
    try {
        return JSON.parse(raw || "{}");
    } catch {
        throw new Error("Body is not valid JSON");
    }
};

/**
 * Neutralises broadcast mentions and user pings in relayed text.
 *
 * A visitor could otherwise type "@channel" / "@here" / "@all" and make the relay
 * ping the whole team, or "@someone" to ping a colleague. A zero-width space after
 * the "@" stops Mattermost matching the mention while leaving the text readable.
 */
const defang = (value: string): string => value.replace(/@(?=[A-Za-z0-9_.-])/g, "@\u200B");

const field = (body: any, key: string, max: number): string =>
    String(body?.[key] ?? "").trim().slice(0, max);

/** Assembles the Mattermost-markdown post from the submitted fields. */
const buildMessage = (config: Config, parts: { name: string; email: string; subject: string; message: string }): string => {
    const lines: string[] = [`**${config.messagePrefix}**`, ""];

    if (parts.name || parts.email) {
        const who = parts.name ? defang(parts.name) : "(no name given)";
        // The e-mail sits in inline code: copyable, and mention-safe without defanging.
        lines.push(`**From:** ${who}${parts.email ? ` \`${parts.email}\`` : ""}`);
    }
    if (parts.subject) lines.push(`**Subject:** ${defang(parts.subject)}`);

    lines.push("", defang(parts.message));
    return lines.join("\n");
};

const handleConfig = async (config: Config, headers: Record<string, string>): Promise<Response> => {
    // The challenge is handed out here so that posting requires having loaded the
    // page. Without a configured secret the field is simply absent and /message does
    // not ask for it.
    const challenge = config.challengeSecret
        ? await issueChallenge(config.challengeSecret, config.challengeDifficulty)
        : null;

    return json(
        200,
        {
            maxMessageChars: config.maxMessageChars,
            challenge,
        },
        headers,
    );
};

const handleMessage = async (
    request: Request,
    config: Config,
    kchat: KChat,
    headers: Record<string, string>,
): Promise<Response> => {
    if (rateLimited(clientIp(request), config.rateLimitPerHour)) {
        return json(
            429,
            { error: "rate_limited", message: "Too many messages. Try again later." },
            headers,
        );
    }

    let body: any;
    try {
        body = await readJsonBody(request);
    } catch (error) {
        return json(400, { error: "bad_request", message: (error as Error).message }, headers);
    }

    // Honeypot: a field hidden in the form that a human never fills in. Answer as if
    // it worked, so a bot learns nothing.
    if (typeof body.website === "string" && body.website.trim() !== "") {
        return json(200, { ok: true }, headers);
    }

    const name = field(body, "name", 120);
    const email = field(body, "email", 200);
    const subject = field(body, "subject", 200);
    const message = field(body, "message", config.maxMessageChars);

    // Validate the input BEFORE spending the challenge. The challenge is single-use,
    // so if a fixable error (a mistyped e-mail) burned it, the visitor would be
    // forced to reload the page to get a fresh one. Cheap, leaks nothing.
    if (!message) return json(400, { error: "invalid_message", message: "A message is required." }, headers);
    if (email && !EMAIL.test(email)) return json(400, { error: "invalid_email" }, headers);

    if (config.challengeSecret) {
        const result = await verifyChallenge(
            config.challengeSecret,
            String(body.challenge ?? ""),
            body.solution,
            { minAgeMs: CHALLENGE_MIN_AGE_MS, maxAgeMs: CHALLENGE_MAX_AGE_MS },
        );
        if (!result.ok) {
            // The reason lets the page tell "reload, your challenge went stale" apart
            // from a genuine refusal. It tells an attacker nothing they could not
            // learn by trying.
            return json(403, { error: "challenge_failed", reason: result.reason }, headers);
        }
    }

    const text = buildMessage(config, { name, email, subject, message });
    const { transport } = await kchat.send({ text });

    return json(200, { ok: true, transport }, headers);
};

/** Builds the request handler. One kChat client instance is reused. */
export const createHandler = (config: Config, kchat: KChat) => {
    return async (request: Request): Promise<Response> => {
        const url = new URL(request.url);
        const headers = corsHeaders(request.headers.get("origin"), config.allowedOrigins);

        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

        try {
            if (request.method === "GET" && url.pathname === "/health") {
                return json(200, { ok: true, transport: kchat.transport }, headers);
            }
            if (request.method === "GET" && url.pathname === "/config") {
                return await handleConfig(config, headers);
            }
            if (request.method === "POST" && url.pathname === "/message") {
                return await handleMessage(request, config, kchat, headers);
            }
            return json(404, { error: "not_found" }, headers);
        } catch (error) {
            // Log the detail, return something generic: upstream errors can echo back
            // request data or secrets and must not be handed to the browser.
            console.error(`[kchat-api] ${request.method} ${url.pathname} failed:`, error);
            return json(
                502,
                { error: "upstream_error", message: "kChat unavailable. Please try again later." },
                headers,
            );
        }
    };
};
