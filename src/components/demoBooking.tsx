"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import prices from "../../prices.json";

// Set NEXT_PUBLIC_BOOKING_API to the deployed booking-api origin (see booking-api/README.md)
// and this section books real slots in the Infomaniak calendar. Leave it unset and the
// section falls back to the example calendar and a mailto request, which is what a plain
// GitHub Pages deployment can do on its own.
const API = process.env.NEXT_PUBLIC_BOOKING_API?.replace(/\/$/, "") ?? "";
const RECIPIENT = "sales@vallus.eu";

const FALLBACK_SLOT_TIMES = ["09:00", "11:00", "13:00", "15:00"];
const MAX_MONTH_OFFSET = 3;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TOPICS = [
    "Live demo of the dashboard",
    `${prices.trial.label} - evaluation key`,
    "Deployment in our environment",
    "Licensing and pricing",
    "A specific integration we need",
];

interface Slot {
    start: string;
    end: string;
    date: string;
    time: string;
}

interface Challenge {
    token: string;
    salt: string;
    difficulty: number;
}

/**
 * Proof of work: find a counter whose SHA-256 starts with enough zero bits.
 *
 * The booking service hands out the challenge with the slots and refuses bookings
 * without a solution, so a bot cannot simply POST at the endpoint. Solved here in
 * the background right after the slots load - it takes about a third of a second,
 * finishes long before anyone has filled in the form, and needs no third-party
 * script, no cookie and no captcha.
 */
const solveChallenge = async (challenge: Challenge): Promise<number> => {
    const encoder = new TextEncoder();
    for (let counter = 0; counter < 50_000_000; counter += 1) {
        const digest = new Uint8Array(
            await crypto.subtle.digest("SHA-256", encoder.encode(`${challenge.salt}:${counter}`)),
        );
        let bits = 0;
        for (const byte of digest) {
            if (byte === 0) {
                bits += 8;
                continue;
            }
            bits += Math.clz32(byte) - 24;
            break;
        }
        if (bits >= challenge.difficulty) return counter;
    }
    throw new Error("challenge unsolved");
};

interface Day {
    iso: string;
    dayOfMonth: number;
    selectable: boolean;
}

type Source = "loading" | "live" | "example";

/**
 * Example availability, used only when no booking API is configured or it cannot be
 * reached. Deterministic on purpose: the same day always renders the same slots.
 */
const exampleSlotIsFree = (iso: string, slotIndex: number) =>
    (Number(iso.slice(-2)) + slotIndex * 3) % 5 !== 1;

const toIso = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate(),
    ).padStart(2, "0")}`;

const buildMonth = (
    year: number,
    month: number,
    today: Date,
    isSelectable: (iso: string, weekendOrPast: boolean) => boolean,
): (Day | null)[] => {
    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7; // Monday-first grid
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: (Day | null)[] = Array.from({ length: lead }, () => null);
    for (let dayOfMonth = 1; dayOfMonth <= daysInMonth; dayOfMonth += 1) {
        const date = new Date(year, month, dayOfMonth);
        const weekday = date.getDay();
        // Today is excluded too - a slot on the same day would often already have passed.
        const weekendOrPast = weekday === 0 || weekday === 6 || date <= today;
        const iso = toIso(date);
        cells.push({ iso, dayOfMonth, selectable: isSelectable(iso, weekendOrPast) });
    }
    return cells;
};

const DemoBooking = () => {
    const [today, setToday] = useState<Date | null>(null);
    const [monthOffset, setMonthOffset] = useState(0);
    // Set once the visitor uses the month arrows, so the jump below never fights them.
    const [monthChosenByVisitor, setMonthChosenByVisitor] = useState(false);
    const [selectedDay, setSelectedDay] = useState<string | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
    const [selectedExampleTime, setSelectedExampleTime] = useState<string | null>(null);

    const [source, setSource] = useState<Source>(API ? "loading" : "example");
    const [slots, setSlots] = useState<Slot[]>([]);
    const [challenge, setChallenge] = useState<Challenge | null>(null);
    const [solution, setSolution] = useState<number | null>(null);
    const [timezone, setTimezone] = useState<string>("CET");
    const [submitting, setSubmitting] = useState(false);
    const [confirmed, setConfirmed] = useState<{ date: string; time: string; timezone: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Resolved after mount so the static export and the browser agree on what "today" is.
    useEffect(() => {
        const now = new Date();
        setToday(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    }, []);

    const loadSlots = useCallback(async () => {
        if (!API) return;
        try {
            const response = await fetch(`${API}/slots`, { headers: { Accept: "application/json" } });
            if (!response.ok) throw new Error(String(response.status));
            const body = await response.json();
            setSlots(Array.isArray(body.slots) ? body.slots : []);
            if (body.timezone) setTimezone(body.timezone);
            setChallenge(body.challenge ?? null);
            setSolution(null);
            setSource("live");
        } catch {
            // Never leave the visitor staring at a broken section: fall back to the
            // example calendar and the mailto path.
            setSource("example");
        }
    }, []);

    useEffect(() => {
        void loadSlots();
    }, [loadSlots]);

    // Solve as soon as a challenge arrives, so the answer is ready by the time
    // anyone presses the button.
    useEffect(() => {
        if (!challenge) return;
        let cancelled = false;
        void solveChallenge(challenge)
            .then((counter) => {
                if (!cancelled) setSolution(counter);
            })
            .catch(() => {
                // Leaves solution null; submitting then reports a clear error rather
                // than failing silently.
            });
        return () => {
            cancelled = true;
        };
    }, [challenge]);

    // Near the end of a month the lead time can push every free slot into the next
    // one. Opening on the current month would then show nothing but greyed-out days,
    // so jump to the month the first slot actually falls in.
    useEffect(() => {
        if (monthChosenByVisitor || source !== "live" || !today || slots.length === 0) return;
        const first = new Date(`${slots[0].date}T00:00:00`);
        const monthsAhead =
            (first.getFullYear() - today.getFullYear()) * 12 + (first.getMonth() - today.getMonth());
        if (monthsAhead > 0) setMonthOffset(Math.min(monthsAhead, MAX_MONTH_OFFSET));
    }, [source, slots, today, monthChosenByVisitor]);

    const slotsByDay = useMemo(() => {
        const map = new Map<string, Slot[]>();
        for (const slot of slots) {
            const bucket = map.get(slot.date) ?? [];
            bucket.push(slot);
            map.set(slot.date, bucket);
        }
        for (const bucket of map.values()) bucket.sort((a, b) => a.time.localeCompare(b.time));
        return map;
    }, [slots]);

    const view = useMemo(() => {
        if (!today) return null;
        const base = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
        const isSelectable = (iso: string, weekendOrPast: boolean) =>
            source === "live" ? (slotsByDay.get(iso)?.length ?? 0) > 0 : !weekendOrPast;

        return {
            year: base.getFullYear(),
            month: base.getMonth(),
            label: base.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
            cells: buildMonth(base.getFullYear(), base.getMonth(), today, isSelectable),
        };
    }, [today, monthOffset, source, slotsByDay]);

    const prettyDate = selectedDay
        ? new Date(`${selectedDay}T00:00:00`).toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
          })
        : null;

    const chosenTime = source === "live" ? selectedSlot?.time ?? null : selectedExampleTime;

    const clearDay = (iso: string) => {
        setSelectedDay(iso);
        setSelectedSlot(null);
        setSelectedExampleTime(null);
        setError(null);
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const value = (key: string) => String(data.get(key) ?? "").trim();

        // No API configured, or it was unreachable: hand the request to the visitor's
        // own mail client, exactly as before.
        if (source !== "live") {
            const preferred =
                prettyDate && chosenTime
                    ? `${prettyDate} at ${chosenTime}`
                    : "no preference - please propose a slot";
            const body = [
                `Name: ${value("name")}`,
                `Company: ${value("company") || "-"}`,
                `E-mail: ${value("email")}`,
                `Phone: ${value("phone") || "-"}`,
                `Team size: ${value("teamSize") || "-"}`,
                `Topic: ${value("topic")}`,
                "",
                `Preferred slot: ${preferred}`,
                "",
                "Message:",
                value("message") || "-",
            ].join("\n");

            window.location.href = `mailto:${RECIPIENT}?subject=${encodeURIComponent(
                `vallus - demo request (${value("company") || value("name")})`,
            )}&body=${encodeURIComponent(body)}`;
            return;
        }

        if (!selectedSlot) {
            setError("Pick a date and a time first.");
            return;
        }
        if (challenge && solution === null) {
            setError("Still preparing the form - try again in a moment.");
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const response = await fetch(`${API}/book`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: value("name"),
                    company: value("company"),
                    email: value("email"),
                    phone: value("phone"),
                    teamSize: value("teamSize"),
                    topic: value("topic"),
                    message: value("message"),
                    website: value("website"), // honeypot; a human leaves it empty
                    challenge: challenge?.token,
                    solution,
                    start: selectedSlot.start,
                }),
            });

            if (response.status === 409) {
                setError("Someone just took that slot. Pick another one - the times below are up to date.");
                await loadSlots();
                setSelectedSlot(null);
                return;
            }
            if (response.status === 403) {
                // The challenge went stale, or the page sat open for an hour.
                setError("That took a while - refreshing the form. Please submit again.");
                await loadSlots();
                return;
            }
            if (response.status === 429) {
                setError("Too many attempts from your network. Try again in a while, or write to us directly.");
                return;
            }
            if (!response.ok) {
                setError("The booking could not be completed. Please try again, or write to us directly.");
                return;
            }

            const body = await response.json();
            setConfirmed({
                date: body.date ?? selectedSlot.date,
                time: body.time ?? selectedSlot.time,
                timezone: body.timezone ?? timezone,
            });
        } catch {
            setError("The booking service is unreachable. Please try again, or write to us directly.");
        } finally {
            setSubmitting(false);
        }
    };

    const fieldClass =
        "mt-1.5 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-bone placeholder:text-muted/70 focus:border-accent focus:outline-none";
    const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";

    return (
        <section id="demo" className="border-b border-line bg-ink-soft">
            <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
                <p className="text-sm font-semibold uppercase tracking-widest text-accent">
                    Book a demo
                </p>
                <h2 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-bone sm:text-4xl">
                    See vallus running on a real project - in 30 minutes
                </h2>
                <p className="mt-4 max-w-2xl text-muted">
                    Pick a slot that suits you and tell us a little about your setup. We walk through
                    the launcher, a multi-step workflow, a live run, the trace viewer and cross-run
                    analytics - then hand you a {prices.trial.label} key if you want to try it
                    yourself.
                </p>

                {confirmed ? (
                    <div
                        role="status"
                        aria-live="polite"
                        tabIndex={-1}
                        ref={(node) => node?.focus()}
                        className="mt-12 rounded-lg border border-accent bg-surface p-8 sm:p-12 focus:outline-none"
                    >
                        <h3 className="text-2xl font-bold text-bone">You are booked in</h3>
                        <p className="mt-4 text-lg text-muted">
                            <span className="text-bone">
                                {new Date(`${confirmed.date}T00:00:00`).toLocaleDateString("en-GB", {
                                    weekday: "long",
                                    day: "numeric",
                                    month: "long",
                                    year: "numeric",
                                })}
                            </span>{" "}
                            at <span className="text-bone">{confirmed.time}</span> ({confirmed.timezone})
                        </p>
                        <p className="mt-4 max-w-2xl leading-relaxed text-muted">
                            The invitation is on its way to the address you gave us. If anything needs
                            to change, just reply to it.
                        </p>
                    </div>
                ) : (
                    <div className="mt-12 grid gap-6 lg:grid-cols-2">
                        <form
                            onSubmit={handleSubmit}
                            className="rounded-lg border border-line bg-surface p-8"
                        >
                            <h3 className="text-lg font-semibold text-bone">Your details</h3>

                            <div className="mt-6 grid gap-5 sm:grid-cols-2">
                                <div className="sm:col-span-1">
                                    <label className={labelClass} htmlFor="name">
                                        Name *
                                    </label>
                                    <input
                                        id="name"
                                        name="name"
                                        required
                                        autoComplete="name"
                                        className={fieldClass}
                                        placeholder="Alex Morgan"
                                    />
                                </div>
                                <div className="sm:col-span-1">
                                    <label className={labelClass} htmlFor="company">
                                        Company
                                    </label>
                                    <input
                                        id="company"
                                        name="company"
                                        autoComplete="organization"
                                        className={fieldClass}
                                        placeholder="Acme Inc."
                                    />
                                </div>
                                <div className="sm:col-span-1">
                                    <label className={labelClass} htmlFor="email">
                                        Work e-mail *
                                    </label>
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        required
                                        autoComplete="email"
                                        className={fieldClass}
                                        placeholder="alex@acme.com"
                                    />
                                </div>
                                <div className="sm:col-span-1">
                                    <label className={labelClass} htmlFor="phone">
                                        Phone
                                    </label>
                                    <input
                                        id="phone"
                                        name="phone"
                                        type="tel"
                                        autoComplete="tel"
                                        className={fieldClass}
                                        placeholder="+44 20 7946 0000"
                                    />
                                </div>
                                <div className="sm:col-span-1">
                                    <label className={labelClass} htmlFor="teamSize">
                                        People who would use it
                                    </label>
                                    <select id="teamSize" name="teamSize" className={fieldClass} defaultValue="">
                                        <option value="">Select…</option>
                                        <option>1–10</option>
                                        <option>11–30</option>
                                        <option>31–100</option>
                                        <option>100+</option>
                                    </select>
                                </div>
                                <div className="sm:col-span-1">
                                    <label className={labelClass} htmlFor="topic">
                                        What it is about
                                    </label>
                                    <select id="topic" name="topic" className={fieldClass} defaultValue={TOPICS[0]}>
                                        {TOPICS.map((topic) => (
                                            <option key={topic}>{topic}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="sm:col-span-2">
                                    <label className={labelClass} htmlFor="message">
                                        Anything we should prepare?
                                    </label>
                                    <textarea
                                        id="message"
                                        name="message"
                                        rows={4}
                                        className={fieldClass}
                                        placeholder="We run ~400 Playwright tests in two repos, and we'd like to see scheduling and Xray."
                                    />
                                </div>
                            </div>

                            {/* Honeypot: hidden from people, irresistible to bots. */}
                            <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden opacity-0">
                                <label htmlFor="website">Leave this field empty</label>
                                <input id="website" name="website" tabIndex={-1} autoComplete="off" />
                            </div>

                            <div className="mt-6 rounded-md border border-line bg-ink px-4 py-3 text-sm">
                                <span className="text-muted">Selected slot: </span>
                                <span className="text-bone">
                                    {prettyDate && chosenTime
                                        ? `${prettyDate}, ${chosenTime} ${source === "live" ? timezone : ""}`.trim()
                                        : source === "live"
                                          ? "none yet - pick one on the right"
                                          : "none yet - we will propose one"}
                                </span>
                            </div>

                            {/* role="alert" so the message is announced, not just displayed -
                                a screen-reader user gets no other signal that submitting failed. */}
                            {error && (
                                <p
                                    role="alert"
                                    className="mt-3 rounded-md border border-amber/60 bg-ink px-4 py-3 text-sm text-amber"
                                >
                                    {error}
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={submitting}
                                className="mt-6 w-full cursor-pointer rounded-md bg-accent px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {submitting
                                    ? "Booking…"
                                    : source === "live"
                                      ? "Confirm the booking"
                                      : "Send the request"}
                            </button>

                            {/* Article 13 GDPR information has to be available where the data is
                                collected, not only in the footer. */}
                            <p className="mt-3 text-xs leading-relaxed text-muted">
                                {source === "live"
                                    ? "Your details go straight to our own booking service and into our calendar - no third-party scheduling platform is involved."
                                    : "The site stores nothing and sends nothing on its own - the button opens your own e-mail client with the request filled in, so you decide what leaves your machine."}{" "}
                                How we handle them, and the rights you have over them, are set out in
                                our{" "}
                                <a
                                    href="/privacy"
                                    className="text-bone underline decoration-line underline-offset-4 hover:decoration-accent"
                                >
                                    privacy notice
                                </a>
                                .
                            </p>
                        </form>

                        <div className="rounded-lg border border-line bg-surface p-8">
                            <div className="flex items-center justify-between gap-4">
                                <h3 className="text-lg font-semibold text-bone">Pick a slot</h3>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMonthChosenByVisitor(true);
                                            setMonthOffset((offset) => Math.max(0, offset - 1));
                                        }}
                                        disabled={monthOffset === 0}
                                        aria-label="Previous month"
                                        className="cursor-pointer rounded border border-line px-2 py-1 text-sm text-muted transition-colors hover:text-bone disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        ‹
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMonthChosenByVisitor(true);
                                            setMonthOffset((offset) => Math.min(MAX_MONTH_OFFSET, offset + 1));
                                        }}
                                        disabled={monthOffset === MAX_MONTH_OFFSET}
                                        aria-label="Next month"
                                        className="cursor-pointer rounded border border-line px-2 py-1 text-sm text-muted transition-colors hover:text-bone disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        ›
                                    </button>
                                </div>
                            </div>

                            {!view || source === "loading" ? (
                                <div className="mt-6 h-64 animate-pulse rounded-md bg-ink" />
                            ) : (
                                <>
                                    <p className="mt-4 text-sm font-medium text-bone">{view.label}</p>

                                    <div className="mt-4 grid grid-cols-7 gap-1 text-center">
                                        {WEEKDAYS.map((weekday) => (
                                            <span
                                                key={weekday}
                                                className="py-1 text-xs font-medium text-muted"
                                            >
                                                {weekday}
                                            </span>
                                        ))}
                                        {view.cells.map((cell, index) =>
                                            cell === null ? (
                                                <span key={`pad-${index}`} />
                                            ) : (
                                                <button
                                                    key={cell.iso}
                                                    type="button"
                                                    disabled={!cell.selectable}
                                                    aria-pressed={selectedDay === cell.iso}
                                                    onClick={() => clearDay(cell.iso)}
                                                    aria-label={new Date(
                                                        `${cell.iso}T00:00:00`,
                                                    ).toLocaleDateString("en-GB", {
                                                        weekday: "long",
                                                        day: "numeric",
                                                        month: "long",
                                                        year: "numeric",
                                                    })}
                                                    className={`rounded py-2 text-sm transition-colors ${
                                                        selectedDay === cell.iso
                                                            ? "bg-accent font-semibold text-ink"
                                                            : cell.selectable
                                                              ? "cursor-pointer text-bone hover:bg-line"
                                                              : "cursor-not-allowed text-muted/40"
                                                    }`}
                                                >
                                                    {cell.dayOfMonth}
                                                </button>
                                            ),
                                        )}
                                    </div>

                                    <div className="mt-6 border-t border-line pt-6">
                                        {!selectedDay ? (
                                            <p className="text-sm text-muted">
                                                {source !== "live"
                                                    ? "Select a weekday to see the times we usually keep free."
                                                    : view.cells.some((cell) => cell?.selectable)
                                                      ? "Select a highlighted day to see the times still open."
                                                      : `Nothing free in ${view.label} - use › for the next month.`}
                                            </p>
                                        ) : (
                                            <>
                                                <p className="text-sm text-muted">
                                                    Times on{" "}
                                                    <span className="text-bone">{prettyDate}</span>{" "}
                                                    ({source === "live" ? timezone : "CET"})
                                                </p>
                                                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                                    {source === "live"
                                                        ? (slotsByDay.get(selectedDay) ?? []).map((slot) => (
                                                              <button
                                                                  key={slot.start}
                                                                  type="button"
                                                                  aria-pressed={selectedSlot?.start === slot.start}
                                                                  aria-label={`${slot.time} ${timezone} on ${prettyDate}`}
                                                                  onClick={() => {
                                                                      setSelectedSlot(slot);
                                                                      setError(null);
                                                                  }}
                                                                  className={`cursor-pointer rounded-md border py-2 text-sm transition-colors ${
                                                                      selectedSlot?.start === slot.start
                                                                          ? "border-accent bg-accent font-semibold text-ink"
                                                                          : "border-line text-bone hover:border-accent-dim"
                                                                  }`}
                                                              >
                                                                  {slot.time}
                                                              </button>
                                                          ))
                                                        : FALLBACK_SLOT_TIMES.map((slot, slotIndex) => {
                                                              const free = exampleSlotIsFree(selectedDay, slotIndex);
                                                              return (
                                                                  <button
                                                                      key={slot}
                                                                      type="button"
                                                                      disabled={!free}
                                                                      aria-pressed={selectedExampleTime === slot}
                                                                      aria-label={`${slot} on ${prettyDate}${free ? "" : " - unavailable"}`}
                                                                      onClick={() => setSelectedExampleTime(slot)}
                                                                      className={`rounded-md border py-2 text-sm transition-colors ${
                                                                          selectedExampleTime === slot
                                                                              ? "border-accent bg-accent font-semibold text-ink"
                                                                              : free
                                                                                ? "cursor-pointer border-line text-bone hover:border-accent-dim"
                                                                                : "cursor-not-allowed border-line text-muted/40 line-through"
                                                                      }`}
                                                                  >
                                                                      {slot}
                                                                  </button>
                                                              );
                                                          })}
                                                </div>
                                                {source === "live" &&
                                                    (slotsByDay.get(selectedDay) ?? []).length === 0 && (
                                                        <p className="mt-3 text-sm text-muted">
                                                            Nothing left on that day - try another.
                                                        </p>
                                                    )}
                                            </>
                                        )}
                                    </div>

                                    <p className="mt-6 text-xs leading-relaxed text-muted">
                                        {source === "live"
                                            ? `Live availability from our calendar, shown in ${timezone}. The slot is held the moment you confirm, and you get an invitation by e-mail. Other time zones and times outside these hours can normally be arranged - just ask in the message.`
                                            : "Example availability, shown to make picking a time easy - it is not a live calendar. Whatever you choose is treated as a preference and confirmed by e-mail, usually within one business day. Slots outside these hours, and other time zones, can normally be arranged."}
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
};

export default DemoBooking;
