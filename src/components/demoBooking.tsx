"use client";

import React, { useEffect, useMemo, useState } from "react";
import prices from "../../prices.json";

const RECIPIENT = "gajownikp@gmail.com";
const SLOTS = ["09:00", "11:00", "13:00", "15:00"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TOPICS = [
    "Live demo of the dashboard",
    `${prices.trial.label} — evaluation key`,
    "Deployment in our environment",
    "Licensing and pricing",
    "A specific integration we need",
];

interface Day {
    iso: string;
    dayOfMonth: number;
    selectable: boolean;
}

/**
 * Example availability. Deterministic on purpose — the same day always renders the
 * same slots, and nothing here talks to a real calendar. The slot is confirmed by e-mail.
 */
const slotIsFree = (iso: string, slotIndex: number) => {
    const dayNumber = Number(iso.slice(-2));
    return (dayNumber + slotIndex * 3) % 5 !== 1;
};

const toIso = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate(),
    ).padStart(2, "0")}`;

const buildMonth = (year: number, month: number, today: Date): (Day | null)[] => {
    const first = new Date(year, month, 1);
    // Monday-first grid.
    const lead = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: (Day | null)[] = Array.from({ length: lead }, () => null);
    for (let dayOfMonth = 1; dayOfMonth <= daysInMonth; dayOfMonth += 1) {
        const date = new Date(year, month, dayOfMonth);
        const weekday = date.getDay();
        const isWeekend = weekday === 0 || weekday === 6;
        // Today is excluded too — a slot on the same day would often already have passed.
        const isPast = date <= today;
        cells.push({
            iso: toIso(date),
            dayOfMonth,
            selectable: !isWeekend && !isPast,
        });
    }
    return cells;
};

const DemoBooking = () => {
    const [today, setToday] = useState<Date | null>(null);
    const [monthOffset, setMonthOffset] = useState(0);
    const [selectedDay, setSelectedDay] = useState<string | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

    // Resolved after mount so the static export and the browser agree on what "today" is.
    useEffect(() => {
        const now = new Date();
        setToday(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    }, []);

    const view = useMemo(() => {
        if (!today) return null;
        const base = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
        return {
            year: base.getFullYear(),
            month: base.getMonth(),
            label: base.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
            cells: buildMonth(base.getFullYear(), base.getMonth(), today),
        };
    }, [today, monthOffset]);

    const prettyDate = selectedDay
        ? new Date(`${selectedDay}T00:00:00`).toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
          })
        : null;

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const value = (key: string) => String(data.get(key) ?? "").trim();

        const preferred =
            prettyDate && selectedSlot
                ? `${prettyDate} at ${selectedSlot} (CET)`
                : "no preference — please propose a slot";

        const body = [
            `Name: ${value("name")}`,
            `Company: ${value("company") || "—"}`,
            `E-mail: ${value("email")}`,
            `Phone: ${value("phone") || "—"}`,
            `Team size: ${value("teamSize") || "—"}`,
            `Topic: ${value("topic")}`,
            "",
            `Preferred slot: ${preferred}`,
            "",
            "Message:",
            value("message") || "—",
        ].join("\n");

        // Static site — nothing is transmitted from the page. This hands the request to
        // the visitor's own mail client, which they then send themselves.
        window.location.href = `mailto:${RECIPIENT}?subject=${encodeURIComponent(
            `vallus — demo request (${value("company") || value("name")})`,
        )}&body=${encodeURIComponent(body)}`;
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
                    See vallus running on a real project — in 30 minutes
                </h2>
                <p className="mt-4 max-w-2xl text-muted">
                    Pick a slot that suits you and tell us a little about your setup. We walk through
                    the launcher, a multi-step workflow, a live run, the trace viewer and cross-run
                    analytics — then hand you a {prices.trial.label} key if you want to try it
                    yourself.
                </p>

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
                                    placeholder="Anna Kowalska"
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
                                    placeholder="Acme S.A."
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
                                    placeholder="anna@acme.com"
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
                                    placeholder="+48 …"
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

                        <div className="mt-6 rounded-md border border-line bg-ink px-4 py-3 text-sm">
                            <span className="text-muted">Selected slot: </span>
                            <span className="text-bone">
                                {prettyDate && selectedSlot
                                    ? `${prettyDate}, ${selectedSlot} CET`
                                    : "none yet — we will propose one"}
                            </span>
                        </div>

                        <button
                            type="submit"
                            className="mt-6 w-full cursor-pointer rounded-md bg-accent px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-accent-dim"
                        >
                            Send the request
                        </button>
                        <p className="mt-3 text-xs leading-relaxed text-muted">
                            The site stores nothing and sends nothing on its own — the button opens
                            your own e-mail client with the request filled in, so you decide what
                            leaves your machine.
                        </p>
                    </form>

                    <div className="rounded-lg border border-line bg-surface p-8">
                        <div className="flex items-center justify-between gap-4">
                            <h3 className="text-lg font-semibold text-bone">Pick a slot</h3>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => setMonthOffset((offset) => Math.max(0, offset - 1))}
                                    disabled={monthOffset === 0}
                                    aria-label="Previous month"
                                    className="cursor-pointer rounded border border-line px-2 py-1 text-sm text-muted transition-colors hover:text-bone disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    ‹
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMonthOffset((offset) => Math.min(2, offset + 1))}
                                    disabled={monthOffset === 2}
                                    aria-label="Next month"
                                    className="cursor-pointer rounded border border-line px-2 py-1 text-sm text-muted transition-colors hover:text-bone disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    ›
                                </button>
                            </div>
                        </div>

                        {!view ? (
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
                                                onClick={() => {
                                                    setSelectedDay(cell.iso);
                                                    setSelectedSlot(null);
                                                }}
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
                                            Select a weekday to see the times we usually keep free.
                                        </p>
                                    ) : (
                                        <>
                                            <p className="text-sm text-muted">
                                                Times on{" "}
                                                <span className="text-bone">{prettyDate}</span> (CET)
                                            </p>
                                            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                                {SLOTS.map((slot, slotIndex) => {
                                                    const free = slotIsFree(selectedDay, slotIndex);
                                                    return (
                                                        <button
                                                            key={slot}
                                                            type="button"
                                                            disabled={!free}
                                                            aria-pressed={selectedSlot === slot}
                                                            onClick={() => setSelectedSlot(slot)}
                                                            className={`rounded-md border py-2 text-sm transition-colors ${
                                                                selectedSlot === slot
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
                                        </>
                                    )}
                                </div>

                                <p className="mt-6 text-xs leading-relaxed text-muted">
                                    Example availability, shown to make picking a time easy — it is
                                    not a live calendar. Whatever you choose is treated as a
                                    preference and confirmed by e-mail, usually within one business
                                    day. Slots outside these hours, and other time zones, can
                                    normally be arranged.
                                </p>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default DemoBooking;
