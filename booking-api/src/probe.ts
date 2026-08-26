// Probe the live Infomaniak account and print what actually comes back.
//
// Why this exists: the calendar-listing and profile shapes are documented by
// Infomaniak's own client, but the *event* response shape is not - listBusy()
// therefore reads several plausible field names. Run this once against the real
// account to see the truth, then tighten infomaniak.ts if you want to.
//
//   INFOMANIAK_TOKEN=… node dist/probe.js
//
// It only reads. It creates nothing.

import { loadConfig } from "./config.js";
import { InfomaniakCalendar } from "./infomaniak.js";
import { slotWindow } from "./slots.js";
import { availableSlots } from "./slots.js";

const config = loadConfig();
const calendar = new InfomaniakCalendar(config.token, config.timezone, config.calendarId, {
    email: config.organizerEmail,
    name: config.organizerName,
});

const main = async () => {
    console.log("- calendars -");
    const calendars = await calendar.listCalendars();
    for (const entry of calendars) {
        console.log(`  id=${entry.id}  name=${entry.name ?? "(unnamed)"}`);
    }
    console.log(`  → using: ${await calendar.resolveCalendarId()}`);

    console.log("\n- organiser shown on bookings -");
    const profile = await calendar.getProfile();
    console.log(`  ${profile.displayName} <${profile.email}>`);
    console.log(
        config.organizerEmail
            ? "  (from BOOKING_ORGANIZER_EMAIL - the token's own profile is not used)"
            : "  (from the token's Infomaniak profile - set BOOKING_ORGANIZER_EMAIL to override)",
    );
    console.log(`  configured booking timezone: ${config.timezone}`);

    const now = new Date();
    const window = slotWindow(config, now);
    console.log(`\n- raw events between ${window.from.toISOString()} and ${window.to.toISOString()} -`);

    // Reach past the typed helper deliberately: the point is to see the raw JSON.
    const raw = await (calendar as any).request(
        `/1/calendar/pim/event?${new URLSearchParams({
            calendar_id: await calendar.resolveCalendarId(),
            from: (await import("./time.js")).formatForInfomaniak(window.from, config.timezone),
            to: (await import("./time.js")).formatForInfomaniak(window.to, config.timezone),
        })}`,
    );
    const events: any[] = Array.isArray(raw?.data) ? raw.data : (raw?.data?.events ?? []);
    console.log(`  ${events.length} event(s)`);
    if (events[0]) {
        console.log("  first event, verbatim:");
        console.log(JSON.stringify(events[0], null, 2).split("\n").map((l) => `    ${l}`).join("\n"));
    } else {
        console.log("  (none - put a test event in the calendar and run again to see the shape)");
    }

    console.log("\n- parsed as busy -");
    const busy = await calendar.listBusy(window.from, window.to);
    for (const period of busy.slice(0, 20)) {
        console.log(`  ${period.start.toISOString()} → ${period.end.toISOString()}`);
    }
    if (busy.length > 20) console.log(`  … and ${busy.length - 20} more`);

    console.log("\n- slots that would be offered -");
    const slots = availableSlots(config, now, busy);
    console.log(`  ${slots.length} slot(s); first 10:`);
    for (const slot of slots.slice(0, 10)) {
        console.log(`  ${slot.date} ${slot.time} (${config.timezone})  =  ${slot.start}`);
    }

    console.log(
        "\nSanity check: the local time above must match what you see in the Infomaniak web calendar.",
    );
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
