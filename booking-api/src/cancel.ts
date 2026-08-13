// List and delete calendar events from the command line.
//
//   npm run cancel                        → list the next 60 days, with ids
//   npm run cancel -- 689304406           → delete that event
//   npm run cancel -- --tests             → delete every upcoming event titled with the
//                                           booking title prefix (cleans up test bookings)
//   npm run cancel -- --older-than 6m     → retention: delete past bookings older than 6 months
//   npm run cancel -- --older-than 6m --yes   → same, unattended (for a scheduled job)
//
// Deletion is immediate and cannot be undone. Every bulk mode prints what it is
// about to remove and asks first, unless --yes is given.

import { createInterface } from "node:readline/promises";
import { loadConfig } from "./config.js";
import { InfomaniakCalendar } from "./infomaniak.js";
import { cutoffFrom, localDate, localTime } from "./time.js";

const config = loadConfig();
const calendar = new InfomaniakCalendar(config.token, config.timezone, config.calendarId, {
    email: config.organizerEmail,
    name: config.organizerName,
});

const HORIZON_DAYS = 60;
/** How far back --older-than looks. Beyond this, clean up by hand. */
const LOOKBACK_YEARS = 5;

interface Entry {
    id: unknown;
    title: string;
    start: Date | null;
}

const toEntries = (events: any[]): Entry[] =>
    events
        .map((event) => ({
            id: event.id,
            title: event.title ?? "(no title)",
            start: event.start ? new Date(event.start) : null,
        }))
        .sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0));

const upcoming = async (): Promise<Entry[]> => {
    const now = new Date();
    return toEntries(
        await calendar.listEvents(now, new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000)),
    );
};

const describe = (entry: Entry) =>
    `  ${entry.id}  ${
        entry.start
            ? `${localDate(entry.start, config.timezone)} ${localTime(entry.start, config.timezone)}`
            : "(no start)"
    }  ${entry.title}`;

const confirm = async (question: string): Promise<boolean> => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`${question} [y/N] `);
    rl.close();
    return answer.trim().toLowerCase() === "y";
};

const deleteAll = async (entries: Entry[]) => {
    for (const entry of entries) {
        await calendar.deleteEvent(entry.id as string | number);
        console.log(`  deleted ${entry.id}`);
    }
};

const main = async () => {
    const args = process.argv.slice(2);
    const yes = args.includes("--yes");
    const positional = args.filter((arg) => !arg.startsWith("--"));

    // ── retention sweep ──────────────────────────────────────────────────────
    if (args.includes("--older-than")) {
        const spec = args[args.indexOf("--older-than") + 1];
        if (!spec) throw new Error("--older-than needs a period, e.g. --older-than 6m");

        const now = new Date();
        const cutoff = cutoffFrom(spec, now);
        const from = new Date(cutoff);
        from.setFullYear(from.getFullYear() - LOOKBACK_YEARS);

        const prefix = config.eventTitlePrefix;
        const all = toEntries(await calendar.listEvents(from, cutoff));

        // Only ever touch what the booking flow created. Everything else in the
        // calendar is the owner's own life and none of this tool's business.
        const stale = all.filter((entry) => entry.title.startsWith(prefix) && entry.start && entry.start < cutoff);

        console.log(
            `Bookings titled "${prefix}" starting before ` +
                `${localDate(cutoff, config.timezone)} (${spec} ago), ` +
                `looking back ${LOOKBACK_YEARS} years:`,
        );
        if (!stale.length) {
            console.log("  (nothing to delete)");
            if (all.length) {
                console.log(
                    `  ${all.length} other event(s) in that range were left alone — they do not carry the prefix.`,
                );
            }
            return;
        }
        for (const entry of stale) console.log(describe(entry));

        if (!yes && !(await confirm(`\nDelete ${stale.length} event(s)? This cannot be undone.`))) {
            console.log("Cancelled — nothing deleted.");
            return;
        }
        await deleteAll(stale);
        console.log(`Done: ${stale.length} event(s) removed.`);
        return;
    }

    // ── delete the test bookings still ahead of us ───────────────────────────
    if (args.includes("--tests")) {
        const prefix = config.eventTitlePrefix;
        const entries = (await upcoming()).filter((entry) => entry.title.startsWith(prefix));

        if (!entries.length) {
            console.log(`Nothing in the next ${HORIZON_DAYS} days starts with "${prefix}".`);
            return;
        }
        console.log(`About to delete ${entries.length} event(s) starting with "${prefix}":`);
        for (const entry of entries) console.log(describe(entry));

        // These are real bookings, not just test ones — anything booked through the
        // website carries the same prefix. Never delete them without being asked.
        if (!yes && !(await confirm("\nThis cannot be undone. Delete them?"))) {
            console.log("Cancelled — nothing deleted.");
            return;
        }
        await deleteAll(entries);
        return;
    }

    // ── delete one by id ─────────────────────────────────────────────────────
    if (positional.length) {
        await calendar.deleteEvent(positional[0]);
        console.log(`Deleted event ${positional[0]}.`);
        return;
    }

    // ── list ─────────────────────────────────────────────────────────────────
    const entries = await upcoming();
    console.log(`Next ${HORIZON_DAYS} days in calendar ${await calendar.resolveCalendarId()}:`);
    if (!entries.length) console.log("  (nothing)");
    for (const entry of entries) console.log(describe(entry));
    console.log("\nDelete one with:  npm run cancel -- <id>");
    console.log("Retention sweep:  npm run cancel -- --older-than 6m");
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
