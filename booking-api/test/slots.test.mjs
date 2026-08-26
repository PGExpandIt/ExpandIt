import { test } from "node:test";
import assert from "node:assert/strict";

import { availableSlots, isSlotBookable } from "../dist/slots.js";
import {
    formatForInfomaniak,
    parseApiInstant,
    wallClockParts,
    zonedWallClockToInstant,
    zoneOffsetMs,
} from "../dist/time.js";

const config = {
    timezone: "Europe/Warsaw",
    workdays: [1, 2, 3, 4, 5],
    slotTimes: ["09:00", "11:00", "13:00", "15:00"],
    slotMinutes: 30,
    leadHours: 24,
    horizonDays: 14,
};

// 2026-08-03 is a Monday.
const monday = (time = "T08:00:00Z") => new Date(`2026-08-03${time}`);

test("summer offset for Warsaw is +2h", () => {
    assert.equal(zoneOffsetMs(new Date("2026-08-03T12:00:00Z"), "Europe/Warsaw"), 2 * 3600_000);
});

test("winter offset for Warsaw is +1h", () => {
    assert.equal(zoneOffsetMs(new Date("2026-01-15T12:00:00Z"), "Europe/Warsaw"), 3600_000);
});

test("wall clock converts to the instant it denotes", () => {
    // 09:00 in Warsaw in August is 07:00 UTC.
    const instant = zonedWallClockToInstant(2026, 8, 3, 9, 0, "Europe/Warsaw");
    assert.equal(instant.toISOString(), "2026-08-03T07:00:00.000Z");
});

test("wall clock survives a DST transition", () => {
    // Clocks go back on 2026-10-25 in Europe/Warsaw; 09:00 that day is 08:00 UTC.
    const instant = zonedWallClockToInstant(2026, 10, 25, 9, 0, "Europe/Warsaw");
    assert.equal(instant.toISOString(), "2026-10-25T08:00:00.000Z");
});

test("the string sent to Infomaniak is the local wall clock, not UTC", () => {
    // This is the bug in Infomaniak's own reference client, and in cal.com #18981:
    // sending a UTC wall clock while declaring a non-UTC timezone name.
    const instant = new Date("2026-08-03T07:00:00Z");
    assert.equal(formatForInfomaniak(instant, "Europe/Warsaw"), "2026-08-03 09:00:00");
    assert.notEqual(formatForInfomaniak(instant, "Europe/Warsaw"), "2026-08-03 07:00:00");
});

test("isoWeekday is Monday=1 through Sunday=7", () => {
    assert.equal(wallClockParts(new Date("2026-08-03T10:00:00Z"), "Europe/Warsaw").isoWeekday, 1);
    assert.equal(wallClockParts(new Date("2026-08-09T10:00:00Z"), "Europe/Warsaw").isoWeekday, 7);
});

test("API timestamps parse from several shapes", () => {
    const tz = "Europe/Warsaw";
    assert.equal(parseApiInstant("2026-08-03 09:00:00", tz).toISOString(), "2026-08-03T07:00:00.000Z");
    assert.equal(parseApiInstant("2026-08-03T07:00:00Z", tz).toISOString(), "2026-08-03T07:00:00.000Z");
    const epochSeconds = Date.UTC(2026, 7, 3, 7, 0, 0) / 1000;
    assert.equal(parseApiInstant(epochSeconds, tz).toISOString(), "2026-08-03T07:00:00.000Z");
    assert.equal(parseApiInstant(epochSeconds * 1000, tz).toISOString(), "2026-08-03T07:00:00.000Z");
    assert.equal(parseApiInstant(null, tz), null);
    assert.equal(parseApiInstant("nonsense", tz), null);
});

test("no slots are offered inside the lead time", () => {
    const now = monday();
    const slots = availableSlots(config, now, []);
    const earliest = new Date(slots[0].start);
    assert.ok(earliest.getTime() - now.getTime() >= config.leadHours * 3600_000);
});

test("weekends are never offered", () => {
    const slots = availableSlots(config, monday(), []);
    for (const slot of slots) {
        const weekday = wallClockParts(new Date(slot.start), config.timezone).isoWeekday;
        assert.ok(weekday >= 1 && weekday <= 5, `${slot.date} is weekday ${weekday}`);
    }
});

test("offered times are exactly the configured ones, in local time", () => {
    const times = new Set(availableSlots(config, monday(), []).map((slot) => slot.time));
    assert.deepEqual([...times].sort(), [...config.slotTimes].sort());
});

test("a busy period removes the slot it overlaps and leaves the others", () => {
    // now is Monday 10:00 Warsaw and the lead time is 24 h, so the first bookable
    // moment is Tuesday 10:00 Warsaw - Tuesday 09:00 is out for that reason alone.
    // Tuesday 11:00 Warsaw = 09:00 UTC, and that is what this busy period covers.
    const busy = [
        { start: new Date("2026-08-04T09:00:00Z"), end: new Date("2026-08-04T09:30:00Z") },
    ];
    const slots = availableSlots(config, monday(), busy);
    const tuesday = slots.filter((slot) => slot.date === "2026-08-04").map((slot) => slot.time);

    assert.ok(!tuesday.includes("11:00"), "the busy slot should be gone");
    assert.deepEqual(tuesday, ["13:00", "15:00"], "the later slots should remain");
});

test("a partial overlap still blocks the slot", () => {
    // 11:15–11:45 covers only part of the 11:00–11:30 slot, and must still block it.
    const busy = [
        { start: new Date("2026-08-04T09:15:00Z"), end: new Date("2026-08-04T09:45:00Z") },
    ];
    const tuesday = availableSlots(config, monday(), busy)
        .filter((slot) => slot.date === "2026-08-04")
        .map((slot) => slot.time);
    assert.ok(!tuesday.includes("11:00"));
});

test("a meeting that ends exactly when a slot starts does not block it", () => {
    // Busy 12:00–13:00 Warsaw (10:00–11:00 UTC); the 13:00 slot begins at the
    // instant it ends, so touching-but-not-overlapping must stay bookable.
    const busy = [
        { start: new Date("2026-08-04T10:00:00Z"), end: new Date("2026-08-04T11:00:00Z") },
    ];
    const tuesday = availableSlots(config, monday(), busy)
        .filter((slot) => slot.date === "2026-08-04")
        .map((slot) => slot.time);
    assert.ok(tuesday.includes("13:00"), "13:00 starts as the busy period ends");
});

test("an all-day busy period clears the whole day", () => {
    const busy = [
        { start: new Date("2026-08-04T00:00:00Z"), end: new Date("2026-08-05T00:00:00Z") },
    ];
    const slots = availableSlots(config, monday(), busy);
    assert.equal(slots.filter((slot) => slot.date === "2026-08-04").length, 0);
});

test("slots stop at the horizon", () => {
    const now = monday();
    const slots = availableSlots(config, now, []);
    const last = new Date(slots[slots.length - 1].start);
    assert.ok(last.getTime() <= now.getTime() + config.horizonDays * 24 * 3600_000);
});

test("bookability is re-checked against the same rules", () => {
    const now = monday();
    const free = new Date(availableSlots(config, now, [])[0].start);

    assert.equal(isSlotBookable(config, now, [], free), true);
    assert.equal(
        isSlotBookable(config, now, [{ start: free, end: new Date(free.getTime() + 1800_000) }], free),
        false,
        "a slot that just became busy must be rejected",
    );
    assert.equal(
        isSlotBookable(config, now, [], new Date(free.getTime() + 7 * 60 * 1000)),
        false,
        "a start time that is not on the grid must be rejected",
    );
});

test("slots offered across a DST change keep their local time", () => {
    // Warsaw goes from +02:00 to +01:00 on 2026-10-25.
    const now = new Date("2026-10-20T08:00:00Z");
    const slots = availableSlots({ ...config, horizonDays: 14 }, now, []);
    const before = slots.find((slot) => slot.date === "2026-10-23" && slot.time === "09:00");
    const after = slots.find((slot) => slot.date === "2026-10-27" && slot.time === "09:00");

    assert.ok(before && after, "both days should offer 09:00");
    assert.equal(before.start, "2026-10-23T07:00:00.000Z", "09:00 CEST = 07:00 UTC");
    assert.equal(after.start, "2026-10-27T08:00:00.000Z", "09:00 CET = 08:00 UTC");
});
