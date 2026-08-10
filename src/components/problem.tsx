import React from "react";

const PAINS = [
    {
        title: "Runs tied to one machine",
        body: "Every execution means a terminal, the right config, browser, environment and filters - then collecting and sharing the HTML report by hand.",
    },
    {
        title: "QA can't trigger anything",
        body: "Testers and product people depend on a developer to start a suite, so verification queues up behind someone else's day.",
    },
    {
        title: "No schedule, no CI trigger",
        body: "There is no central place to run nightly suites or to fire a run from a pipeline when a build lands.",
    },
    {
        title: "No history, no trends",
        body: "Without run history, flaky tests and slow regressions stay invisible until they break a release.",
    },
    {
        title: "Results scattered",
        body: "Reports live in folders on laptops, traces are awkward to share, and nobody can answer \"was this green last week?\"",
    },
    {
        title: "No access control",
        body: "Nothing decides who may run what against which environment - a real problem once staging and production data are involved.",
    },
];

const Problem = () => (
    <section id="product" className="border-b border-line">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
            <p className="text-sm font-semibold uppercase tracking-widest text-accent">
                The problem
            </p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-bone sm:text-4xl">
                Playwright is excellent. Running it across a team is the hard part.
            </h2>
            <p className="mt-4 max-w-2xl text-muted">
                Every organisation that adopts Playwright hits the same wall - and rebuilds the same
                scripts, spreadsheets and shared folders to work around it, once per project and per
                team.
            </p>

            <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
                {PAINS.map(({ title, body }) => (
                    <article key={title} className="bg-ink-soft p-6">
                        <h3 className="text-base font-semibold text-bone">{title}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
                    </article>
                ))}
            </div>
        </div>
    </section>
);

export default Problem;
