// Slot generation. Pure functions — no network, no clock of their own — so the
// rules can be unit-tested without an Infomaniak account. See test/slots.test.mjs.

import type { Config } from "./config.js";
import type { BusyPeriod } from "./infomaniak.js";
import { localDate, localTime, wallClockParts, zonedWallClockToInstant } from "./time.js";

export interface Slot {
    /** Instant the slot starts, as an ISO-8601 UTC string. */
    start: string;
    end: string;
    /** The same moment as read on a clock in the configured timezone. */
    date: string;
    time: string;
}

const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean =>
    aStart < bEnd && bStart < aEnd;

/**
 * Every slot the rules allow between `now + leadHours` and `now + horizonDays`,
 * minus anything that collides with a busy period.
 */
export const availableSlots = (config: Config, now: Date, busy: BusyPeriod[]): Slot[] => {
    const earliest = new Date(now.getTime() + config.leadHours * 60 * 60 * 1000);
    const latest = new Date(now.getTime() + config.horizonDays * 24 * 60 * 60 * 1000);
    const slots: Slot[] = [];

    // Walk local calendar days from the day `earliest` falls on. Stepping by
    // calendar date rather than by 24h keeps DST transitions from shifting the
    // offered times.
    const first = wallClockParts(earliest, config.timezone);
    let cursor = { year: first.year, month: first.month, day: first.day };

    for (let dayIndex = 0; dayIndex <= config.horizonDays + 1; dayIndex += 1) {
        const dayStart = zonedWallClockToInstant(
            cursor.year,
            cursor.month,
            cursor.day,
            0,
            0,
            config.timezone,
        );
        if (dayStart > latest) break;

        const weekday = wallClockParts(dayStart, config.timezone).isoWeekday;
        if (config.workdays.includes(weekday)) {
            for (const slotTime of config.slotTimes) {
                const [hour, minute] = slotTime.split(":").map(Number);
                const start = zonedWallClockToInstant(
                    cursor.year,
                    cursor.month,
                    cursor.day,
                    hour,
                    minute,
                    config.timezone,
                );
                const end = new Date(start.getTime() + config.slotMinutes * 60 * 1000);

                if (start < earliest || start > latest) continue;
                if (busy.some((period) => overlaps(start, end, period.start, period.end))) continue;

                slots.push({
                    start: start.toISOString(),
                    end: end.toISOString(),
                    date: localDate(start, config.timezone),
                    time: localTime(start, config.timezone),
                });
            }
        }

        // Next calendar day. Date handles month and year rollover.
        const next = new Date(Date.UTC(cursor.year, cursor.month - 1, cursor.day + 1));
        cursor = {
            year: next.getUTCFullYear(),
            month: next.getUTCMonth() + 1,
            day: next.getUTCDate(),
        };
    }

    return slots;
};

/**
 * Whether a specific requested start is one the rules allow and nothing collides
 * with. Used to re-check at booking time, so a slot that was taken while the
 * visitor filled in the form cannot be double-booked.
 */
export const isSlotBookable = (
    config: Config,
    now: Date,
    busy: BusyPeriod[],
    requestedStart: Date,
): boolean =>
    availableSlots(config, now, busy).some(
        (slot) => new Date(slot.start).getTime() === requestedStart.getTime(),
    );

export const slotWindow = (config: Config, now: Date) => ({
    from: new Date(now.getTime() + config.leadHours * 60 * 60 * 1000 - 24 * 60 * 60 * 1000),
    to: new Date(now.getTime() + (config.horizonDays + 1) * 24 * 60 * 60 * 1000),
});
