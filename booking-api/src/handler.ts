// The whole API as one Web-standard handler: Request in, Response out.
//
// Deliberately free of any runtime-specific API, so the same code serves requests
// locally under Node and on Bunny Edge Scripting (Deno). Anything that needs a
// filesystem, a socket or a process lives in config.ts or edge.ts.

import { issueChallenge, verifyChallenge } from "./challenge.js";
import type { Config } from "./config.js";
import { InfomaniakCalendar } from "./infomaniak.js";
import { availableSlots, isSlotBookable, slotWindow } from "./slots.js";
import { cutoffFrom, localDate, localTime } from "./time.js";

const MAX_BODY_BYTES = 16 * 1024;
/** A form filled in faster than this was not filled in by a person. */
const CHALLENGE_MIN_AGE_MS = 3_000;
/** Long enough to read the page and think, short enough to bound replay. */
const CHALLENGE_MAX_AGE_MS = 60 * 60 * 1000;
const EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

/**
 * Per-IP booking attempts.
 *
 * At the edge this is best-effort and nothing more: instances are many and
 * short-lived, so a caller spread across regions sees a much higher effective
 * limit than the configured one. It raises the cost of casual abuse; it is not a
 * security boundary. The honeypot and the "slot must be one we offered" check are
 * what actually keep the calendar clean.
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

const corsHeaders = (
    origin: string | null,
    allowed: string[],
): Record<string, string> => {
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

const handleSlots = async (
    config: Config,
    calendar: InfomaniakCalendar,
    headers: Record<string, string>,
): Promise<Response> => {
    const now = new Date();
    const window = slotWindow(config, now);
    const busy = await calendar.listBusy(window.from, window.to);

    // The challenge is handed out here so that booking requires having loaded the
    // page. Without a configured secret the field is simply absent and /book does
    // not ask for it.
    const challenge = config.challengeSecret
        ? await issueChallenge(config.challengeSecret, config.challengeDifficulty)
        : null;

    return json(
        200,
        {
            timezone: config.timezone,
            slotMinutes: config.slotMinutes,
            generatedAt: now.toISOString(),
            slots: availableSlots(config, now, busy),
            challenge,
        },
        headers,
    );
};

const handleBook = async (
    request: Request,
    config: Config,
    calendar: InfomaniakCalendar,
    headers: Record<string, string>,
): Promise<Response> => {
    if (rateLimited(clientIp(request), config.rateLimitPerHour)) {
        return json(
            429,
            { error: "rate_limited", message: "Too many booking attempts. Try again later." },
            headers,
        );
    }

    let body: any;
    try {
        body = await readJsonBody(request);
    } catch (error) {
        return json(400, { error: "bad_request", message: (error as Error).message }, headers);
    }

    // Honeypot: a field hidden in the form that a human never fills in. Answer as
    // if it worked, so a bot learns nothing.
    if (typeof body.website === "string" && body.website.trim() !== "") {
        return json(200, { ok: true }, headers);
    }

    if (config.challengeSecret) {
        const result = await verifyChallenge(
            config.challengeSecret,
            String(body.challenge ?? ""),
            body.solution,
            { minAgeMs: CHALLENGE_MIN_AGE_MS, maxAgeMs: CHALLENGE_MAX_AGE_MS },
        );
        if (!result.ok) {
            // The reason is returned so the page can tell "reload, your challenge
            // went stale" apart from a genuine refusal. It tells an attacker nothing
            // they could not learn by trying.
            return json(403, { error: "challenge_failed", reason: result.reason }, headers);
        }
    }

    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim();

    if (!name || name.length > 120) return json(400, { error: "invalid_name" }, headers);
    if (!EMAIL.test(email) || email.length > 200) {
        return json(400, { error: "invalid_email" }, headers);
    }

    const start = new Date(String(body.start ?? "").trim());
    if (Number.isNaN(start.getTime())) return json(400, { error: "invalid_start" }, headers);

    const now = new Date();
    const window = slotWindow(config, now);
    const busy = await calendar.listBusy(window.from, window.to);

    // Re-check rather than trust the browser: the slot may have been taken while
    // the visitor was filling in the form.
    if (!isSlotBookable(config, now, busy, start)) {
        return json(
            409,
            { error: "slot_taken", message: "That slot is no longer available." },
            headers,
        );
    }

    const field = (key: string, max: number) => String(body[key] ?? "").trim().slice(0, max);
    const company = field("company", 120);

    const description = [
        "Booked from the vallus website.",
        "",
        `Name: ${name}`,
        `Company: ${company || "—"}`,
        `E-mail: ${email}`,
        `Phone: ${field("phone", 60) || "—"}`,
        `Team size: ${field("teamSize", 60) || "—"}`,
        `Topic: ${field("topic", 200) || "—"}`,
        "",
        "Message:",
        field("message", 4000) || "—",
    ].join("\n");

    const end = new Date(start.getTime() + config.slotMinutes * 60 * 1000);
    const created = await calendar.createEvent({
        title: `${config.eventTitlePrefix} — ${company || name}`,
        start,
        end,
        description,
        attendeeEmail: email,
        attendeeName: name,
    });

    return json(
        201,
        {
            ok: true,
            eventId: created.id ?? null,
            start: start.toISOString(),
            end: end.toISOString(),
            date: localDate(start, config.timezone),
            time: localTime(start, config.timezone),
            timezone: config.timezone,
        },
        headers,
    );
};

/** How far back the retention sweep looks. Older than this, clean up by hand. */
const RETENTION_LOOKBACK_YEARS = 5;

/** Length-safe comparison, so a wrong secret cannot be found one character at a time. */
const secretsMatch = (given: string, expected: string): boolean => {
    if (given.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < given.length; i += 1) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
};

/**
 * Deletes bookings older than the retention period.
 *
 * Exists because the personal data lives in calendar events and nothing there
 * expires on its own, while the privacy notice promises six months. Bunny Edge
 * Scripting has no scheduler, so something outside has to call this — see the
 * retention workflow. It is guarded by its own secret rather than the Infomaniak
 * token, so whatever triggers it can delete stale bookings and nothing else.
 */
const handleRetention = async (
    request: Request,
    config: Config,
    calendar: InfomaniakCalendar,
    headers: Record<string, string>,
): Promise<Response> => {
    if (!config.adminToken) return json(404, { error: "not_found" }, headers);

    const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!given || !secretsMatch(given, config.adminToken)) {
        return json(401, { error: "unauthorized" }, headers);
    }

    const url = new URL(request.url);
    const spec = url.searchParams.get("older_than") ?? config.retentionPeriod;
    const dryRun = url.searchParams.get("dry_run") === "true";

    let cutoff: Date;
    try {
        cutoff = cutoffFrom(spec, new Date());
    } catch (error) {
        return json(400, { error: "invalid_period", message: (error as Error).message }, headers);
    }

    const from = new Date(cutoff);
    from.setFullYear(from.getFullYear() - RETENTION_LOOKBACK_YEARS);

    const events = await calendar.listEvents(from, cutoff);
    // Only ever touch what the booking flow created — the rest of the calendar is
    // the owner's own life.
    const stale = events.filter((event) => {
        const title = String(event?.title ?? "");
        const start = event?.start ? new Date(event.start) : null;
        return title.startsWith(config.eventTitlePrefix) && start !== null && start < cutoff;
    });

    const deleted: unknown[] = [];
    if (!dryRun) {
        for (const event of stale) {
            await calendar.deleteEvent(event.id);
            deleted.push(event.id);
        }
    }

    return json(
        200,
        {
            ok: true,
            dryRun,
            period: spec,
            cutoff: localDate(cutoff, config.timezone),
            examined: events.length,
            matched: stale.length,
            deleted: deleted.length,
            ids: dryRun ? stale.map((event) => event.id) : deleted,
        },
        headers,
    );
};

/** Builds the request handler. One instance of the calendar client is reused. */
export const createHandler = (config: Config, calendar: InfomaniakCalendar) => {
    return async (request: Request): Promise<Response> => {
        const url = new URL(request.url);
        const headers = corsHeaders(request.headers.get("origin"), config.allowedOrigins);

        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

        try {
            if (request.method === "GET" && url.pathname === "/health") {
                return json(200, { ok: true }, headers);
            }
            if (request.method === "GET" && url.pathname === "/slots") {
                return await handleSlots(config, calendar, headers);
            }
            if (request.method === "POST" && url.pathname === "/book") {
                return await handleBook(request, config, calendar, headers);
            }
            if (request.method === "POST" && url.pathname === "/retention") {
                return await handleRetention(request, config, calendar, headers);
            }
            return json(404, { error: "not_found" }, headers);
        } catch (error) {
            // Log the detail, return something generic: upstream errors can echo back
            // request data and must not be handed to the browser.
            console.error(`[booking-api] ${request.method} ${url.pathname} failed:`, error);
            return json(
                502,
                { error: "upstream_error", message: "Calendar unavailable. Please try again later." },
                headers,
            );
        }
    };
};
