"use client";

import React, { useState } from "react";
import prices from "../../prices.json";

const ITEMS = [
    {
        q: "How long is the trial?",
        a: `${prices.trial.days} days. ${prices.trial.note}`,
    },
    {
        q: "Is the product still being developed?",
        a: "Actively, yes. Releases ship on a regular cadence and new integrations are added continuously - several of the ones listed on this page exist because a customer asked. Every release during a subscription term is included, and Business and Enterprise requests are prioritized.",
    },
    {
        q: "Does it work with our existing Playwright projects?",
        a: "Yes. vallus wraps the standard Playwright CLI, so no code changes are needed. You point it at a project folder and it runs your existing configs, projects and environments as they are.",
    },
    {
        q: "Where does our test data live?",
        a: "Entirely on your own server. Runs, reports and traces are stored locally and nothing is sent to us or to any third party - there is no telemetry and no licence server to check in with. Once installed it runs in networks with no internet access; the install itself pulls one native database module for your platform, which can be staged in advance.",
    },
    {
        q: "How hard is it to deploy?",
        a: "Unzip, npm install, npm start, then a browser setup wizard creates the admin account and registers your projects. Teams that already have Playwright tests are usually running them through the dashboard the same day.",
    },
    {
        q: "Can non-developers trigger runs?",
        a: "That is the point of the product. Workflows are defined once by someone technical, and anyone with the executor role can then run them from the browser - with per-workflow permissions deciding who may run what.",
    },
    {
        q: "What happens when a license expires?",
        a: "Reading stays open - dashboards, history, reports and traces remain accessible. Only mutating operations are blocked until the license is renewed, so you never lose access to your own results.",
    },
    {
        q: "Can we get an integration that is not on the list?",
        a: "Usually yes. Most integrations are a matter of configuration plus a release rather than a project - describe the system and we will tell you the effort. Custom integrations are quoted as professional services, and prioritized for Business and Enterprise customers.",
    },
    {
        q: "Can we keep using it independently of the vendor?",
        a: "Yes. The commercial source license is perpetual and includes the right to modify the code for internal use, with source escrow available on request. Subscription fees paid in the first 24 months are credited against it.",
    },
    {
        q: "Do you support Python?",
        a: "Yes - pytest-playwright suites run alongside Node/TypeScript projects under the same launcher, roles, scheduling and run history.",
    },
];

const Faq = () => {
    const [open, setOpen] = useState<number | null>(0);

    return (
        <section id="faq" className="border-b border-line bg-ink-soft">
            <div className="mx-auto max-w-3xl px-6 py-20 sm:py-24">
                <p className="text-sm font-semibold uppercase tracking-widest text-accent">FAQ</p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-bone sm:text-4xl">
                    Questions we get asked first
                </h2>

                <dl className="mt-10 divide-y divide-line border-y border-line">
                    {ITEMS.map(({ q, a }, index) => {
                        const isOpen = open === index;
                        const panelId = `faq-panel-${index}`;
                        return (
                            <div key={q} className="py-4">
                                <dt>
                                    <button
                                        type="button"
                                        aria-expanded={isOpen}
                                        aria-controls={panelId}
                                        onClick={() => setOpen(isOpen ? null : index)}
                                        className="flex w-full cursor-pointer items-center justify-between gap-4 rounded text-left focus:outline-none focus-visible:ring focus-visible:ring-accent/60"
                                    >
                                        <span className="text-base font-medium text-bone">{q}</span>
                                        <span
                                            aria-hidden="true"
                                            className={`shrink-0 text-accent transition-transform ${
                                                isOpen ? "rotate-45" : ""
                                            }`}
                                        >
                                            +
                                        </span>
                                    </button>
                                </dt>
                                {isOpen && (
                                    <dd
                                        id={panelId}
                                        className="mt-3 pr-8 text-sm leading-relaxed text-muted"
                                    >
                                        {a}
                                    </dd>
                                )}
                            </div>
                        );
                    })}
                </dl>
            </div>
        </section>
    );
};

export default Faq;
