"use client";

import React, { useEffect, useState } from "react";

/**
 * Back to the top of a long page, at every width: on a phone the header's links are
 * behind the menu button and a long thumb-scroll away, and on a desktop the homepage
 * is a dozen sections long. Shown once the visitor is a screen down. Sits above the
 * cookie notice while that is shown (it publishes its height as --cookie-notice-h),
 * rather than under it.
 */
const ScrollToTop = () => {
    const [shown, setShown] = useState(false);

    useEffect(() => {
        const update = () => setShown(window.scrollY > window.innerHeight);
        update();
        window.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        return () => {
            window.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
        };
    }, []);

    const toTop = () => {
        // Smooth or instant as globals.css decides: it turns smooth scrolling off for
        // a visitor who asked for reduced motion.
        window.scrollTo({ top: 0 });
        // The button fades out under the pointer; focus goes to the start of the
        // content, not lost with it, so the next Tab continues from the top.
        document.getElementById("main")?.focus({ preventScroll: true });
    };

    return (
        <button
            type="button"
            onClick={toTop}
            aria-label="Scroll to top"
            title="Scroll to top"
            // Invisible, not just transparent, while hidden: out of the tab order and
            // of the accessibility tree, and the fade still plays.
            className={`fixed right-4 z-40 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-line bg-surface/90 text-bone shadow-lg shadow-black/40 backdrop-blur transition-[opacity,visibility,bottom] duration-300 hover:border-accent hover:text-accent ${
                shown ? "visible opacity-100" : "invisible opacity-0"
            }`}
            style={{ bottom: "calc(var(--cookie-notice-h, 0px) + 1rem)" }}
        >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 15l6-6 6 6" />
            </svg>
        </button>
    );
};

export default ScrollToTop;
