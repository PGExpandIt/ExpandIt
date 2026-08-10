import React from "react";

interface Feature {
    title: string;
    body: string;
}

const FEATURES: Feature[] = [
    {
        title: "Multi-project launcher",
        body: "Register any number of Playwright projects behind one entry point. Several teams share a single instance, each with its own dashboard and its own access rules.",
    },
    {
        title: "Multi-step workflows",
        body: "Define a run once - config, browser, test filters, environment variables, steps in sequence - and let anyone repeat it exactly, without touching a terminal.",
    },
    {
        title: "Scheduling and a run queue",
        body: "Nightly regression, hourly smoke, or a one-off run at 3 a.m. Queued execution keeps concurrent runs from fighting over the same machine.",
    },
    {
        title: "CI webhooks",
        body: "Trigger workflows from Jenkins, GitHub Actions, Azure or any pipeline with a token-authenticated HTTP call, and pick up the result programmatically.",
    },
    {
        title: "Reports, Allure and traces",
        body: "Playwright HTML reports, Allure trends and the trace viewer are served straight from the dashboard - no zipping folders, no sharing files by hand.",
    },
    {
        title: "Cross-run analytics",
        body: "Run history in SQLite turns into trends: flaky tests, newly failing specs, duration drift, step-level summaries, and CSV export for reporting.",
    },
    {
        title: "Role-based access control",
        body: "Viewer, executor, admin and superAdmin roles, plus per-workflow permissions - so the people who may run against production are exactly the ones you chose.",
    },
    {
        title: "SSO via OIDC",
        body: "Connect Keycloak, Entra ID or any OIDC provider with just-in-time account provisioning, and keep a break-glass local admin for emergencies.",
    },
    {
        title: "Python as well as TypeScript",
        body: "Node/TypeScript Playwright projects and Python pytest-playwright suites run side by side under the same dashboard, roles and history.",
    },
    {
        title: "HTTPS and key management",
        body: "Built-in certificate generation, TLS serving, and signed license keys - required anyway once the trace viewer is used from outside localhost.",
    },
    {
        title: "Jira and Xray integration",
        body: "Push execution results to Xray test executions and link runs back to Jira issues, so manual and automated coverage live in one report.",
    },
    {
        title: "Fully self-hosted",
        body: "Runs, reports, traces and history stay on your infrastructure. Nothing is sent externally, no telemetry is collected, and once installed the product needs no internet connection.",
    },
];

const Features = () => (
    <section id="features" className="border-b border-line">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
            <p className="text-sm font-semibold uppercase tracking-widest text-accent">
                What vallus does
            </p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-bone sm:text-4xl">
                A dashboard that wraps the Playwright CLI in governance, history and access control
            </h2>
            <p className="mt-4 max-w-2xl text-muted">
                It works with your existing projects as they are - same configs, same projects, same
                environments. No code changes, no rewriting of tests.
            </p>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {FEATURES.map(({ title, body }) => (
                    <article
                        key={title}
                        className="rounded-lg border border-line bg-ink-soft p-6 transition-colors hover:border-accent-dim"
                    >
                        <h3 className="text-base font-semibold text-bone">{title}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
                    </article>
                ))}
            </div>
        </div>
    </section>
);

export default Features;
