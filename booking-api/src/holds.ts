// Keeping the demo calendar from reading as abandoned.
//
// A calendar where every single slot for the next month is free tells a visitor
// that nobody books demos here. Blocking one working hour a week fixes that, and
// it is honest: a small team genuinely cannot hold every slot it offers open.
//
// What these events are: the owner's own unavailable hours. They carry no
// attendee, no invented company name, no personal data, and nothing about them
// claims a meeting took place. They must never be dressed up as bookings that
// did not happen — a prospect who later learns the "busy" calendar was staged
// has been told something untrue about the business, and that is a worse problem
// than an empty calendar.
//
// Pure functions only: no network, no clock of their own, so the rules are unit
// tested without an Infomaniak account. See test/holds.test.mjs.

import type { Config } from "./config.js";
import type { BusyPeriod } from "./infomaniak.js";
import { availableSlots, type Slot } from "./slots.js";
import { wallClockParts, zonedWallClockToInstant } from "./time.js";

export interface Hold extends Slot {
    /** Monday of the ISO week this hold falls in, as YYYY-MM-DD in local time. */
    week: string;
}

/** Monday of the ISO week an instant falls in, read on a local clock. */
export const weekKeyOf = (instant: Date, timezone: string): string => {
    const parts = wallClockParts(instant, timezone);
    // Arithmetic on the local calendar date only, so a DST transition inside the
    // week cannot shift which Monday this resolves to.
    const monday = new Date(
        Date.UTC(parts.year, parts.month - 1, parts.day - (parts.isoWeekday - 1)),
    );
    return monday.toISOString().slice(0, 10);
};

/** The instants a local ISO week starts and ends at. */
export const weekBounds = (weekKey: string, timezone: string): { from: Date; to: Date } => {
    const [year, month, day] = weekKey.split("-").map(Number);
    const from = zonedWallClockToInstant(year, month, day, 0, 0, timezone);
    const nextMonday = new Date(Date.UTC(year, month - 1, day + 7));
    const to = zonedWallClockToInstant(
        nextMonday.getUTCFullYear(),
        nextMonday.getUTCMonth() + 1,
        nextMonday.getUTCDate(),
        0,
        0,
        timezone,
    );
    return { from, to };
};

/**
 * Deterministic index from a string, so the same week always proposes the same
 * slot. Runs every few days would otherwise walk a block around the week each
 * time, and a slot that appeared and vanished between two visits looks worse
 * than one that was never there. FNV-1a: small, no dependencies, and the spread
 * is far better than anything the week number alone would give.
 */
const pickIndex = (seed: string, length: number): number => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < seed.length; i += 1) {
        hash ^= seed.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash % length;
};

/**
 * Which slots to block so that every working week inside the booking horizon has
 * at least `holdsPerWeek` things in it.
 *
 * Anything already in the calendar counts — a real booking, a previous hold, the
 * owner's dentist appointment. That is what makes this safe to run on a schedule:
 * a week is only ever topped up to the target, so repeated runs add nothing, and
 * a week that fills up with real bookings is left alone entirely.
 */
export const planHolds = (config: Config, now: Date, busy: BusyPeriod[]): Hold[] => {
    if (config.holdsPerWeek <= 0) return [];

    const byWeek = new Map<string, Slot[]>();
    for (const slot of availableSlots(config, now, busy)) {
        const key = weekKeyOf(new Date(slot.start), config.timezone);
        const bucket = byWeek.get(key) ?? [];
        bucket.push(slot);
        byWeek.set(key, bucket);
    }

    const holds: Hold[] = [];
    for (const [week, slots] of [...byWeek.entries()].sort()) {
        const { from, to } = weekBounds(week, config.timezone);
        const occupied = busy.filter((period) => period.start < to && from < period.end).length;

        const remaining = slots.slice();
        for (let placed = occupied; placed < config.holdsPerWeek; placed += 1) {
            if (remaining.length === 0) break;
            const [chosen] = remaining.splice(pickIndex(`${week}#${placed}`, remaining.length), 1);
            holds.push({ ...chosen, week });
        }
    }

    return holds;
};
