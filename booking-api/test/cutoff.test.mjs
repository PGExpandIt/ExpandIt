import { test } from "node:test";
import assert from "node:assert/strict";

import { cutoffFrom } from "../dist/time.js";

const at = (iso) => new Date(iso);
const day = (date) => date.toISOString().slice(0, 10);

test("months are counted on the calendar", () => {
    assert.equal(day(cutoffFrom("6m", at("2026-08-02T12:00:00Z"))), "2026-02-02");
    assert.equal(day(cutoffFrom("1m", at("2026-08-02T12:00:00Z"))), "2026-07-02");
});

test("a short target month clamps instead of rolling forward", () => {
    // "31 February" would roll to 3 March and delete three days too early.
    assert.equal(day(cutoffFrom("6m", at("2026-08-31T12:00:00Z"))), "2026-02-28");
    assert.equal(day(cutoffFrom("1m", at("2026-03-31T12:00:00Z"))), "2026-02-28");
    assert.equal(day(cutoffFrom("1m", at("2026-05-31T12:00:00Z"))), "2026-04-30");
});

test("leap years are respected", () => {
    // 2028 is a leap year, so a February clamp lands on the 29th…
    assert.equal(day(cutoffFrom("1m", at("2028-03-31T12:00:00Z"))), "2028-02-29");
    // …and going back from 29 February to a non-leap year clamps to the 28th.
    assert.equal(day(cutoffFrom("12m", at("2028-02-29T12:00:00Z"))), "2027-02-28");
});

test("days and years work too", () => {
    assert.equal(day(cutoffFrom("30d", at("2026-08-02T12:00:00Z"))), "2026-07-03");
    assert.equal(day(cutoffFrom("1y", at("2026-08-02T12:00:00Z"))), "2025-08-02");
});

test("whitespace and capitals are tolerated", () => {
    assert.equal(day(cutoffFrom(" 6M ", at("2026-08-02T12:00:00Z"))), "2026-02-02");
});

test("anything unparseable is rejected rather than guessed", () => {
    for (const bad of ["6 weeks", "", "m6", "-6m", "6", "6w"]) {
        assert.throws(() => cutoffFrom(bad, at("2026-08-02T12:00:00Z")), /Cannot read the period/);
    }
});
