import React from "react";

const STEPS = [
    {
        step: "01",
        title: "Install",
        body: "vallus ships as a package with its dependencies inside. Unzip it on any machine with Node.js, run npm install to add the database module for your platform, then npm start. It runs against the Playwright projects you already have.",
    },
    {
        step: "02",
        title: "Set up in the browser",
        body: "A setup wizard creates the first admin account and registers your Playwright projects - folder path and port, nothing else. Your test code stays untouched.",
    },
    {
        step: "03",
        title: "Build workflows",
        body: "Compose runs from config, browser, filters and environment, assign who may execute them, then trigger on demand, on a schedule or from CI.",
    },
    {
        step: "04",
        title: "Review and compare",
        body: "Open the HTML report or the trace for any run, watch Allure trends, and use cross-run analytics to spot flakiness and regressions early.",
    },
];

const HowItWorks = () => (
    <section id="how-it-works" className="border-b border-line bg-ink-soft">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
            <p className="text-sm font-semibold uppercase tracking-widest text-accent">
                How it works
            </p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-bone sm:text-4xl">
                If your team already has Playwright tests, you are running them through the dashboard
                in minutes
            </h2>

            <div className="mt-12 grid gap-6 lg:grid-cols-4">
                {STEPS.map(({ step, title, body }) => (
                    <article key={step} className="rounded-lg border border-line bg-surface p-6">
                        <span className="font-mono text-sm text-accent">{step}</span>
                        <h3 className="mt-3 text-lg font-semibold text-bone">{title}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
                    </article>
                ))}
            </div>

            <div className="mt-10 overflow-x-auto rounded-lg border border-line bg-ink p-6">
                <pre className="font-mono text-sm leading-relaxed text-muted">
                    <code>
                        {`unzip vallus-1.2.0.zip && cd vallus
npm install
npm start                       # dashboard on http://localhost:3000

# optional - HTTPS, needed for the trace viewer off localhost
npm run tls:cert
npm run start:tls`}
                    </code>
                </pre>
            </div>
        </div>
    </section>
);

export default HowItWorks;
