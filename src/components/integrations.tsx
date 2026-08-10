import React from "react";

interface IntegrationGroup {
    group: string;
    items: { name: string; note: string }[];
}

const GROUPS: IntegrationGroup[] = [
    {
        group: "Test runtimes",
        items: [
            { name: "Playwright Test", note: "Node.js / TypeScript, your existing configs" },
            { name: "pytest-playwright", note: "Python suites in the same dashboard" },
        ],
    },
    {
        group: "Reporting",
        items: [
            { name: "Playwright HTML report", note: "Served per run" },
            { name: "Allure", note: "Trends and history across runs" },
            { name: "Trace viewer", note: "Hosted, shareable over HTTPS" },
            { name: "Grafana", note: "Run metrics for your own dashboards" },
            { name: "ReportPortal", note: "Optional result forwarding" },
        ],
    },
    {
        group: "Delivery pipelines",
        items: [
            { name: "Jenkins", note: "Webhook-triggered runs" },
            { name: "GitHub Actions", note: "Token-authenticated triggers" },
            { name: "Azure DevOps", note: "Any pipeline with an HTTP step" },
            { name: "Git", note: "Pull the project before a run" },
        ],
    },
    {
        group: "Governance",
        items: [
            { name: "Jira", note: "Link runs back to issues" },
            { name: "Xray", note: "Push test executions" },
            { name: "Keycloak / OIDC", note: "SSO with JIT provisioning" },
            { name: "TLS certificates", note: "Generated or bring your own" },
        ],
    },
];

const Integrations = () => (
    <section id="integrations" className="border-b border-line">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
            <p className="text-sm font-semibold uppercase tracking-widest text-accent">
                Fits your stack
            </p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-bone sm:text-4xl">
                Integrations
            </h2>
            <p className="mt-4 max-w-2xl text-muted">
                vallus sits between the tools you already run. Everything below is configuration -
                nothing requires changes to your test code. The list is a snapshot: new integrations
                are added continuously, so if yours is missing, it is most likely a request away.
            </p>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {GROUPS.map(({ group, items }) => (
                    <div key={group} className="rounded-lg border border-line bg-ink-soft p-6">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-bone">
                            {group}
                        </h3>
                        <ul className="mt-4 space-y-4">
                            {items.map(({ name, note }) => (
                                <li key={name}>
                                    <p className="text-sm font-medium text-bone">{name}</p>
                                    <p className="text-xs leading-relaxed text-muted">{note}</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    </section>
);

export default Integrations;
