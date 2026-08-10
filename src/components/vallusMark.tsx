import React from "react";

/** The vallus mark - a palisade of bars (vallus, lat. "stake / palisade"). */
const VallusMark = ({ className = "" }: { className?: string }) => (
    <svg
        viewBox="0 0 153 120"
        fill="currentColor"
        aria-hidden="true"
        className={className}
    >
        <rect x="24" y="24" width="9" height="72" rx="1.2" />
        <rect x="40" y="40" width="9" height="56" rx="1.2" />
        <rect x="56" y="56" width="9" height="40" rx="1.2" />
        <rect x="72" y="66" width="9" height="30" rx="1.2" />
        <rect x="88" y="56" width="9" height="40" rx="1.2" />
        <rect x="104" y="40" width="9" height="56" rx="1.2" />
        <rect x="120" y="24" width="9" height="72" rx="1.2" />
    </svg>
);

export default VallusMark;
