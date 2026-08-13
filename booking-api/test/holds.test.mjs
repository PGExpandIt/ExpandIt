import assert from "node:assert/strict";
import test from "node:test";

import { planHolds, weekBounds, weekKeyOf } from "../dist/holds.js";

const config = {
    timezone: "Europe/Warsaw",
    workdays: [1, 2, 3, 4, 5],
    slotTimes: ["09:00", "11:00", "13:00", "15:00"],
    slotMinutes: 30,
    leadHours: 24,
    horizonDays: 30,
    holdsPerWeek: 1,
};

// Monday 3 August 2026, 08:00 local.
const MONDAY = new Date("2026-08-03T06:00:00Z");

const busyAt = (iso, minutes = 30) => ({
    start: new Date(iso),
    end: new Date(new Date(iso).getTime() + minutes * 60 * 1000),
});

test("a week key is the Monday of that week, in local time", () => {
    assert.equal(weekKeyOf(new Date("2026-08-05T10:00:00Z"), config.timezone), "2026-08-03");
    assert.equal(weekKeyOf(new Date("2026-08-09T10:00:00Z"), config.timezone), "2026-08-03");
    assert.equal(weekKeyOf(new Date("2026-08-10T10:00:00Z"), config.timezone), "2026-08-10");
});

test("a Sunday late enough to be Monday locally belongs to the next week", () => {
    // 23:30 UTC on Sunday is 01:30 Monday in Warsaw during summer time.
    assert.equal(weekKeyOf(new Date("2026-08-09T23:30:00Z"), config.timezone), "2026-08-10");
});

test("week bounds span exactly seven local days", () => {
    const { from, to } = weekBounds("2026-08-03", config.timezone);
    assert.equal(from.toISOString(), "2026-08-02T22:00:00.000Z");
    assert.equal(to.toISOString(), "2026-08-09T22:00:00.000Z");
});

test("week bounds stay seven days across a DST change", () => {
    // Poland leaves summer time on 25 October 2026, so this week has 169 hours.
    const { from, to } = weekBounds("2026-10-19", config.timezone);
    assert.equal((to.getTime() - from.getTime()) / (60 * 60 * 1000), 169);
});

test("an empty calendar gets one hold in every week of the horizon", () => {
    const holds = planHolds(config, MONDAY, []);
    const weeks = holds.map((hold) => hold.week);

    assert.equal(weeks.length, new Set(weeks).size, "one hold per week, never two");
    assert.deepEqual(weeks, [...weeks].sort(), "weeks come back in order");
    // 30 days from a Monday touches five ISO weeks; the first slot is a day out.
    assert.ok(weeks.length >= 4 && weeks.length <= 6, `unexpected week count: ${weeks.length}`);
});

test("holds land on working days, at offered times, inside their own week", () => {
    for (const hold of planHolds(config, MONDAY, [])) {
        assert.ok(config.slotTimes.includes(hold.time), `${hold.time} is not an offered time`);

        const weekday = new Date(hold.start).getUTCDay();
        assert.ok(weekday >= 1 && weekday <= 5, `${hold.date} is not a working day`);

        const { from, to } = weekBounds(hold.week, config.timezone);
        const start = new Date(hold.start);
        assert.ok(start >= from && start < to, `${hold.date} falls outside week ${hold.week}`);
    }
});

test("a week that already contains something is left alone", () => {
    const first = planHolds(config, MONDAY, [])[0];
    const busy = [busyAt(first.start)];
    const weeks = planHolds(config, MONDAY, busy).map((hold) => hold.week);

    assert.ok(!weeks.includes(first.week), "topped up a week that was already occupied");
});

test("running again after the holds exist proposes nothing new", () => {
    // What the scheduled job actually does every few days: the previous run's
    // holds are now busy periods, and nothing further may be added.
    const busy = planHolds(config, MONDAY, []).map((hold) => busyAt(hold.start));
    assert.deepEqual(planHolds(config, MONDAY, busy), []);
});

test("the same week always proposes the same slot", () => {
    const once = planHolds(config, MONDAY, []);
    const twice = planHolds(config, MONDAY, []);
    assert.deepEqual(once, twice);
});

test("holdsPerWeek of 0 disables it", () => {
    assert.deepEqual(planHolds({ ...config, holdsPerWeek: 0 }, MONDAY, []), []);
});

test("a higher target tops a week up to that many, without repeating a slot", () => {
    const holds = planHolds({ ...config, holdsPerWeek: 2 }, MONDAY, []);
    const perWeek = new Map();
    for (const hold of holds) perWeek.set(hold.week, (perWeek.get(hold.week) ?? 0) + 1);

    for (const [week, count] of perWeek) assert.equal(count, 2, `week ${week} got ${count}`);
    const starts = holds.map((hold) => hold.start);
    assert.equal(starts.length, new Set(starts).size, "the same slot was proposed twice");
});

test("holds never collide with a real booking", () => {
    // Every Tuesday 11:00 in the horizon is taken.
    const busy = [];
    for (let day = 0; day < 30; day += 1) {
        const date = new Date(MONDAY.getTime() + day * 24 * 60 * 60 * 1000);
        if (date.getUTCDay() === 2) busy.push(busyAt(`${date.toISOString().slice(0, 10)}T09:00:00Z`));
    }

    for (const hold of planHolds(config, MONDAY, busy)) {
        const start = new Date(hold.start);
        assert.ok(
            !busy.some((period) => start >= period.start && start < period.end),
            `${hold.date} ${hold.time} collides with a booking`,
        );
    }
});
