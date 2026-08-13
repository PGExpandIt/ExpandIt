import React from "react";

const POINTS = [
    {
        title: "Runs without the internet",
        body: "Once installed, vallus needs no outbound connection: no telemetry, no licence server, no update check. The licence is verified locally by signature. Installation itself fetches one native database module for your platform, which can be staged in advance for a disconnected network.",
    },
    {
        title: "Your data stays yours",
        body: "Runs, reports, traces and history are written to your own server. Nothing about your application, your environments or your test data leaves the perimeter.",
    },
    {
        title: "Portable deployment",
        body: "Any machine with Node.js will do - a VM, a container, or a workstation. Optional extras such as Allure and HTTPS/TLS are configuration, not a separate install.",
    },
    {
        title: "Docker where it earns its keep",
        body: "Giving each run its own container needs a Docker daemon the runner can reach; a compose file ships with the product. Without one it still runs every suite as before, in-process - the isolation is an upgrade, not a prerequisite.",
    },
    {
        title: "Hardened access",
        body: "Signed license keys, TLS, OIDC single sign-on with a break-glass local admin, role-based permissions and per-workflow grants for executors.",
    },
];

const Deployment = () => (
    <section id="deployment" className="border-b border-line">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
            <p className="text-sm font-semibold uppercase tracking-widest text-accent">
                Deployment and security
            </p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-bone sm:text-4xl">
                Built for regulated networks, not for someone else&apos;s cloud
            </h2>

            <div className="mt-12 grid gap-6 sm:grid-cols-2">
                {POINTS.map(({ title, body }) => (
                    <article key={title} className="rounded-lg border border-line bg-ink-soft p-6">
                        <h3 className="text-base font-semibold text-bone">{title}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
                    </article>
                ))}
            </div>
        </div>
    </section>
);

export default Deployment;
