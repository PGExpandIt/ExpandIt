"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";

type NavItem = { href: string; label: string };

/**
 * The header's links below lg, where the row has no room for them: a button beside
 * "Book a demo" opens them as a panel under the header. The links are the header's
 * own NAV, passed in, so the two menus cannot drift apart. Prerendered closed - the
 * export cannot know the visitor's screen - and opened only by the button.
 */
const MobileMenu = ({ items }: { items: NavItem[] }) => {
    const [open, setOpen] = useState(false);
    const button = useRef<HTMLButtonElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const panelId = useId();

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            setOpen(false);
            button.current?.focus();
        };
        // A tap outside the panel closes it, as a tap on the page would be expected to.
        const onPointer = (event: PointerEvent) => {
            const target = event.target as Node;
            if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
        };
        // Widened past lg (a rotated tablet), the full nav is back in the row; a
        // panel left open there would hang under it with the same links twice.
        const wide = window.matchMedia("(min-width: 64rem)");
        const onWide = () => {
            if (wide.matches) setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        document.addEventListener("pointerdown", onPointer);
        wide.addEventListener("change", onWide);
        return () => {
            window.removeEventListener("keydown", onKey);
            document.removeEventListener("pointerdown", onPointer);
            wide.removeEventListener("change", onWide);
        };
    }, [open]);

    return (
        // Not positioned: the panel is placed against the sticky header, the nearest
        // positioned ancestor, so it spans the full width under it.
        <div className="lg:hidden">
            <button
                ref={button}
                type="button"
                aria-label="Menu"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen((value) => !value)}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border border-line text-bone transition-colors hover:border-muted"
            >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    {open ? (
                        <path d="M6 6l12 12M18 6L6 18" />
                    ) : (
                        <path d="M4 7h16M4 12h16M4 17h16" />
                    )}
                </svg>
            </button>

            <div
                ref={panel}
                id={panelId}
                hidden={!open}
                // Opaque, not the header's blur: a backdrop filter inside one does not
                // blur the page, and the links would sit on the text beneath them.
                // Capped at the screen below the header, so a phone held sideways can
                // still scroll to the last link.
                className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-line bg-ink shadow-2xl shadow-black/40"
            >
                <nav aria-label="Main">
                    <ul className="mx-auto max-w-6xl px-3 py-3 sm:px-6">
                        {items.map(({ href, label }) => (
                            <li key={href}>
                                <Link
                                    href={href}
                                    onClick={() => setOpen(false)}
                                    className="block rounded-md px-3 py-3 text-base text-muted transition-colors hover:bg-surface hover:text-bone"
                                >
                                    {label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
            </div>
        </div>
    );
};

export default MobileMenu;
