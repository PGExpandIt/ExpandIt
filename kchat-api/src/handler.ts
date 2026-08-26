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
import { issueCode, verifyCode } from "./otp.js";
import { sendCodeViaMailer } from "./mailerClient.js";

/** OTP e-mail verification is on only when the secret, mailer URL and shared secret are all set. */
const otpEnabled = (config: Config): config is Config & { otpSecret: string; mailerUrl: string; mailerSecret: string } =>
    config.otpSecret !== null && config.mailerUrl !== null && config.mailerSecret !== null;

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

/**
 * Hand back the slot `rateLimited` just took.
 *
 * Only for failures that are already bounded somewhere tighter - a mistyped OTP
 * code, capped per token in `otp.ts`. Without this the two limits stack: the
 * per-IP budget runs out first, so a visitor who fumbles the code from their
 * inbox is locked out for an hour and the error they see is `rate_limited`,
 * which says nothing about what they got wrong.
 */
const refundAttempt = (ip: string): void => {
    attempts.get(ip)?.pop();
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

/** True only for a present Origin that is on the allowlist (narrows to string). */
const originAllowed = (origin: string | null, allowed: string[]): origin is string =>
    origin !== null && allowed.includes(origin);

const corsHeaders = (origin: string | null, allowed: string[]): Record<string, string> => {
    // Explicit allowlist. Never reflect an arbitrary Origin back.
    if (!originAllowed(origin, allowed)) return {};
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

/** Assembles the kChat post for a free-licence request from the /free page. */
const buildLicenseRequest = (parts: { company: string; email: string; marketing: boolean }): string =>
    [
        "**🔑 Free licence request**",
        "",
        `**Company (exact, case-sensitive):** ${defang(parts.company)}`,
        `**E-mail:** \`${parts.email}\``,
        `**Product-update opt-in:** ${parts.marketing ? "yes" : "no"}`,
        "",
        `_Sign the free key offline and send the licence to \`${parts.email}\` within 24 h._`,
    ].join("\n");

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
            // Lets the form pick its flow: one-step, or the two-step OTP exchange.
            otp: otpEnabled(config),
        },
        headers,
    );
};

/**
 * The anti-bot gate for a side-effecting post. When OTP is on, the caller must
 * present a code+token proving control of the e-mail; otherwise the proof-of-work
 * challenge applies (only where `challengeFallback` is true - /register never used
 * it). Verified last, after cheap validation, so a fixable error does not burn a
 * single-use code or challenge.
 */
const verifyHumanGate = async (
    config: Config,
    body: any,
    email: string,
    headers: Record<string, string>,
    challengeFallback: boolean,
    ip: string,
): Promise<Response | null> => {
    if (otpEnabled(config)) {
        if (!EMAIL.test(email)) {
            return json(400, { error: "invalid_email", message: "A verified e-mail is required." }, headers);
        }
        const result = await verifyCode(config.otpSecret, email, body.code, body.token);
        if (!result.ok) {
            // Refund a genuine typo only. A malformed or expired token is not someone
            // misreading six digits, and `too_many` means the per-token cap already
            // did its job - those keep costing the caller a slot, so a spammer
            // without a real token still runs out after `rateLimitPerHour`.
            if (result.reason === "wrong_code") refundAttempt(ip);
            return json(403, { error: "code_invalid", reason: result.reason }, headers);
        }
        return null;
    }
    if (challengeFallback && config.challengeSecret) {
        const result = await verifyChallenge(
            config.challengeSecret,
            String(body.challenge ?? ""),
            body.solution,
            { minAgeMs: CHALLENGE_MIN_AGE_MS, maxAgeMs: CHALLENGE_MAX_AGE_MS },
        );
        if (!result.ok) return json(403, { error: "challenge_failed", reason: result.reason }, headers);
    }
    return null;
};

const handleRequestCode = async (
    request: Request,
    config: Config,
    headers: Record<string, string>,
): Promise<Response> => {
    if (!otpEnabled(config)) return json(404, { error: "not_found" }, headers);
    if (rateLimited(clientIp(request), config.rateLimitPerHour)) {
        return json(429, { error: "rate_limited", message: "Too many code requests. Try again later." }, headers);
    }

    let body: any;
    try {
        body = await readJsonBody(request);
    } catch (error) {
        return json(400, { error: "bad_request", message: (error as Error).message }, headers);
    }

    // Honeypot: answer as if it worked, send nothing.
    if (typeof body.website === "string" && body.website.trim() !== "") {
        return json(200, { ok: true }, headers);
    }

    const email = field(body, "email", 200);
    if (!EMAIL.test(email)) return json(400, { error: "invalid_email" }, headers);

    // Proof-of-work gates the actual e-mail send (the costly, abusable step), so a
    // bot cannot make us mail arbitrary addresses en masse.
    if (config.challengeSecret) {
        const result = await verifyChallenge(
            config.challengeSecret,
            String(body.challenge ?? ""),
            body.solution,
            { minAgeMs: CHALLENGE_MIN_AGE_MS, maxAgeMs: CHALLENGE_MAX_AGE_MS },
        );
        if (!result.ok) return json(403, { error: "challenge_failed", reason: result.reason }, headers);
    }

    const issued = await issueCode(config.otpSecret, email, config.otpTtlMs);
    try {
        await sendCodeViaMailer(config.mailerUrl, config.mailerSecret, email, issued.code);
    } catch (error) {
        console.error(`[kchat-api] /request-code send failed:`, error);
        return json(502, { error: "mail_failed", message: "Could not send the code. Please try again." }, headers);
    }

    // The code itself is never returned - only the token and its expiry.
    return json(200, { ok: true, token: issued.token, expiresAt: issued.expiresAt }, headers);
};

const handleMessage = async (
    request: Request,
    config: Config,
    kchat: KChat,
    headers: Record<string, string>,
): Promise<Response> => {
    const ip = clientIp(request);
    if (rateLimited(ip, config.rateLimitPerHour)) {
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

    // OTP (if enabled) or proof-of-work. The reason on a failure lets the page tell
    // "reload, it went stale" from a genuine refusal, and tells an attacker nothing.
    const gate = await verifyHumanGate(config, body, email, headers, true, ip);
    if (gate) return gate;

    const text = buildMessage(config, { name, email, subject, message });
    const { transport } = await kchat.send({ text });

    return json(200, { ok: true, transport }, headers);
};

const handleRegister = async (
    request: Request,
    config: Config,
    kchat: KChat,
    headers: Record<string, string>,
): Promise<Response> => {
    const ip = clientIp(request);
    if (rateLimited(ip, config.rateLimitPerHour)) {
        return json(
            429,
            { error: "rate_limited", message: "Too many requests. Try again later." },
            headers,
        );
    }

    let body: any;
    try {
        body = await readJsonBody(request);
    } catch (error) {
        return json(400, { error: "bad_request", message: (error as Error).message }, headers);
    }

    // Honeypot: a hidden field a human never fills. Answer as if it worked.
    if (typeof body.website === "string" && body.website.trim() !== "") {
        return json(200, { ok: true }, headers);
    }

    const company = field(body, "company", 120);
    const email = field(body, "email", 200);
    const marketing = body?.marketing === true;

    if (!company) return json(400, { error: "invalid_company", message: "A company name is required." }, headers);
    if (!EMAIL.test(email)) return json(400, { error: "invalid_email", message: "A valid e-mail is required." }, headers);

    // When OTP is on, the e-mail must be verified (code + token) before the request
    // reaches the channel - the /free form does not run the proof-of-work flow, so
    // there is no challenge fallback here.
    const gate = await verifyHumanGate(config, body, email, headers, false, ip);
    if (gate) return gate;

    const text = buildLicenseRequest({ company, email, marketing });
    const { transport } = await kchat.send({ text });

    return json(200, { ok: true, transport }, headers);
};

/** Builds the request handler. One kChat client instance is reused. */
export const createHandler = (config: Config, kchat: KChat) => {
    return async (request: Request): Promise<Response> => {
        const url = new URL(request.url);
        // Behind a same-origin proxy the base path arrives NOT at the start: the
        // site's router first rewrites to /deploys/<hash>/api/kchat/message, then the
        // edge rule forwards that here. So route from the base-path marker wherever
        // it appears - and leave a direct, unprefixed call (/message) untouched.
        let pathname = url.pathname;
        if (config.basePath) {
            const at = pathname.indexOf(config.basePath);
            if (at !== -1) pathname = pathname.slice(at + config.basePath.length) || "/";
        }
        const headers = corsHeaders(request.headers.get("origin"), config.allowedOrigins);

        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

        // Hard origin gate on side-effecting requests. CORS alone only stops a
        // browser from READING the response - the POST still ran and the message
        // still went out. Rejecting here means a cross-site (or Origin-less) POST
        // does nothing at all. Spoofable by a non-browser client, so it sits on top
        // of the proof-of-work and rate limit, not instead of them.
        if (request.method === "POST" && !originAllowed(request.headers.get("origin"), config.allowedOrigins)) {
            return json(403, { error: "forbidden_origin" }, headers);
        }

        try {
            if (request.method === "GET" && pathname === "/health") {
                return json(200, { ok: true, transport: kchat.transport }, headers);
            }
            if (request.method === "GET" && pathname === "/config") {
                return await handleConfig(config, headers);
            }
            if (request.method === "POST" && pathname === "/request-code") {
                return await handleRequestCode(request, config, headers);
            }
            if (request.method === "POST" && pathname === "/message") {
                return await handleMessage(request, config, kchat, headers);
            }
            if (request.method === "POST" && pathname === "/register") {
                return await handleRegister(request, config, kchat, headers);
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
