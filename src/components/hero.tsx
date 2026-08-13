import React from "react";
import VallusMark from "@/components/vallusMark";
import prices from "../../prices.json";

const STATS = [
    { value: "Self-hosted", label: "Your server, your test data" },
    { value: "Node · TS · Python", label: "Playwright and pytest-playwright" },
    { value: "Minutes", label: "From unzip to first run" },
];

const Hero = () => (
    <section id="top" className="relative overflow-hidden border-b border-line">
        <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] bg-[radial-gradient(ellipse_at_top,var(--color-glow),transparent_65%)]"
        />
        <div className="relative mx-auto max-w-6xl px-6 py-24 text-center sm:py-32">
            <VallusMark className="mx-auto h-16 w-auto text-accent" />

            <p className="mt-8 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                A product of ExpandIt · version 1.3 · actively developed
            </p>

            <div className="mx-auto mt-8 max-w-2xl space-y-4 text-left text-[15px] leading-relaxed text-muted sm:text-center">
                <p>
                    A Roman legionary carried his own stakes. Each evening, after the march, the
                    camp&apos;s palisade went up from what the soldiers already had - no supply line,
                    no waiting for anyone.
                </p>
                <p>
                    <span className="text-bone">Vallus works the same way.</span> Every instance
                    runs on your own infrastructure and answers to nothing outside it. No telemetry,
                    no licence server, no call home. Once it is installed it needs no route to the
                    internet at all.
                </p>
            </div>

            <h1 className="mx-auto mt-12 max-w-4xl text-4xl font-bold leading-tight tracking-tight text-bone sm:text-6xl">
                Schedule, run and analyze your Playwright tests
                <span className="text-accent"> from one dashboard</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted">
                The Playwright CLI works for a single developer. vallus turns your existing
                Playwright projects into managed, repeatable workflows that anyone on the team can
                trigger - on demand, on a schedule, or from CI - with reports, traces and cross-run
                analytics in one place.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a
                    href="#demo"
                    className="w-full rounded-md bg-accent px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-accent-dim sm:w-auto"
                >
                    Book a demo · {prices.trial.label}
                </a>
                <a
                    href="#how-it-works"
                    className="w-full rounded-md border border-line bg-surface px-6 py-3 text-sm font-semibold text-bone transition-colors hover:border-muted sm:w-auto"
                >
                    See how it works
                </a>
            </div>

            <dl className="mx-auto mt-16 grid max-w-3xl grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
                {STATS.map(({ value, label }) => (
                    <div key={value} className="bg-ink-soft px-6 py-5">
                        <dt className="text-base font-semibold text-bone">{value}</dt>
                        <dd className="mt-1 text-sm text-muted">{label}</dd>
                    </div>
                ))}
            </dl>
        </div>
    </section>
);

export default Hero;
