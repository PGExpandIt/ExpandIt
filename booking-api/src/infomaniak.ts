// Client for the Infomaniak Calendar API.
//
// Endpoints and payload shape taken from Infomaniak's own MCP calendar server
// (github.com/Infomaniak/mcp-server-calendar, src/calendar-client.ts):
//
//   GET  /1/calendar/pim/calendar                      → { data: { calendars: [...] } }
//   GET  /2/profile                                    → { data: { email, display_name, preferences } }
//   GET  /1/calendar/pim/event?calendar_id=&from=&to=  → events in a range
//   POST /1/calendar/pim/event                         → creates an event
//
// One deliberate divergence from that reference client: it formats timestamps
// with toISOString() (UTC) while labelling them with the profile's timezone name,
// which shifts every event by the UTC offset. We send a wall clock that actually
// matches the timezone name we declare. See time.ts.

import { readEnv } from "./config.js";
import { formatForInfomaniak, parseApiInstant } from "./time.js";

const BASE = readEnv("INFOMANIAK_API_BASE") ?? "https://api.infomaniak.com";

export interface BusyPeriod {
    start: Date;
    end: Date;
}

export interface CreatedEvent {
    id?: string | number;
    raw: unknown;
}

export class InfomaniakCalendar {
    private readonly headers: Record<string, string>;
    private readonly timezone: string;
    private calendarId: string | null;
    private calendarIdVerified = false;
    private profile: { email: string; displayName: string } | null = null;

    private readonly organizerOverride: { email: string; displayName: string } | null;

    constructor(
        token: string,
        timezone: string,
        calendarId: string | null,
        organizer?: { email: string | null; name: string | null },
    ) {
        this.headers = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        };
        this.timezone = timezone;
        this.calendarId = calendarId;
        this.organizerOverride = organizer?.email
            ? { email: organizer.email, displayName: organizer.name ?? organizer.email }
            : null;
    }

    private async request(path: string, init?: RequestInit): Promise<any> {
        const response = await fetch(`${BASE}${path}`, { ...init, headers: this.headers });
        const text = await response.text();

        if (!response.ok) {
            // The token must never end up in a log line or an error surfaced to a caller.
            throw new Error(`Infomaniak ${init?.method ?? "GET"} ${path} → ${response.status}: ${text.slice(0, 500)}`);
        }
        try {
            return JSON.parse(text);
        } catch {
            throw new Error(`Infomaniak ${path} returned non-JSON: ${text.slice(0, 200)}`);
        }
    }

    async listCalendars(): Promise<any[]> {
        const body = await this.request("/1/calendar/pim/calendar");
        return body?.data?.calendars ?? [];
    }

    /**
     * The configured calendar, or the first one on the account.
     *
     * A configured id is checked against the account's calendars once per process.
     * Without that check, an id belonging to another account — or simply mistyped —
     * surfaces later as a bare `403 access_denied` on event listing, which reads
     * like a token or scope problem and sends you looking in the wrong place.
     */
    async resolveCalendarId(): Promise<string> {
        if (this.calendarId && this.calendarIdVerified) return this.calendarId;

        const calendars = await this.listCalendars();
        if (!calendars.length) throw new Error("No calendars available on this Infomaniak account");

        const available = calendars.map((entry) => String(entry.id));

        if (this.calendarId) {
            if (!available.includes(this.calendarId)) {
                const listed = calendars
                    .map((entry) => `${entry.id} (${entry.name ?? "unnamed"})`)
                    .join(", ");
                throw new Error(
                    `INFOMANIAK_CALENDAR_ID is ${this.calendarId}, which is not on this account. ` +
                        `Available: ${listed}. Set one of those, or leave the variable empty to use the first.`,
                );
            }
            this.calendarIdVerified = true;
            return this.calendarId;
        }

        this.calendarId = available[0];
        this.calendarIdVerified = true;
        return this.calendarId;
    }

    /**
     * Who appears as the organiser. The configured override wins; only without one
     * is the token's profile read — which also means the `user_info` scope is only
     * needed when no override is set.
     */
    async getProfile(): Promise<{ email: string; displayName: string }> {
        if (this.organizerOverride) return this.organizerOverride;
        if (this.profile) return this.profile;

        const body = await this.request("/2/profile");
        this.profile = {
            email: body?.data?.email ?? "",
            displayName: body?.data?.display_name ?? body?.data?.email ?? "Organizer",
        };
        return this.profile;
    }

    /**
     * Busy periods between two instants.
     *
     * Events whose timestamps cannot be parsed are returned as busy anyway, using
     * whatever could be read — an unparseable event must never make a slot look
     * free. Callers that get an empty array should be sure it means "nothing in
     * the calendar", not "the shape changed"; run `npm run probe` to confirm.
     */
    async listBusy(from: Date, to: Date): Promise<BusyPeriod[]> {
        const calendarId = await this.resolveCalendarId();
        const params = new URLSearchParams({
            calendar_id: calendarId,
            from: formatForInfomaniak(from, this.timezone),
            to: formatForInfomaniak(to, this.timezone),
        });

        const body = await this.request(`/1/calendar/pim/event?${params}`);
        const events: any[] = Array.isArray(body?.data) ? body.data : (body?.data?.events ?? []);

        const busy: BusyPeriod[] = [];
        for (const event of events) {
            // "free" events (tentative holds, all-day markers) do not block a slot.
            if (typeof event?.freebusy === "string" && event.freebusy.toLowerCase() === "free") continue;

            const start = parseApiInstant(event?.start ?? event?.dtstart ?? event?.start_at, this.timezone);
            const end = parseApiInstant(event?.end ?? event?.dtend ?? event?.end_at, this.timezone);

            if (event?.fullday === true || event?.full_day === true) {
                // An all-day event blocks the whole local day.
                if (!start) continue;
                const dayStart = new Date(start);
                const dayEnd = new Date(start.getTime() + 24 * 60 * 60 * 1000);
                busy.push({ start: dayStart, end: end ?? dayEnd });
                continue;
            }

            if (!start || !end) {
                // Unparseable: block conservatively around whatever we do have.
                if (start) busy.push({ start, end: new Date(start.getTime() + 60 * 60 * 1000) });
                continue;
            }
            busy.push({ start, end });
        }
        return busy;
    }

    async createEvent(input: {
        title: string;
        start: Date;
        end: Date;
        description: string;
        attendeeEmail: string;
        attendeeName: string;
    }): Promise<CreatedEvent> {
        const calendarId = await this.resolveCalendarId();
        const profile = await this.getProfile();

        // Someone booking with the organiser's own address would otherwise be listed
        // twice — once as the guest, once as the organiser. It happens in testing, and
        // it would happen to a colleague booking an internal demo.
        const sameAsOrganizer =
            input.attendeeEmail.trim().toLowerCase() === profile.email.trim().toLowerCase();

        const attendees = [
            ...(sameAsOrganizer
                ? []
                : [
                      {
                          address: input.attendeeEmail,
                          className: "Attendee",
                          name: input.attendeeName || input.attendeeEmail,
                          organizer: false,
                          state: "NEEDS-ACTION",
                      },
                  ]),
            {
                address: profile.email,
                className: "Attendee",
                name: profile.displayName,
                organizer: true,
                state: "ACCEPTED",
            },
        ];

        const body = await this.request("/1/calendar/pim/event", {
            method: "POST",
            body: JSON.stringify({
                title: input.title,
                start: formatForInfomaniak(input.start, this.timezone),
                end: formatForInfomaniak(input.end, this.timezone),
                description: input.description,
                freebusy: "busy",
                type: "event",
                calendar_id: calendarId,
                fullday: false,
                timezone_start: this.timezone,
                timezone_end: this.timezone,
                attendees,
            }),
        });

        return { id: body?.data?.id, raw: body };
    }

    /**
     * Deletes an event.
     *
     * `DELETE /1/calendar/pim/event/{id}` is not in Infomaniak's reference client and
     * is not documented alongside the endpoints above; it was verified by hand against
     * a live account — 200 with `data: null`, and the event gone from the calendar.
     * Treat it as working but unofficial.
     *
     * There is no undo. Nothing calls this during a booking; it exists for cleaning up
     * test bookings and cancelling by hand.
     */
    async deleteEvent(eventId: string | number): Promise<void> {
        await this.request(`/1/calendar/pim/event/${encodeURIComponent(String(eventId))}`, {
            method: "DELETE",
        });
    }

    /** One API call. The range must stay within the server-side limit. */
    private async listEventsWindow(from: Date, to: Date): Promise<any[]> {
        const calendarId = await this.resolveCalendarId();
        const params = new URLSearchParams({
            calendar_id: calendarId,
            from: formatForInfomaniak(from, this.timezone),
            to: formatForInfomaniak(to, this.timezone),
        });
        const body = await this.request(`/1/calendar/pim/event?${params}`);
        return Array.isArray(body?.data) ? body.data : (body?.data?.events ?? []);
    }

    /**
     * Events in a range, as returned by the API.
     *
     * The endpoint refuses any range longer than three months
     * (`range_must_be_lower_than_3_months`, HTTP 500), which a retention sweep
     * looking years back would hit immediately. So the range is walked in windows
     * and the results merged, de-duplicated by id because an event on a boundary
     * comes back from both sides.
     */
    async listEvents(from: Date, to: Date): Promise<any[]> {
        const WINDOW_DAYS = 80; // comfortably under the three-month limit
        const windowMs = WINDOW_DAYS * 24 * 60 * 60 * 1000;
        const byId = new Map<unknown, any>();

        for (let start = from.getTime(); start < to.getTime(); start += windowMs) {
            const windowEnd = new Date(Math.min(start + windowMs, to.getTime()));
            for (const event of await this.listEventsWindow(new Date(start), windowEnd)) {
                byId.set(event?.id ?? Symbol(), event);
            }
        }
        return [...byId.values()];
    }
}
