"use client";

import React, { useState } from "react";

// Only the first step differs between the two ways of installing; everything
// after it is identical, which is why the shared steps live below the tabs
// rather than being duplicated inside each one.
//
// The archive name carries a placeholder, not a real version: a concrete number
// here goes stale on every release and nobody notices until a customer copies a
// command for a file that does not exist. This page had 1.2.0 long after 1.3
// shipped.
type Mode = "local" | "docker";

const INSTALL: Record<Mode, { label: string; title: string; body: string; code: string }> = {
    local: {
        label: "Local",
        title: "Install",
        body: "vallus ships as a package with its dependencies inside. Unzip it on any machine with Node.js, run npm install to add the database module for your platform, then npm start. It runs against the Playwright projects you already have.",
        code: `unzip vallus-X.Y.Z.zip && cd vallus
npm install
npm start                       # dashboard on http://localhost:3000

# optional - HTTPS, needed for the trace viewer off localhost
npm run tls:cert
npm run start:tls`,
    },
    docker: {
        label: "Docker",
        title: "Install with Compose",
        body: "A compose file ships with the product: the runner behind a TLS proxy, with certificates handled for you. This is the mode where each run gets a container of its own, so several suites can execute side by side - it needs a Docker daemon the runner can reach.",
        code: `# edit docker-compose.yml: point the project volume at your tests
docker compose up -d --build    # dashboard on https://localhost:3000

# each run now gets its own container
docker ps --filter label=vallus.project`,
    },
};

const SHARED = [
    {
        step: "02",
        title: "Set up in the browser",
        body: "A setup wizard creates the first admin account and registers your Playwright projects - by folder path, or by cloning them straight from Git, including a subdirectory of a monorepo. Your test code stays untouched.",
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

const HowItWorks = () => {
    const [mode, setMode] = useState<Mode>("local");

    return (
        <section id="how-it-works" className="border-b border-line bg-ink-soft">
            <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
                <p className="text-sm font-semibold uppercase tracking-widest text-accent">
                    How it works
                </p>
                <h2 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-bone sm:text-4xl">
                    If your team already has Playwright tests, you are running them through the dashboard
                    in minutes
                </h2>

                <div
                    role="tablist"
                    aria-label="Installation method"
                    className="mt-10 inline-flex rounded-lg border border-line bg-surface p-1"
                >
                    {(Object.keys(INSTALL) as Mode[]).map((key) => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            id={`install-tab-${key}`}
                            aria-selected={mode === key}
                            aria-controls={`install-panel-${key}`}
                            onClick={() => setMode(key)}
                            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                                mode === key
                                    ? "bg-ink text-bone"
                                    : "text-muted hover:text-bone"
                            }`}
                        >
                            {INSTALL[key].label}
                        </button>
                    ))}
                </div>

                {/* Both panels are rendered and the inactive one is hidden, rather than
                    swapped in on click. A statically exported page is what crawlers and
                    JS-less visitors read, and rendering only the selected tab left the
                    Docker copy - now a differentiator - out of the HTML entirely. */}
                {(Object.keys(INSTALL) as Mode[]).map((key) => (
                    <div
                        key={key}
                        role="tabpanel"
                        id={`install-panel-${key}`}
                        aria-labelledby={`install-tab-${key}`}
                        hidden={mode !== key}
                        className="mt-6 grid gap-6 lg:grid-cols-3"
                    >
                        <article className="rounded-lg border border-line bg-surface p-6">
                            <span className="font-mono text-sm text-accent">01</span>
                            <h3 className="mt-3 text-lg font-semibold text-bone">{INSTALL[key].title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-muted">{INSTALL[key].body}</p>
                        </article>

                        <div className="overflow-x-auto rounded-lg border border-line bg-ink p-6 lg:col-span-2">
                            <pre className="font-mono text-sm leading-relaxed text-muted">
                                <code>{INSTALL[key].code}</code>
                            </pre>
                        </div>
                    </div>
                ))}

                <p className="mt-12 text-sm font-semibold uppercase tracking-wide text-muted">
                    The rest is the same either way
                </p>
                <div className="mt-4 grid gap-6 lg:grid-cols-3">
                    {SHARED.map(({ step, title, body }) => (
                        <article key={step} className="rounded-lg border border-line bg-surface p-6">
                            <span className="font-mono text-sm text-accent">{step}</span>
                            <h3 className="mt-3 text-lg font-semibold text-bone">{title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default HowItWorks;
