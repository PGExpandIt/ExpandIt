// Time-zone helpers built on Intl, so the service has no dependencies.
//
// The point of all this: Infomaniak's event API takes a wall-clock string
// ("2026-08-03 09:00:00") *plus* a separate timezone name. Send a UTC wall clock
// with a non-UTC timezone name and the event silently lands at the wrong hour —
// the same class of bug as cal.com issue #18981, and the same bug Infomaniak's own
// MCP client has (it formats with toISOString but labels the result with the
// profile timezone). Everything below exists to keep those two in agreement.

/**
 * How far `timeZone` is from UTC at the given instant, in milliseconds.
 * Positive east of Greenwich. Accounts for DST because it asks Intl for the
 * actual local wall clock at that instant.
 */
export const zoneOffsetMs = (instant: Date, timeZone: string): number => {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).formatToParts(instant);

    const field = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    // Intl renders midnight as hour 24 in some engines; normalise it.
    const hour = field("hour") % 24;

    const asIfUtc = Date.UTC(
        field("year"),
        field("month") - 1,
        field("day"),
        hour,
        field("minute"),
        field("second"),
    );
    return asIfUtc - instant.getTime();
};

/**
 * Turns a wall-clock time in `timeZone` into the instant it denotes.
 *
 * Two passes: the first guesses the offset using the wall clock read as UTC, the
 * second corrects it. That handles the case where the guess lands on the other
 * side of a DST transition from the real answer.
 */
export const zonedWallClockToInstant = (
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    timeZone: string,
): Date => {
    const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    const firstGuess = new Date(naiveUtc - zoneOffsetMs(new Date(naiveUtc), timeZone));
    return new Date(naiveUtc - zoneOffsetMs(firstGuess, timeZone));
};

/** The parts of the local wall clock in `timeZone` at a given instant. */
export const wallClockParts = (instant: Date, timeZone: string) => {
    const offset = zoneOffsetMs(instant, timeZone);
    const shifted = new Date(instant.getTime() + offset);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        hour: shifted.getUTCHours(),
        minute: shifted.getUTCMinutes(),
        second: shifted.getUTCSeconds(),
        /** 1 = Monday … 7 = Sunday. */
        isoWeekday: ((shifted.getUTCDay() + 6) % 7) + 1,
    };
};

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

/**
 * "YYYY-MM-DD HH:MM:SS" as read on a clock in `timeZone` — the format the
 * Infomaniak event API expects alongside `timezone_start` / `timezone_end`.
 */
export const formatForInfomaniak = (instant: Date, timeZone: string): string => {
    const p = wallClockParts(instant, timeZone);
    return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
};

/** "YYYY-MM-DD" in `timeZone`. */
export const localDate = (instant: Date, timeZone: string): string => {
    const p = wallClockParts(instant, timeZone);
    return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};

/** "HH:MM" in `timeZone`. */
export const localTime = (instant: Date, timeZone: string): string => {
    const p = wallClockParts(instant, timeZone);
    return `${pad(p.hour)}:${pad(p.minute)}`;
};

/**
 * Parses what the Infomaniak event API returns for a timestamp. Observed shapes
 * differ by field, so this is deliberately permissive: a unix timestamp (seconds
 * or milliseconds), an ISO string, or a "YYYY-MM-DD HH:MM:SS" wall clock which is
 * interpreted in `timeZone`. Returns null when nothing sensible can be made of it,
 * and callers treat null as "assume busy".
 */
export const parseApiInstant = (value: unknown, timeZone: string): Date | null => {
    if (value == null) return null;

    if (typeof value === "number") {
        // Seconds vs milliseconds: anything below this threshold cannot plausibly
        // be milliseconds (it would be 1970).
        const ms = value < 100_000_000_000 ? value * 1000 : value;
        const date = new Date(ms);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    if (typeof value !== "string") return null;

    const numeric = Number(value);
    if (/^\d+$/.test(value) && Number.isFinite(numeric)) return parseApiInstant(numeric, timeZone);

    // Explicit offset or Z — trust it.
    if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value)) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (match) {
        const [, y, mo, d, h, mi] = match;
        return zonedWallClockToInstant(+y, +mo, +d, +h, +mi, timeZone);
    }

    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
};

/**
 * "6m" → the instant six months ago. Also accepts days and years.
 *
 * Months are counted on the calendar, not as 30-day blocks, because retention is
 * promised in months. The clamp matters: `setMonth` on 31 August minus six months
 * lands on "31 February", which JavaScript silently rolls forward to 3 March —
 * three days of data deleted earlier than promised. Clamping to the last day of
 * the target month gives 28 February, which is what "six months earlier" means.
 */
export const cutoffFrom = (spec: string, now: Date): Date => {
    const match = spec.trim().match(/^(\d+)\s*([dmy])$/i);
    if (!match) {
        throw new Error(`Cannot read the period "${spec}". Use a form like 30d, 6m or 1y.`);
    }
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const cutoff = new Date(now);
    const dayOfMonth = cutoff.getDate();

    if (unit === "d") cutoff.setDate(cutoff.getDate() - amount);
    if (unit === "y") cutoff.setFullYear(cutoff.getFullYear() - amount);
    if (unit === "m") {
        cutoff.setMonth(cutoff.getMonth() - amount);
        // Day changed ⇒ the target month is shorter and the date overflowed.
        // setDate(0) steps back to the last day of that month.
        if (cutoff.getDate() !== dayOfMonth) cutoff.setDate(0);
    }
    return cutoff;
};
