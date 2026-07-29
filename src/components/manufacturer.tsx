import React from "react";

const Manufacturer = () => (
    <section id="manufacturer" className="border-b border-line">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
            <div>
                <p className="text-sm font-semibold uppercase tracking-widest text-accent">
                    The manufacturer
                </p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-bone sm:text-4xl">
                    ExpandIt
                </h2>
                <p className="mt-2 text-lg text-muted">A better quality starts now.</p>

                <div className="mt-6 max-w-3xl space-y-4 leading-relaxed text-muted">
                    <p>
                        ExpandIt designs, builds and licenses vallus. The product is not a side
                        project of a larger platform — it is the whole of what we do, and it grew out
                        of years of hands-on work in software testing: functional UI tests first, but
                        also unit, integration, performance and stress testing.
                    </p>
                    <p>
                        Much of that work was test automation — across Selenium WebDriver, Cypress,
                        Appium, Protractor, Puppeteer, Cucumber and SpecFlow, with Jenkins, GitHub,
                        Azure, Jira and Xray around them. vallus is the tool that kept being missing
                        on those engagements: the layer that makes an automated suite something a
                        whole team can run, govern and trust — not just the people who wrote it.
                    </p>
                    <p>
                        We build for the way testing teams actually work: self-hosted, inside your
                        network, on top of the Playwright projects you already maintain. Nothing you
                        run depends on us staying online.
                    </p>
                </div>

                <dl className="mt-8 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
                    <div className="bg-ink-soft px-6 py-5">
                        <dt className="text-2xl font-bold text-bone">EU</dt>
                        <dd className="mt-1 text-sm text-muted">based, EU/EEA licensing</dd>
                    </div>
                    <div className="bg-ink-soft px-6 py-5">
                        <dt className="text-2xl font-bold text-bone">QA-built</dt>
                        <dd className="mt-1 text-sm text-muted">
                            made by testers, for testing teams
                        </dd>
                    </div>
                    <div className="bg-ink-soft px-6 py-5">
                        <dt className="text-2xl font-bold text-bone">Single focus</dt>
                        <dd className="mt-1 text-sm text-muted">vallus is the whole roadmap</dd>
                    </div>
                </dl>
            </div>
        </div>
    </section>
);

export default Manufacturer;
