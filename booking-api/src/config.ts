// All configuration comes from the environment. Nothing here may ever reach the
// browser: the Infomaniak token grants full read/write access to the calendar and,
// with the user_info scope, to account details.

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

const required = (name: string): string => {
    const value = readEnv(name);
    if (!value) throw new Error(`Missing required environment variable ${name}`);
    return value;
};

const optional = (name: string, fallback: string): string => readEnv(name) ?? fallback;

const list = (name: string, fallback: string): string[] =>
    optional(name, fallback)
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);

export interface Config {
    token: string;
    calendarId: string | null;
    timezone: string;
    port: number;
    allowedOrigins: string[];
    /** ISO weekday numbers that may be booked. 1 = Monday … 7 = Sunday. */
    workdays: number[];
    /** Local start times of the offered slots, "HH:MM" in `timezone`. */
    slotTimes: string[];
    slotMinutes: number;
    /** How far ahead the earliest bookable slot must be. */
    leadHours: number;
    /** How far into the future slots are offered. */
    horizonDays: number;
    eventTitlePrefix: string;
    /** Per-IP booking attempts allowed per hour. */
    rateLimitPerHour: number;
    /**
     * Address shown as the organiser on every booking. Leave empty to use the one
     * on the token's Infomaniak profile — which is often a personal address rather
     * than the one you want prospects to see.
     */
    organizerEmail: string | null;
    organizerName: string | null;
    /**
     * Shared secret for POST /retention. Unset (the default) disables the endpoint
     * entirely, so nothing destructive is reachable unless you opt in.
     */
    adminToken: string | null;
    /** Default period for the retention sweep, e.g. "6m". */
    retentionPeriod: string;
    /**
     * How many things each working week inside the horizon should contain before
     * POST /holds stops topping it up. 0 disables the endpoint's effect entirely.
     */
    holdsPerWeek: number;
    /**
     * Title of the blocks /holds creates. Deliberately says nothing about a
     * meeting or a customer: these are unavailable hours, not staged bookings.
     */
    holdTitle: string;
    /**
     * Secret signing the proof-of-work challenges. Unset disables the challenge —
     * the honeypot and the rate limit still apply, but /book becomes reachable
     * without loading the page first. Must be identical across all edge instances,
     * so it has to come from the environment rather than be generated per process.
     */
    challengeSecret: string | null;
    /**
     * Leading zero bits required. Measured at ~110k hashes/s through SubtleCrypto:
     * 15 averages 0.3 s and stays under a second in the bad case, which is invisible
     * because the browser solves it while the form is being filled in. 18 would
     * average 2.4 s and occasionally take seven — too slow to hide.
     */
    challengeDifficulty: number;
}

export { readEnv };

export const loadConfig = (): Config => ({
    token: required("INFOMANIAK_TOKEN"),
    // Optional: when unset the first calendar on the account is used, which is
    // what Infomaniak's own client does. Set it explicitly in production so a new
    // calendar appearing on the account cannot silently change the target.
    calendarId: readEnv("INFOMANIAK_CALENDAR_ID") ?? null,
    timezone: optional("BOOKING_TIMEZONE", "Europe/Warsaw"),
    port: Number(optional("PORT", "8787")),
    allowedOrigins: list("ALLOWED_ORIGINS", "https://vallus.eu"),
    workdays: list("BOOKING_WORKDAYS", "1,2,3,4,5").map(Number),
    slotTimes: list("BOOKING_SLOT_TIMES", "09:00,11:00,13:00,15:00"),
    slotMinutes: Number(optional("BOOKING_SLOT_MINUTES", "30")),
    leadHours: Number(optional("BOOKING_LEAD_HOURS", "24")),
    horizonDays: Number(optional("BOOKING_HORIZON_DAYS", "30")),
    eventTitlePrefix: optional("BOOKING_TITLE_PREFIX", "vallus demo"),
    rateLimitPerHour: Number(optional("BOOKING_RATE_LIMIT_PER_HOUR", "5")),
    organizerEmail: readEnv("BOOKING_ORGANIZER_EMAIL")?.trim() || null,
    organizerName: readEnv("BOOKING_ORGANIZER_NAME")?.trim() || null,
    adminToken: readEnv("BOOKING_ADMIN_TOKEN")?.trim() || null,
    retentionPeriod: optional("BOOKING_RETENTION_PERIOD", "6m"),
    holdsPerWeek: Number(optional("BOOKING_HOLDS_PER_WEEK", "1")),
    holdTitle: optional("BOOKING_HOLD_TITLE", "Unavailable"),
    challengeSecret: readEnv("BOOKING_CHALLENGE_SECRET")?.trim() || null,
    challengeDifficulty: Number(optional("BOOKING_CHALLENGE_DIFFICULTY", "15")),
});
