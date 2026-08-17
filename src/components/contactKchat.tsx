"use client";

import React, { useEffect, useState } from "react";

// Set NEXT_PUBLIC_KCHAT_API to the deployed kchat-api origin (see kchat-api/README).
// Left unset, the form falls back to a mailto so a bare static deploy still works.
const API = process.env.NEXT_PUBLIC_KCHAT_API?.replace(/\/$/, "") ?? "";
const RECIPIENT = "sales@vallus.eu";

const fieldClass =
    "mt-1.5 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-bone placeholder:text-muted/70 focus:border-accent focus:outline-none";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";

interface Challenge {
    token: string;
    salt: string;
    difficulty: number;
}

/**
 * Proof of work: find a counter whose SHA-256 starts with enough zero bits.
 *
 * The kChat service hands out the challenge from GET /config and refuses posts
 * without a solution, so a bot cannot simply POST at the endpoint. Solved here in
 * the background right after the page loads — it takes about a third of a second,
 * finishes long before anyone has filled in the form, and needs no third-party
 * script, no cookie and no captcha.
 */
const solveChallenge = async (challenge: Challenge): Promise<number> => {
    const encoder = new TextEncoder();
    for (let counter = 0; counter < 50_000_000; counter += 1) {
        const digest = new Uint8Array(
            await crypto.subtle.digest("SHA-256", encoder.encode(`${challenge.salt}:${counter}`)),
        );
        let bits = 0;
        for (const byte of digest) {
            if (byte === 0) {
                bits += 8;
                continue;
            }
            bits += Math.clz32(byte) - 24;
            break;
        }
        if (bits >= challenge.difficulty) return counter;
    }
    throw new Error("challenge unsolved");
};

type Status = "idle" | "submitting" | "success" | "error";

export default function ContactKchat() {
    const [status, setStatus] = useState<Status>("idle");
    const [error, setError] = useState<string | null>(null);
    const [challenge, setChallenge] = useState<Challenge | null>(null);
    const [solution, setSolution] = useState<number | null>(null);

    // Ask the service for a challenge once, after mount. A failure here is not
    // fatal: the honeypot and the rate limit still apply, and if the service has no
    // challenge configured it simply returns null.
    useEffect(() => {
        if (!API) return;
        let cancelled = false;
        void fetch(`${API}/config`, { headers: { Accept: "application/json" } })
            .then((response) => (response.ok ? response.json() : null))
            .then((body) => {
                if (!cancelled) setChallenge(body?.challenge ?? null);
            })
            .catch(() => {
                /* offline or blocked — submitting still works without a solution */
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Solve as soon as a challenge arrives, so the answer is ready by the time the
    // visitor submits.
    useEffect(() => {
        if (!challenge) return;
        let cancelled = false;
        void solveChallenge(challenge)
            .then((counter) => {
                if (!cancelled) setSolution(counter);
            })
            .catch(() => {
                // Leaves solution null; submitting then reports a clear error rather
                // than a silent failure.
            });
        return () => {
            cancelled = true;
        };
    }, [challenge]);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        // One form, one message: ignore a second submit while the first is in flight,
        // so a fast double-click cannot post twice. The server also enforces this —
        // a solved challenge is single-use — but this stops the duplicate at source.
        if (status === "submitting") return;
        const form = event.currentTarget;
        const data = new FormData(form);

        // Honeypot: a real user never fills a field hidden from view.
        if (((data.get("website") as string) ?? "").trim()) {
            setStatus("success");
            return;
        }

        const name = ((data.get("name") as string) ?? "").trim();
        const email = ((data.get("email") as string) ?? "").trim();
        const subject = ((data.get("subject") as string) ?? "").trim();
        const message = ((data.get("message") as string) ?? "").trim();
        if (!message) {
            setStatus("error");
            setError("Please write a message.");
            return;
        }

        // No backend configured → hand the message to the visitor's mail client.
        if (!API) {
            const mailSubject = encodeURIComponent(subject || "Message from the vallus website");
            const body = encodeURIComponent(
                `${message}\n\n— ${name || "(no name)"}${email ? ` <${email}>` : ""}`,
            );
            window.location.href = `mailto:${RECIPIENT}?subject=${mailSubject}&body=${body}`;
            setStatus("success");
            return;
        }

        // The challenge is solved in the background; if it has not finished, ask the
        // visitor to try again in a moment rather than sending an unsolved request.
        if (challenge && solution === null) {
            setStatus("error");
            setError("Still preparing — please try again in a second.");
            return;
        }

        setStatus("submitting");
        setError(null);
        try {
            const res = await fetch(`${API}/message`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    name,
                    email,
                    subject,
                    message,
                    challenge: challenge?.token,
                    solution,
                }),
            });
            if (!res.ok) {
                const payload = await res.json().catch(() => null);
                if (payload?.error === "challenge_failed") {
                    // The challenge went stale, or the page sat open too long.
                    throw new Error("Your session expired. Please reload the page and try again.");
                }
                throw new Error((payload?.message as string) ?? `The message could not be sent (${res.status}).`);
            }
            setStatus("success");
        } catch (e) {
            setStatus("error");
            setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
        }
    }

    if (status === "success") {
        return (
            <div className="rounded-lg border border-line bg-surface p-8">
                <h3 className="text-lg font-semibold text-bone">Message sent</h3>
                <p className="mt-4 max-w-2xl leading-relaxed text-muted">
                    Thanks — it has reached our team. We will get back to you at the address you
                    left, usually within one business day.
                </p>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="rounded-lg border border-line bg-surface p-8">
            <h3 className="text-lg font-semibold text-bone">Send us a message</h3>
            <p className="mt-2 max-w-2xl text-sm text-muted">
                A question about vallus? Write to us and it lands straight with the team.
            </p>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                    <label className={labelClass} htmlFor="name">
                        Name
                    </label>
                    <input
                        id="name"
                        name="name"
                        autoComplete="name"
                        className={fieldClass}
                        placeholder="Alex Doe"
                    />
                </div>
                <div>
                    <label className={labelClass} htmlFor="email">
                        E-mail
                    </label>
                    <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        className={fieldClass}
                        placeholder="alex@acme.com"
                    />
                    <p className="mt-1.5 text-xs text-muted">So we can reply. Optional.</p>
                </div>
            </div>

            <div className="mt-5">
                <label className={labelClass} htmlFor="subject">
                    Subject
                </label>
                <input
                    id="subject"
                    name="subject"
                    className={fieldClass}
                    placeholder="What is this about?"
                />
            </div>

            <div className="mt-5">
                <label className={labelClass} htmlFor="message">
                    Message *
                </label>
                <textarea
                    id="message"
                    name="message"
                    required
                    rows={5}
                    className={`${fieldClass} resize-y`}
                    placeholder="How can we help?"
                />
            </div>

            {/* Honeypot — off-screen, not display:none, so bots that skip hidden
                fields still fill it. aria-hidden + tabIndex keep it away from users. */}
            <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden opacity-0">
                <label htmlFor="website">Leave this field empty</label>
                <input id="website" name="website" tabIndex={-1} autoComplete="off" />
            </div>

            {error && (
                <p
                    role="alert"
                    className="mt-4 rounded-md border border-amber/60 bg-ink px-4 py-3 text-sm text-amber"
                >
                    {error}
                </p>
            )}

            <button
                type="submit"
                disabled={status === "submitting"}
                className="mt-6 w-full cursor-pointer rounded-md bg-accent px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-60"
            >
                {status === "submitting" ? "Sending…" : "Send message"}
            </button>
        </form>
    );
}
