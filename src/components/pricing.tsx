import React from "react";
// All commercial figures live in prices.json at the repository root — edit that file, redeploy, done.
import prices from "../../prices.json";

const Pricing = () => (
    <section id="pricing" className="border-b border-line bg-ink-soft">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
            <p className="text-sm font-semibold uppercase tracking-widest text-accent">Licensing</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-bone sm:text-4xl">
                Subscribe, or buy the source outright
            </h2>
            <p className="mt-4 max-w-2xl text-muted">
                {prices.intro} Evaluation is free for {prices.trial.days} days with full
                functionality — no card, no auto-renewal.
            </p>

            <div className="mt-12 grid gap-6 lg:grid-cols-3">
                {prices.tiers.map(({ id, name, price, cadence, summary, points, highlight, badge }) => (
                    <article
                        key={id}
                        className={`flex flex-col rounded-lg border bg-surface p-8 ${
                            highlight ? "border-accent" : "border-line"
                        }`}
                    >
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-lg font-semibold text-bone">{name}</h3>
                            {badge && (
                                <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-ink">
                                    {badge}
                                </span>
                            )}
                        </div>
                        <p className="mt-4 text-3xl font-bold text-bone">{price}</p>
                        <p className="text-sm text-muted">{cadence}</p>
                        <p className="mt-4 text-sm leading-relaxed text-muted">{summary}</p>
                        <ul className="mt-6 flex-1 space-y-2.5">
                            {points.map((point) => (
                                <li key={point} className="flex gap-2.5 text-sm text-muted">
                                    <span aria-hidden="true" className="text-accent">
                                        ✓
                                    </span>
                                    <span>{point}</span>
                                </li>
                            ))}
                        </ul>
                        <a
                            href="#demo"
                            className={`mt-8 rounded-md px-4 py-2.5 text-center text-sm font-semibold transition-colors ${
                                highlight
                                    ? "bg-accent text-ink hover:bg-accent-dim"
                                    : "border border-line text-bone hover:border-muted"
                            }`}
                        >
                            Talk to us
                        </a>
                    </article>
                ))}
            </div>

            <div className="mt-6 rounded-lg border border-line bg-surface p-8 lg:flex lg:items-center lg:justify-between lg:gap-10">
                <div>
                    <div className="flex flex-wrap items-baseline gap-3">
                        <h3 className="text-lg font-semibold text-bone">
                            {prices.sourceLicense.title}
                        </h3>
                        <span className="text-lg font-bold text-accent">
                            {prices.sourceLicense.price}
                        </span>
                    </div>
                    <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
                        {prices.sourceLicense.body}
                    </p>
                </div>
                <a
                    href="#demo"
                    className="mt-6 inline-block shrink-0 rounded-md border border-accent px-5 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent hover:text-ink lg:mt-0"
                >
                    {prices.sourceLicense.cta}
                </a>
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-3">
                <div className="rounded-lg border border-line bg-surface p-6">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-bone">
                        Add-ons
                    </h3>
                    <dl className="mt-4 space-y-3">
                        {prices.addOns.map(({ name, price }) => (
                            <div key={name} className="flex justify-between gap-4 text-sm">
                                <dt className="text-muted">{name}</dt>
                                <dd className="shrink-0 text-bone">{price}</dd>
                            </div>
                        ))}
                    </dl>
                </div>

                <div className="rounded-lg border border-line bg-surface p-6">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-bone">
                        Professional services
                    </h3>
                    <dl className="mt-4 space-y-3">
                        {prices.services.map(({ name, price }) => (
                            <div key={name} className="flex justify-between gap-4 text-sm">
                                <dt className="text-muted">{name}</dt>
                                <dd className="shrink-0 text-bone">{price}</dd>
                            </div>
                        ))}
                    </dl>
                </div>

                <div className="rounded-lg border border-line bg-surface p-6">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-bone">
                        Discounts
                    </h3>
                    <dl className="mt-4 space-y-3">
                        {prices.discounts.map(({ name, value }) => (
                            <div key={name} className="flex justify-between gap-4 text-sm">
                                <dt className="text-muted">{name}</dt>
                                <dd className="shrink-0 text-accent">{value}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </div>
        </div>
    </section>
);

export default Pricing;
