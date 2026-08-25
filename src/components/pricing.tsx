import React from "react";
import Link from "next/link";
// All commercial figures live in prices.json at the repository root - edit that file, redeploy, done.
import prices from "../../prices.json";

// An entry in prices.json may carry a `note`. The price cell then shows only the
// figure, marked with an asterisk, and the note is spelled out under the list.
// Used by services and add-ons alike - a condition attached to something you buy
// belongs next to its price, not three sections away.
type Priced = { name: string; price: string; note?: string };

/** The noted entries of one list, and how to mark them. Each list numbers its own
 *  asterisks, so a note in one section cannot renumber another. */
function notes(entries: Priced[], idPrefix: string) {
    const noted = entries.filter((entry) => entry.note);
    return {
        noted,
        idFor: (entry: Priced) => `${idPrefix}-note-${noted.indexOf(entry)}`,
        marker: (entry: Priced) => {
            const index = noted.indexOf(entry);
            return index === -1 ? null : "*".repeat(index + 1);
        },
    };
}

const SERVICES: Priced[] = prices.services;
const ADD_ONS: Priced[] = prices.addOns;
const serviceNotes = notes(SERVICES, "service");
const addOnNotes = notes(ADD_ONS, "add-on");

const Pricing = () => (
    <section id="pricing" className="border-b border-line bg-ink-soft">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
            <p className="text-sm font-semibold uppercase tracking-widest text-accent">Licensing</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-bone sm:text-4xl">
                Subscribe, or buy the source outright
            </h2>
            <p className="mt-4 max-w-2xl text-muted">
                {prices.intro} Evaluation is free for {prices.trial.days} days with full
                functionality - no card, no auto-renewal.
            </p>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {prices.tiers.map((tier) => {
                    const { id, name, price, cadence, summary, points, highlight, badge } = tier;
                    // A tier may override the call to action (e.g. the free tier links
                    // to /free/ instead of the demo). Defaults keep the paid tiers as-is.
                    const cta = "cta" in tier && tier.cta ? tier.cta : "Talk to us";
                    const href = "href" in tier && tier.href ? tier.href : "/#demo";
                    return (
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
                            {points
                                // A point is either a plain string (included) or an
                                // object flagging a capability this tier does NOT have,
                                // which renders a red ✗ instead of the green ✓.
                                .map((point) =>
                                    typeof point === "string"
                                        ? { text: point, included: true }
                                        : point,
                                )
                                // Green (included) first, red (excluded) last. Array.sort
                                // is stable, so order within each group is preserved.
                                .sort((a, b) => Number(b.included) - Number(a.included))
                                .map((item) => (
                                    <li
                                        key={item.text}
                                        className={`flex gap-2.5 text-sm ${
                                            item.included ? "text-muted" : "text-muted/70"
                                        }`}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className={item.included ? "text-accent" : "text-danger"}
                                        >
                                            {item.included ? "✓" : "✗"}
                                        </span>
                                        <span className="sr-only">
                                            {item.included ? "Included: " : "Not included: "}
                                        </span>
                                        <span>{item.text}</span>
                                    </li>
                                ))}
                        </ul>
                        <Link
                            href={href}
                            className={`mt-8 rounded-md px-4 py-2.5 text-center text-sm font-semibold transition-colors ${
                                highlight
                                    ? "bg-accent text-ink hover:bg-accent-dim"
                                    : "border border-line text-bone hover:border-muted"
                            }`}
                        >
                            {cta}
                        </Link>
                    </article>
                    );
                })}
            </div>

            {/* One shared footnote for the asterisked points above — the parallel-run
                figures are a licence ceiling, not a promise the host can meet without
                a Docker daemon. */}
            <p className="mt-6 text-xs leading-relaxed text-muted/80">{prices.tiersNote}</p>

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

            {/* Add-ons and services only. The discount grid is deliberately not
    published — it is a negotiation lever, not a page a prospect reads
    before the first call. The figures live in the internal price list. */}
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
                <div className="rounded-lg border border-line bg-surface p-6">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-bone">
                        Add-ons
                    </h3>
                    <dl className="mt-4 space-y-3">
                        {ADD_ONS.map((addOn) => {
                            const mark = addOnNotes.marker(addOn);
                            return (
                                <div key={addOn.name} className="flex justify-between gap-4 text-sm">
                                    <dt className="text-muted">{addOn.name}</dt>
                                    <dd
                                        className="shrink-0 text-bone"
                                        aria-describedby={mark ? addOnNotes.idFor(addOn) : undefined}
                                    >
                                        {addOn.price}
                                        {mark && (
                                            <sup aria-hidden="true" className="ml-0.5 text-accent">
                                                {mark}
                                            </sup>
                                        )}
                                    </dd>
                                </div>
                            );
                        })}
                    </dl>

                    {addOnNotes.noted.length > 0 && (
                        <ul className="mt-4 space-y-1.5 border-t border-line pt-3">
                            {addOnNotes.noted.map((addOn, index) => (
                                <li
                                    key={addOn.name}
                                    id={`add-on-note-${index}`}
                                    className="text-xs leading-relaxed text-muted"
                                >
                                    <span aria-hidden="true" className="text-accent">
                                        {"*".repeat(index + 1)}
                                    </span>{" "}
                                    {addOn.note}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="rounded-lg border border-line bg-surface p-6">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-bone">
                        Professional services
                    </h3>
                    <dl className="mt-4 space-y-3">
                        {SERVICES.map((service) => {
                            const mark = serviceNotes.marker(service);
                            return (
                                <div
                                    key={service.name}
                                    className="flex justify-between gap-4 text-sm"
                                >
                                    <dt className="text-muted">{service.name}</dt>
                                    <dd
                                        className="shrink-0 text-bone"
                                        aria-describedby={
                                            mark
                                                ? serviceNotes.idFor(service)
                                                : undefined
                                        }
                                    >
                                        {service.price}
                                        {mark && (
                                            <sup aria-hidden="true" className="ml-0.5 text-accent">
                                                {mark}
                                            </sup>
                                        )}
                                    </dd>
                                </div>
                            );
                        })}
                    </dl>

                    {serviceNotes.noted.length > 0 && (
                        <ul className="mt-4 space-y-1.5 border-t border-line pt-3">
                            {serviceNotes.noted.map((service, index) => (
                                <li
                                    key={service.name}
                                    id={`service-note-${index}`}
                                    className="text-xs leading-relaxed text-muted"
                                >
                                    <span aria-hidden="true" className="text-accent">
                                        {"*".repeat(index + 1)}
                                    </span>{" "}
                                    {service.note}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

            </div>
        </div>
    </section>
);

export default Pricing;
