import React from "react";

const POINTS = [
    {
        title: "Shipped continuously",
        body: "vallus is under active development, not in maintenance mode. Releases land regularly, and every one of them is included in a running subscription at no extra cost.",
    },
    {
        title: "New integrations keep arriving",
        body: "The integration list grows constantly — reporting backends, issue trackers, identity providers, CI systems. What is listed on this page is the state today, not the ceiling.",
    },
    {
        title: "Your request shapes the next release",
        body: "Need a system that is not supported yet? Tell us. Integration requests from customers are how most of the current list came to exist, and Business and Enterprise tiers get theirs prioritized.",
    },
    {
        title: "Upgrades stay boring",
        body: "The product wraps your Playwright projects instead of owning them, so new versions do not ask you to rewrite tests. Your configs, your repository, your history stay as they are.",
    },
];

const Development = () => (
    <section id="development" className="border-b border-line bg-ink-soft">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
            <p className="text-sm font-semibold uppercase tracking-widest text-accent">
                Actively developed
            </p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-bone sm:text-4xl">
                A moving product, not a frozen one
            </h2>
            <p className="mt-4 max-w-2xl text-muted">
                You are buying something that is still being built — and the roadmap is open to the
                teams that use it.
            </p>

            <div className="mt-12 grid gap-6 sm:grid-cols-2">
                {POINTS.map(({ title, body }) => (
                    <article key={title} className="rounded-lg border border-line bg-surface p-6">
                        <h3 className="text-base font-semibold text-bone">{title}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
                    </article>
                ))}
            </div>

            <div className="mt-6 flex flex-col gap-4 rounded-lg border border-accent-dim bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-relaxed text-muted">
                    <span className="font-semibold text-bone">
                        Missing an integration you depend on?
                    </span>{" "}
                    Ask for it — most are a matter of configuration and a release, not a project.
                </p>
                <a
                    href="#demo"
                    className="shrink-0 rounded-md bg-accent px-5 py-2.5 text-center text-sm font-semibold text-ink transition-colors hover:bg-accent-dim"
                >
                    Request an integration
                </a>
            </div>
        </div>
    </section>
);

export default Development;
