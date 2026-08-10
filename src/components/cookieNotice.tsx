"use client";

import React, { useEffect, useState } from "react";

/**
 * Flip to true the moment anything non-essential is added - analytics, an embedded
 * video, a chat widget, a map, a third-party font. The notice then stops being an
 * informational one-button banner and becomes a real accept/decline gate, and
 * `hasAnalyticsConsent()` starts meaning something.
 *
 * While it is false the site genuinely sets no cookies, writes nothing but this
 * one dismissal flag, and makes no third-party requests - verified by loading the
 * built export and inspecting cookies, storage and network.
 */
const HAS_NON_ESSENTIAL = false;

const STORAGE_KEY = "vallus.cookie-notice";

type Choice = "acknowledged" | "accepted" | "declined";

const read = (): Choice | null => {
    try {
        const value = window.localStorage.getItem(STORAGE_KEY);
        return value === "acknowledged" || value === "accepted" || value === "declined"
            ? value
            : null;
    } catch {
        // Private mode, or storage disabled. Showing the notice every visit is the
        // right failure: better repeated than wrongly assumed to be answered.
        return null;
    }
};

const write = (choice: Choice) => {
    try {
        window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
        // Nothing to do - the visitor simply sees the notice again next time.
    }
};

/**
 * Whether the visitor agreed to non-essential storage. Gate any future analytics
 * or third-party embed on this - do not load them before it returns true.
 */
export const hasAnalyticsConsent = (): boolean =>
    HAS_NON_ESSENTIAL ? read() === "accepted" : false;

const CookieNotice = () => {
    // Rendered only after mount: the static export has no idea what this visitor
    // has already answered, and guessing would flash the banner at everyone.
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (read() === null) setVisible(true);
    }, []);

    const decide = (choice: Choice) => {
        write(choice);
        setVisible(false);
    };

    useEffect(() => {
        if (!visible) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") decide(HAS_NON_ESSENTIAL ? "declined" : "acknowledged");
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [visible]);

    if (!visible) return null;

    return (
        <div
            role="region"
            aria-label="Privacy notice"
            className="fixed inset-x-0 bottom-0 z-[60] border-t border-line bg-surface/95 backdrop-blur"
        >
            <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-relaxed text-muted">
                    {HAS_NON_ESSENTIAL ? (
                        <>
                            <span className="font-semibold text-bone">Cookies.</span> We use what is
                            needed to make the site work, and - only with your agreement - some that
                            help us understand how it is used. You can decline and nothing changes
                            for you.
                        </>
                    ) : (
                        <>
                            <span className="font-semibold text-bone">
                                This site sets no cookies.
                            </span>{" "}
                            No trackers, no analytics, no third-party requests. The only thing stored
                            in your browser is a note that you have seen this message. Booking a demo
                            sends the details you type straight to our own calendar service - nothing
                            else leaves your machine.{" "}
                        </>
                    )}
                    <a
                        href="/privacy"
                        className="text-bone underline decoration-line underline-offset-4 hover:decoration-accent"
                    >
                        Privacy notice
                    </a>
                    .
                </p>

                <div className="flex shrink-0 gap-3">
                    {HAS_NON_ESSENTIAL && (
                        <button
                            type="button"
                            onClick={() => decide("declined")}
                            className="cursor-pointer rounded-md border border-line px-4 py-2 text-sm font-semibold text-bone transition-colors hover:border-muted"
                        >
                            Decline
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => decide(HAS_NON_ESSENTIAL ? "accepted" : "acknowledged")}
                        className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-accent-dim"
                    >
                        {HAS_NON_ESSENTIAL ? "Accept" : "Got it"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CookieNotice;
